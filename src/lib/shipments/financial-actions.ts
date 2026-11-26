"use server";

/**
 * Financial Server Actions Layer — Server Side (Phase 2 — Step 3)
 *
 * Secure server mutations for the OUT Financial Ledger (`shipment_customs_obligations`,
 * `shipment_financial_transactions`, `shipment_financial_internal_notes`) and the
 * Stage 9 (`stage_9_fees_payments`) completion gate.
 *
 * Security & Authorization Invariants:
 *  1. Strictly Admin-Only Writes:
 *     - `admin`: Full financial write access (create/update/cancel customs obligations,
 *       record disbursements/charges/credits/collections/direct payments, verify/reject
 *       direct payments, reverse posted entries, add internal notes, and close Stage 9).
 *     - `manager`: Read-only access (all write actions return `UNAUTHORIZED_ROLE`).
 *     - `scout` / `inspector` / `data_entry`: Zero financial access (`UNAUTHORIZED_ROLE`).
 *     - `customer`: Read-only access to own verified shipment (`UNAUTHORIZED_ROLE` on writes).
 *  2. Zero Service-Role Escalation:
 *     Uses the session-bound Supabase server client (`createClient()`) so PostgreSQL RLS
 *     and database triggers remain active on every operation.
 *  3. Duplicate & Concurrency Protection:
 *     - Every financial transaction requires a non-empty `idempotency_key` scoped to `shipment_id`.
 *     - Active payment references (`reference_number`) are deduplicated per `(shipment_id, entry_category)`.
 *  4. Single Source of Truth for OUT Service Fee:
 *     - Base OUT clearance service fee lives exclusively in `shipment_pricing.final_price`
 *       and is NEVER duplicated as a `shipment_financial_transactions` row.
 *  5. Atomic Double-Entry Reversal:
 *     - Original posted transactions are NEVER deleted or mutated in amount/type.
 *     - Reversals insert a single `direction = -1` row with `reversal_of_transaction_id`,
 *       while Migration 0019's `BEFORE`/`AFTER INSERT` triggers atomically lock the original row,
 *       mark `is_reversed = true`, recalculate obligation coverage, and reopen Stage 9 if needed.
 */

import { z } from "zod";
import {
  FINANCIAL_OBLIGATION_CLAIM_TYPES,
  FINANCIAL_PAYMENT_METHODS,
  type FinancialObligationClaimType,
  type FinancialPaymentMethod,
  type FinancialTransactionCategory,
  type FinancialTransactionType,
  type MonetaryNumericValue,
  type ShipmentCustomsObligation,
  type ShipmentCustomsObligationRow,
  type ShipmentFinancialInternalNote,
  type ShipmentFinancialInternalNoteRow,
  type ShipmentFinancialSummary,
  type ShipmentFinancialTransaction,
  type ShipmentFinancialTransactionRow,
  type Stage9FinancialGateEvaluation,
} from "../../types/financial";
import {
  deriveSingleObligationCoverageStatus,
  evaluateStage9FinancialGate,
  fromPiastres,
  normalizeCustomsObligationRow,
  normalizeFinancialTransactionRow,
  toPiastres,
  validateFinancialTransactionInput,
} from "./financial-calculations";
import {
  getShipmentCustomsObligationsQuery,
  getShipmentFinancialSummaryQuery,
  isValidUuid,
  resolveVerifiedFinancialActor,
  type FinancialExecutionContext,
  type FinancialResult,
  type ShipmentOwnershipRecord,
  type SupabaseServerClientLike,
  type VerifiedFinancialActor,
} from "./financial-queries";

// ─── 1. Internal Helpers (Path Revalidation, Admin Verification, Error Mapping) ─

async function safeRevalidateShipmentPaths(shipmentId: string): Promise<void> {
  try {
    const cacheMod = await import("next/cache");
    cacheMod.revalidatePath("/shipments");
    cacheMod.revalidatePath(`/shipments/${shipmentId}`);
    cacheMod.revalidatePath("/my-shipments");
    cacheMod.revalidatePath(`/my-shipments/${shipmentId}`);
  } catch {
    // No-op when running in standalone Node.js unit test runner outside Next.js request context
  }
}

/**
 * Verifies that the caller is an authenticated, active `admin` and that the target shipment exists.
 * Explicitly blocks `manager` (read-only), `scout`, `inspector`, `data_entry`, and `customer`.
 */
async function verifyAdminWriteAccessForShipment(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<{
  authorized: boolean;
  supabase?: SupabaseServerClientLike;
  actor?: VerifiedFinancialActor;
  shipment?: ShipmentOwnershipRecord;
  errorResult?: FinancialResult<never>;
}> {
  if (!isValidUuid(shipmentId)) {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "VALIDATION_ERROR",
        error: "معرف الشحنة غير صالح.",
      },
    };
  }

  const { supabase, actor, authError } = await resolveVerifiedFinancialActor(context);
  if (authError || !actor) {
    return { authorized: false, errorResult: authError };
  }

  if (actor.role === "manager") {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "UNAUTHORIZED_ROLE",
        error:
          "صلاحية المدير (Manager) قراءة فقط للبيانات والمراحل المالية؛ لا يُسمح بتنفيذ عمليات إضافة أو تعديل أو اعتماد مالي.",
      },
    };
  }

  if (actor.role !== "admin") {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "UNAUTHORIZED_ROLE",
        error: "غير مصرح لدورك بتنفيذ عمليات كتابة أو تعديل في دفتر الأستاذ المالي.",
      },
    };
  }

  const { data: shipment, error: shipErr } = await supabase
    .from("shipments")
    .select("id, customer_id, company_id, status, reference_number")
    .eq("id", shipmentId.trim())
    .maybeSingle();

  if (shipErr || !shipment) {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "VALIDATION_ERROR",
        error: "الشحنة المحددة غير موجودة.",
      },
    };
  }

  return {
    authorized: true,
    supabase,
    actor,
    shipment: shipment as ShipmentOwnershipRecord,
  };
}

/**
 * Translates PostgreSQL / Supabase constraint and trigger errors into safe, deterministic
 * domain error codes and Arabic user messages without leaking SQL or stack traces.
 */
function mapDatabaseFinancialError(
  dbError: { code?: string; message?: string; details?: string } | null | undefined,
  fallbackMessage: string,
): FinancialResult<never> {
  const msg = String(dbError?.message || "");
  const code = String(dbError?.code || "");

  if (
    code === "23505" ||
    msg.includes("idx_uq_financial_tx_idempotency") ||
    msg.includes("idx_uq_financial_tx_active_reference") ||
    msg.includes("idx_uq_shipment_primary_customs_obligation") ||
    msg.includes("idx_uq_shipment_customs_claim_number")
  ) {
    if (msg.includes("idx_uq_shipment_primary_customs_obligation")) {
      return {
        success: false,
        code: "DUPLICATE_TRANSACTION",
        error: "توجد مطالبة جمركية أساسية نشطة مسجلة بالفعل لهذه الشحنة.",
      };
    }
    if (msg.includes("idx_uq_shipment_customs_claim_number")) {
      return {
        success: false,
        code: "DUPLICATE_TRANSACTION",
        error: "رقم المطالبة الجمركية مسجل بالفعل لمطالبة نشطة على هذه الشحنة.",
      };
    }
    if (msg.includes("idx_uq_financial_tx_active_reference")) {
      return {
        success: false,
        code: "DUPLICATE_TRANSACTION",
        error: "رقم المرجع / الإيصال المالي مسجل مسبقاً لحركة نشطة من نفس الفئة على هذه الشحنة.",
      };
    }
    if (msg.includes("reversal_of_transaction_id")) {
      return {
        success: false,
        code: "ALREADY_REVERSED",
        error: "هذا القيد المالي تم عكسه مسبقاً ولا يمكن عكسه مرة أخرى.",
      };
    }
    return {
      success: false,
      code: "DUPLICATE_TRANSACTION",
      error: "تم إرسال هذه الحركة المالية مسبقاً (منع تكرار العملية).",
    };
  }

  if (msg.includes("CUSTOMS_OBLIGATION_OVERALLOCATION")) {
    return {
      success: false,
      code: "OBLIGATION_OVERALLOCATION",
      error:
        "مجموع المبالغ المخصصة لتغطية المطالبة الجمركية يتجاوز قيمة المطالبة الرسمية المقررة.",
    };
  }

  if (msg.includes("CUSTOMS_OBLIGATION_BELOW_COVERED")) {
    return {
      success: false,
      code: "OBLIGATION_OVERALLOCATION",
      error:
        "لا يمكن تخفيض قيمة المطالبة الجمركية لأقل من إجمالي الدفعات المرحّلة لتغطيتها.",
    };
  }

  if (msg.includes("CUSTOMS_OBLIGATION_HAS_PAYMENTS")) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error:
        "لا يمكن إلغاء مطالبة جمركية عليها دفعات مرحّلة قبل عكس تلك الدفعات أولاً.",
    };
  }

  if (msg.includes("DUPLICATE_REVERSAL")) {
    return {
      success: false,
      code: "ALREADY_REVERSED",
      error: "هذا القيد المالي تم عكسه مسبقاً ولا يمكن عكسه مرة أخرى.",
    };
  }

  if (msg.includes("INVALID_REVERSAL_TARGET") || msg.includes("REVERSAL_MISMATCH")) {
    return {
      success: false,
      code: "REVERSAL_NOT_ALLOWED",
      error: "القيد المحدد غير قابل للعكس (لا يمكن عكس قيد غير مرحّل أو قيد عكسي آخر).",
    };
  }

  if (msg.includes("INVALID_CUSTOMS_OBLIGATION")) {
    return {
      success: false,
      code: "OBLIGATION_NOT_FOUND",
      error: "سجل المطالبة الجمركية المحدد غير موجود أو ملغى أو لا ينتمي لهذه الشحنة.",
    };
  }

  if (msg.includes("IMMUTABLE_FINANCIAL_LEDGER") || msg.includes("IMMUTABLE_CUSTOMS_OBLIGATION")) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "دفتر الأستاذ المالي غير قابل للتعديل المباشر أو الحذف؛ استخدم قيد العكس لتصحيح الأخطاء.",
    };
  }

  if (
    msg.includes("FINANCIAL_GATE_") ||
    msg.includes("STAGE_10_REQUIRES_FINANCIAL_COMPLETION")
  ) {
    return {
      success: false,
      code: "SETTLEMENT_INCOMPLETE",
      error: "لا يمكن إغلاق المرحلة قبل استيفاء كافة شروط البوابة المالية والتسوية الكاملة.",
    };
  }

  if (
    msg.includes("UNAUTHORIZED_FINANCIAL_ACCESS") ||
    msg.includes("UNAUTHORIZED_MANAGER_FINANCIAL_WRITE")
  ) {
    return {
      success: false,
      code: "UNAUTHORIZED_ROLE",
      error: "غير مصرح لك بتنفيذ هذه العملية المالية.",
    };
  }

  return {
    success: false,
    code: "DATABASE_ERROR",
    error: fallbackMessage,
  };
}

