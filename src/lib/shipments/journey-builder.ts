/**
 * Pure Customs Clearance Journey Builder Utilities
 *
 * Contains pure synchronous domain functions for building and resolving
 * the 7 canonical high-level OUT shipment stages across client and server.
 * This file is completely decoupled from database clients and next/headers.
 */

import type {
  GoodsCategory,
  UnifiedJourneyStage,
  UnifiedJourneyStageKey,
  UnifiedSevenStageJourney,
  UnifiedStageStatus,
  UnifiedJourneyStageChecklistItem,
  ShipmentCustomsJourney,
} from "@/types/journey";
import {
  APPLICABLE_PROCEDURE_DEFINITIONS,
  GOODS_CATEGORY_LABELS,
} from "@/types/journey";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentAcid,
} from "@/types";
import { matchFinalDocumentType, FINAL_SHIPMENT_DOCUMENT_TYPES } from "@/types";

/**
 * Returns default procedure branch IDs for a given goods category.
 */
export function getDefaultProceduresForCategory(category: GoodsCategory): string[] {
  const matches = APPLICABLE_PROCEDURE_DEFINITIONS.filter((p) =>
    p.defaultCategories.includes(category),
  );
  if (matches.length === 0) {
    return ["general_customs_procedure"];
  }
  return matches.map((m) => m.id);
}

/**
 * Resolves the 7 canonical high-level stages for a shipment, unifying the journey
 * across Admin and Customer details pages with automatic progression and clear state.
 */
