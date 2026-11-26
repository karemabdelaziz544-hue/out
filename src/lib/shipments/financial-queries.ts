/**
 * Financial Queries Layer — Server Side (Phase 2 — Step 3)
 *
 * Authoritative read queries for the OUT financial ledger, customs obligations,
 * customer-safe financial statements, internal admin/manager notes, reversal audit trail,
 * and Stage 9 financial gate status.
 *
 * Security & Authorization Matrix (Enforced Server-Side + PostgreSQL RLS):
 *  - Admin: Full read access across all financial tables, RPCs, internal notes, and audit views.
 *  - Manager: Read-only access across all financial tables, RPCs, internal notes, and audit views.
 *  - Scout / Inspector / Data Entry: Zero financial read access (strictly blocked).
 *  - Customer: Read access ONLY to their own verified shipment (`customer_id === user.id` AND
 *    `company_id === user.companyId` with active account), restricted to customer-safe RPC/rows
 *    (never exposing internal notes, staff user IDs, non-billable OUT expenses, or unverified entries).
 */

import type { UserRole } from "../../types/auth";
import type { CustomsStageStatus } from "../../types/journey";
import type {
  CustomerShipmentFinancialStatementItem,
  CustomerShipmentFinancialStatementItemRaw,
  ShipmentCustomsObligation,
  ShipmentCustomsObligationRow,
  ShipmentFinancialInternalNote,
  ShipmentFinancialInternalNoteRow,
  ShipmentFinancialMigrationAuditRow,
  ShipmentFinancialSummary,
  ShipmentFinancialSummaryRaw,
  ShipmentFinancialTransaction,
  ShipmentFinancialTransactionRow,
  Stage9FinancialGateEvaluation,
} from "../../types/financial";
import {
  evaluateStage9FinancialGate,
  normalizeCustomerStatementItemRaw,
  normalizeCustomsObligationRow,
  normalizeFinancialSummaryRaw,
  normalizeFinancialTransactionRow,
} from "./financial-calculations";

// ─── 1. Standardized Query Result & Error Codes ───────────────────────────────

export type FinancialErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED_ROLE"
  | "UNAUTHORIZED_SHIPMENT"
  | "VALIDATION_ERROR"
  | "DUPLICATE_TRANSACTION"
  | "OBLIGATION_NOT_FOUND"
  | "OBLIGATION_OVERALLOCATION"
  | "ALREADY_REVERSED"
  | "REVERSAL_NOT_ALLOWED"
  | "VERIFICATION_FAILED"
  | "SETTLEMENT_INCOMPLETE"
  | "DATABASE_ERROR";

export interface FinancialResult<T> {
  success: boolean;
  code?: FinancialErrorCode;
  message?: string;
  error?: string;
  data?: T;
}

export interface VerifiedFinancialActor {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  provisioningStatus: string;
  companyId: string | null;
}

export interface ShipmentOwnershipRecord {
  id: string;
  customer_id: string;
  company_id: string;
  status: string;
  reference_number: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseServerClientLike = any;

export interface FinancialExecutionContext {
  supabase?: SupabaseServerClientLike;
  actor?: VerifiedFinancialActor | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

// ─── 2. Server-Side Actor & Shipment Ownership Verification ──────────────────

export async function getDefaultSupabaseClient(): Promise<SupabaseServerClientLike> {
  const serverModulePath = "../supabase/server";
  const mod = await import(serverModulePath);
  return mod.createClient();
}

/**
 * Resolves and verifies the current authenticated user directly from Supabase Auth
 * and the `public.profiles` table (never trusting client-supplied role/user_id).
 */
export async function resolveVerifiedFinancialActor(
  context?: FinancialExecutionContext,
): Promise<{
  supabase: SupabaseServerClientLike;
  actor: VerifiedFinancialActor | null;
  authError?: FinancialResult<never>;
}> {
  const supabase = context?.supabase ?? (await getDefaultSupabaseClient());

  if (context && "actor" in context) {
    const actor = context.actor ?? null;
    if (!actor) {
      return {
        supabase,
        actor: null,
        authError: {
          success: false,
          code: "UNAUTHENTICATED",
          error: "يجب تسجيل الدخول للوصول إلى البيانات المالية.",
        },
      };
    }
    if (!actor.isActive || actor.provisioningStatus !== "active") {
      return {
        supabase,
        actor: null,
        authError: {
          success: false,
          code: "UNAUTHORIZED_ROLE",
          error: "حساب المستخدم غير نشط أو غير مفعّل.",
        },
      };
    }
    return { supabase, actor };
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      supabase,
      actor: null,
      authError: {
        success: false,
        code: "UNAUTHENTICATED",
        error: "يجب تسجيل الدخول للوصول إلى البيانات المالية.",
      },
    };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, provisioning_status, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return {
      supabase,
      actor: null,
      authError: {
        success: false,
        code: "UNAUTHENTICATED",
        error: "تعذر التحقق من الملف الشخصي للمستخدم الحالي.",
      },
    };
  }