// ─── 2. Section A: Customs Obligations Server Actions ─────────────────────────

const CreateCustomsObligationSchema = z.object({
  shipment_id: z.string().trim().min(1),
  claim_type: z.enum(FINANCIAL_OBLIGATION_CLAIM_TYPES).default("primary_assessment"),
  customs_claim_number: z.string().trim().optional().nullable(),
  assessed_amount: z.union([z.number(), z.string()]),
  assessed_at: z.string().trim().optional(),
  notes: z.string().trim().optional().nullable(),
});

export type CreateCustomsObligationInput = z.input<typeof CreateCustomsObligationSchema>;

/**
 * A.1 Create a new Customs Obligation (`public.shipment_customs_obligations`) for a shipment.
 * Enforces:
 *  - Admin-only permission & verified shipment existence.
 *  - Positive `assessed_amount > 0` parsed via piastres helper.
 *  - At most one active `primary_assessment` per shipment (`supplementary_assessment` and
 *    `penalty_or_demurrage` can be added as additional rows).
 *  - Unique active `customs_claim_number` per shipment.
 */
export async function createCustomsObligationAction(
  rawInput: CreateCustomsObligationInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentCustomsObligation>> {
  const parsed = CreateCustomsObligationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات المطالبة الجمركية غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  let assessedPiastres: number;
  try {
    assessedPiastres = toPiastres(input.assessed_amount, {
      fieldName: "assessed_amount",
      allowNegative: false,
      allowZero: false,
    });
  } catch {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "قيمة المطالبة الجمركية يجب أن تكون مبلغاً موجباً أكبر من صفر.",
    };
  }

  const claimNumber =
    input.customs_claim_number && input.customs_claim_number.trim().length > 0
      ? input.customs_claim_number.trim()
      : null;

  // Check existing active obligations on this shipment for primary_assessment / duplicate claim_number
  const { data: existingObligations, error: fetchErr } = await access.supabase
    .from("shipment_customs_obligations")
    .select("*")
    .eq("shipment_id", input.shipment_id.trim());

  if (fetchErr) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر التحقق من المطالبات الجمركية الحالية للشحنة.",
    };
  }

  const activeObligations = (
    (existingObligations || []) as ShipmentCustomsObligationRow[]
  ).filter((o) => o.status !== "cancelled");

  if (
    input.claim_type === "primary_assessment" &&
    activeObligations.some((o) => o.claim_type === "primary_assessment")
  ) {
    return {
      success: false,
      code: "DUPLICATE_TRANSACTION",
      error:
        "توجد مطالبة جمركية أساسية نشطة مسجلة بالفعل لهذه الشحنة؛ لإضافة فروق تثمين أو غرامات استخدم مطالبة تكميلية أو غرامات.",
    };
  }

  if (
    claimNumber &&
    activeObligations.some(
      (o) =>
        o.customs_claim_number &&
        o.customs_claim_number.trim().toLowerCase() === claimNumber.toLowerCase(),
    )
  ) {
    return {
      success: false,
      code: "DUPLICATE_TRANSACTION",
      error: "رقم المطالبة الجمركية مسجل بالفعل لمطالبة نشطة على هذه الشحنة.",
    };
  }

  const assessedAmountFormatted = fromPiastres(assessedPiastres);

  const { data: inserted, error: insertErr } = await access.supabase
    .from("shipment_customs_obligations")
    .insert({
      shipment_id: input.shipment_id.trim(),
      claim_type: input.claim_type as FinancialObligationClaimType,
      customs_claim_number: claimNumber,
      assessed_amount: assessedAmountFormatted,
      currency: "EGP",
      status: "assessed",
      assessed_at: input.assessed_at || new Date().toISOString(),
      notes: input.notes?.trim() || null,
      created_by: access.actor.id,
      updated_by: access.actor.id,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر إنشاء سجل المطالبة الجمركية.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم تسجيل المطالبة الجمركية بنجاح.",
    data: normalizeCustomsObligationRow(inserted as ShipmentCustomsObligationRow),
  };
}