export function buildUnifiedSevenStageJourney(params: {
  shipment: Shipment;
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  documents?: DocumentItem[];
  journey?: ShipmentCustomsJourney | null;
}): UnifiedSevenStageJourney {
  const { shipment, pricing, acid, documents = [], journey } = params;

  // 1. Calculate document metrics
  let approvedFinalDocs = 0;
  let revisionDocs = 0;
  for (const t of FINAL_SHIPMENT_DOCUMENT_TYPES) {
    const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === t);
    if (doc?.status === "approved") approvedFinalDocs++;
    if (doc?.status === "revision_required") revisionDocs++;
  }

  // Preliminary invoice document check
  const preliminaryInvoiceDoc = documents.find((d) =>
    ["commercial_invoice", "proforma_invoice", "invoice", "فاتورة مبدئية", "الفاتورة التجارية"].includes(d.document_type || ""),
  );

  // 2. Check Stage 6 & 7 operational completion from journey
  const stagesMap = new Map((journey?.stages || []).map((s) => [s.stage_key, s]));
  const st1 = stagesMap.get("stage_1_intake");
  const st2 = stagesMap.get("stage_2_pricing");
  const st3 = stagesMap.get("stage_3_nafeza_acid");
  const st4 = stagesMap.get("stage_4_type_procedures");
  const st5 = stagesMap.get("stage_5_scouting");
  const st6 = stagesMap.get("stage_6_inspection");
  const st7 = stagesMap.get("stage_7_data_entry");
  const st9 = stagesMap.get("stage_9_fees_payments");
  const st10 = stagesMap.get("stage_10_clearance_release");

  const customsOpsDone =
    (st4 ? st4.status === "completed" || st4.status === "not_applicable" : true) &&
    (st5 ? st5.status === "completed" : false) &&
    (st6 ? st6.status === "completed" : false) &&
    (st7 ? st7.status === "completed" : false);

  const stage6Completed =
    ["customs_cleared", "delivered"].includes(shipment.status) ||
    customsOpsDone ||
    st6?.status === "completed" ||
    st9?.status === "completed" ||
    st9?.status === "in_progress" ||
    st10?.status === "completed" ||
    st10?.status === "in_progress" ||
    journey?.isFullyCleared === true;

  const stage7Completed =
    ["customs_cleared", "delivered"].includes(shipment.status) ||
    journey?.isFullyCleared === true ||
    st10?.status === "completed" ||
    !!st10?.reference_number;

  // 3. Define raw completion for the 7 stages
  const isS1Done =
    (shipment.status !== "draft" && shipment.status !== "submitted") ||
    !!shipment.classification_reviewed_at ||
    st1?.status === "completed";

  const isS2Done =
    pricing?.status === "customer_approved" ||
    [
      "awaiting_invoice_review",
      "invoice_revision_required",
      "invoice_approved",
      "acid_processing",
      "acid_issued",
      "awaiting_shipment_documents",
      "documents_completed",
      "ready_for_external_stage",
      "customs_in_progress",
      "customs_cleared",
      "delivered",
    ].includes(shipment.status);

  const isS3Done =
    preliminaryInvoiceDoc?.status === "approved" ||
    [
      "invoice_approved",
      "acid_processing",
      "acid_issued",
      "awaiting_shipment_documents",
      "documents_completed",
      "ready_for_external_stage",
      "customs_in_progress",
      "customs_cleared",
      "delivered",
    ].includes(shipment.status);

  const isS4Done =
    (acid?.status === "issued" && !!acid?.acid_number) ||
    [
      "acid_issued",
      "awaiting_shipment_documents",
      "documents_completed",
      "ready_for_external_stage",
      "customs_in_progress",
      "customs_cleared",
      "delivered",
    ].includes(shipment.status);

  const isS5Done =
    ["ready_for_external_stage", "customs_in_progress", "customs_cleared", "delivered"].includes(shipment.status) ||
    approvedFinalDocs >= 4;
  const isS6Done = isS5Done && stage6Completed;
  const isS7Done = isS6Done && stage7Completed;

  // 4. Raw stage definitions with checklists & prerequisites
  const rawDefinitions: Array<{
    number: string;
    key: UnifiedJourneyStageKey;
    title: string;
    shortDescription: string;
    customerDescription: string;
    metaInfo?: string | null;
    isCompletedRaw: boolean;
    prerequisiteText?: string | null;
    checklist: UnifiedJourneyStageChecklistItem[];
    operationalStageRecord?: typeof st1;
  }> = [
    {
      number: "01",
      key: "01_intake",
      title: "استلام طلب الشحنة",
      shortDescription: "مراجعة بيانات الشحنة وتحديد تصنيف نوع البضاعة والمسار الجمركي",
      customerDescription: "استلام طلب الشحنة وتدقيق البيانات الأساسية وتحديد المسار الإجرائي",
      metaInfo: shipment.goods_category ? GOODS_CATEGORY_LABELS[shipment.goods_category] : "بانتظار تصنيف البضاعة",
      isCompletedRaw: isS1Done,
      prerequisiteText: null,
      checklist: [
        { id: "chk_1_data", label: "مراجعة بيانات الشحنة والمورد وميناء الوصول", isRequired: true, isCompleted: isS1Done },
        { id: "chk_1_cat", label: "تحديد وتثبيت تصنيف نوع البضاعة", isRequired: true, isCompleted: !!shipment.goods_category },
        { id: "chk_1_proc", label: "تعيين المسارات الإجرائية الجمركية المقررة", isRequired: true, isCompleted: Array.isArray(shipment.applicable_procedures) && shipment.applicable_procedures.length > 0 },
      ],
      operationalStageRecord: st1,
    },
    {
      number: "02",
      key: "02_pricing",
      title: "التسعير وموافقة العميل",
      shortDescription: "إعداد عرض سعر خدمة OUT وموافقة العميل الرسمية",
      customerDescription: "مراجعة واعتماد عرض السعر لخدمة التخليص الجمركي",
      metaInfo: pricing?.final_price
        ? `${pricing.final_price.toLocaleString("ar-EG")} ج.م (معتمد)`
        : pricing?.estimated_min_price
          ? `تقديري: ${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price?.toLocaleString("ar-EG")} ج.م`
          : null,
      isCompletedRaw: isS2Done,
      prerequisiteText: "تتطلب استكمال مراجعة بيانات وتصنيف الشحنة أولاً",
      checklist: [
        { id: "chk_2_est", label: "إعداد وحفظ نطاق التسعير التقديري", isRequired: true, isCompleted: !!(pricing?.estimated_min_price || pricing?.final_price) },
        { id: "chk_2_final", label: "تقديم عرض السعر النهائي لأتعاب خدمة OUT", isRequired: true, isCompleted: !!pricing?.final_price },
        { id: "chk_2_appr", label: "اعتماد وموافقة العميل الرسمية على التسعير", isRequired: true, isCompleted: pricing?.status === "customer_approved" },
      ],
      operationalStageRecord: st2,
    },
    {
      number: "03",
      key: "03_invoice_review",
      title: "مراجعة الفاتورة المبدئية",
      shortDescription: "تدقيق واعتماد الفاتورة المبدئية ومطابقة بنودها",
      customerDescription: "مراجعة وتدقيق الفاتورة المبدئية للشحنة ومطابقتها",
      metaInfo: isS3Done ? "معتمدة" : null,
      isCompletedRaw: isS3Done,
      prerequisiteText: "تتطلب اعتماد التسعير وموافقة العميل الرسمية أولاً",
      checklist: [
        { id: "chk_3_up", label: "التحقق من رفع الفاتورة المبدئية للشحنة", isRequired: true, isCompleted: !!preliminaryInvoiceDoc },
        { id: "chk_3_chk", label: "تدقيق مطابقة بنود ومصطلحات الفاتورة المبدئية", isRequired: true, isCompleted: isS3Done },
        { id: "chk_3_appr", label: "اعتماد الفاتورة المبدئية من إدارة التخليص", isRequired: true, isCompleted: isS3Done },
      ],
      operationalStageRecord: st2,
    },
    {
      number: "04",
      key: "04_acid",
      title: "إصدار رقم ACID من نافذة",
      shortDescription: "استخراج وتوثيق رقم القيد الجمركي المبدئي من منصة نافذة",
      customerDescription: "إصدار وتوثيق رقم ACID للشحنة عبر منصة نافذة",
      metaInfo: acid?.acid_number ? `ACID: ${acid.acid_number}` : null,
      isCompletedRaw: isS4Done,
      prerequisiteText: "تتطلب مراجعة واعتماد الفاتورة المبدئية أولاً",
      checklist: [
        { id: "chk_4_req", label: "إدراج بيانات الشحنة المعتمدة على منصة نافذة", isRequired: true, isCompleted: isS4Done },
        { id: "chk_4_acid", label: "استخراج وتوثيق رقم ACID الرسمي (19 رقماً)", isRequired: true, isCompleted: !!(acid?.acid_number && acid?.status === "issued") },
        { id: "chk_4_bind", label: "ربط الرقم الموحد بالشحنة والمستورد والمورد", isRequired: true, isCompleted: isS4Done },
      ],
      operationalStageRecord: st3,
    },
    {
      number: "05",
      key: "05_documents",
      title: "مراجعة مستندات الشحنة",
      shortDescription: "فحص واعتماد المستندات الأربعة النهائية (الفاتورة، البوليصة، كشف العبوة، شهادة المنشأ)",
      customerDescription: "رفع ومراجعة المستندات النهائية الأربعة للشحن",
      metaInfo: `مستندات معتمدة (${approvedFinalDocs}/4)`,
      isCompletedRaw: isS5Done,
      prerequisiteText: "تتطلب استخراج وتوثيق رقم ACID من منصة نافذة أولاً",
      checklist: [
        { id: "chk_5_inv", label: "الفاتورة التجارية النهائية (Commercial Invoice)", isRequired: true, isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "commercial_invoice" && d.status === "approved") },
        { id: "chk_5_pack", label: "بيان العبوة النهائي (Packing List)", isRequired: true, isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "packing_list" && d.status === "approved") },
        { id: "chk_5_bol", label: "بوليصة الشحن (Bill of Lading)", isRequired: true, isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "bill_of_lading" && d.status === "approved") },
        { id: "chk_5_coo", label: "شهادة المنشأ الرسمية (Certificate of Origin)", isRequired: true, isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "certificate_of_origin" && d.status === "approved") },
      ],
      operationalStageRecord: st5,
    },
    {
      number: "06",
      key: "06_customs_procedures",
      title: "إجراءات التخليص حسب نوع الشحنة",
      shortDescription: "الفحص والمعاينة واللجان الفنية وإدراج البيانات حسب مسار البضاعة",
      customerDescription: "إجراءات الفحص والمعاينة ومطابقة المواصفات الجمركية",
      metaInfo: shipment.goods_category ? GOODS_CATEGORY_LABELS[shipment.goods_category]?.split(" (")[0] : null,
      isCompletedRaw: isS6Done,
      prerequisiteText: "تتطلب استكمال واعتماد مستندات الشحنة الأربعة النهائية أولاً",
      checklist: [
        { id: "chk_6_branch", label: "استيفاء متطلبات الفحص الخاص بنوع البضاعة", isRequired: true, isCompleted: isS6Done },
        { id: "chk_6_insp", label: "إتمام الكشف والمعاينة ومطابقة المواصفات القياسية", isRequired: true, isCompleted: isS6Done },
        { id: "chk_6_ref46", label: "إدراج البيان الجمركي (رقم 46 اختياري ولا يعطل المسار)", isRequired: false, isCompleted: isS6Done },
      ],
      operationalStageRecord: st6,
    },
    {
      number: "07",
      key: "07_clearance_release",
      title: "استكمال إجراءات التخليص والإفراج الجمركي",
      shortDescription: "تسوية الرسوم الجمركية واستخراج إذن الإفراج النهائي",
      customerDescription: "سداد الرسوم الجمركية واستلام إذن الإفراج النهائي",
      metaInfo: st10?.reference_number ? `إذن إفراج: ${st10.reference_number}` : null,
      isCompletedRaw: isS7Done,
      prerequisiteText: "تتطلب إتمام إجراءات الفحص والمعاينة الجمركية أولاً",
      checklist: [
        { id: "chk_7_claim", label: "استلام وتدقيق مطالبة الرسوم والضرائب الجمركية الرسمية", isRequired: true, isCompleted: isS7Done },
        { id: "chk_7_settle", label: "تسوية وسداد الرسوم الجمركية المقررة", isRequired: true, isCompleted: isS7Done },
        { id: "chk_7_permit", label: "استخراج وتوثيق رقم إذن الإفراج النهائي الرسمي", isRequired: true, isCompleted: !!(st10?.reference_number || isS7Done) },
      ],
      operationalStageRecord: st10,
    },
  ];

  // 5. Sequential status resolution (completed, current, upcoming, waiting_customer, needs_correction)
  let foundActive = false;
  let activeStageNumber = "01";
  let activeStageTitle = "استلام طلب الشحنة";

  const resolvedStages: UnifiedJourneyStage[] = rawDefinitions.map((def) => {
    let status: UnifiedStageStatus = "upcoming";
    let statusLabel = "لم تبدأ";
    let isCurrent = false;

    if (def.isCompletedRaw) {
      status = "completed";
      statusLabel = "مكتملة";
    } else if (!foundActive) {
      foundActive = true;
      isCurrent = true;
      status = "current";
      statusLabel = "المرحلة الحالية";
      activeStageNumber = def.number;
      activeStageTitle = def.title;

      // Stage-specific waiting/action conditions
      if (def.key === "02_pricing") {
        if (pricing?.status === "proposed" || pricing?.status === "final_proposed") {
          status = "waiting_customer";
          statusLabel = "بانتظار موافقة العميل";
        } else if (pricing?.status === "negotiation_requested") {
          status = "needs_correction";
          statusLabel = "قيد التفاوض";
        }
      } else if (def.key === "03_invoice_review") {
        if (shipment.status === "invoice_revision_required") {
          status = "needs_correction";
          statusLabel = "مطلوب تعديل الفاتورة";
        }
      } else if (def.key === "05_documents") {
        if (revisionDocs > 0) {
          status = "needs_correction";
          statusLabel = "مطلوب تعديل المستندات";
        } else if (documents.length < 4) {
          status = "waiting_customer";
          statusLabel = "بانتظار رفع المستندات";
        }
      }
    }

    const opRecord = def.operationalStageRecord;

    return {
      number: def.number,
      key: def.key,
      title: def.title,
      status,
      statusLabel,
      shortDescription: def.shortDescription,
      customerDescription: def.customerDescription,
      metaInfo: def.metaInfo,
      prerequisiteText: def.prerequisiteText,
      checklist: def.checklist,
      isCompleted: status === "completed",
      isCurrent,
      isUpcoming: status === "upcoming",
      isActionRequired: status === "waiting_customer" || status === "needs_correction",
      completedAt: opRecord?.completed_at || (def.isCompletedRaw ? shipment.updated_at : null),
      activatedAt: opRecord?.activated_at || null,
      targetCompletionAt: opRecord?.target_completion_at || null,
      targetDurationHours: opRecord?.target_duration_hours || undefined,
      isOverdue: opRecord?.is_overdue || false,
      timeStatusLabel: opRecord?.time_status_label || null,
      waitingReason: opRecord?.waiting_reason || null,
    };
  });

  const completedCount = resolvedStages.filter((s) => s.isCompleted).length;
  const isCompleted = completedCount === 7;
  if (isCompleted) {
    activeStageNumber = "07";
    activeStageTitle = "مكتملة ومفرج عنها";
  }

  return {
    shipmentId: shipment.id,
    stages: resolvedStages,
    currentStageNumber: activeStageNumber,
    currentStageTitle: activeStageTitle,
    completedCount,
    totalCount: 7,
    progressPercentage: Math.round((completedCount / 7) * 100),
    isCompleted,
  };
}

export {
  buildAuthoritativeTenStageJourney,
  buildCustomerSevenStationJourney,
} from "./canonical-journey-adapter";