  const provisioningStatus = profile.provisioning_status || "active";
  if (!profile.is_active || provisioningStatus !== "active") {
    return {
      supabase,
      actor: null,
      authError: {
        success: false,
        code: "UNAUTHORIZED_ROLE",
        error: "حساب المستخدم غير نشط أو غير مصرح له بالعمليات المالية.",
      },
    };
  }

  return {
    supabase,
    actor: {
      id: profile.id,
      email: profile.email || user.email || "",
      fullName: profile.full_name || null,
      role: profile.role as UserRole,
      isActive: Boolean(profile.is_active),
      provisioningStatus,
      companyId: profile.company_id || null,
    },
  };
}

/**
 * Verifies read access to a shipment's financial data according to the approved role matrix:
 *  - `admin` / `manager`: allowed (provided shipment exists).
 *  - `customer`: allowed ONLY if `shipment.customer_id === actor.id` AND `actor.companyId !== null`
 *    AND `shipment.company_id === actor.companyId` (matches `public.is_authorized_customer_for_shipment` in 0019).
 *  - `scout` / `inspector` / `data_entry`: strictly forbidden (`UNAUTHORIZED_ROLE`).
 */
export async function verifyFinancialReadAccess(
  shipmentId: string,
  options?: {
    staffOnly?: boolean;
    context?: FinancialExecutionContext;
  },
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

  const { supabase, actor, authError } = await resolveVerifiedFinancialActor(
    options?.context,
  );
  if (authError || !actor) {
    return { authorized: false, errorResult: authError };
  }

  // Operational field roles (scout, inspector, data_entry) are strictly prohibited from financial access
  if (
    actor.role === "scout" ||
    actor.role === "inspector" ||
    actor.role === "data_entry"
  ) {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "UNAUTHORIZED_ROLE",
        error: "غير مصرح لدورك التشغيلي بالوصول إلى البيانات المالية للشحنة.",
      },
    };
  }

  if (options?.staffOnly && actor.role === "customer") {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "UNAUTHORIZED_ROLE",
        error: "غير مصرح للعميل بالوصول إلى السجلات والملاحظات المالية الداخلية.",
      },
    };
  }

  if (actor.role !== "admin" && actor.role !== "manager" && actor.role !== "customer") {
    return {
      authorized: false,
      errorResult: {
        success: false,
        code: "UNAUTHORIZED_ROLE",
        error: "دور المستخدم غير مصرح له بالوصول إلى البيانات المالية.",
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
        code: actor.role === "customer" ? "UNAUTHORIZED_SHIPMENT" : "VALIDATION_ERROR",
        error:
          actor.role === "customer"
            ? "غير مصرح لك بالوصول إلى البيانات المالية لهذه الشحنة."
            : "الشحنة المحددة غير موجودة.",
      },
    };
  }

  // Customer ownership check: requires BOTH customer_id match AND non-null company_id match
  if (actor.role === "customer") {
    const ownsShipment =
      shipment.customer_id === actor.id &&
      Boolean(actor.companyId) &&
      shipment.company_id === actor.companyId;

    if (!ownsShipment) {
      return {
        authorized: false,
        errorResult: {
          success: false,
          code: "UNAUTHORIZED_SHIPMENT",
          error: "غير مصرح لك بالوصول إلى البيانات المالية لهذه الشحنة.",
        },
      };
    }
  }

  return {
    authorized: true,
    supabase,
    actor,
    shipment: shipment as ShipmentOwnershipRecord,
  };
}

// ─── 3. Query 1: Shipment Financial Summary (via RPC `get_shipment_financial_summary`) ─

/**
 * Fetches the authoritative financial summary for a shipment directly from the PostgreSQL RPC
 * `public.get_shipment_financial_summary(p_shipment_id uuid)`.
 *
 * For customers, `non_billable_out_disbursements` is always 0.00 (enforced both in SQL and here).
 */
export async function getShipmentFinancialSummaryQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialSummary>> {
  const access = await verifyFinancialReadAccess(shipmentId, { context });
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  const { data, error } = await access.supabase.rpc("get_shipment_financial_summary", {
    p_shipment_id: shipmentId.trim(),
  });

  if (error) {
    if (String(error.message || "").includes("UNAUTHORIZED_FINANCIAL_ACCESS")) {
      return {
        success: false,
        code: "UNAUTHORIZED_SHIPMENT",
        error: "غير مصرح لك بالوصول إلى البيانات المالية لهذه الشحنة.",
      };
    }
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر جلب الملخص المالي للشحنة.",
    };
  }

  const rawRow: ShipmentFinancialSummaryRaw | null = Array.isArray(data)
    ? (data[0] ?? null)
    : (data ?? null);

  if (!rawRow) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "لم يتم العثور على ملخص مالي للشحنة.",
    };
  }

  const summary = normalizeFinancialSummaryRaw(rawRow);

  // Defense-in-depth: never expose internal non-billable OUT disbursements to customer role
  if (access.actor.role === "customer") {
    summary.non_billable_out_disbursements = 0;
    summary.total_out_disbursements = summary.billable_out_disbursements;
    summary.other_out_disbursements = Math.max(
      0,
      Number((summary.billable_out_disbursements - summary.out_customs_disbursements).toFixed(2)),
    );
  }

  return {
    success: true,
    data: summary,
  };
}

// ─── 4. Query 2: Customer Financial Statement (via RPC `get_customer_shipment_financial_statement`) ─

/**
 * Fetches the customer-safe financial statement for a shipment from the PostgreSQL RPC
 * `public.get_customer_shipment_financial_statement(p_shipment_id uuid)`.
 *
 * Exposes ONLY posted, customer-visible, billable movements and excludes all internal
 * staff IDs (`created_by`, `verified_by`, `reversed_by`), `idempotency_key`, and internal notes.
 */
export async function getCustomerShipmentFinancialStatementQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<CustomerShipmentFinancialStatementItem[]>> {
  const access = await verifyFinancialReadAccess(shipmentId, { context });
  if (!access.authorized || !access.supabase) {
    return access.errorResult!;
  }

  const { data, error } = await access.supabase.rpc(
    "get_customer_shipment_financial_statement",
    {
      p_shipment_id: shipmentId.trim(),
    },
  );

  if (error) {
    if (String(error.message || "").includes("UNAUTHORIZED_FINANCIAL_ACCESS")) {
      return {
        success: false,
        code: "UNAUTHORIZED_SHIPMENT",
        error: "غير مصرح لك بعرض كشف الحساب المالي لهذه الشحنة.",
      };
    }
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر جلب كشف الحساب المالي للشحنة.",
    };
  }

  const rows: CustomerShipmentFinancialStatementItemRaw[] = Array.isArray(data)
    ? data
    : [];

  return {
    success: true,
    data: rows.map(normalizeCustomerStatementItemRaw),
  };
}

// ─── 5. Query 3: Customs Obligations for a Shipment ──────────────────────────

/**
 * Fetches customs obligations (`public.shipment_customs_obligations`) for a shipment.
 * Customers only see non-cancelled obligations for their own verified shipment.
 */
export async function getShipmentCustomsObligationsQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentCustomsObligation[]>> {
  const access = await verifyFinancialReadAccess(shipmentId, { context });
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  let query = access.supabase
    .from("shipment_customs_obligations")
    .select("*")
    .eq("shipment_id", shipmentId.trim());

  if (access.actor.role === "customer") {
    query = query.neq("status", "cancelled");
  }

  const { data, error } = await query.order("assessed_at", { ascending: true });

  if (error) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر جلب المطالبات الجمركية الخاصة بالشحنة.",
    };
  }

  const rows = (Array.isArray(data) ? data : []) as ShipmentCustomsObligationRow[];
  const filteredRows =
    access.actor.role === "customer"
      ? rows.filter((r) => r.status !== "cancelled")
      : rows;

  return {
    success: true,
    data: filteredRows.map(normalizeCustomsObligationRow),
  };
}

// ─── 6. Query 4: Financial Transactions (Role-Scoped) ─────────────────────────