const UpdateCustomsObligationSchema = z.object({
  obligation_id: z.string().trim().min(1),
  shipment_id: z.string().trim().min(1),
  assessed_amount: z.union([z.number(), z.string()]).optional(),
  customs_claim_number: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type UpdateCustomsObligationInput = z.input<typeof UpdateCustomsObligationSchema>;

/**
 * A.2 Update an existing Customs Obligation (`assessed_amount`, `customs_claim_number`, `notes`).
 * Enforces:
 *  - Cannot update a cancelled obligation.
 *  - Cannot reduce `assessed_amount` below the net sum of posted customs payments already allocated to it.
 */
export async function updateCustomsObligationAction(
  rawInput: UpdateCustomsObligationInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentCustomsObligation>> {
  const parsed = UpdateCustomsObligationSchema.safeParse(rawInput);
  if (!parsed.success || !isValidUuid(parsed.data.obligation_id)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات تحديث المطالبة الجمركية غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  const { data: existingOb, error: obErr } = await access.supabase
    .from("shipment_customs_obligations")
    .select("*")
    .eq("id", input.obligation_id.trim())
    .eq("shipment_id", input.shipment_id.trim())
    .maybeSingle();

  if (obErr || !existingOb) {
    return {
      success: false,
      code: "OBLIGATION_NOT_FOUND",
      error: "سجل المطالبة الجمركية غير موجود أو لا ينتمي لهذه الشحنة.",
    };
  }

  const obligationRow = existingOb as ShipmentCustomsObligationRow;
  if (obligationRow.status === "cancelled") {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "لا يمكن تعديل مطالبة جمركية ملغاة.",
    };
  }

  // Fetch posted transactions linked to this obligation to check already-covered amount
  const { data: linkedTxs, error: txErr } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("customs_obligation_id", obligationRow.id);

  if (txErr) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر التحقق من الدفعات المرتبطة بالمطالبة الجمركية.",
    };
  }

  const txRows = (linkedTxs || []) as ShipmentFinancialTransactionRow[];
  let coveredPiastres = 0;
  for (const tx of txRows) {
    if (tx.entry_status === "posted") {
      const dir = tx.direction === -1 ? -1 : 1;
      coveredPiastres += dir * toPiastres(tx.allocated_customs_amount);
    }
  }

  let newAssessedPiastres = toPiastres(obligationRow.assessed_amount);
  if (input.assessed_amount !== undefined) {
    try {
      newAssessedPiastres = toPiastres(input.assessed_amount, {
        fieldName: "assessed_amount",
        allowNegative: false,
        allowZero: false,
      });
    } catch {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        error: "قيمة المطالبة الجمركية يجب أن تكون مبلغاً موجباً أكبر من صفر.",
      };
    }

    if (newAssessedPiastres < coveredPiastres) {
      return {
        success: false,
        code: "OBLIGATION_OVERALLOCATION",
        error: `لا يمكن تخفيض قيمة المطالبة الجمركية (${fromPiastres(newAssessedPiastres)} ج.م) لأقل من المبالغ المرحّلة لتغطيتها (${fromPiastres(coveredPiastres)} ج.م).`,
      };
    }
  }

  const newStatus = deriveSingleObligationCoverageStatus(
    {
      id: obligationRow.id,
      status: obligationRow.status,
      assessed_amount: fromPiastres(newAssessedPiastres),
    },
    txRows,
  );

  const updatePayload: Record<string, unknown> = {
    assessed_amount: fromPiastres(newAssessedPiastres),
    status: newStatus,
    updated_by: access.actor.id,
    updated_at: new Date().toISOString(),
  };

  if (input.customs_claim_number !== undefined) {
    updatePayload.customs_claim_number =
      input.customs_claim_number && input.customs_claim_number.trim().length > 0
        ? input.customs_claim_number.trim()
        : null;
  }

  if (input.notes !== undefined) {
    updatePayload.notes =
      input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null;
  }

  const { data: updated, error: updateErr } = await access.supabase
    .from("shipment_customs_obligations")
    .update(updatePayload)
    .eq("id", obligationRow.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return mapDatabaseFinancialError(
      updateErr,
      "تعذر تحديث بيانات المطالبة الجمركية.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم تحديث المطالبة الجمركية بنجاح.",
    data: normalizeCustomsObligationRow(updated as ShipmentCustomsObligationRow),
  };
}

const CancelCustomsObligationSchema = z.object({
  obligation_id: z.string().trim().min(1),
  shipment_id: z.string().trim().min(1),
  cancellation_reason: z.string().trim().min(3),
});

export type CancelCustomsObligationInput = z.input<typeof CancelCustomsObligationSchema>;

/**
 * A.3 Cancel a Customs Obligation while preserving its historical row (`status = 'cancelled'`).
 * Enforces:
 *  - Never deletes the row (`IMMUTABLE_CUSTOMS_OBLIGATION`).
 *  - Blocks cancellation if net posted payments (`coveredPiastres > 0`) are allocated to it.
 */
export async function cancelCustomsObligationAction(
  rawInput: CancelCustomsObligationInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentCustomsObligation>> {
  const parsed = CancelCustomsObligationSchema.safeParse(rawInput);
  if (!parsed.success || !isValidUuid(parsed.data.obligation_id)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "يرجى تحديد المطالبة الجمركية وإدخال سبب واضح للإلغاء (3 أحرف على الأقل).",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  const { data: existingOb, error: obErr } = await access.supabase
    .from("shipment_customs_obligations")
    .select("*")
    .eq("id", input.obligation_id.trim())
    .eq("shipment_id", input.shipment_id.trim())
    .maybeSingle();

  if (obErr || !existingOb) {
    return {
      success: false,
      code: "OBLIGATION_NOT_FOUND",
      error: "سجل المطالبة الجمركية غير موجود أو لا ينتمي لهذه الشحنة.",
    };
  }

  const obligationRow = existingOb as ShipmentCustomsObligationRow;
  if (obligationRow.status === "cancelled") {
    return {
      success: true,
      message: "المطالبة الجمركية ملغاة بالفعل.",
      data: normalizeCustomsObligationRow(obligationRow),
    };
  }

  const { data: linkedTxs, error: txErr } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("customs_obligation_id", obligationRow.id);

  if (txErr) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر التحقق من الدفعات المرتبطة بالمطالبة الجمركية.",
    };
  }

  const txRows = (linkedTxs || []) as ShipmentFinancialTransactionRow[];
  let coveredPiastres = 0;
  for (const tx of txRows) {
    if (tx.entry_status === "posted") {
      const dir = tx.direction === -1 ? -1 : 1;
      coveredPiastres += dir * toPiastres(tx.allocated_customs_amount);
    }
  }

  if (coveredPiastres > 0) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: `لا يمكن إلغاء مطالبة جمركية عليها دفعات مرحّلة بقيمة ${fromPiastres(coveredPiastres)} ج.م قبل عكس تلك الدفعات أولاً.`,
    };
  }

  const mergedNotes = obligationRow.notes
    ? `${obligationRow.notes} | [سبب الإلغاء]: ${input.cancellation_reason.trim()}`
    : `[سبب الإلغاء]: ${input.cancellation_reason.trim()}`;

  const { data: updated, error: updateErr } = await access.supabase
    .from("shipment_customs_obligations")
    .update({
      status: "cancelled",
      notes: mergedNotes,
      updated_by: access.actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", obligationRow.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return mapDatabaseFinancialError(
      updateErr,
      "تعذر إلغاء المطالبة الجمركية.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم إلغاء المطالبة الجمركية مع الحفاظ على سجلها التاريخي.",
    data: normalizeCustomsObligationRow(updated as ShipmentCustomsObligationRow),
  };
}

/**
 * A.4 Fetch Customs Obligations for a shipment (convenience Server Action wrapper).
 */
export async function getShipmentCustomsObligationsAction(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentCustomsObligation[]>> {
  return getShipmentCustomsObligationsQuery(shipmentId, context);
}

// ─── 3. Section B: Financial Transactions Server Actions ──────────────────────

/**
 * Helper to check idempotency and active reference uniqueness before inserting a transaction,
 * and to verify customs obligation allocation bounds when `customs_obligation_id` is supplied.
 */
async function prevalidateTransactionInsertion(params: {
  supabase: SupabaseServerClientLike;
  shipmentId: string;
  customsObligationId: string | null;
  entryCategory: FinancialTransactionCategory;
  entryType: FinancialTransactionType;
  entryStatus: "pending_verification" | "posted";
  amount: MonetaryNumericValue;
  allocatedCustomsAmount: MonetaryNumericValue;
  isBillableToCustomer: boolean;
  customerVisible: boolean;
  paymentMethod: FinancialPaymentMethod | null;
  referenceNumber: string | null;
  idempotencyKey: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}): Promise<{
  valid: boolean;
  existingIdempotentTx?: ShipmentFinancialTransaction;
  errorResult?: FinancialResult<never>;
}> {
  // 1. Check idempotency key on the shipment
  const { data: existingIdem } = await params.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("shipment_id", params.shipmentId)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existingIdem) {
    return {
      valid: false,
      errorResult: {
        success: false,
        code: "DUPLICATE_TRANSACTION",
        error: "تم تنفيذ هذه الحركة المالية مسبقاً (تم منع التكرار عبر مفتاح عدم التكرار idempotency_key).",
      },
    };
  }

  // 2. Check active reference_number uniqueness per (shipment_id, entry_category)
  if (params.referenceNumber && params.referenceNumber.trim().length > 0) {
    const cleanRef = params.referenceNumber.trim().toLowerCase();
    const { data: sameCategoryTxs } = await params.supabase
      .from("shipment_financial_transactions")
      .select("id, reference_number, direction, is_reversed, entry_status")
      .eq("shipment_id", params.shipmentId)
      .eq("entry_category", params.entryCategory);

    const hasDuplicateActiveRef = ((sameCategoryTxs || []) as Array<{
      reference_number: string | null;
      direction: number;
      is_reversed: boolean;
      entry_status: string;
    }>).some(
      (tx) =>
        tx.direction === 1 &&
        !tx.is_reversed &&
        tx.entry_status !== "rejected" &&
        tx.reference_number &&
        tx.reference_number.trim().toLowerCase() === cleanRef,
    );

    if (hasDuplicateActiveRef) {
      return {
        valid: false,
        errorResult: {
          success: false,
          code: "DUPLICATE_TRANSACTION",
          error:
            "رقم المرجع / الإيصال المالي مسجل مسبقاً لحركة نشطة من نفس الفئة على هذه الشحنة.",
        },
      };
    }
  }

  // 3. If linked to a customs obligation, verify obligation existence, ownership, status, and remaining coverage
  let linkedObligation: ShipmentCustomsObligationRow | null = null;
  let currentCoveredAmount = 0;

  if (params.customsObligationId) {
    if (!isValidUuid(params.customsObligationId)) {
      return {
        valid: false,
        errorResult: {
          success: false,
          code: "VALIDATION_ERROR",
          error: "معرف المطالبة الجمركية غير صالح.",
        },
      };
    }

    const { data: obRow, error: obErr } = await params.supabase
      .from("shipment_customs_obligations")
      .select("*")
      .eq("id", params.customsObligationId)
      .maybeSingle();

    if (obErr || !obRow) {
      return {
        valid: false,
        errorResult: {
          success: false,
          code: "OBLIGATION_NOT_FOUND",
          error: "سجل المطالبة الجمركية المحدد غير موجود.",
        },
      };
    }

    linkedObligation = obRow as ShipmentCustomsObligationRow;
    if (linkedObligation.shipment_id !== params.shipmentId) {
      return {
        valid: false,
        errorResult: {
          success: false,
          code: "OBLIGATION_NOT_FOUND",
          error: "المطالبة الجمركية المحددة لا تنتمي لهذه الشحنة.",
        },
      };
    }

    if (linkedObligation.status === "cancelled") {
      return {
        valid: false,
        errorResult: {
          success: false,
          code: "VALIDATION_ERROR",
          error: "لا يمكن تخصيص دفعة جمركية على مطالبة ملغاة.",
        },
      };
    }

    const { data: obTxs } = await params.supabase
      .from("shipment_financial_transactions")
      .select("direction, allocated_customs_amount, entry_status")
      .eq("customs_obligation_id", linkedObligation.id);

    let coveredPiastres = 0;
    for (const tx of (obTxs || []) as Array<{
      direction: number;
      allocated_customs_amount: MonetaryNumericValue;
      entry_status: string;
    }>) {
      if (tx.entry_status === "posted") {
        const dir = tx.direction === -1 ? -1 : 1;
        coveredPiastres += dir * toPiastres(tx.allocated_customs_amount);
      }
    }
    currentCoveredAmount = fromPiastres(coveredPiastres);

    // Check overallocation both for immediately posted entries AND for pending_verification direct customs entries
    const candidateAllocatedPiastres = toPiastres(params.allocatedCustomsAmount);
    const assessedPiastres = toPiastres(linkedObligation.assessed_amount);
    if (coveredPiastres + candidateAllocatedPiastres > assessedPiastres) {
      return {
        valid: false,
        errorResult: {
          success: false,
          code: "OBLIGATION_OVERALLOCATION",
          error: `مجموع مبالغ تغطية المطالبة الجمركية (${fromPiastres(coveredPiastres + candidateAllocatedPiastres)} ج.م) يتجاوز قيمة المطالبة الرسمية المقررة (${fromPiastres(assessedPiastres)} ج.م).`,
        },
      };
    }
  }

  // 4. Pure calculation/constraint validation
  const validation = validateFinancialTransactionInput({
    shipment_id: params.shipmentId,
    customs_obligation_id: params.customsObligationId,
    entry_category: params.entryCategory,
    entry_type: params.entryType,
    entry_status: params.entryStatus,
    direction: 1,
    amount: params.amount,
    allocated_customs_amount: params.allocatedCustomsAmount,
    is_billable_to_customer: params.isBillableToCustomer,
    customer_visible: params.customerVisible,
    payment_method: params.paymentMethod,
    reference_number: params.referenceNumber,
    idempotency_key: params.idempotencyKey,
    verified_by: params.verifiedBy,
    verified_at: params.verifiedAt,
    linkedObligation,
    currentObligationCoveredAmount: currentCoveredAmount,
  });

  if (!validation.valid) {
    return {
      valid: false,
      errorResult: {
        success: false,
        code: "VALIDATION_ERROR",
        error: validation.errors[0] || "بيانات الحركة المالية غير صالحة.",
      },
    };
  }

  return { valid: true };
}

