"use server";

/**
 * Customs Clearance Journey Actions — Server Side
 *
 * Secure server actions for:
 * 1. Updating shipment classification & authoritative regulatory procedure branches.
 * 2. Managing individual regulatory procedures (`shipment_regulatory_procedures`).
 * 3. Updating stage status, outcome, references, notes, and completion criteria
 *    with strict role + assignment (`assigned_to`) enforcement and Form 46 gate validation.
 * 4. Reopening stages with automatic Form 46 gate activation if a terminal exempt shipment is reopened.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import {
  CustomsStageKey,
  CustomsStageStatus,
  GoodsCategory,
  GOODS_CATEGORIES,
  CUSTOMS_STAGE_DEFINITIONS,
  APPLICABLE_PROCEDURE_DEFINITIONS,
  getWorkflowTemplateForCategory,
  type RegulatoryProcedureStatus,
  type ShipmentRegulatoryProcedure,
} from "@/types/journey";
import { matchFinalDocumentType } from "@/types";
import { createNotification } from "@/lib/notifications/queries";
import { evaluateStage9FinancialGate } from "./financial-calculations";
import { getShipmentFinancialSummaryQuery } from "./financial-queries";
import {
  STAGE_WORKFLOW_RULES,
  isStageApplicable,
  validateStagePrerequisites,
  resolveNextApplicableStageKey,
  type StageStateSnapshot,
} from "./workflow-rules";

export interface JourneyActionResult {
  success: boolean;
  error?: string;
  message?: string;
}

const PROCEDURE_AUTHORITY_NAMES: Record<string, string> = {
  plant_quarantine: "الإدارة المركزية للحجر الزراعي",
  food_safety_authority: "الهيئة القومية لسلامة الغذاء (NFSA)",
  food_safety: "الهيئة القومية لسلامة الغذاء (NFSA)",
  industrial_standards_inspection: "الهيئة العامة للرقابة على الصادرات والواردات (GOEIC)",
  radiation_clearance: "هيئة الطاقة الذرية / الكشف الإشعاعي",
  telecom_approval: "الجهاز القومي لتنظيم الاتصالات (NTRA)",
};

function resolveAuthorityNameAr(code: string): string {
  if (PROCEDURE_AUTHORITY_NAMES[code]) {
    return PROCEDURE_AUTHORITY_NAMES[code];
  }
  const found = APPLICABLE_PROCEDURE_DEFINITIONS.find((d) => d.id === code);
  return found ? found.authorityName : code;
}

/**
 * 1. Update Shipment Goods Classification & Authoritative Regulatory Procedures
 *    Per Owner Decision: Does NOT automatically enforce Food Safety for agricultural shipments.
 *    Only procedures explicitly selected by Admin/Manager are added to `shipment_regulatory_procedures`.
 */