export type RoleScopedFinancialTransactionsResult =
  | {
      scope: "staff_full";
      transactions: ShipmentFinancialTransaction[];
    }
  | {
      scope: "customer_statement";
      transactions: CustomerShipmentFinancialStatementItem[];
    };

/**
 * Fetches financial transactions for a shipment according to the caller's role:
 *  - `admin` / `manager`: receives full normalized ledger rows (`scope: "staff_full"`).
 *  - `customer`: receives strictly the sanitized customer statement (`scope: "customer_statement"`)
 *    without internal staff IDs, non-billable expenses, or unverified/rejected entries.
 */
export async function getShipmentFinancialTransactionsQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<RoleScopedFinancialTransactionsResult>> {
  const access = await verifyFinancialReadAccess(shipmentId, { context });
  if (!access.authorized || !access.supabase || !access.actor) {
    return access.errorResult!;
  }

  if (access.actor.role === "customer") {
    const statementRes = await getCustomerShipmentFinancialStatementQuery(
      shipmentId,
      context,
    );
    if (!statementRes.success || !statementRes.data) {
      return {
        success: false,
        code: statementRes.code || "DATABASE_ERROR",
        error: statementRes.error || "تعذر جلب الحركات المالية المسموح بعرضها.",
      };
    }
    return {
      success: true,
      data: {
        scope: "customer_statement",
        transactions: statementRes.data,
      },
    };
  }

  const { data, error } = await access.supabase
    .from("shipment_financial_transactions")
    .select("*")
    .eq("shipment_id", shipmentId.trim())
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر جلب سجل الحركات المالية للشحنة.",
    };
  }

  const rows = (Array.isArray(data) ? data : []) as ShipmentFinancialTransactionRow[];

  return {
    success: true,
    data: {
      scope: "staff_full",
      transactions: rows.map(normalizeFinancialTransactionRow),
    },
  };
}

// ─── 7. Query 5: Internal Financial Notes (Admin & Manager ONLY) ──────────────

/**
 * Fetches internal financial notes (`public.shipment_financial_internal_notes`) for Admin & Manager ONLY.
 * Strictly blocks customers and operational roles (`scout`, `inspector`, `data_entry`).
 */
export async function getShipmentFinancialInternalNotesQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialInternalNote[]>> {
  const access = await verifyFinancialReadAccess(shipmentId, {
    staffOnly: true,
    context,
  });
  if (!access.authorized || !access.supabase) {
    return access.errorResult!;
  }

  const { data, error } = await access.supabase
    .from("shipment_financial_internal_notes")
    .select("*")
    .eq("shipment_id", shipmentId.trim())
    .order("created_at", { ascending: false });

  if (error) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر جلب الملاحظات المالية الداخلية للشحنة.",
    };
  }

  return {
    success: true,
    data: (Array.isArray(data) ? data : []) as ShipmentFinancialInternalNoteRow[],
  };
}

// ─── 8. Query 6: Reversed Transactions & Audit Information (Admin & Manager ONLY) ─

export interface ReversedTransactionAuditPair {
  originalTransaction: ShipmentFinancialTransaction;
  reversalTransaction: ShipmentFinancialTransaction | null;
}

export interface ShipmentFinancialAuditReport {
  shipmentId: string;
  reversedPairs: ReversedTransactionAuditPair[];
  rejectedTransactions: ShipmentFinancialTransaction[];
  pendingVerificationTransactions: ShipmentFinancialTransaction[];
  migrationAudit: ShipmentFinancialMigrationAuditRow | null;
}

/**
 * Fetches the audit trail of reversed transactions (`is_reversed = true` paired with `direction = -1`),
 * rejected entries, pending verification entries, and the legacy Stage 9 migration audit view
 * (`public.shipment_financial_migration_audit_v`).
 * Restricted strictly to `admin` and `manager`.
 */
export async function getShipmentReversedTransactionsAuditQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<ShipmentFinancialAuditReport>> {
  const access = await verifyFinancialReadAccess(shipmentId, {
    staffOnly: true,
    context,
  });
  if (!access.authorized || !access.supabase) {
    return access.errorResult!;
  }

  const [txRes, migRes] = await Promise.all([
    access.supabase
      .from("shipment_financial_transactions")
      .select("*")
      .eq("shipment_id", shipmentId.trim())
      .order("created_at", { ascending: true }),
    access.supabase
      .from("shipment_financial_migration_audit_v")
      .select("*")
      .eq("shipment_id", shipmentId.trim())
      .maybeSingle(),
  ]);

  if (txRes.error) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "تعذر جلب السجل التدقيقي للحركات المالية المعكوسة.",
    };
  }

  const allNormalized = (
    (Array.isArray(txRes.data) ? txRes.data : []) as ShipmentFinancialTransactionRow[]
  ).map(normalizeFinancialTransactionRow);

  const reversalByOrigId = new Map<string, ShipmentFinancialTransaction>();
  for (const tx of allNormalized) {
    if (tx.direction === -1 && tx.reversal_of_transaction_id) {
      reversalByOrigId.set(tx.reversal_of_transaction_id, tx);
    }
  }

  const reversedPairs: ReversedTransactionAuditPair[] = allNormalized
    .filter((tx) => tx.direction === 1 && (tx.is_reversed || reversalByOrigId.has(tx.id)))
    .map((orig) => ({
      originalTransaction: orig,
      reversalTransaction: reversalByOrigId.get(orig.id) ?? null,
    }));

  const rejectedTransactions = allNormalized.filter(
    (tx) => tx.entry_status === "rejected",
  );
  const pendingVerificationTransactions = allNormalized.filter(
    (tx) => tx.entry_status === "pending_verification",
  );

  return {
    success: true,
    data: {
      shipmentId: shipmentId.trim(),
      reversedPairs,
      rejectedTransactions,
      pendingVerificationTransactions,
      migrationAudit: (migRes.data as ShipmentFinancialMigrationAuditRow | null) ?? null,
    },
  };
}

// ─── 9. Query 7: Stage 9 Financial Gate Status ────────────────────────────────

export interface Stage9FinancialGateStatus {
  shipmentId: string;
  stageStatus: CustomsStageStatus;
  completedAt: string | null;
  completedBy: string | null;
  isLegacyTerminalExempt: boolean;
  summary: ShipmentFinancialSummary;
  gate: Stage9FinancialGateEvaluation;
}

/**
 * Evaluates and returns the authoritative Stage 9 (`stage_9_fees_payments`) financial gate status
 * combining the database summary (`get_shipment_financial_summary`), the pure gate evaluator
 * (`evaluateStage9FinancialGate`), and the current `stage_9_fees_payments` row state.
 */
export async function getStage9FinancialGateStatusQuery(
  shipmentId: string,
  context?: FinancialExecutionContext,
): Promise<FinancialResult<Stage9FinancialGateStatus>> {
  const access = await verifyFinancialReadAccess(shipmentId, { context });
  if (!access.authorized || !access.supabase || !access.shipment) {
    return access.errorResult!;
  }

  const [summaryRes, stageRes] = await Promise.all([
    getShipmentFinancialSummaryQuery(shipmentId, {
      supabase: access.supabase,
      actor: access.actor,
    }),
    access.supabase
      .from("shipment_customs_stages")
      .select("status, stage_data, completed_at, completed_by")
      .eq("shipment_id", shipmentId.trim())
      .eq("stage_key", "stage_9_fees_payments")
      .maybeSingle(),
  ]);

  if (!summaryRes.success || !summaryRes.data) {
    return {
      success: false,
      code: summaryRes.code || "DATABASE_ERROR",
      error: summaryRes.error || "تعذر تقييم حالة البوابة المالية للمرحلة التاسعة.",
    };
  }

  const stageRow = stageRes.data as {
    status?: CustomsStageStatus;
    stage_data?: Record<string, unknown> | null;
    completed_at?: string | null;
    completed_by?: string | null;
  } | null;

  const isLegacyTerminalExempt =
    (access.shipment.status === "customs_cleared" ||
      access.shipment.status === "delivered") &&
    stageRow?.stage_data?.legacy_financial_resolution === "exempt_terminal_shipment";

  const gate = evaluateStage9FinancialGate(summaryRes.data);

  return {
    success: true,
    data: {
      shipmentId: shipmentId.trim(),
      stageStatus: stageRow?.status || "pending",
      completedAt: stageRow?.completed_at || null,
      completedBy:
        access.actor?.role === "customer" ? null : (stageRow?.completed_by ?? null),
      isLegacyTerminalExempt,
      summary: summaryRes.data,
      gate: isLegacyTerminalExempt
        ? {
            canComplete: true,
            isCustomsCoverageComplete: true,
            hasConfirmedFinalPrice: true,
            isOutReceivableSettled: true,
            blockingReasons: [],
          }
        : gate,
    },
  };
}
