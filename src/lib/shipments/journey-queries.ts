/**
 * Customs Clearance Journey Queries — Server Side
 *
 * Secure database queries for the customs clearance operational journey,
 * independent Form 46 gate, regulatory procedures, and audit history.
 *
 * Security Enforcements (Phase 1):
 * - Customer-facing reads (`getCustomerShipmentCustomsJourney`) use the session-bound
 *   Supabase client (`createClient()`) and NEVER use Service Role.
 * - Fixes `shipment_invoice_reviews` column names (`action, note, performed_at`)
 *   and `shipment_pricing.status` checks (`proposed` | `final_proposed`).
 */

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import {
  CustomsStageKey,
  CustomsStageStatus,
  GoodsCategory,
  ShipmentCustomsJourney,
  CustomsJourneyStage,
  CustomsJourneyStageHistory,
  ShipmentRegulatoryProcedure,
  CUSTOMS_STAGE_DEFINITIONS,
  getWorkflowTemplateForCategory,
  type CustomsDutiesSettlementData,
} from "@/types/journey";
import {
  STAGE_KEYS_SEQUENCE,
  isStageApplicable,
  getEffectiveForm46Data,
} from "./workflow-rules";
import type { DocumentItem } from "@/types";
import { matchFinalDocumentType, FINAL_SHIPMENT_DOCUMENT_TYPES } from "@/types";

/**
 * Fetch and assemble the complete customs journey for a shipment (Staff/Admin).
 */
export async function getShipmentCustomsJourney(
  shipmentId: string,
): Promise<ShipmentCustomsJourney | null> {
  await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);
  return getShipmentCustomsJourneyInternal(shipmentId, { allowBackgroundInit: true });
}