const RecordOutDisbursementSchema = z.object({
  shipment_id: z.string().trim().min(1),
  entry_type: z.enum([
    "customs_duties",
    "government_fees",
    "port_demurrage",
    "inspection_fees",
    "transport_fees",
    "other_expense",
  ]),
  customs_obligation_id: z.string().trim().optional().nullable(),
  amount: z.union([z.number(), z.string()]),
  is_billable_to_customer: z.boolean().default(true),
  customer_visible: z.boolean().optional(),
  payment_method: z.enum(FINANCIAL_PAYMENT_METHODS),
  reference_number: z.string().trim().min(2),
  recipient_or_counterparty: z.string().trim().optional().nullable(),
  transaction_date: z.string().trim().optional(),
  attachment_document_id: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  idempotency_key: z.string().trim().min(1),
});

export type RecordOutDisbursementInput = z.input<typeof RecordOutDisbursementSchema>;

/**
 * B.1 & B.2 Record an expense / disbursement paid by OUT (`entry_category = 'out_disbursement'`).
 * Supports:
 *  - OUT paying Customs duties (`entry_type = 'customs_duties'`, linked `customs_obligation_id`,
 *    `allocated_customs_amount = amount`).
 *  - OUT paying additional operational expenses (`government_fees`, `port_demurrage`, `inspection_fees`,
 *    `transport_fees`, `other_expense`) as either billable (`is_billable_to_customer = true`)
 *    or non-billable absorbed by OUT (`is_billable_to_customer = false`, `customer_visible = false`).
 */
export async function recordOutDisbursementAction(
  rawInput: RecordOutDisbursementInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = RecordOutDisbursementSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات المصروف المسدد بواسطة OUT غير مكتملة أو غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  let amountPiastres: number;
  try {
    amountPiastres = toPiastres(input.amount, {
      fieldName: "amount",
      allowNegative: false,
      allowZero: false,
    });
  } catch {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "قيمة المصروف يجب أن تكون مبلغاً موجباً أكبر من صفر.",
    };
  }

  const amountFormatted = fromPiastres(amountPiastres);
  const isCustomsDuties = input.entry_type === "customs_duties";
  const customsObligationId = isCustomsDuties
    ? (input.customs_obligation_id?.trim() || null)
    : null;

  if (isCustomsDuties && !customsObligationId) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "عند تسجيل سداد رسوم جمركية بواسطة OUT يجب ربط القيد بسجل المطالبة الجمركية.",
    };
  }

  if (!isCustomsDuties && input.customs_obligation_id) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "لا يجوز ربط مصروف غير جمركي بسجل المطالبة الجمركية الرسمية.",
    };
  }

  const allocatedCustomsAmount = isCustomsDuties ? amountFormatted : 0;
  const isBillable = input.is_billable_to_customer;
  // Non-billable OUT disbursements can NEVER be visible to the customer
  const customerVisible = isBillable ? (input.customer_visible ?? true) : false;

  if (!isBillable && input.customer_visible === true) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "المصروف الداخلي غير القابل للفوترة على العميل لا يمكن إظهاره للعميل.",
    };
  }

  const nowIso = new Date().toISOString();

  const precheck = await prevalidateTransactionInsertion({
    supabase: access.supabase,
    shipmentId: input.shipment_id.trim(),
    customsObligationId,
    entryCategory: "out_disbursement",
    entryType: input.entry_type,
    entryStatus: "posted",
    amount: amountFormatted,
    allocatedCustomsAmount,
    isBillableToCustomer: isBillable,
    customerVisible,
    paymentMethod: input.payment_method as FinancialPaymentMethod,
    referenceNumber: input.reference_number.trim(),
    idempotencyKey: input.idempotency_key.trim(),
    verifiedBy: access.actor.id,
    verifiedAt: nowIso,
  });

  if (!precheck.valid) {
    return precheck.errorResult!;
  }

  const { data: inserted, error: insertErr } = await access.supabase
    .from("shipment_financial_transactions")
    .insert({
      shipment_id: input.shipment_id.trim(),
      customs_obligation_id: customsObligationId,
      entry_category: "out_disbursement",
      entry_type: input.entry_type,
      entry_status: "posted",
      direction: 1,
      amount: amountFormatted,
      allocated_customs_amount: allocatedCustomsAmount,
      currency: "EGP",
      is_billable_to_customer: isBillable,
      customer_visible: customerVisible,
      payment_method: input.payment_method,
      reference_number: input.reference_number.trim(),
      recipient_or_counterparty: input.recipient_or_counterparty?.trim() || null,
      transaction_date: input.transaction_date || nowIso,
      attachment_document_id: input.attachment_document_id?.trim() || null,
      description: input.description?.trim() || null,
      idempotency_key: input.idempotency_key.trim(),
      created_by: access.actor.id,
      verified_by: access.actor.id,
      verified_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر تسجيل المصروف في دفتر الأستاذ المالي.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم تسجيل المصروف المسدد بواسطة OUT بنجاح.",
    data: normalizeFinancialTransactionRow(inserted as ShipmentFinancialTransactionRow),
  };
}

const RecordCustomerPaymentToOutSchema = z.object({
  shipment_id: z.string().trim().min(1),
  entry_type: z.enum(["customer_installment", "final_settlement"]).default("customer_installment"),
  amount: z.union([z.number(), z.string()]),
  payment_method: z.enum(FINANCIAL_PAYMENT_METHODS),
  reference_number: z.string().trim().min(2),
  recipient_or_counterparty: z.string().trim().optional().nullable(),
  transaction_date: z.string().trim().optional(),
  attachment_document_id: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  idempotency_key: z.string().trim().min(1),
});