export async function updateShipmentClassificationAction(
  formData: FormData,
): Promise<JourneyActionResult> {
  try {
    await requireRole(["admin", "manager"]);
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "يجب تسجيل الدخول لتحديث تصنيف الشحنة." };
    }

    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const goodsCategory = formData.get("goods_category")?.toString().trim() as GoodsCategory;
    const notes = formData.get("classification_notes")?.toString().trim() || null;
    const proceduresRaw = formData
      .getAll("applicable_procedures")
      .map((p) => p.toString().trim())
      .filter((p) => p && p !== "general_customs_procedure");

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة غير صالح." };
    }

    if (!goodsCategory || !GOODS_CATEGORIES.includes(goodsCategory)) {
      return { success: false, error: "يرجى تحديد تصنيف صالح لنوع البضاعة." };
    }

    const uniqueSelectedProcedures = Array.from(new Set(proceduresRaw));

    const supabase = await createClient();

    // Fetch previous classification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: previousShipment, error: prevErr } = await (supabase.from("shipments") as any)
      .select("goods_category, applicable_procedures")
      .eq("id", shipmentId)
      .maybeSingle();

    if (prevErr || !previousShipment) {
      return { success: false, error: "تعذر العثور على بيانات الشحنة." };
    }

    const previousCategory = previousShipment.goods_category || "other";
    const previousProcedures = previousShipment.applicable_procedures || [];

    // Fetch existing rows in shipment_regulatory_procedures
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRegProcs } = await (supabase.from("shipment_regulatory_procedures") as any)
      .select("*")
      .eq("shipment_id", shipmentId);

    const existingRegList = (existingRegProcs || []) as ShipmentRegulatoryProcedure[];
    const existingCodes = new Set(existingRegList.map((r) => r.procedure_code));

    // Prevent removing a regulatory procedure that is already approved
    const approvedRemoved = existingRegList.filter(
      (r) => r.status === "approved" && !uniqueSelectedProcedures.includes(r.procedure_code),
    );
    if (approvedRemoved.length > 0) {
      const names = approvedRemoved.map((r) => r.authority_name_ar).join("، ");
      return {
        success: false,
        error: `لا يمكن حذف جهة رقابية تم اعتماد موافقتها مسبقاً: (${names}).`,
      };
    }

    // Delete unselected non-approved regulatory procedures
    const codesToDelete = existingRegList
      .filter((r) => r.status !== "approved" && !uniqueSelectedProcedures.includes(r.procedure_code))
      .map((r) => r.procedure_code);

    if (codesToDelete.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_regulatory_procedures") as any)
        .delete()
        .eq("shipment_id", shipmentId)
        .in("procedure_code", codesToDelete);
    }

    // Insert newly selected regulatory procedures into shipment_regulatory_procedures
    const codesToInsert = uniqueSelectedProcedures.filter((c) => !existingCodes.has(c));
    if (codesToInsert.length > 0) {
      const rowsToInsert = codesToInsert.map((code) => ({
        shipment_id: shipmentId,
        procedure_code: code,
        authority_name_ar: resolveAuthorityNameAr(code),
        status: "pending",
        created_by: user.id,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_regulatory_procedures") as any).upsert(rowsToInsert, {
        onConflict: "shipment_id,procedure_code",
      });
    }

    // Update shipments table classification metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("shipments") as any)
      .update({
        goods_category: goodsCategory,
        applicable_procedures: uniqueSelectedProcedures,
        classification_notes: notes,
        classification_reviewed_at: new Date().toISOString(),
        classification_reviewed_by: user.id,
        updated_by: user.id,
      })
      .eq("id", shipmentId);

    if (updateErr) {
      return { success: false, error: `فشل تحديث تصنيف الشحنة: ${updateErr.message}` };
    }

    const template = getWorkflowTemplateForCategory(goodsCategory);

    // Update Stage 1 (Shipment Intake & Classification) in shipment_customs_stages
    const outcomeText =
      uniqueSelectedProcedures.length > 0
        ? `تم تصنيف البضاعة: ${template.name} مع تحديد ${uniqueSelectedProcedures.length} جهة رقابية.`
        : `تم تصنيف البضاعة: ${template.name} (دون جهات رقابية إضافية).`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stage1Err } = await (supabase.from("shipment_customs_stages") as any).upsert(
      {
        shipment_id: shipmentId,
        stage_key: "stage_1_intake",
        stage_order: 1,
        status: "completed",
        is_applicable: true,
        expected_role: "admin",
        role_confirmed: true,
        outcome: outcomeText,
        notes: notes,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "shipment_id,stage_key" },
    );

    if (stage1Err) {
      return { success: false, error: `فشل تسجيل اكتمال مرحلة استقبال الشحنة: ${stage1Err.message}` };
    }

    // Synchronize Stage 4 Type Procedures (Order 7) applicability
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stage4Row } = await (supabase.from("shipment_customs_stages") as any)
      .select("status, is_applicable")
      .eq("shipment_id", shipmentId)
      .eq("stage_key", "stage_4_type_procedures")
      .maybeSingle();

    const isStage4App = isStageApplicable(
      "stage_4_type_procedures",
      goodsCategory,
      uniqueSelectedProcedures,
    );

    if (stage4Row) {
      if (stage4Row.status === "pending" || stage4Row.status === "not_applicable") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_customs_stages") as any)
          .update({
            stage_order: 7,
            is_applicable: isStage4App,
            status: isStage4App ? "pending" : "not_applicable",
            outcome: isStage4App ? null : `لا توجد جهات رقابية مطلوبة (${template.badge})`,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("shipment_id", shipmentId)
          .eq("stage_key", "stage_4_type_procedures");
      } else if (stage4Row.status === "completed" && codesToInsert.length > 0) {
        // Reopen stage_4_type_procedures if a new unapproved regulatory procedure was added
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_customs_stages") as any)
          .update({
            is_applicable: true,
            status: "in_progress",
            completed_at: null,
            completed_by: null,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("shipment_id", shipmentId)
          .eq("stage_key", "stage_4_type_procedures");
      }
    }

    // Record audit history entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_customs_stage_history") as any).insert({
      shipment_id: shipmentId,
      stage_key: "stage_1_intake",
      action: "classification_changed",
      from_status: "in_progress",
      to_status: "completed",
      outcome: outcomeText,
      notes: notes || `تم تحديث واعتماد مسار الشحنة: ${template.name}`,
      metadata: {
        previous_category: previousCategory,
        new_category: goodsCategory,
        previous_procedures: previousProcedures,
        new_procedures: uniqueSelectedProcedures,
        template_name: template.name,
      },
      performed_by: user.id,
    });

    // Auto-activate Stage 2 (Pricing & Preliminary Documents) if still pending
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stage2Row } = await (supabase.from("shipment_customs_stages") as any)
      .select("status, stage_data")
      .eq("shipment_id", shipmentId)
      .eq("stage_key", "stage_2_pricing")
      .maybeSingle();

    if (!stage2Row || stage2Row.status === "pending" || stage2Row.status === "not_applicable") {
      const nowIso = new Date().toISOString();
      const targetIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_customs_stages") as any).upsert(
        {
          shipment_id: shipmentId,
          stage_key: "stage_2_pricing",
          stage_order: 2,
          status: "in_progress",
          is_applicable: true,
          expected_role: "admin",
          role_confirmed: true,
          stage_data: {
            ...(stage2Row?.stage_data || {}),
            activated_at: nowIso,
            target_completion_at: targetIso,
            target_duration_hours: 24,
            waiting_reason: "بانتظار إعداد عرض السعر ومراجعة الفاتورة المبدئية",
          },
          updated_at: nowIso,
          updated_by: user.id,
        },
        { onConflict: "shipment_id,stage_key" },
      );
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);

    return {
      success: true,
      message: "تم تحديث تصنيف البضاعة والجهات الرقابية المعتمدة بنجاح.",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
    return { success: false, error: errorMsg };
  }
}

/**
 * 1b. Update an individual regulatory procedure record in `shipment_regulatory_procedures`
 */