export async function getShipmentCustomsJourneyInternal(
  shipmentId: string,
  options: { allowBackgroundInit?: boolean } = {},
): Promise<ShipmentCustomsJourney | null> {
  const supabase = await createClient();

  // 1. Fetch shipment basic classification & references using session-bound client (RLS enforced)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shipmentRow, error: shipmentErr } = await (supabase.from("shipments") as any)
    .select(`
      id,
      status,
      goods_description,
      supplier_name,
      country_of_origin,
      port_of_arrival,
      goods_category,
      applicable_procedures,
      classification_notes,
      classification_reviewed_at,
      classification_reviewed_by,
      reviewer:classification_reviewed_by ( full_name )
    `)
    .eq("id", shipmentId)
    .maybeSingle();

  if (shipmentErr || !shipmentRow) {
    if (process.env.NODE_ENV === "development" && shipmentErr) {
      console.error("[getShipmentCustomsJourney] Error fetching shipment:", shipmentErr.message);
    }
    return null;
  }

  const goodsCategory: GoodsCategory = shipmentRow.goods_category || "other";
  const workflowTemplate = getWorkflowTemplateForCategory(goodsCategory);

  // 2. Fetch authoritative regulatory procedures & existing stage records in parallel
  const [regProcsRes, stagesRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("shipment_regulatory_procedures") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .order("created_at", { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("shipment_customs_stages") as any)
      .select(`
        *,
        completer:completed_by ( full_name ),
        assignee:assigned_to ( full_name )
      `)
      .eq("shipment_id", shipmentId)
      .order("stage_order", { ascending: true }),
  ]);

  const regulatoryProcedures: ShipmentRegulatoryProcedure[] = Array.isArray(regProcsRes.data)
    ? (regProcsRes.data as ShipmentRegulatoryProcedure[])
    : [];

  // Single Source of Truth: derive applicableProcedures from shipment_regulatory_procedures if populated,
  // otherwise fallback to non-generic items in shipmentRow.applicable_procedures
  const applicableProcedures: string[] =
    regulatoryProcedures.length > 0
      ? regulatoryProcedures.map((p) => p.procedure_code)
      : Array.isArray(shipmentRow.applicable_procedures)
      ? shipmentRow.applicable_procedures.filter((p: string) => p && p !== "general_customs_procedure")
      : [];

  const stagesRows = stagesRes.data;
  if (stagesRes.error && process.env.NODE_ENV === "development") {
    console.error("[getShipmentCustomsJourney] Error fetching stages:", stagesRes.error.message);
  }

  // 3. Map existing stages by key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingStagesMap = new Map<CustomsStageKey, any>();
  if (Array.isArray(stagesRows)) {
    for (const row of stagesRows) {
      if (CUSTOMS_STAGE_DEFINITIONS[row.stage_key as CustomsStageKey]) {
        existingStagesMap.set(row.stage_key as CustomsStageKey, {
          id: row.id,
          shipment_id: row.shipment_id,
          stage_key: row.stage_key,
          stage_order: row.stage_order,
          status: row.status,
          is_applicable: row.is_applicable ?? true,
          expected_role: row.expected_role,
          assigned_to: row.assigned_to || null,
          assigned_to_name: row.assignee?.full_name || null,
          role_confirmed: row.role_confirmed ?? false,
          outcome: row.outcome,
          reference_number: row.reference_number,
          notes: row.notes,
          rejection_or_delay_reason: row.rejection_or_delay_reason,
          stage_data: row.stage_data || {},
          completed_at: row.completed_at,
          completed_by: row.completed_by,
          completed_by_name: row.completer?.full_name || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
          updated_by: row.updated_by,
        });
      }
    }
  }

  // 4. Fetch context for stages 1, 2, 3 synchronization
  const [pricingRes, acidRes, docsRes] = await Promise.all([
    supabase
      .from("shipment_pricing")
      .select("status, final_price, estimated_min_price, estimated_max_price, approval_type")
      .eq("shipment_id", shipmentId)
      .maybeSingle(),
    supabase
      .from("shipment_acids")
      .select("status, acid_number")
      .eq("shipment_id", shipmentId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, document_type, status")
      .eq("shipment_id", shipmentId),
  ]);

  const pricing = pricingRes.data as {
    status?: string;
    final_price?: number | null;
    estimated_min_price?: number;
    estimated_max_price?: number;
    approval_type?: string | null;
  } | null;
  const acid = acidRes.data as { status?: string; acid_number?: string } | null;
  const documents = (docsRes.data || []) as DocumentItem[];

  // Evaluate historical Form 46 compatibility if stage_4_form_46 is not yet persisted
  const st7Existing = existingStagesMap.get("stage_7_data_entry");
  const st7HistoricalForm46 =
    (typeof st7Existing?.stage_data?.declaration_46_number === "string" &&
      st7Existing.stage_data.declaration_46_number.trim()) ||
    (typeof st7Existing?.stage_data?.declaration_46_advisory === "string" &&
      st7Existing.stage_data.declaration_46_advisory.trim()) ||
    (typeof st7Existing?.reference_number === "string" &&
      st7Existing.reference_number.trim()) ||
    null;

  // 5. Initialize any missing stages or compute synced status
  const finalizedStages: CustomsJourneyStage[] = [];
  const stagesToInsert: Array<Record<string, unknown>> = [];

  for (let i = 0; i < STAGE_KEYS_SEQUENCE.length; i++) {
    const stageKey = STAGE_KEYS_SEQUENCE[i];
    const def = CUSTOMS_STAGE_DEFINITIONS[stageKey];
    const existing = existingStagesMap.get(stageKey);

    // Evaluate stage applicability dynamically
    let isApplicable = isStageApplicable(
      stageKey,
      goodsCategory,
      applicableProcedures,
      existing !== undefined ? existing.is_applicable : null,
    );

    let calculatedStatus: CustomsStageStatus =
      existing?.status || (!isApplicable ? "not_applicable" : "pending");
    let outcome =
      existing?.outcome ||
      (!isApplicable ? `غير مطلوب (${workflowTemplate.badge})` : null);
    let referenceNumber = existing?.reference_number || null;
    let completedAt = existing?.completed_at || null;
    const baseStageData: Record<string, unknown> = { ...(existing?.stage_data || {}) };

    // Handle virtual initialization of stage_4_form_46 for legacy shipments if not yet in DB
    if (stageKey === "stage_4_form_46" && !existing) {
      if (st7HistoricalForm46) {
        calculatedStatus = "skipped";
        isApplicable = false;
        referenceNumber = st7HistoricalForm46;
        completedAt = null; // Never fabricate completed_at
        outcome = "مستوفى تاريخياً من سجل مرحلة إدراج البيانات السابقة";
        baseStageData.legacy_resolution = "satisfied_from_stage_7";
        baseStageData.source_stage = "stage_7_data_entry";
        baseStageData.historical_form_46_number = st7HistoricalForm46;
        baseStageData.historical_recorded_by = st7Existing?.completed_by || null;
        baseStageData.historical_recorded_at =
          st7Existing?.completed_at || st7Existing?.updated_at || null;
      } else if (
        shipmentRow.status === "customs_cleared" ||
        shipmentRow.status === "delivered"
      ) {
        calculatedStatus = "not_applicable";
        isApplicable = false;
        completedAt = null;
        outcome = "شحنة منتهية تاريخياً قبل استحداث بوابة رقم 46 المستقلة";
        baseStageData.legacy_resolution = "exempt_terminal_shipment";
      }
    }

    // Sync with existing workflows if not already manually updated
    if (!existing || existing.status === "pending" || existing.status === "not_applicable") {
      if (stageKey === "stage_1_intake") {
        const hasBasicData = !!(shipmentRow.goods_description && shipmentRow.country_of_origin);
        if (hasBasicData && (shipmentRow.classification_reviewed_at || shipmentRow.goods_category)) {
          calculatedStatus = "completed";
          outcome = `تم استلام الشحنة وتحديد الفئة: ${workflowTemplate.name}`;
          completedAt = shipmentRow.classification_reviewed_at || shipmentRow.updated_at || null;
        } else if (hasBasicData) {
          calculatedStatus = "in_progress";
        }
      }

      if (stageKey === "stage_2_pricing") {
        if (pricing?.status === "customer_approved") {
          calculatedStatus = "completed";
          outcome =
            pricing.final_price !== null && pricing.final_price !== undefined
              ? `تم اعتماد السعر النهائي (${pricing.final_price.toLocaleString("ar-EG")} EGP)`
              : `تمت موافقة العميل على النطاق التقديري (${pricing.estimated_min_price?.toLocaleString("ar-EG") || "—"} – ${pricing.estimated_max_price?.toLocaleString("ar-EG") || "—"} EGP)`;
        } else if (pricing?.status && pricing.status !== "pending") {
          calculatedStatus = "in_progress";
        }
      }

      if (stageKey === "stage_3_nafeza_acid") {
        let approvedDocsCount = 0;
        for (const type of FINAL_SHIPMENT_DOCUMENT_TYPES) {
          const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === type);
          if (doc?.status === "approved") approvedDocsCount++;
        }

        if (acid?.status === "issued" && approvedDocsCount >= 4) {
          calculatedStatus = "completed";
          outcome = `تم إصدار ACID (${acid.acid_number || "معتمد"}) واعتماد المستندات 4/4`;
          referenceNumber = acid.acid_number || null;
        } else if (acid?.status === "issued" || acid?.status === "processing") {
          calculatedStatus = "in_progress";
          referenceNumber = acid.acid_number || null;
        }
      }
    }

    const currentStatus =
      existing?.status && existing.status !== "pending"
        ? existing.status
        : calculatedStatus;
    const currentOutcome = existing?.outcome || outcome;
    const currentRef = existing?.reference_number || referenceNumber;
    const currentCompletedAt = existing?.completed_at ?? completedAt;

    // SLA & Timing computation
    const targetDurationHours =
      typeof baseStageData.target_duration_hours === "number"
        ? baseStageData.target_duration_hours
        : def.targetDurationHours;

    let activatedAt =
      typeof baseStageData.activated_at === "string" ? baseStageData.activated_at : null;
    if (
      !activatedAt &&
      (currentStatus === "in_progress" ||
        currentStatus === "awaiting_external_response" ||
        currentStatus === "needs_correction" ||
        currentStatus === "blocked")
    ) {
      activatedAt = existing?.created_at || new Date().toISOString();
    }

    let targetCompletionAt =
      typeof baseStageData.target_completion_at === "string"
        ? baseStageData.target_completion_at
        : null;
    if (activatedAt && !targetCompletionAt && targetDurationHours > 0) {
      targetCompletionAt = new Date(
        new Date(activatedAt).getTime() + targetDurationHours * 3600 * 1000,
      ).toISOString();
    }

    const waitingReason =
      typeof baseStageData.waiting_reason === "string" ? baseStageData.waiting_reason : null;

    let isOverdue = false;
    let timeStatusLabel: string | null = null;
    const nowMs = Date.now();

    if (currentStatus === "completed") {
      if (currentCompletedAt && targetCompletionAt) {
        isOverdue =
          new Date(currentCompletedAt).getTime() > new Date(targetCompletionAt).getTime();
        timeStatusLabel = isOverdue
          ? "أُنجز بعد تجاوز الوقت المستهدف"
          : "أُنجز ضمن الوقت المستهدف";
      } else {
        timeStatusLabel = "مكتمل وموثق";
      }
    } else if (currentStatus === "skipped") {
      timeStatusLabel = "مستوفى من السجل التاريخي السابق";
    } else if (currentStatus === "not_applicable") {
      timeStatusLabel = "غير مطلوب لهذا المسار";
    } else if (currentStatus === "awaiting_external_response") {
      timeStatusLabel = waitingReason || "بانتظار رد خارجي / العميل";
    } else if (activatedAt && targetCompletionAt) {
      const targetMs = new Date(targetCompletionAt).getTime();
      const diffMs = targetMs - nowMs;
      if (diffMs < 0) {
        isOverdue = true;
        const overdueHours = Math.max(1, Math.ceil(-diffMs / (3600 * 1000)));
        timeStatusLabel = `متأخر بمقدار ${overdueHours} ساعة`;
      } else {
        const remainingHours = Math.max(1, Math.ceil(diffMs / (3600 * 1000)));
        timeStatusLabel = `متبقي ${remainingHours} ساعة`;
      }
    } else if (currentStatus === "pending") {
      timeStatusLabel = "بانتظار بدء المرحلة";
    }

    // Predefined checklist synchronization
    const savedChecklist = Array.isArray(baseStageData.checklist)
      ? (baseStageData.checklist as Array<Record<string, unknown>>)
      : [];
    const savedChecklistMap = new Map<string, Record<string, unknown>>();
    for (const item of savedChecklist) {
      if (typeof item.id === "string") {
        savedChecklistMap.set(item.id, item);
      }
    }

    const checklist = def.defaultChecklist.map((itemDef) => {
      const saved = savedChecklistMap.get(itemDef.id);
      const isCompleted =
        currentStatus === "completed" ||
        currentStatus === "skipped" ||
        saved?.status === "completed";
      const itemStatus: "pending" | "completed" | "blocked" | "needs_correction" =
        saved?.status === "blocked" ||
        saved?.status === "needs_correction" ||
        saved?.status === "completed" ||
        saved?.status === "pending"
          ? (saved.status as "pending" | "completed" | "blocked" | "needs_correction")
          : isCompleted
          ? "completed"
          : "pending";

      return {
        id: itemDef.id,
        label: itemDef.label,
        isRequired: itemDef.isRequired,
        status: itemStatus,
        completedAt:
          typeof saved?.completed_at === "string"
            ? saved.completed_at
            : currentStatus === "completed"
            ? currentCompletedAt
            : null,
        completedBy: typeof saved?.completed_by === "string" ? saved.completed_by : null,
        completedByName:
          typeof saved?.completed_by_name === "string" ? saved.completed_by_name : null,
        notes: typeof saved?.notes === "string" ? saved.notes : null,
      };
    });

    const finalizedStageData: Record<string, unknown> = {
      ...baseStageData,
      activated_at: activatedAt,
      target_completion_at: targetCompletionAt,
      target_duration_hours: targetDurationHours,
      waiting_reason: waitingReason,
      checklist,
    };

    if (existing) {
      finalizedStages.push({
        ...existing,
        stage_order: def.order,
        status: currentStatus,
        is_applicable: isApplicable,
        outcome: currentOutcome,
        reference_number: currentRef,
        completed_at: currentCompletedAt,
        activated_at: activatedAt,
        target_completion_at: targetCompletionAt,
        target_duration_hours: targetDurationHours,
        waiting_reason: waitingReason,
        is_overdue: isOverdue,
        time_status_label: timeStatusLabel,
        checklist,
        stage_data: finalizedStageData,
      });
    } else {
      const newStageRecord: CustomsJourneyStage = {
        id: `virtual-${stageKey}`,
        shipment_id: shipmentId,
        stage_key: stageKey,
        stage_order: def.order,
        status: currentStatus,
        is_applicable: isApplicable,
        expected_role: def.expectedRole,
        assigned_to: null,
        assigned_to_name: null,
        role_confirmed: def.isRoleConfirmed,
        outcome: currentOutcome,
        reference_number: currentRef,
        notes: null,
        rejection_or_delay_reason: null,
        stage_data: finalizedStageData,
        completed_at: currentCompletedAt,
        completed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
        activated_at: activatedAt,
        target_completion_at: targetCompletionAt,
        target_duration_hours: targetDurationHours,
        waiting_reason: waitingReason,
        is_overdue: isOverdue,
        time_status_label: timeStatusLabel,
        checklist,
      };

      finalizedStages.push(newStageRecord);

      if (options.allowBackgroundInit) {
        stagesToInsert.push({
          shipment_id: shipmentId,
          stage_key: stageKey,
          stage_order: def.order,
          status: currentStatus,
          is_applicable: isApplicable,
          expected_role: def.expectedRole,
          role_confirmed: def.isRoleConfirmed,
          outcome: currentOutcome,
          reference_number: currentRef,
          notes: null,
          stage_data: finalizedStageData,
          completed_at: currentCompletedAt,
        });
      }
    }
  }

  // Persist newly initialized stages only when called by authorized staff/admin
  if (options.allowBackgroundInit && stagesToInsert.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("shipment_customs_stages") as any)
      .upsert(stagesToInsert, { onConflict: "shipment_id,stage_key", ignoreDuplicates: true })
      .then(() => {})
      .catch((err: Error) => {
        if (process.env.NODE_ENV === "development") {
          console.error("[getShipmentCustomsJourney] Background stages insert error:", err.message);
        }
      });
  }

  // 6. Fetch history records
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: historyRows } = await (supabase.from("shipment_customs_stage_history") as any)
    .select(`
      *,
      profiles:performed_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("performed_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: CustomsJourneyStageHistory[] = (historyRows || []).map((h: any) => ({
    id: h.id,
    shipment_id: h.shipment_id,
    stage_key: h.stage_key,
    action: h.action,
    from_status: h.from_status,
    to_status: h.to_status,
    outcome: h.outcome,
    reference_number: h.reference_number,
    notes: h.notes,
    metadata: h.metadata || {},
    performed_by: h.performed_by,
    performed_by_name: h.profiles?.full_name || null,
    performed_at: h.performed_at,
  }));

  // 7. Calculate Journey Metrics & Active / Next Stage
  const applicableStages = finalizedStages.filter(
    (s) => s.is_applicable && s.status !== "not_applicable" && s.status !== "skipped",
  );
  const completedStages = applicableStages.filter((s) => s.status === "completed");

  const activeStage =
    applicableStages.find(
      (s) =>
        s.status !== "completed" &&
        s.status !== "not_applicable" &&
        s.status !== "skipped",
    ) ||
    applicableStages[applicableStages.length - 1] ||
    finalizedStages[0];

  const activeIndex = applicableStages.findIndex((s) => s.stage_key === activeStage.stage_key);
  const nextStage =
    activeIndex >= 0 && activeIndex + 1 < applicableStages.length
      ? applicableStages[activeIndex + 1]
      : null;

  const isFullyCleared =
    finalizedStages.find((s) => s.stage_key === "stage_10_clearance_release")?.status ===
    "completed";

  const progressPercentage =
    applicableStages.length > 0
      ? Math.round((completedStages.length / applicableStages.length) * 100)
      : 0;

  return {
    shipment_id: shipmentId,
    goods_category: goodsCategory,
    applicable_procedures: applicableProcedures,
    regulatory_procedures: regulatoryProcedures,
    classification_notes: shipmentRow.classification_notes || null,
    classification_reviewed_at: shipmentRow.classification_reviewed_at || null,
    classification_reviewed_by: shipmentRow.classification_reviewed_by || null,
    classification_reviewed_by_name: shipmentRow.reviewer?.full_name || null,
    stages: finalizedStages,
    history,
    activeStageKey: activeStage.stage_key,
    nextStageKey: nextStage ? nextStage.stage_key : null,
    completedStagesCount: completedStages.length,
    applicableStagesCount: applicableStages.length,
    progressPercentage,
    isFullyCleared,
  };
}

/**
 * Fetch and construct the customer-safe synchronized journey.
 * Uses the session-bound Supabase client (`createClient()`) and strictly isolates
 * internal notes, employee IDs, and staff checklists.
 */
export async function getCustomerShipmentCustomsJourney(
  shipmentId: string,
): Promise<import("@/types").CustomerCustomsJourney | null> {
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // 1. Fetch shipment and verify access permissions via session client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shipmentRow, error: shipmentErr } = await (supabase.from("shipments") as any)
    .select("id, customer_id, company_id, status, goods_category")
    .eq("id", shipmentId)
    .maybeSingle();

  if (shipmentErr || !shipmentRow) return null;

  const isStaff = ["admin", "manager", "data_entry", "inspector", "scout"].includes(user.role);
  const isOwner =
    shipmentRow.customer_id === user.id ||
    (user.companyId && shipmentRow.company_id === user.companyId);

  if (!isStaff && !isOwner) {
    return null;
  }

  // 2. Load the canonical journey using session-bound client (no background writes from customer view)
  const journey = await getShipmentCustomsJourneyInternal(shipmentId, {
    allowBackgroundInit: isStaff,
  });
  if (!journey) return null;

  // 3. Fetch customer pricing, invoice review, and document contexts
  //    Fixed: shipment_invoice_reviews columns are (action, note, performed_at)
  const [pricingRes, acidRes, docsRes, invoiceReviewsRes] = await Promise.all([
    supabase
      .from("shipment_pricing")
      .select(
        "status, final_price, estimated_min_price, estimated_max_price, approval_type",
      )
      .eq("shipment_id", shipmentId)
      .maybeSingle(),
    supabase
      .from("shipment_acids")
      .select("status, acid_number")
      .eq("shipment_id", shipmentId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, document_type, status, title")
      .eq("shipment_id", shipmentId),
    supabase
      .from("shipment_invoice_reviews")
      .select("action, note, performed_at")
      .eq("shipment_id", shipmentId)
      .order("performed_at", { ascending: false })
      .limit(1),
  ]);

  const pricing = pricingRes.data as {
    status?: string;
    final_price?: number | null;
    estimated_min_price?: number;
    estimated_max_price?: number;
    approval_type?: string | null;
  } | null;
  const acid = acidRes.data as { status?: string; acid_number?: string } | null;
  const documents = (docsRes.data || []) as DocumentItem[];
  const latestInvoiceReview = (invoiceReviewsRes.data || [])[0] as
    | { action?: string; note?: string | null; performed_at?: string }
    | undefined;

  const stagesSnapshotMap = new Map(
    journey.stages.map((s) => [
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
  const effectiveForm46 = getEffectiveForm46Data(stagesSnapshotMap, shipmentRow.status);

  // 4. Map stages to customer-safe representations
  const template = getWorkflowTemplateForCategory(journey.goods_category);
  const customerStages: import("@/types").CustomerCustomsStage[] = journey.stages.map((st) => {
    const def = CUSTOMS_STAGE_DEFINITIONS[st.stage_key];
    const isCurrentActive = st.stage_key === journey.activeStageKey;

    let isWaitingForCustomer = false;
    let customerActionRequired: string | null = null;
    let approvedPublicReference: string | null = null;

    if (st.stage_key === "stage_2_pricing") {
      // Fixed: shipment_pricing.status values are 'proposed' | 'final_proposed'
      if (pricing?.status === "proposed" || pricing?.status === "final_proposed") {
        isWaitingForCustomer = true;
        customerActionRequired = "مطلوب مراجعة واعتماد عرض السعر لخدمة OUT";
      } else if (pricing?.status === "customer_approved") {
        if (pricing.final_price !== null && pricing.final_price !== undefined) {
          approvedPublicReference = `${pricing.final_price.toLocaleString("ar-EG")} ج.م (سعر نهائي معتمد)`;
        } else if (pricing.estimated_min_price !== undefined) {
          approvedPublicReference = `${pricing.estimated_min_price.toLocaleString("ar-EG")} – ${pricing.estimated_max_price?.toLocaleString("ar-EG")} ج.م (نطاق تقديري معتمد)`;
        }
      }
    } else if (st.stage_key === "stage_3_nafeza_acid") {
      if (acid?.acid_number && acid.status === "issued") {
        approvedPublicReference = `ACID: ${acid.acid_number}`;
      }
      let finalUploaded = 0;
      let finalRevision = 0;
      for (const t of FINAL_SHIPMENT_DOCUMENT_TYPES) {
        const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === t);
        if (doc) finalUploaded++;
        if (doc?.status === "revision_required") finalRevision++;
      }
      if (finalRevision > 0) {
        isWaitingForCustomer = true;
        customerActionRequired = `توجد ${finalRevision} مستندات بحاجة للتعديل وإعادة الرفع`;
      } else if (finalUploaded < 4 && acid?.status === "issued") {
        isWaitingForCustomer = true;
        customerActionRequired = `بانتظار استكمال رفع المستندات الأربعة النهائية (${finalUploaded}/4)`;
      }
    } else if (st.stage_key === "stage_4_form_46") {
      if (effectiveForm46.number) {
        approvedPublicReference = `رقم 46: ${effectiveForm46.number}`;
      }
    } else if (st.stage_key === "stage_9_fees_payments") {
      const settlement = (st.stage_data?.customs_duties_settlement ||
        st.stage_data) as CustomsDutiesSettlementData | undefined;
      const assessedAmount =
        settlement?.assessed_customs_amount ?? settlement?.duties_amount;
      if (settlement?.settlement_status === "customer_paid_direct") {
        const directRef =
          settlement.customer_direct_payment_reference || st.reference_number;
        approvedPublicReference = directRef
          ? `سداد مباشر بإيصال: ${directRef}`
          : "تم السداد المباشر من العميل لمصلحة الجمارك";
      } else if (
        settlement?.settlement_status === "settled" &&
        st.status === "completed"
      ) {
        approvedPublicReference =
          assessedAmount && assessedAmount > 0
            ? `تمت التسوية المالية بالكامل (${assessedAmount.toLocaleString("ar-EG")} ج.م)`
            : "تمت التسوية المالية بالكامل";
      } else if (assessedAmount && assessedAmount > 0) {
        approvedPublicReference = `الرسوم الرسمية المقررة: ${assessedAmount.toLocaleString("ar-EG")} ج.م`;
      }
      if (settlement?.settlement_status === "paid_by_out_awaiting_customer") {
        isWaitingForCustomer = true;
        customerActionRequired =
          "سددت OUT الرسوم الجمركية وبانتظار تحويل المستحقات لحساب الشركة";
      }
    } else if (st.stage_key === "stage_10_clearance_release") {
      const releaseData = st.stage_data as
        | import("@/types").ClearanceReleaseStageData
        | undefined;
      if (releaseData?.delivered_at || st.status === "completed") {
        approvedPublicReference = "تم الإفراج والتسليم بنجاح";
      } else if (releaseData?.release_permit_number || st.reference_number) {
        approvedPublicReference = `إذن إفراج: ${releaseData?.release_permit_number || st.reference_number}`;
      }
    }

    return {
      key: st.stage_key,
      order: st.stage_order,
      title: def.title,
      shortDescription: def.shortDescription,
      customerDescription: def.customerVisibleDescription,
      status: st.status,
      isApplicable: st.is_applicable,
      completedAt: st.completed_at,
      isCurrentActive,
      isWaitingForCustomer,
      customerActionRequired,
      approvedPublicReference,
      regulatoryAuthority: template.regulatoryAuthority,
      timeStatusLabel: st.time_status_label,
    };
  });

  // 5. Determine Primary Customer Action Required
  let primaryAction: import("@/types").CustomerCustomsJourney["primaryActionRequired"] = null;

  // Fixed: check 'proposed' | 'final_proposed' instead of 'price_proposed'
  if (pricing?.status === "proposed" || pricing?.status === "final_proposed") {
    primaryAction = {
      actionType: "approve_price",
      title: "اعتماد عرض سعر الخدمة",
      description:
        pricing.status === "final_proposed"
          ? "قام فريق OUT بتحديد السعر النهائي لأتعاب التخليص الجمركي. يرجى مراجعة السعر النهائي واعتماده لمتابعة الإجراءات."
          : "قام فريق OUT بتقديم النطاق التقديري لأتعاب التخليص الجمركي. يمكنك الموافقة على النطاق للمتابعة أو طلب التفاوض.",
      buttonLabel: "مراجعة واعتماد السعر",
      targetTab: "pricing",
    };
  } else if (
    latestInvoiceReview?.action === "revision_requested" ||
    shipmentRow.status === "invoice_revision_required"
  ) {
    primaryAction = {
      actionType: "revise_invoice",
      title: "تعديل الفاتورة المبدئية",
      description:
        latestInvoiceReview?.note ||
        "تم تسجيل ملاحظات على الفاتورة المبدئية وتتطلب التعديل وإعادة الرفع.",
      buttonLabel: "رفع النسخة المعدلة",
      targetTab: "documents",
    };
  } else {
    let revisionDocCount = 0;
    let uploadedFinalCount = 0;
    for (const t of FINAL_SHIPMENT_DOCUMENT_TYPES) {
      const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === t);
      if (doc) uploadedFinalCount++;
      if (doc?.status === "revision_required") revisionDocCount++;
    }

    if (revisionDocCount > 0) {
      primaryAction = {
        actionType: "correct_document",
        title: "تعديل مستندات الشحنة",
        description: `توجد ${revisionDocCount} مستندات تتطلب تعديلها وإعادة رفعها بناءً على تدقيق فريق العمليات.`,
        buttonLabel: "تعديل المستندات",
        targetTab: "documents",
      };
    } else if (acid?.status === "issued" && uploadedFinalCount < 4) {
      primaryAction = {
        actionType: "upload_documents",
        title: "استكمال رفع المستندات النهائية",
        description: `تم إصدار رقم ACID بنجاح. يرجى استكمال رفع المستندات الأربعة النهائية (${uploadedFinalCount}/4 مرفوعة).`,
        buttonLabel: "رفع المستندات",
        targetTab: "documents",
      };
    }
  }

  const activeStageMeta = CUSTOMS_STAGE_DEFINITIONS[journey.activeStageKey];

  return {
    shipmentId,
    goodsCategory: journey.goods_category,
    categoryLabel: template.name,
    stages: customerStages,
    activeStageKey: journey.activeStageKey,
    activeStageTitle: activeStageMeta.title,
    completedStagesCount: journey.completedStagesCount,
    applicableStagesCount: journey.applicableStagesCount,
    progressPercentage: journey.progressPercentage,
    isFullyCleared: journey.isFullyCleared,
    primaryActionRequired: primaryAction,
  };
}

export {
  getDefaultProceduresForCategory,
  buildUnifiedSevenStageJourney,
  buildAuthoritativeTenStageJourney,
} from "./journey-builder";