export type RecordCustomerPaymentToOutInput = z.input<typeof RecordCustomerPaymentToOutSchema>;

/**
 * B.3 Record a payment collected from the customer by OUT (`entry_category = 'customer_payment_to_out'`).
 */
export async function recordCustomerPaymentToOutAction(
  rawInput: RecordCustomerPaymentToOutInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = RecordCustomerPaymentToOutSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات دفعة التحصيل من العميل غير مكتملة أو غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  let amountPiastres: number;
  try {
    amountPiastres = toPiastres(input.amount, {
      fieldName: "amount",
      allowNegative: false,
      allowZero: false,
    });
  } catch {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "مبلغ الدفعة المحصلة يجب أن يكون رقماً موجباً أكبر من صفر.",
    };
  }

  const amountFormatted = fromPiastres(amountPiastres);
  const nowIso = new Date().toISOString();

  const precheck = await prevalidateTransactionInsertion({
    supabase: access.supabase,
    shipmentId: input.shipment_id.trim(),
    customsObligationId: null,
    entryCategory: "customer_payment_to_out",
    entryType: input.entry_type,
    entryStatus: "posted",
    amount: amountFormatted,
    allocatedCustomsAmount: 0,
    isBillableToCustomer: true,
    customerVisible: true,
    paymentMethod: input.payment_method as FinancialPaymentMethod,
    referenceNumber: input.reference_number.trim(),
    idempotencyKey: input.idempotency_key.trim(),
    verifiedBy: access.actor.id,
    verifiedAt: nowIso,
  });

  if (!precheck.valid) {
    return precheck.errorResult!;
  }

  const { data: inserted, error: insertErr } = await access.supabase
    .from("shipment_financial_transactions")
    .insert({
      shipment_id: input.shipment_id.trim(),
      customs_obligation_id: null,
      entry_category: "customer_payment_to_out",
      entry_type: input.entry_type,
      entry_status: "posted",
      direction: 1,
      amount: amountFormatted,
      allocated_customs_amount: 0,
      currency: "EGP",
      is_billable_to_customer: true,
      customer_visible: true,
      payment_method: input.payment_method,
      reference_number: input.reference_number.trim(),
      recipient_or_counterparty:
        input.recipient_or_counterparty?.trim() || "خزينة / حسابات شركة OUT",
      transaction_date: input.transaction_date || nowIso,
      attachment_document_id: input.attachment_document_id?.trim() || null,
      description: input.description?.trim() || null,
      idempotency_key: input.idempotency_key.trim(),
      created_by: access.actor.id,
      verified_by: access.actor.id,
      verified_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر تسجيل دفعة العميل في دفتر الأستاذ المالي.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم تسجيل دفعة التحصيل من العميل لصالح OUT بنجاح.",
    data: normalizeFinancialTransactionRow(inserted as ShipmentFinancialTransactionRow),
  };
}

const RecordCustomerDirectCustomsPaymentSchema = z.object({
  shipment_id: z.string().trim().min(1),
  customs_obligation_id: z.string().trim().min(1),
  amount: z.union([z.number(), z.string()]),
  payment_method: z.enum(FINANCIAL_PAYMENT_METHODS),
  reference_number: z.string().trim().min(2),
  recipient_or_counterparty: z.string().trim().optional().nullable(),
  transaction_date: z.string().trim().optional(),
  attachment_document_id: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  idempotency_key: z.string().trim().min(1),
});

export type RecordCustomerDirectCustomsPaymentInput = z.input<
  typeof RecordCustomerDirectCustomsPaymentSchema
>;

/**
 * B.4 Record a direct customer payment to Customs (`entry_category = 'customer_direct_customs_payment'`)
 * with initial status `entry_status = 'pending_verification'`.
 *
 * Strict Guarantees:
 *  - Always recorded with `entry_status = 'pending_verification'`, `is_billable_to_customer = false`,
 *    and `customer_visible = false` (until verified and posted).
 *  - NEVER counted as money received by OUT (`total_received_by_out`) or billed by OUT (`billable_out_disbursements`).
 *  - Does NOT count toward `total_customs_covered` until verified via `verifyCustomerDirectCustomsPaymentAction`.
 */
export async function recordCustomerDirectCustomsPaymentAction(
  rawInput: RecordCustomerDirectCustomsPaymentInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = RecordCustomerDirectCustomsPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات السداد الجمركي المباشر من العميل غير مكتملة أو غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  let amountPiastres: number;
  try {
    amountPiastres = toPiastres(input.amount, {
      fieldName: "amount",
      allowNegative: false,
      allowZero: false,
    });
  } catch {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "مبلغ السداد الجمركي المباشر يجب أن يكون رقماً موجباً أكبر من صفر.",
    };
  }

  const amountFormatted = fromPiastres(amountPiastres);
  const nowIso = new Date().toISOString();

  const precheck = await prevalidateTransactionInsertion({
    supabase: access.supabase,
    shipmentId: input.shipment_id.trim(),
    customsObligationId: input.customs_obligation_id.trim(),
    entryCategory: "customer_direct_customs_payment",
    entryType: "customs_duties",
    entryStatus: "pending_verification",
    amount: amountFormatted,
    allocatedCustomsAmount: amountFormatted,
    isBillableToCustomer: false,
    customerVisible: false, // Required by Migration 0019 while entry_status = 'pending_verification'
    paymentMethod: input.payment_method as FinancialPaymentMethod,
    referenceNumber: input.reference_number.trim(),
    idempotencyKey: input.idempotency_key.trim(),
    verifiedBy: null,
    verifiedAt: null,
  });

  if (!precheck.valid) {
    return precheck.errorResult!;
  }

  const { data: inserted, error: insertErr } = await access.supabase
    .from("shipment_financial_transactions")
    .insert({
      shipment_id: input.shipment_id.trim(),
      customs_obligation_id: input.customs_obligation_id.trim(),
      entry_category: "customer_direct_customs_payment",
      entry_type: "customs_duties",
      entry_status: "pending_verification",
      direction: 1,
      amount: amountFormatted,
      allocated_customs_amount: amountFormatted,
      currency: "EGP",
      is_billable_to_customer: false,
      customer_visible: false,
      payment_method: input.payment_method,
      reference_number: input.reference_number.trim(),
      recipient_or_counterparty:
        input.recipient_or_counterparty?.trim() || "مصلحة الجمارك المصرية",
      transaction_date: input.transaction_date || nowIso,
      attachment_document_id: input.attachment_document_id?.trim() || null,
      description: input.description?.trim() || null,
      idempotency_key: input.idempotency_key.trim(),
      created_by: access.actor.id,
      verified_by: null,
      verified_at: null,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر تسجيل إشعار السداد الجمركي المباشر.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message:
      "تم تسجيل إشعار السداد الجمركي المباشر بحالة «بانتظار المراجعة والتحقق» ولا يدخل في التغطية المؤكدة إلا بعد التحقق من مستند السداد واعتماده.",
    data: normalizeFinancialTransactionRow(inserted as ShipmentFinancialTransactionRow),
  };
}

const VerifyCustomerDirectCustomsPaymentSchema = z.object({
  transaction_id: z.string().trim().min(1),
  shipment_id: z.string().trim().min(1),
  attachment_document_id: z.string().trim().optional().nullable(),
  verification_note: z.string().trim().optional().nullable(),
});

export type VerifyCustomerDirectCustomsPaymentInput = z.input<
  typeof VerifyCustomerDirectCustomsPaymentSchema
>;

/**
 * B.5 Verify and approve a pending direct customer customs payment (`pending_verification` -> `posted`).
 * Enforces:
 *  - Target transaction must exist, belong to `shipment_id`, have `entry_category = 'customer_direct_customs_payment'`,
 *    and currently be in `entry_status = 'pending_verification'`.
 *  - Must have a valid payment `reference_number` and verified payment evidence (`attachment_document_id`
 *    either already attached on the transaction or supplied during verification).
 *  - Linked customs obligation must not be cancelled and must not exceed `assessed_amount` when posted.
 */