export async function updateShipmentRegulatoryProcedureAction(
  formData: FormData,
): Promise<JourneyActionResult> {
  try {
    await requireRole(["admin", "manager", "inspector"]);
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "يجب تسجيل الدخول لتحديث الإجراء الرقابي." };
    }

    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const procedureCode = formData.get("procedure_code")?.toString().trim();
    const status = formData.get("status")?.toString().trim() as RegulatoryProcedureStatus;
    const referenceNumber = formData.get("reference_number")?.toString().trim() || null;
    const sampleTaken = formData.get("sample_taken") === "true";
    const inspectorName = formData.get("inspector_name")?.toString().trim() || null;
    const notes = formData.get("notes")?.toString().trim() || null;

    if (!shipmentId || !procedureCode || !status) {
      return { success: false, error: "بيانات الإجراء الرقابي غير مكتملة." };
    }

    const validStatuses: RegulatoryProcedureStatus[] = [
      "pending",
      "in_progress",
      "sample_taken",
      "approved",
      "rejected",
    ];
    if (!validStatuses.includes(status)) {
      return { success: false, error: "حالة الإجراء الرقابي غير صالحة." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProc, error: fetchErr } = await (supabase.from("shipment_regulatory_procedures") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .eq("procedure_code", procedureCode)
      .maybeSingle();

    if (fetchErr || !existingProc) {
      return { success: false, error: "الإجراء الرقابي المحدد غير مسجل لهذه الشحنة." };
    }

    // If user is inspector, verify assignment
    if (user.role === "inspector") {
      if (existingProc.assigned_to && existingProc.assigned_to !== user.id) {
        return {
          success: false,
          error: "هذا الإجراء الرقابي مسند لمعاين آخر.",
        };
      }
    }

    const nowIso = new Date().toISOString();
    const isApproved = status === "approved";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("shipment_regulatory_procedures") as any)
      .update({
        status,
        reference_number: referenceNumber,
        sample_taken: sampleTaken,
        inspector_name: inspectorName,
        notes,
        completed_by: isApproved ? user.id : null,
        completed_at: isApproved ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", existingProc.id);

    if (updateErr) {
      return { success: false, error: `تعذر تحديث الإجراء الرقابي: ${updateErr.message}` };
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);

    return {
      success: true,
      message: `تم تحديث حالة «${existingProc.authority_name_ar}» بنجاح.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
    return { success: false, error: errorMsg };
  }
}

/**
 * 2. Update Stage Status, Outcome, References, and Stage-Specific Data
 */
export async function updateCustomsStageAction(
  formData: FormData,
  explicitStageData?: Record<string, unknown>,
): Promise<JourneyActionResult> {
  try {
    await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "يجب تسجيل الدخول لتحديث مراحل التخليص." };
    }

    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const stageKey = formData.get("stage_key")?.toString().trim() as CustomsStageKey;
    const status = formData.get("status")?.toString().trim() as CustomsStageStatus;
    const outcome = formData.get("outcome")?.toString().trim() || null;
    let referenceNumber = formData.get("reference_number")?.toString().trim() || null;
    const notes = formData.get("notes")?.toString().trim() || null;
    const rejectionOrDelayReason =
      formData.get("rejection_or_delay_reason")?.toString().trim() || null;
    const isApplicableRaw = formData.get("is_applicable")?.toString();
    const isApplicable = isApplicableRaw !== "false";
    const expectedUpdatedAt = formData.get("expected_updated_at")?.toString().trim() || null;

    const stageDataJson = formData.get("stage_data")?.toString().trim();
    let stageData: Record<string, unknown> = explicitStageData ? { ...explicitStageData } : {};
    if (stageDataJson) {
      try {
        stageData = { ...stageData, ...JSON.parse(stageDataJson) };
      } catch {
        // ignore parse error
      }
    }

    // ─── Stage 4 Form 46: Independent Form 46 Gate ───
    if (stageKey === "stage_4_form_46") {
      const declaration46 =
        formData.get("declaration_46_number")?.toString().trim() ||
        referenceNumber ||
        (typeof stageData.declaration_46_number === "string"
          ? stageData.declaration_46_number.trim()
          : null);
      if (declaration46) {
        referenceNumber = declaration46;
        stageData.declaration_46_number = declaration46;
      }
    }

    // ─── Stage 9: Frozen Legacy JSONB (Authoritative truth is in Financial Ledger) ───
    // Do NOT populate or overwrite `stage_9_fees_payments.stage_data` with `customs_duties_settlement`.
    // Strip any legacy financial keys passed in stageData so `stage_data` is never used as the new financial source of truth.
    if (stageKey === "stage_9_fees_payments") {
      delete stageData.customs_duties_settlement;
      delete stageData.assessed_customs_amount;
      delete stageData.duties_amount;
      delete stageData.amount_paid_by_out;
      delete stageData.duties_paid_by_out;
      delete stageData.amount_collected_from_customer;
      delete stageData.collected_from_customer;
      delete stageData.settlement_status;
    }

    // ─── Stage 7: Customs Declaration ───
    if (stageKey === "stage_7_data_entry") {
      const declaration46 = formData.get("declaration_46_number")?.toString().trim() || null;
      if (declaration46) {
        stageData.declaration_46_number = declaration46;
      }
      const cargoxJson = formData.get("cargox_data")?.toString().trim();
      if (cargoxJson) {
        try {
          stageData.cargox = JSON.parse(cargoxJson);
        } catch {
          // preserve backward compatibility without blocking
        }
      }
    }

    // ─── Stage 10: Decoupled Events ───
    let clearPortExit = false;
    let clearDelivery = false;

    if (stageKey === "stage_10_clearance_release") {
      const releasePermitNumber =
        formData.get("release_permit_number")?.toString().trim() || referenceNumber;
      const customsReleasedAt = formData.get("customs_released_at")?.toString().trim();
      const portExitAt = formData.get("port_exit_at")?.toString().trim();
      const transporterName = formData.get("transporter_name")?.toString().trim();
      const gatePassNumber = formData.get("port_exit_gate_pass")?.toString().trim();
      const deliveredAt = formData.get("delivered_at")?.toString().trim();
      const recipientName = formData.get("recipient_name")?.toString().trim();
      const deliveryNotes = formData.get("delivery_notes")?.toString().trim();

      clearPortExit =
        formData.get("clear_port_exit") === "true" ||
        stageData.clear_port_exit === true ||
        (stageData.hasOwnProperty("port_exit_at") && stageData.port_exit_at === null);

      clearDelivery =
        formData.get("clear_delivery") === "true" ||
        stageData.clear_delivery === true ||
        (stageData.hasOwnProperty("delivered_at") && stageData.delivered_at === null);

      if (releasePermitNumber) stageData.release_permit_number = releasePermitNumber;
      if (customsReleasedAt) stageData.customs_released_at = customsReleasedAt;
      if (portExitAt) stageData.port_exit_at = portExitAt;
      if (transporterName) stageData.transporter_name = transporterName;
      if (gatePassNumber) stageData.port_exit_gate_pass = gatePassNumber;
      if (deliveredAt) stageData.delivered_at = deliveredAt;
      if (recipientName) stageData.recipient_name = recipientName;
      if (deliveryNotes) stageData.delivery_notes = deliveryNotes;
    }

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة غير صالح." };
    }

    if (!stageKey || !CUSTOMS_STAGE_DEFINITIONS[stageKey]) {
      return { success: false, error: "مرحلة التخليص الجمركي المحددة غير صالحة." };
    }

    const stageDef = CUSTOMS_STAGE_DEFINITIONS[stageKey];

    // ─── Enforce Role Authorization per Stage (Including Manager Read-Only on Financial Stages) ───
    if (
      user.role === "manager" &&
      (stageKey === "stage_2_pricing" || stageKey === "stage_9_fees_payments")
    ) {
      return {
        success: false,
        error: "صلاحية المدير (Manager) قراءة فقط للبيانات والمراحل المالية؛ لا يُسمح بتعديل أو إغلاق هذه المرحلة.",
      };
    }

    const isSuperAdmin = user.role === "admin" || user.role === "manager";
    if (!isSuperAdmin) {
      if (stageDef.expectedRole !== user.role) {
        return {
          success: false,
          error: `غير مصرح لدورك التشغيلي بتحديث مرحلة «${stageDef.title}». الدور المطلوب هو ${stageDef.expectedRole}.`,
        };
      }
    }

    if (stageKey === "stage_10_clearance_release" && (clearPortExit || clearDelivery)) {
      if (!isSuperAdmin) {
        return {
          success: false,
          error: "غير مصرح لدورك بتصحيح أو إلغاء أحداث التسليم أو خروج الميناء.",
        };
      }
    }

    const validStatuses: CustomsStageStatus[] = [
      "not_applicable",
      "skipped",
      "pending",
      "in_progress",
      "awaiting_external_response",
      "needs_correction",
      "completed",
      "blocked",
    ];

    if (!status || !validStatuses.includes(status)) {
      return { success: false, error: "حالة المرحلة المحددة غير صالحة." };
    }

    const supabase = await createClient();

    // Fetch shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipmentRow, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, status, reference_number, customer_id, goods_category, applicable_procedures")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipmentRow) {
      return { success: false, error: "لم يتم العثور على بيانات الشحنة." };
    }

    // ─── Authoritative Financial Gate Enforcement for Stage 9 and Stage 10 ───
    if (
      (stageKey === "stage_9_fees_payments" || stageKey === "stage_10_clearance_release") &&
      status === "completed"
    ) {
      const summaryRes = await getShipmentFinancialSummaryQuery(shipmentId, {
        supabase,
      });

      if (!summaryRes.success || !summaryRes.data) {
        return {
          success: false,
          error:
            summaryRes.error ||
            "تعذر التحقق من استيفاء البوابة المالية للشحنة قبل إغلاق المرحلة.",
        };
      }

      const gate = evaluateStage9FinancialGate(summaryRes.data);
      if (!gate.canComplete || !summaryRes.data.is_financial_settlement_complete) {
        return {
          success: false,
          error:
            gate.blockingReasons[0]?.message ||
            "لا يمكن إغلاق المرحلة قبل استيفاء كافة شروط البوابة المالية والتسوية الكاملة.",
        };
      }
    }

    // Fetch document statuses, all stages, and regulatory procedures in parallel
    const [shipDocsRes, allStagesRes, regProcsRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("documents") as any).select("document_type, status").eq("shipment_id", shipmentId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("shipment_customs_stages") as any)
        .select("stage_key, stage_order, status, is_applicable, reference_number, stage_data, completed_at, completed_by, assigned_to")
        .eq("shipment_id", shipmentId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("shipment_regulatory_procedures") as any)
        .select("*")
        .eq("shipment_id", shipmentId),
    ]);

    const docStatusMap = new Map<string, string>();
    for (const d of (shipDocsRes.data || []) as Array<{ document_type?: string | null; status?: string | null }>) {
      const matched = matchFinalDocumentType(d.document_type);
      if (matched && d.status) {
        docStatusMap.set(matched, d.status);
      }
    }

    const stagesMap = new Map<string, StageStateSnapshot>(
      ((allStagesRes.data || []) as Array<StageStateSnapshot & { stage_key: string }>).map((s) => [
        s.stage_key,
        {
          status: s.status,
          is_applicable: s.is_applicable,
          reference_number: s.reference_number,
          stage_data: s.stage_data,
          completed_at: s.completed_at,
          completed_by: s.completed_by,
        },
      ]),
    );

    const regulatoryProcedures = (regProcsRes.data || []) as ShipmentRegulatoryProcedure[];

    // Fetch existing stage row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingStage } = await (supabase.from("shipment_customs_stages") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .eq("stage_key", stageKey)
      .maybeSingle();

    // Enforce assignment restriction for operational staff (Owner Decision #7)
    if (!isSuperAdmin && existingStage?.assigned_to && existingStage.assigned_to !== user.id) {
      return {
        success: false,
        error: "هذه المرحلة مسندة لموظف آخر؛ غير مصرح لك بتحديثها.",
      };
    }

    // ─── Optimistic Concurrency Control (OCC) Check ───
    if (existingStage?.updated_at) {
      if (!expectedUpdatedAt || typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt.trim()) {
        return {
          success: false,
          error: "رمز التزامن مفقود. يرجى تحديث الصفحة والمحاولة مجدداً لمنع تضارب البيانات.",
        };
      }
      const trimmedExpected = expectedUpdatedAt.trim();
      const expectedTime = new Date(trimmedExpected).getTime();
      const actualTime = new Date(existingStage.updated_at).getTime();
      if (isNaN(expectedTime)) {
        return {
          success: false,
          error: "رمز التزامن غير صالح. يرجى تحديث الصفحة والمحاولة مجدداً لمنع تضارب البيانات.",
        };
      }

      const isExactString = trimmedExpected === existingStage.updated_at.trim();
      const isEquivalentIso =
        !isNaN(actualTime) &&
        new Date(trimmedExpected).toISOString() === new Date(existingStage.updated_at).toISOString();

      if (!isExactString && !isEquivalentIso) {
        return {
          success: false,
          error: "تم تعديل بيانات هذه المرحلة بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً لمنع تضارب البيانات.",
        };
      }
    }

    // ─── Idempotency Check ───
    if (
      existingStage &&
      existingStage.status === status &&
      status === "completed" &&
      (existingStage.reference_number || null) === (referenceNumber || existingStage.reference_number || null)
    ) {
      return {
        success: true,
        message: `تم تحديث «${stageDef.title}» بنجاح.`,
      };
    }

    // ─── Checklist Validations ───
    if (status === "completed") {
      const existingChecklist =
        ((stageData?.checklist || existingStage?.stage_data?.checklist) as Array<Record<string, unknown>>) || [];
      const checklistMap = new Map<string, string>();
      for (const item of existingChecklist) {
        if (typeof item.id === "string" && typeof item.status === "string") {
          checklistMap.set(item.id, item.status);
        }
      }

      for (const defItem of stageDef.defaultChecklist) {
        if (defItem.isRequired) {
          const itemStatus = checklistMap.get(defItem.id);
          if (itemStatus && itemStatus !== "completed") {
            return {
              success: false,
              error: `لا يمكن اعتماد اكتمال المرحلة لوجود بند تدقيق إلزامي غير مكتمل: «${defItem.label}».`,
            };
          }
        }
      }
    }

    const mergedStageData: Record<string, unknown> = {
      ...(existingStage?.stage_data || {}),
      ...stageData,
    };

    if (stageKey === "stage_10_clearance_release") {
      if (clearPortExit) {
        mergedStageData.port_exit_at = null;
      } else if (!stageData.port_exit_at && existingStage?.stage_data?.port_exit_at) {
        mergedStageData.port_exit_at = existingStage.stage_data.port_exit_at;
      }

      if (clearDelivery) {
        mergedStageData.delivered_at = null;
      } else if (!stageData.delivered_at && existingStage?.stage_data?.delivered_at) {
        mergedStageData.delivered_at = existingStage.stage_data.delivered_at;
      }

      delete mergedStageData.clear_port_exit;
      delete mergedStageData.clear_delivery;
    }

    const validation = validateStagePrerequisites({
      shipmentStatus: shipmentRow.status,
      stageKey,
      targetStatus: status,
      currentStatus: existingStage?.status || "pending",
      stagesMap,
      documentStatuses: docStatusMap,
      regulatoryProcedures,
      stageData: mergedStageData,
      referenceNumber: referenceNumber || existingStage?.reference_number || null,
      notes,
      rejectionOrDelayReason,
    });

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || "فشل التحقق من استيفاء متطلبات المرحلة.",
      };
    }

    const fromStatus = existingStage?.status || "pending";
    const isCompleted = status === "completed";

    const updatePayload: Record<string, unknown> = {
      shipment_id: shipmentId,
      stage_key: stageKey,
      stage_order: stageDef.order,
      status: status,
      is_applicable: isApplicable,
      expected_role: stageDef.expectedRole,
      role_confirmed: stageDef.isRoleConfirmed,
      outcome: outcome || existingStage?.outcome || null,
      reference_number: referenceNumber || existingStage?.reference_number || null,
      notes: notes,
      rejection_or_delay_reason: rejectionOrDelayReason,
      stage_data: mergedStageData,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (isCompleted) {
      updatePayload.completed_at = new Date().toISOString();
      updatePayload.completed_by = user.id;
    } else if (status === "pending" || status === "in_progress") {
      updatePayload.completed_at = null;
      updatePayload.completed_by = null;
    }

    if (existingStage) {
      const concurrencyCondition = expectedUpdatedAt ? expectedUpdatedAt.trim() : existingStage.updated_at;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updatedRows, error: updateErr } = await (supabase.from("shipment_customs_stages") as any)
        .update(updatePayload)
        .eq("id", existingStage.id)
        .eq("updated_at", concurrencyCondition)
        .select("id");

      if (updateErr) {
        return { success: false, error: `فشل حفظ بيانات المرحلة: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        return {
          success: false,
          error: "تم تعديل بيانات هذه المرحلة بواسطة مستخدم آخر أثناء المعالجة. يرجى تحديث الصفحة والمحاولة مجدداً لمنع تضارب البيانات.",
        };
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase.from("shipment_customs_stages") as any)
        .insert(updatePayload);

      if (insertErr) {
        if (insertErr.code === "23505") {
          return {
            success: false,
            error: "تم إنشاء بيانات هذه المرحلة بواسطة مستخدم آخر أثناء المعالجة. يرجى تحديث الصفحة والمحاولة مجدداً.",
          };
        }
        return { success: false, error: `فشل حفظ بيانات المرحلة: ${insertErr.message}` };
      }
    }

    // Audit log entry in shipment_customs_stage_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_customs_stage_history") as any).insert({
      shipment_id: shipmentId,
      stage_key: stageKey,
      action: isCompleted ? "completed" : status === "blocked" ? "blocked" : "status_updated",
      from_status: fromStatus,
      to_status: status,
      outcome: outcome,
      reference_number: referenceNumber,
      notes: notes || rejectionOrDelayReason,
      metadata: stageData,
      performed_by: user.id,
    });

    // ─── Post-Validation Safe Promotion to 'customs_in_progress' ───
    if (
      stageDef.order >= 4 &&
      (shipmentRow.status === "documents_completed" || shipmentRow.status === "ready_for_external_stage") &&
      (status === "in_progress" || status === "completed")
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: shipPromoErr } = await (supabase.from("shipments") as any)
        .update({
          status: "customs_in_progress",
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("id", shipmentId);

      if (!shipPromoErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_stage_history") as any).insert({
          shipment_id: shipmentId,
          action: "customs_in_progress",
          note: `بدء العمليات الجمركية في مرحلة «${stageDef.title}»`,
          performed_by: user.id,
        });
        shipmentRow.status = "customs_in_progress";
      }
    }

    // ─── Automatic Next Stage Activation ───
    if (isCompleted) {
      const updatedAllStages = [
        ...((allStagesRes.data || []) as Array<{ stage_key: string; status: string; is_applicable?: boolean }>).filter(
          (s) => s.stage_key !== stageKey,
        ),
        { stage_key: stageKey, status: "completed", is_applicable: true },
      ];
      const nextKey = resolveNextApplicableStageKey(stageKey, updatedAllStages);

      if (nextKey) {
        const nextRule = STAGE_WORKFLOW_RULES[nextKey];
        const nextDef = CUSTOMS_STAGE_DEFINITIONS[nextKey];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: nextExisting } = await (supabase.from("shipment_customs_stages") as any)
          .select("*")
          .eq("shipment_id", shipmentId)
          .eq("stage_key", nextKey)
          .maybeSingle();

        if (!nextExisting || nextExisting.status === "pending") {
          const nextStatus: CustomsStageStatus = nextRule.initialStatus;
          const nextWaitingReason: string | null = nextRule.initialWaitingReason;

          const nextActivatedAt = new Date().toISOString();
          const targetHours = nextRule.targetDurationHours || 24;
          const nextTargetCompletion = new Date(Date.now() + targetHours * 3600 * 1000).toISOString();

          const nextData = {
            ...(nextExisting?.stage_data || {}),
            activated_at: nextActivatedAt,
            target_completion_at: nextTargetCompletion,
            target_duration_hours: targetHours,
            waiting_reason: nextWaitingReason,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("shipment_customs_stages") as any).upsert(
            {
              shipment_id: shipmentId,
              stage_key: nextKey,
              stage_order: nextRule.order,
              status: nextStatus,
              is_applicable: true,
              expected_role: nextRule.expectedRole,
              role_confirmed: nextDef.isRoleConfirmed,
              stage_data: nextData,
              updated_at: nextActivatedAt,
              updated_by: user.id,
            },
            { onConflict: "shipment_id,stage_key" },
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("shipment_customs_stage_history") as any).insert({
            shipment_id: shipmentId,
            stage_key: nextKey,
            action: "stage_activated",
            from_status: nextExisting?.status || "pending",
            to_status: nextStatus,
            notes: `تم تفعيل المرحلة تلقائياً إثر اكتمال «${stageDef.title}».`,
            metadata: {
              target_completion_at: nextTargetCompletion,
              waiting_reason: nextWaitingReason,
            },
            performed_by: user.id,
          });
        }
      }
    }

    // ─── Synchronize Clearance Milestones with shipment_stage_history & shipments.status ───
    if (stageKey === "stage_10_clearance_release") {
      const existingData = (existingStage?.stage_data || {}) as Record<string, unknown>;
      const currentData = (updatePayload.stage_data || {}) as Record<string, unknown>;

      const wasDelivered = !!existingData.delivered_at;
      const isNowDelivered = !!currentData.delivered_at;

      const wasPortExited = !!existingData.port_exit_at;
      const isNowPortExited = !!currentData.port_exit_at;

      const wasCustomsReleased = !!existingData.customs_released_at || !!existingStage?.reference_number;
      const hasCustomsReleased =
        !!currentData.customs_released_at ||
        !!currentData.release_permit_number ||
        !!referenceNumber ||
        isCompleted;

      if (wasDelivered && !isNowDelivered) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_stage_history") as any).insert({
          shipment_id: shipmentId,
          action: "delivery_event_corrected",
          note: "تم تصحيح وإلغاء تسجيل حدث التسليم للعميل وتحديث حالة الشحنة وفق الأحداث الفعلية المتبقية",
          performed_by: user.id,
        });

        let targetShipmentStatus = "customs_in_progress";
        if (hasCustomsReleased) {
          targetShipmentStatus = "customs_cleared";
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipments") as any)
          .update({
            status: targetShipmentStatus,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("id", shipmentId);
      } else if (!wasDelivered && isNowDelivered) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deliveryErr } = await (supabase.from("shipments") as any)
          .update({
            status: "delivered",
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("id", shipmentId);

        if (deliveryErr) {
          return {
            success: false,
            error: `تم حفظ بيانات المرحلة ولكن تعذر تحديث حالة الشحنة إلى تم التسليم: ${deliveryErr.message}`,
          };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_stage_history") as any).insert({
          shipment_id: shipmentId,
          action: "delivered_to_customer",
          note: `تم تسليم الشحنة للعميل بنجاح${currentData.recipient_name ? ` (المستلم: ${currentData.recipient_name})` : ""}`,
          performed_by: user.id,
        });

        if (shipmentRow?.customer_id) {
          await createNotification({
            userId: shipmentRow.customer_id,
            shipmentId,
            title: "تم تسليم الشحنة بنجاح",
            message: `تم تسليم الشحنة ${shipmentRow.reference_number || ""} إليك بنجاح. نشكرك لتعاملك مع OUT.`,
            type: "success",
            link: `/my-shipments/${shipmentId}`,
          });
        }
      }

      if (wasPortExited && !isNowPortExited) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_stage_history") as any).insert({
          shipment_id: shipmentId,
          action: "port_exit_event_corrected",
          note: "تم تصحيح وإلغاء تسجيل حدث خروج الميناء بواسطة الإدارة",
          performed_by: user.id,
        });
      } else if (!wasPortExited && isNowPortExited) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_stage_history") as any).insert({
          shipment_id: shipmentId,
          action: "port_exited",
          note: `خروج الشحنة من الدائرة الجمركية والميناء${currentData.transporter_name ? ` (الناقل: ${currentData.transporter_name})` : ""}`,
          performed_by: user.id,
        });
      }

      if (!wasCustomsReleased && hasCustomsReleased) {
        if (!isNowDelivered) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: clearanceErr } = await (supabase.from("shipments") as any)
            .update({
              status: "customs_cleared",
              updated_at: new Date().toISOString(),
              updated_by: user.id,
            })
            .eq("id", shipmentId);

          if (clearanceErr) {
            return {
              success: false,
              error: `تم حفظ بيانات المرحلة ولكن تعذر تحديث حالة الشحنة إلى تم الإفراج الجمركي: ${clearanceErr.message}`,
            };
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_stage_history") as any).insert({
          shipment_id: shipmentId,
          action: "customs_cleared",
          note: `تم الإفراج الجمركي النهائي واستصدار إذن الإفراج برقم: ${currentData.release_permit_number || referenceNumber || ""}`,
          performed_by: user.id,
        });

        if (shipmentRow?.customer_id) {
          await createNotification({
            userId: shipmentRow.customer_id,
            shipmentId,
            title: "تم الإفراج الجمركي النهائي عن الشحنة",
            message: `تم إصدار إذن الإفراج الجمركي الرسمي للشحنة ${shipmentRow.reference_number || ""} بنجاح برقم: ${currentData.release_permit_number || referenceNumber || ""}.`,
            type: "success",
            link: `/my-shipments/${shipmentId}`,
          });
        }
      }
    } else if (status === "blocked") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_stage_history") as any).insert({
        shipment_id: shipmentId,
        action: "customs_stage_blocked",
        note: `توقف في مرحلة «${stageDef.title}»: ${rejectionOrDelayReason || notes || "مانع تشغيلي"}`,
        performed_by: user.id,
      });
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");

    return {
      success: true,
      message: `تم تحديث «${stageDef.title}» بنجاح.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
    return { success: false, error: errorMsg };
  }
}

/**
 * 3. Reopen a completed or blocked stage for correction / revision.
 *    C-09 Enforcement: If reopening a terminal shipment that had an `exempt_terminal_shipment`
 *    Form 46 row, automatically transitions `stage_4_form_46` from `not_applicable` to `pending`
 *    so the reopened shipment cannot bypass Form 46!
 */
export async function reopenCustomsStageAction(
  formData: FormData,
): Promise<JourneyActionResult> {
  try {
    await requireRole(["admin", "manager"]);
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "يجب تسجيل الدخول لإعادة فتح المرحلة." };
    }

    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const stageKey = formData.get("stage_key")?.toString().trim() as CustomsStageKey;
    const reason = formData.get("reopen_reason")?.toString().trim();
    const expectedUpdatedAt = formData.get("expected_updated_at")?.toString().trim() || null;

    if (!shipmentId || !stageKey) {
      return { success: false, error: "بيانات المرحلة غير صالحة." };
    }

    if (!reason) {
      return { success: false, error: "يرجى توضيح سبب إعادة فتح المرحلة للمراجعة والتعديل." };
    }

    const stageDef = CUSTOMS_STAGE_DEFINITIONS[stageKey];
    if (!stageDef) {
      return { success: false, error: "المرحلة المحددة غير معروفة." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingStage } = await (supabase.from("shipment_customs_stages") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .eq("stage_key", stageKey)
      .maybeSingle();

    if (!existingStage) {
      return { success: false, error: "تعذر العثور على سجل المرحلة." };
    }

    if (expectedUpdatedAt && existingStage.updated_at) {
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      const actualTime = new Date(existingStage.updated_at).getTime();
      if (!isNaN(expectedTime) && !isNaN(actualTime) && Math.abs(expectedTime - actualTime) > 1000) {
        return {
          success: false,
          error: "تم تعديل بيانات هذه المرحلة بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً لمنع تضارب البيانات.",
        };
      }
    }

    const fromStatus = existingStage.status;
    const nowIso = new Date().toISOString();

    const updatedStageData = {
      ...(existingStage.stage_data || {}),
      reopened_at: nowIso,
      reopened_by: user.id,
      reopen_reason: reason,
      activated_at: nowIso,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("shipment_customs_stages") as any)
      .update({
        status: "needs_correction",
        completed_at: null,
        completed_by: null,
        rejection_or_delay_reason: reason,
        stage_data: updatedStageData,
        updated_at: nowIso,
        updated_by: user.id,
      })
      .eq("shipment_id", shipmentId)
      .eq("stage_key", stageKey);

    if (updateErr) {
      return { success: false, error: `فشل إعادة فتح المرحلة: ${updateErr.message}` };
    }

    // If reopening stage_10_clearance_release (or any stage on a terminal shipment),
    // revert shipment status to customs_in_progress AND revoke terminal Form 46 exemption if present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipmentRow } = await (supabase.from("shipments") as any)
      .select("id, status")
      .eq("id", shipmentId)
      .maybeSingle();

    if (
      shipmentRow &&
      (shipmentRow.status === "customs_cleared" || shipmentRow.status === "delivered")
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipments") as any)
        .update({
          status: "customs_in_progress",
          updated_at: nowIso,
          updated_by: user.id,
        })
        .eq("id", shipmentId);

      // Check if stage_4_form_46 was exempt due to terminal status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: form46Stage } = await (supabase.from("shipment_customs_stages") as any)
        .select("id, status, stage_data")
        .eq("shipment_id", shipmentId)
        .eq("stage_key", "stage_4_form_46")
        .maybeSingle();

      if (
        form46Stage &&
        form46Stage.status === "not_applicable" &&
        form46Stage.stage_data?.legacy_resolution === "exempt_terminal_shipment"
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("shipment_customs_stages") as any)
          .update({
            status: "pending",
            is_applicable: true,
            outcome: null,
            stage_data: {
              ...(form46Stage.stage_data || {}),
              legacy_resolution: "reopened_requires_form46",
              reopened_at: nowIso,
              reopened_by: user.id,
            },
            updated_at: nowIso,
            updated_by: user.id,
          })
          .eq("id", form46Stage.id);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_customs_stage_history") as any).insert({
      shipment_id: shipmentId,
      stage_key: stageKey,
      action: "reopened",
      from_status: fromStatus,
      to_status: "needs_correction",
      notes: reason,
      metadata: { reopen_reason: reason },
      performed_by: user.id,
    });

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);

    return {
      success: true,
      message: `تمت إعادة فتح مرحلة «${stageDef.title}» للتصحيح والمراجعة.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "حدث خطأ أثناء إعادة فتح المرحلة.";
    return { success: false, error: errorMsg };
  }
}