export async function verifyCustomerDirectCustomsPaymentAction(
  rawInput: VerifyCustomerDirectCustomsPaymentInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = VerifyCustomerDirectCustomsPaymentSchema.safeParse(rawInput);
  if (!parsed.success || !isValidUuid(parsed.data.transaction_id)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات اعتماد الدفعة الجمركية المباشرة غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  const { data: existingTx, error: txErr } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("id", input.transaction_id.trim())
    .eq("shipment_id", input.shipment_id.trim())
    .maybeSingle();

  if (txErr || !existingTx) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "القيد المالي المطلوب اعتماده غير موجود.",
    };
  }

  const txRow = existingTx as ShipmentFinancialTransactionRow;
  if (txRow.entry_category !== "customer_direct_customs_payment") {
    return {
      success: false,
      code: "VERIFICATION_FAILED",
      error: "هذه العملية مخصصة فقط لاعتماد دفعات العميل المباشرة للجمارك.",
    };
  }

  if (txRow.entry_status === "posted") {
    return {
      success: true,
      message: "تم التحقق من هذه الدفعة واعتمادها مسبقاً.",
      data: normalizeFinancialTransactionRow(txRow),
    };
  }

  if (txRow.entry_status !== "pending_verification") {
    return {
      success: false,
      code: "VERIFICATION_FAILED",
      error: "لا يمكن اعتماد قيد مرفوض؛ يجب أن تكون الدفعة في حالة «بانتظار المراجعة والتحقق».",
    };
  }

  if (!txRow.reference_number || txRow.reference_number.trim().length < 2 || !txRow.payment_method) {
    return {
      success: false,
      code: "VERIFICATION_FAILED",
      error: "لا يمكن اعتماد الدفعة المباشرة دون وجود رقم إيصال رسمي ووسيلة دفع موثقة.",
    };
  }

  const resolvedAttachmentId =
    input.attachment_document_id?.trim() || txRow.attachment_document_id || null;

  if (!resolvedAttachmentId || !isValidUuid(resolvedAttachmentId)) {
    return {
      success: false,
      code: "VERIFICATION_FAILED",
      error:
        "لا يمكن اعتماد الدفعة الجمركية المباشرة قبل إرفاق والتحقق من مستند إيصال السداد (`attachment_document_id`).",
    };
  }

  // Verify the attachment document exists and belongs to the same shipment
  const { data: docRow, error: docErr } = await access.supabase
    .from("documents")
    .select("id, shipment_id")
    .eq("id", resolvedAttachmentId)
    .maybeSingle();

  if (docErr || !docRow || docRow.shipment_id !== input.shipment_id.trim()) {
    return {
      success: false,
      code: "VERIFICATION_FAILED",
      error: "مستند إيصال السداد المرفق غير موجود أو لا ينتمي لهذه الشحنة.",
    };
  }

  // Verify customs obligation coverage will not exceed assessed_amount
  if (!txRow.customs_obligation_id) {
    return {
      success: false,
      code: "OBLIGATION_NOT_FOUND",
      error: "الدفعة المباشرة غير مرتبطة بمطالبة جمركية صالحة.",
    };
  }

  const { data: obRow, error: obErr } = await access.supabase
    .from("shipment_customs_obligations")
    .select("*")
    .eq("id", txRow.customs_obligation_id)
    .maybeSingle();

  if (obErr || !obRow || obRow.status === "cancelled") {
    return {
      success: false,
      code: "OBLIGATION_NOT_FOUND",
      error: "المطالبة الجمركية المرتبطة بالدفعة غير موجودة أو ملغاة.",
    };
  }

  const { data: postedObTxs } = await access.supabase
    .from("shipment_financial_transactions")
    .select("id, direction, allocated_customs_amount, entry_status")
    .eq("customs_obligation_id", txRow.customs_obligation_id);

  let coveredPiastres = 0;
  for (const t of (postedObTxs || []) as Array<{
    id: string;
    direction: number;
    allocated_customs_amount: MonetaryNumericValue;
    entry_status: string;
  }>) {
    if (t.entry_status === "posted" && t.id !== txRow.id) {
      const dir = t.direction === -1 ? -1 : 1;
      coveredPiastres += dir * toPiastres(t.allocated_customs_amount);
    }
  }

  const txAllocatedPiastres = toPiastres(txRow.allocated_customs_amount);
  const assessedPiastres = toPiastres(obRow.assessed_amount);

  if (coveredPiastres + txAllocatedPiastres > assessedPiastres) {
    return {
      success: false,
      code: "OBLIGATION_OVERALLOCATION",
      error: `اعتماد هذه الدفعة يؤدي لتجاوز قيمة المطالبة الجمركية المقررة (${fromPiastres(assessedPiastres)} ج.م).`,
    };
  }

  const nowIso = new Date().toISOString();
  const updatedDescription = input.verification_note?.trim()
    ? txRow.description
      ? `${txRow.description} | [توثيق الاعتماد]: ${input.verification_note.trim()}`
      : `[توثيق الاعتماد]: ${input.verification_note.trim()}`
    : txRow.description;

  const { data: updated, error: updateErr } = await access.supabase
    .from("shipment_financial_transactions")
    .update({
      entry_status: "posted",
      customer_visible: true,
      attachment_document_id: resolvedAttachmentId,
      description: updatedDescription,
      verified_by: access.actor.id,
      verified_at: nowIso,
    })
    .eq("id", txRow.id)
    .eq("entry_status", "pending_verification")
    .select("*")
    .single();

  if (updateErr || !updated) {
    return mapDatabaseFinancialError(
      updateErr,
      "تعذر اعتماد الدفعة الجمركية المباشرة.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم التحقق من إيصال السداد واعتماد الدفعة الجمركية المباشرة بنجاح.",
    data: normalizeFinancialTransactionRow(updated as ShipmentFinancialTransactionRow),
  };
}

const RejectFinancialTransactionSchema = z.object({
  transaction_id: z.string().trim().min(1),
  shipment_id: z.string().trim().min(1),
  rejection_reason: z.string().trim().min(3),
});

export type RejectFinancialTransactionInput = z.input<typeof RejectFinancialTransactionSchema>;

/**
 * B.6 Reject a `pending_verification` financial transaction with a mandatory `rejection_reason`.
 * Enforces:
 *  - Posted transactions can NEVER be rejected (`IMMUTABLE_FINANCIAL_LEDGER` — must use reversal).
 */
export async function rejectFinancialTransactionAction(
  rawInput: RejectFinancialTransactionInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = RejectFinancialTransactionSchema.safeParse(rawInput);
  if (!parsed.success || !isValidUuid(parsed.data.transaction_id)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "يرجى تحديد القيد المالي وإدخال سبب واضح للرفض (3 أحرف على الأقل).",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  const { data: existingTx, error: txErr } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("id", input.transaction_id.trim())
    .eq("shipment_id", input.shipment_id.trim())
    .maybeSingle();

  if (txErr || !existingTx) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "القيد المالي المطلوب رفضه غير موجود.",
    };
  }

  const txRow = existingTx as ShipmentFinancialTransactionRow;
  if (txRow.entry_status === "posted") {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "لا يمكن رفض قيد مالي مرحّل (posted)؛ استخدم قيد العكس (Reversal) لإلغاء أثره المحاسبي.",
    };
  }

  if (txRow.entry_status === "rejected") {
    return {
      success: true,
      message: "تم رفض هذا القيد المالي مسبقاً.",
      data: normalizeFinancialTransactionRow(txRow),
    };
  }

  const nowIso = new Date().toISOString();

  const { data: updated, error: updateErr } = await access.supabase
    .from("shipment_financial_transactions")
    .update({
      entry_status: "rejected",
      customer_visible: false,
      rejection_reason: input.rejection_reason.trim(),
      verified_by: access.actor.id,
      verified_at: nowIso,
    })
    .eq("id", txRow.id)
    .eq("entry_status", "pending_verification")
    .select("*")
    .single();

  if (updateErr || !updated) {
    return mapDatabaseFinancialError(updateErr, "تعذر تسجيل رفض القيد المالي.");
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم رفض القيد المالي وتوثيق سبب الرفض بنجاح.",
    data: normalizeFinancialTransactionRow(updated as ShipmentFinancialTransactionRow),
  };
}

const RecordCustomerChargeOrCreditSchema = z.object({
  shipment_id: z.string().trim().min(1),
  entry_category: z.enum(["customer_charge", "credit_adjustment"]),
  entry_type: z.enum([
    "extra_clearance_service",
    "documentation_fee",
    "storage_surcharge",
    "other_charge",
    "discount_credit",
  ]),
  amount: z.union([z.number(), z.string()]),
  reference_number: z.string().trim().optional().nullable(),
  transaction_date: z.string().trim().optional(),
  attachment_document_id: z.string().trim().optional().nullable(),
  description: z.string().trim().min(3),
  idempotency_key: z.string().trim().min(1),
  /** Optional explicit guard flag if caller mistakenly attempts to re-record base OUT clearance fee */
  is_base_clearance_service_fee: z.boolean().optional(),
});

export type RecordCustomerChargeOrCreditInput = z.input<
  typeof RecordCustomerChargeOrCreditSchema
>;

const FORBIDDEN_BASE_FEE_PATTERNS = [
  "base_clearance_fee",
  "shipment_pricing.final_price",
  "أتعاب التخليص الأساسية",
  "أتعاب خدمة out الأساسية",
];