/**
 * 4. Update Checklist Item State
 */
export async function updateStageChecklistItemAction(
  formData: FormData,
): Promise<JourneyActionResult> {
  try {
    await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "يجب تسجيل الدخول لتحديث بنود التدقيق." };
    }

    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const stageKey = formData.get("stage_key")?.toString().trim() as CustomsStageKey;
    const itemId = formData.get("item_id")?.toString().trim();
    const itemStatus = formData.get("status")?.toString().trim() as
      | "pending"
      | "completed"
      | "blocked"
      | "needs_correction";
    const notes = formData.get("notes")?.toString().trim() || null;
    const expectedUpdatedAt = formData.get("expected_updated_at")?.toString().trim() || null;

    if (!shipmentId || !stageKey || !itemId || !itemStatus) {
      return { success: false, error: "بيانات بند التدقيق غير مكتملة." };
    }

    const stageDef = CUSTOMS_STAGE_DEFINITIONS[stageKey];
    if (!stageDef) {
      return { success: false, error: "المرحلة غير صالحة." };
    }

    const isSuperAdmin = user.role === "admin" || user.role === "manager";
    if (!isSuperAdmin && stageDef.expectedRole !== user.role) {
      return {
        success: false,
        error: `غير مصرح لدورك التشغيلي بتحديث بنود تدقيق مرحلة «${stageDef.title}». الدور المطلوب هو ${stageDef.expectedRole}.`,
      };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingStage } = await (supabase.from("shipment_customs_stages") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .eq("stage_key", stageKey)
      .maybeSingle();

    if (!isSuperAdmin && existingStage?.assigned_to && existingStage.assigned_to !== user.id) {
      return {
        success: false,
        error: "هذه المرحلة مسندة لموظف آخر؛ غير مصرح لك بتحديث بنودها.",
      };
    }

    if (expectedUpdatedAt && existingStage?.updated_at) {
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      const actualTime = new Date(existingStage.updated_at).getTime();
      if (!isNaN(expectedTime) && !isNaN(actualTime) && Math.abs(expectedTime - actualTime) > 1000) {
        return {
          success: false,
          error: "تم تعديل بيانات هذه المرحلة بواسطة مستخدم آخر. يرجى تحديث الصفحة والمحاولة مجدداً لمنع تضارب البيانات.",
        };
      }
    }

    const stageData = (existingStage?.stage_data || {}) as Record<string, unknown>;
    const savedChecklist = Array.isArray(stageData.checklist)
      ? [...(stageData.checklist as Array<Record<string, unknown>>)]
      : [];

    const existingItemIndex = savedChecklist.findIndex((i) => i.id === itemId);
    const itemDef = stageDef.defaultChecklist.find((i) => i.id === itemId);

    const updatedItem = {
      id: itemId,
      label: itemDef?.label || itemId,
      isRequired: itemDef?.isRequired ?? true,
      status: itemStatus,
      completedAt: itemStatus === "completed" ? new Date().toISOString() : null,
      completedBy: itemStatus === "completed" ? user.id : null,
      completedByName: itemStatus === "completed" ? user.fullName || "المختص" : null,
      notes: notes,
    };

    if (existingItemIndex >= 0) {
      savedChecklist[existingItemIndex] = updatedItem;
    } else {
      savedChecklist.push(updatedItem);
    }

    const nowIso = new Date().toISOString();
    const newStageData = {
      ...stageData,
      checklist: savedChecklist,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("shipment_customs_stages") as any)
      .upsert(
        {
          shipment_id: shipmentId,
          stage_key: stageKey,
          stage_order: stageDef.order,
          status: existingStage?.status || "in_progress",
          is_applicable: existingStage?.is_applicable ?? true,
          expected_role: stageDef.expectedRole,
          role_confirmed: stageDef.isRoleConfirmed,
          stage_data: newStageData,
          updated_at: nowIso,
          updated_by: user.id,
        },
        { onConflict: "shipment_id,stage_key" },
      );

    if (updateErr) {
      return { success: false, error: `فشل تحديث بند التدقيق: ${updateErr.message}` };
    }

    revalidatePath(`/shipments/${shipmentId}`);

    return {
      success: true,
      message: `تم تحديث بند التدقيق بنجاح.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "حدث خطأ أثناء تحديث بند التدقيق.";
    return { success: false, error: errorMsg };
  }
}