/**
 * B.7 Record an approved extra customer charge (`customer_charge`) or credit/discount (`credit_adjustment`).
 *
 * Strict Anti-Double-Counting Guard:
 *  - The agreed base OUT clearance service fee is stored exclusively in `shipment_pricing.final_price`.
 *  - Any attempt to record the base OUT clearance fee a second time in `shipment_financial_transactions`
 *    is rejected with `VALIDATION_ERROR`.
 */
export async function recordCustomerChargeOrCreditAction(
  rawInput: RecordCustomerChargeOrCreditInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = RecordCustomerChargeOrCreditSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات الرسوم الإضافية أو الخصم غير مكتملة أو غير صالحة.",
    };
  }

  const input = parsed.data;

  // Prevent double-counting base OUT service fee already in shipment_pricing.final_price
  const descLower = input.description.trim().toLowerCase();
  if (
    input.is_base_clearance_service_fee === true ||
    FORBIDDEN_BASE_FEE_PATTERNS.some((p) => descLower.includes(p.toLowerCase()))
  ) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error:
        "لا يجوز تسجيل أتعاب خدمة التخليص الأساسية لـ OUT في دفتر الأستاذ المالي لأنها مسجلة بالفعل في السعر النهائي المعتمد للشحنة (`shipment_pricing.final_price`).",
    };
  }

  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  let amountPiastres: number;
  try {
    amountPiastres = toPiastres(input.amount, {
      fieldName: "amount",
      allowNegative: false,
      allowZero: false,
    });
  } catch {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "المبلغ يجب أن يكون رقماً موجباً أكبر من صفر.",
    };
  }

  const amountFormatted = fromPiastres(amountPiastres);
  const nowIso = new Date().toISOString();

  const precheck = await prevalidateTransactionInsertion({
    supabase: access.supabase,
    shipmentId: input.shipment_id.trim(),
    customsObligationId: null,
    entryCategory: input.entry_category,
    entryType: input.entry_type,
    entryStatus: "posted",
    amount: amountFormatted,
    allocatedCustomsAmount: 0,
    isBillableToCustomer: true,
    customerVisible: true,
    paymentMethod: null,
    referenceNumber: input.reference_number?.trim() || null,
    idempotencyKey: input.idempotency_key.trim(),
    verifiedBy: access.actor.id,
    verifiedAt: nowIso,
  });

  if (!precheck.valid) {
    return precheck.errorResult!;
  }

  const { data: inserted, error: insertErr } = await access.supabase
    .from("shipment_financial_transactions")
    .insert({
      shipment_id: input.shipment_id.trim(),
      customs_obligation_id: null,
      entry_category: input.entry_category,
      entry_type: input.entry_type,
      entry_status: "posted",
      direction: 1,
      amount: amountFormatted,
      allocated_customs_amount: 0,
      currency: "EGP",
      is_billable_to_customer: true,
      customer_visible: true,
      payment_method: null,
      reference_number: input.reference_number?.trim() || null,
      recipient_or_counterparty: null,
      transaction_date: input.transaction_date || nowIso,
      attachment_document_id: input.attachment_document_id?.trim() || null,
      description: input.description.trim(),
      idempotency_key: input.idempotency_key.trim(),
      created_by: access.actor.id,
      verified_by: access.actor.id,
      verified_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر تسجيل القيد المالي في دفتر الأستاذ.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message:
      input.entry_category === "credit_adjustment"
        ? "تم تسجيل الخصم / التسوية الدائنة للعميل بنجاح."
        : "تم تسجيل الرسوم الإضافية على الشحنة بنجاح.",
    data: normalizeFinancialTransactionRow(inserted as ShipmentFinancialTransactionRow),
  };
}

// ─── 4. Section C: Atomic Double-Entry Reversal Server Action ─────────────────

const ReverseFinancialTransactionSchema = z.object({
  transaction_id: z.string().trim().min(1),
  shipment_id: z.string().trim().min(1),
  reversal_reason: z.string().trim().min(3),
  idempotency_key: z.string().trim().min(1),
});

export type ReverseFinancialTransactionInput = z.input<
  typeof ReverseFinancialTransactionSchema
>;

/**
 * C.1 Reverse a previously posted financial transaction (`direction = -1`).
 *
 * Atomicity & Integrity Guarantees (Backed by Migration 0019 Triggers):
 *  - NEVER deletes or modifies the original transaction's amount/type/status.
 *  - Pre-validates that the original transaction exists, belongs to `shipment_id`,
 *    has `direction === 1`, `entry_status === 'posted'`, and `is_reversed === false`.
 *  - Performs a SINGLE `INSERT` of the reversal row (`direction = -1`, `reversal_of_transaction_id`).
 *  - Inside PostgreSQL, the `BEFORE INSERT` trigger (`enforce_financial_transaction_integrity`)
 *    acquires a `FOR UPDATE` row lock on the original transaction, and the `AFTER INSERT` trigger
 *    (`sync_after_financial_transaction`) atomically sets `is_reversed = true`, `reversed_at`, `reversed_by`
 *    on the original row, recalculates customs obligation status, and reopens `stage_9_fees_payments`
 *    if the reversal makes the shipment unsettled.
 */
export async function reverseFinancialTransactionAction(
  rawInput: ReverseFinancialTransactionInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialTransaction>> {
  const parsed = ReverseFinancialTransactionSchema.safeParse(rawInput);
  if (!parsed.success || !isValidUuid(parsed.data.transaction_id)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "يرجى تحديد القيد المالي المطلوب عكسه وإدخال سبب واضح للعكس (3 أحرف على الأقل).",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  // Check idempotency key first (prevents double-click duplicate submissions)
  const { data: existingIdem } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("shipment_id", input.shipment_id.trim())
    .eq("idempotency_key", input.idempotency_key.trim())
    .maybeSingle();

  if (existingIdem) {
    return {
      success: false,
      code: "DUPLICATE_TRANSACTION",
      error: "تم إرسال طلب عكس هذا القيد مسبقاً (تم منع تكرار العملية).",
    };
  }

  // Fetch original transaction
  const { data: origData, error: origErr } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("id", input.transaction_id.trim())
    .maybeSingle();

  if (origErr || !origData) {
    return {
      success: false,
      code: "REVERSAL_NOT_ALLOWED",
      error: "القيد الأصلي المطلوب عكسه غير موجود.",
    };
  }

  const orig = origData as ShipmentFinancialTransactionRow;

  if (orig.shipment_id !== input.shipment_id.trim()) {
    return {
      success: false,
      code: "REVERSAL_NOT_ALLOWED",
      error: "القيد المالي لا ينتمي لهذه الشحنة.",
    };
  }

  if (orig.direction !== 1) {
    return {
      success: false,
      code: "REVERSAL_NOT_ALLOWED",
      error: "لا يمكن عكس قيد عكسي آخر.",
    };
  }

  if (orig.entry_status !== "posted") {
    return {
      success: false,
      code: "REVERSAL_NOT_ALLOWED",
      error: "لا يمكن عكس قيد غير مرحّل (pending_verification أو rejected).",
    };
  }

  if (orig.is_reversed) {
    return {
      success: false,
      code: "ALREADY_REVERSED",
      error: "هذا القيد المالي تم عكسه مسبقاً ولا يمكن عكسه مرة أخرى.",
    };
  }

  // Also check if a reversal row referencing orig.id already exists
  const { data: existingReversal } = await access.supabase
    .from("shipment_financial_transactions")
    .select("id")
    .eq("reversal_of_transaction_id", orig.id)
    .maybeSingle();

  if (existingReversal) {
    return {
      success: false,
      code: "ALREADY_REVERSED",
      error: "هذا القيد المالي تم عكسه مسبقاً ولا يمكن عكسه مرة أخرى.",
    };
  }

  const nowIso = new Date().toISOString();
  const amountFormatted = fromPiastres(toPiastres(orig.amount));
  const allocatedFormatted = fromPiastres(toPiastres(orig.allocated_customs_amount));

  const validation = validateFinancialTransactionInput({
    shipment_id: orig.shipment_id,
    customs_obligation_id: orig.customs_obligation_id,
    entry_category: orig.entry_category,
    entry_type: orig.entry_type,
    entry_status: "posted",
    direction: -1,
    amount: amountFormatted,
    allocated_customs_amount: allocatedFormatted,
    is_billable_to_customer: orig.is_billable_to_customer,
    customer_visible: orig.customer_visible,
    payment_method: orig.payment_method,
    reference_number: orig.reference_number,
    idempotency_key: input.idempotency_key.trim(),
    reversal_of_transaction_id: orig.id,
    reversal_reason: input.reversal_reason.trim(),
    verified_by: access.actor.id,
    verified_at: nowIso,
    originalTransaction: orig,
  });

  if (!validation.valid) {
    return {
      success: false,
      code: "REVERSAL_NOT_ALLOWED",
      error: validation.errors[0] || "بيانات القيد العكسي غير متوافقة مع القيد الأصلي.",
    };
  }

  // Single atomic INSERT — database triggers handle marking orig.is_reversed = true,
  // recalculating obligation status, and reopening Stage 9 if needed.
  const { data: insertedReversal, error: insertErr } = await access.supabase
    .from("shipment_financial_transactions")
    .insert({
      shipment_id: orig.shipment_id,
      customs_obligation_id: orig.customs_obligation_id,
      entry_category: orig.entry_category,
      entry_type: orig.entry_type,
      entry_status: "posted",
      direction: -1,
      amount: amountFormatted,
      allocated_customs_amount: allocatedFormatted,
      currency: "EGP",
      is_billable_to_customer: orig.is_billable_to_customer,
      customer_visible: orig.customer_visible,
      payment_method: orig.payment_method,
      reference_number: orig.reference_number,
      recipient_or_counterparty: orig.recipient_or_counterparty,
      transaction_date: nowIso,
      attachment_document_id: orig.attachment_document_id,
      description: `قيد عكسي: ${input.reversal_reason.trim()}`,
      idempotency_key: input.idempotency_key.trim(),
      reversal_of_transaction_id: orig.id,
      reversal_reason: input.reversal_reason.trim(),
      is_reversed: false,
      created_by: access.actor.id,
      verified_by: access.actor.id,
      verified_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr || !insertedReversal) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر إنشاء القيد العكسي في دفتر الأستاذ المالي.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم إدراج القيد العكسي بنجاح وإلغاء الأثر المحاسبي للقيد الأصلي مع حفظ السجل التدقيقي.",
    data: normalizeFinancialTransactionRow(
      insertedReversal as ShipmentFinancialTransactionRow,
    ),
  };
}

// ─── 5. Section D: Internal Financial Notes & Stage 9 Completion Gate ─────────

const AddFinancialInternalNoteSchema = z.object({
  shipment_id: z.string().trim().min(1),
  transaction_id: z.string().trim().optional().nullable(),
  note: z.string().trim().min(2),
});

export type AddFinancialInternalNoteInput = z.input<typeof AddFinancialInternalNoteSchema>;

/**
 * D.1 Add an internal financial note (`public.shipment_financial_internal_notes`).
 * Strictly Admin-only; never visible to customers.
 */
export async function addFinancialInternalNoteAction(
  rawInput: AddFinancialInternalNoteInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialInternalNote>> {
  const parsed = AddFinancialInternalNoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "يرجى إدخال نص الملاحظة الداخلية (حرفان على الأقل).",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  const txId = input.transaction_id?.trim() || null;
  if (txId && !isValidUuid(txId)) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "معرف الحركة المالية المرتبطة بالملاحظة غير صالح.",
    };
  }

  const { data: inserted, error: insertErr } = await access.supabase
    .from("shipment_financial_internal_notes")
    .insert({
      shipment_id: input.shipment_id.trim(),
      transaction_id: txId,
      note: input.note.trim(),
      created_by: access.actor.id,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return mapDatabaseFinancialError(
      insertErr,
      "تعذر حفظ الملاحظة المالية الداخلية.",
    );
  }

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم حفظ الملاحظة المالية الداخلية بنجاح.",
    data: inserted as ShipmentFinancialInternalNoteRow,
  };
}

const CompleteStage9FinancialSettlementSchema = z.object({
  shipment_id: z.string().trim().min(1),
  reference_number: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type CompleteStage9FinancialSettlementInput = z.input<
  typeof CompleteStage9FinancialSettlementSchema
>;

export interface CompleteStage9FinancialSettlementData {
  summary: ShipmentFinancialSummary;
  gate: Stage9FinancialGateEvaluation;
}

/**
 * D.2 Complete Stage 9 (`stage_9_fees_payments`) after verifying all financial gate conditions.
 *
 * Strict Guarantees:
 *  - Restricted strictly to `admin` (neither `manager` nor `customer` nor field staff can close Stage 9).
 *  - Evaluates the authoritative database summary (`get_shipment_financial_summary`) and
 *    `evaluateStage9FinancialGate(summary)`.
 *  - Rejects partial payments, unconfirmed final prices (`estimated_range`), unverified direct customs
 *    payments (`pending_verification`), missing customs assessments, or unsettled balances.
 *  - NEVER writes financial figures into `stage_9_fees_payments.stage_data` as a source of truth.
 *  - Relies on PostgreSQL trigger `enforce_customs_stage_guards()` as the final authoritative gatekeeper.
 */
export async function completeStage9FinancialSettlementAction(
  rawInput: CompleteStage9FinancialSettlementInput,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<CompleteStage9FinancialSettlementData>> {
  const parsed = CompleteStage9FinancialSettlementSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: "بيانات إغلاق المرحلة المالية التاسعة غير صالحة.",
    };
  }

  const input = parsed.data;
  const access = await verifyAdminWriteAccessForShipment(input.shipment_id, context);
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  // Fetch authoritative financial summary from the database RPC
  const summaryRes = await getShipmentFinancialSummaryQuery(input.shipment_id, {
    supabase: access.supabase,
    actor: access.actor,
  });

  if (!summaryRes.success || !summaryRes.data) {
    return {
      success: false,
      code: summaryRes.code || "DATABASE_ERROR",
      error: summaryRes.error || "تعذر التحقق من الملخص المالي للشحنة.",
    };
  }

  const summary = summaryRes.data;
  const gate = evaluateStage9FinancialGate(summary);

  if (!gate.canComplete || !summary.is_financial_settlement_complete) {
    return {
      success: false,
      code: "SETTLEMENT_INCOMPLETE",
      error:
        gate.blockingReasons[0]?.message ||
        "لم تكتمل شروط البوابة المالية الإلزامية لإغلاق المرحلة التاسعة.",
      data: {
        summary,
        gate,
      },
    };
  }

  const nowIso = new Date().toISOString();

  // Fetch existing Stage 9 row to preserve existing non-financial stage_data (e.g. checklist/SLA timestamps)
  const { data: existingStage } = await access.supabase
    .from("shipment_customs_stages")
    .select("id, status, stage_data, reference_number")
    .eq("shipment_id", input.shipment_id.trim())
    .eq("stage_key", "stage_9_fees_payments")
    .maybeSingle();

  const fromStatus = existingStage?.status || "in_progress";
  const resolvedRef =
    input.reference_number?.trim() || existingStage?.reference_number || null;

  const { error: stageErr } = await access.supabase
    .from("shipment_customs_stages")
    .upsert(
      {
        shipment_id: input.shipment_id.trim(),
        stage_key: "stage_9_fees_payments",
        stage_order: 10,
        status: "completed",
        is_applicable: true,
        expected_role: "admin",
        role_confirmed: true,
        outcome: "تمت التسوية المالية الكاملة وتغطية الالتزامات الجمركية ومستحقات OUT عبر دفتر الأستاذ المالي",
        reference_number: resolvedRef,
        notes: input.notes?.trim() || null,
        stage_data: existingStage?.stage_data || {},
        completed_at: nowIso,
        completed_by: access.actor.id,
        updated_at: nowIso,
        updated_by: access.actor.id,
      },
      { onConflict: "shipment_id,stage_key" },
    );

  if (stageErr) {
    return mapDatabaseFinancialError(
      stageErr,
      "رفضت قاعدة البيانات إغلاق المرحلة التاسعة لعدم استيفاء شروط البوابة المالية.",
    );
  }

  // Record stage completion in shipment_customs_stage_history
  await access.supabase.from("shipment_customs_stage_history").insert({
    shipment_id: input.shipment_id.trim(),
    stage_key: "stage_9_fees_payments",
    action: "completed",
    from_status: fromStatus,
    to_status: "completed",
    outcome: "تمت التسوية المالية الكاملة عبر دفتر الأستاذ المالي",
    reference_number: resolvedRef,
    notes: input.notes?.trim() || null,
    metadata: {
      assessed_customs_obligation: summary.assessed_customs_obligation,
      total_customs_covered: summary.total_customs_covered,
      confirmed_out_service_fee: summary.confirmed_out_service_fee,
      total_customer_receivable_to_out: summary.total_customer_receivable_to_out,
      total_received_by_out: summary.total_received_by_out,
      outstanding_balance_to_out: summary.outstanding_balance_to_out,
    },
    performed_by: access.actor.id,
  });

  await safeRevalidateShipmentPaths(input.shipment_id);

  return {
    success: true,
    message: "تم التحقق من البوابة المالية وإغلاق مرحلة الرسوم الجمركية والمدفوعات بنجاح.",
    data: {
      summary,
      gate,
    },
  };
}
