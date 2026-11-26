/**
 * Canonical 10-Stage Journey Adapter Layer
 *
 * Maps the authoritative OUT business workflow to the underlying database records,
 * enforcing:
 * - Independent Form 46 gate (`stage_4_form_46`) before field scouting & inspection,
 *   with historical satisfaction (`skipped`) from `stage_7_data_entry`.
 * - Authoritative manual regulatory procedures (`stage_4_type_procedures`) positioned
 *   after inspection (Stage 06) and only active when procedures are explicitly selected.
 * - Distinction between acceptance of an estimated range vs a fixed final price.
 */

import type {
  GoodsCategory,
  CustomsStageKey,
  CustomsStageStatus,
  AuthoritativeStageNumber,
  AuthoritativeStageKey,
  AuthoritativeJourneyStage,
  AuthoritativeTenStageJourney,
  ShipmentCustomsJourney,
  CustomsDutiesSettlementData,
  CustomerStationNumber,
  CustomerJourneyStation,
  CustomerSevenStationJourney,
} from "@/types/journey";
import {
  GOODS_CATEGORY_LABELS,
  CUSTOMS_STAGE_STATUS_CONFIG,
  CUSTOMER_STATIONS_CONFIG,
  computeCustomsOutstandingBalance,
} from "@/types/journey";
import {
  isStageApplicable,
  getEffectiveForm46Data,
  type StageStateSnapshot,
} from "./workflow-rules";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  ShipmentInvoiceReview,
  ShipmentAcid,
  ShipmentAcidHistoryItem,
  ShipmentDocumentReviewItem,
  ShipmentStageHistoryItem,
} from "@/types";
import { matchFinalDocumentType, FINAL_SHIPMENT_DOCUMENT_TYPES } from "@/types";

export interface BuildAuthoritativeJourneyParams {
  shipment: Shipment;
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  documents?: DocumentItem[];
  journey?: ShipmentCustomsJourney | null;
  customerJourney?: import("@/types").CustomerCustomsJourney | null;
  invoiceReviews?: ShipmentInvoiceReview[];
  pricingHistory?: ShipmentPricingHistoryItem[];
  acidHistory?: ShipmentAcidHistoryItem[];
  documentReviews?: ShipmentDocumentReviewItem[];
  stageHistory?: ShipmentStageHistoryItem[];
  isCustomerView?: boolean;
}

/**
 * Builds the canonical 10-stage journey for a shipment, synchronizing the authoritative
 * stages across Admin and Customer views.
 */
export function buildAuthoritativeTenStageJourney(
  params: BuildAuthoritativeJourneyParams,
): AuthoritativeTenStageJourney {
  const {
    shipment,
    pricing,
    acid,
    documents = [],
    journey,
    customerJourney,
    invoiceReviews = [],
    isCustomerView = false,
  } = params;

  const goodsCategory: GoodsCategory =
    journey?.goods_category || customerJourney?.goodsCategory || shipment.goods_category || "other";

  // Authoritative regulatory procedures: never auto-assume Food Safety unless explicitly present
  const applicableProcedures: string[] =
    Array.isArray(journey?.regulatory_procedures) && journey.regulatory_procedures.length > 0
      ? journey.regulatory_procedures.map((p) => p.procedure_code)
      : Array.isArray(journey?.applicable_procedures)
      ? journey.applicable_procedures.filter((p) => p && p !== "general_customs_procedure")
      : Array.isArray(shipment.applicable_procedures)
      ? shipment.applicable_procedures.filter((p) => p && p !== "general_customs_procedure")
      : [];

  // 1. Map existing operational customs stage records by key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawStages: Array<any> =
    journey?.stages && journey.stages.length > 0
      ? journey.stages
      : (customerJourney?.stages || []).map((cs) => ({
          stage_key: cs.key,
          stage_order: cs.order,
          status: cs.status as CustomsStageStatus,
          is_applicable: cs.isApplicable,
          completed_at: cs.completedAt,
          assigned_to: null,
          notes: null,
          reference_number: null,
          stage_data: null,
        }));

  const stagesMap = new Map(rawStages.map((s) => [s.stage_key, s]));
  const st1 = stagesMap.get("stage_1_intake");
  const st2 = stagesMap.get("stage_2_pricing");
  const st3 = stagesMap.get("stage_3_nafeza_acid");
  const st4Form46 = stagesMap.get("stage_4_form_46");
  const st5 = stagesMap.get("stage_5_scouting");
  const st6 = stagesMap.get("stage_6_inspection");
  const st4TypeProc = stagesMap.get("stage_4_type_procedures");
  const st7 = stagesMap.get("stage_7_data_entry");
  const st8 = stagesMap.get("stage_8_valuation");
  const st9 = stagesMap.get("stage_9_fees_payments");
  const st10 = stagesMap.get("stage_10_clearance_release");

  const snapshotMap = new Map<string, StageStateSnapshot>();
  for (const [k, v] of stagesMap.entries()) {
    snapshotMap.set(k, {
      status: v.status,
      is_applicable: v.is_applicable,
      reference_number: v.reference_number,
      stage_data: v.stage_data,
      completed_at: v.completed_at,
      completed_by: v.completed_by,
    });
  }

  const effectiveForm46 = getEffectiveForm46Data(snapshotMap, shipment.status);

  // 2. Document Metrics (Final 4 Shipping Documents)
  let approvedFinalDocsCount = 0;
  let revisionFinalDocsCount = 0;
  let uploadedFinalDocsCount = 0;

  for (const t of FINAL_SHIPMENT_DOCUMENT_TYPES) {
    const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === t);
    if (doc) uploadedFinalDocsCount++;
    if (doc?.status === "approved") approvedFinalDocsCount++;
    if (doc?.status === "revision_required") revisionFinalDocsCount++;
  }

  const preliminaryInvoiceDoc = documents.find((d) =>
    ["commercial_invoice", "proforma_invoice", "invoice", "فاتورة مبدئية", "الفاتورة التجارية"].includes(
      d.document_type || "",
    ),
  );

  // 3. Raw Stage Completion Evaluations

  // Stage 01: Intake & Goods Classification
  const isS1Done =
    st1?.status === "completed" ||
    (!!shipment.classification_reviewed_at && !["draft", "submitted"].includes(shipment.status)) ||
    (!!shipment.goods_category && !!shipment.port_of_arrival && !["draft", "submitted"].includes(shipment.status));

  // Stage 02: Pricing & Customer Approval
  const isS2Done =
    pricing?.status === "customer_approved" ||
    !!pricing?.customer_approved_at ||
    st2?.status === "completed" ||
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

  // Stage 03: Preliminary Invoice Review & Nafeza / ACID
  const latestInvoiceReview = invoiceReviews[0];
  const isInvoiceApproved =
    preliminaryInvoiceDoc?.status === "approved" ||
    latestInvoiceReview?.action === "approved" ||
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

  const isAcidIssued =
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

  const isS3Done = (isInvoiceApproved && isAcidIssued) || st3?.status === "completed";

  // Stage 04: Shipment Documents Review (4 Final Docs) + Independent Form 46 Gate
  const isS4Done = approvedFinalDocsCount >= 4 && effectiveForm46.isSatisfied;

  // Stage 05: Field Scouting (stage_5_scouting)
  const isS5Done =
    st5?.status === "completed" ||
    st5?.status === "not_applicable" ||
    st5?.is_applicable === false;

  // Stage 06: Customs Inspection (stage_6_inspection) + Conditional Regulatory Procedures (stage_4_type_procedures)
  const isTypeProcApplicable = isStageApplicable(
    "stage_4_type_procedures",
    goodsCategory,
    applicableProcedures,
    st4TypeProc?.is_applicable,
  );
  const isTypeProcSatisfied =
    !isTypeProcApplicable ||
    st4TypeProc?.status === "completed" ||
    st4TypeProc?.status === "not_applicable";
  const isS6Done = st6?.status === "completed" && isTypeProcSatisfied;

  // Stage 07: Data Entry (stage_7_data_entry)
  const isS7Done =
    st7?.status === "completed" || ["customs_cleared", "delivered"].includes(shipment.status);

  // Stage 08: Customs Valuation
  const isS8Done =
    st8?.status === "completed" || ["customs_cleared", "delivered"].includes(shipment.status);

  // Stage 09: Settlement of Dues & Customs Duties
  const settlementData = (st9?.stage_data?.customs_duties_settlement || st9?.stage_data) as
    | CustomsDutiesSettlementData
    | undefined;
  const outstandingDutiesBalance = computeCustomsOutstandingBalance(settlementData);
  const isS9Done =
    (st9?.status === "completed" && outstandingDutiesBalance <= 0) ||
    ["customs_cleared", "delivered"].includes(shipment.status) ||
    journey?.isFullyCleared === true;

  // Stage 10: Clearance, Release, Exit & Delivery
  const isS10Done =
    st10?.status === "completed" ||
    shipment.status === "delivered" ||
    (st10?.status === "completed" && !!st10?.reference_number);

  // Pricing display helper (distinguishes estimated range vs final fixed amount)
  const pricingMetaInfo =
    pricing?.status === "customer_approved"
      ? pricing.final_price !== null && pricing.final_price !== undefined
        ? `${pricing.final_price.toLocaleString("ar-EG")} ج.م (سعر نهائي معتمد)`
        : `نطاق معتمد: ${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price.toLocaleString("ar-EG")} ج.م`
      : pricing?.final_price !== null && pricing?.final_price !== undefined
      ? `نهائي مقترح: ${pricing.final_price.toLocaleString("ar-EG")} ج.م`
      : pricing?.estimated_min_price
      ? `تقديري: ${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price?.toLocaleString("ar-EG")} ج.م`
      : null;

  // 4. Raw Definitions Array for the 10 Authoritative Stages
  const rawStageDefinitions: Array<{
    number: AuthoritativeStageNumber;
    key: AuthoritativeStageKey;
    title: string;
    icon: string;
    shortDescription: string;
    customerDescription: string;
    isCompletedRaw: boolean;
    isApplicable: boolean;
    metaInfo?: string | null;
    prerequisiteText?: string | null;
    mappedDbKeys: CustomsStageKey[];
    dbStageRecord?: typeof st1;
    assignedRole: string;
    assignedRoleLabel: string;
    form46SubProcess?: import("@/types/journey").StageSubProcessDetails;
    typeProceduresSubProcess?: import("@/types/journey").StageSubProcessDetails;
    checklist: Array<{ id: string; label: string; isRequired: boolean; isCompleted: boolean; status?: string }>;
  }> = [
    // 01 — تقديم طلب الشحنة
    {
      number: "01",
      key: "01_intake",
      title: "01 — تقديم طلب الشحنة",
      icon: "PackageCheck",
      shortDescription: "مراجعة بيانات الشحنة والمورد وميناء الوصول وتحديد نوع الشحنة (زراعية / صناعية)",
      customerDescription: "استلام طلب الشحنة وتدقيق البيانات الأساسية وتحديد المسار الإجرائي المناسب",
      isCompletedRaw: isS1Done,
      isApplicable: true,
      metaInfo: shipment.goods_category
        ? GOODS_CATEGORY_LABELS[shipment.goods_category]
        : "بانتظار تحديد نوع الشحنة",
      prerequisiteText: null,
      mappedDbKeys: ["stage_1_intake"],
      dbStageRecord: st1,
      assignedRole: "admin",
      assignedRoleLabel: "إدارة العمليات",
      checklist: [
        { id: "chk_1_data", label: "مراجعة بيانات الشحنة والمورد وميناء الوصول", isRequired: true, isCompleted: isS1Done },
        { id: "chk_1_cat", label: "تحديد وتثبيت نوع الشحنة (زراعية / صناعية)", isRequired: true, isCompleted: !!shipment.goods_category },
      ],
    },

    // 02 — التسعير وموافقة العميل
    {
      number: "02",
      key: "02_pricing",
      title: "02 — التسعير وموافقة العميل",
      icon: "Receipt",
      shortDescription: "إعداد نطاق التسعير التقديري، وموافقة العميل على النطاق أو التفاوض وتثبيت السعر النهائي",
      customerDescription: "مراجعة عرض سعر خدمة OUT والموافقة عليه أو طلب التفاوض لمتابعة إجراءات التخليص",
      isCompletedRaw: isS2Done,
      isApplicable: true,
      metaInfo: pricingMetaInfo,
      prerequisiteText: "تتطلب استكمال مراجعة بيانات وتصنيف الشحنة أولاً",
      mappedDbKeys: ["stage_2_pricing"],
      dbStageRecord: st2,
      assignedRole: "admin",
      assignedRoleLabel: "إدارة العمليات والتسعير",
      checklist: [
        { id: "chk_2_est", label: "إعداد وحفظ نطاق التسعير التقديري", isRequired: true, isCompleted: !!(pricing?.estimated_min_price || pricing?.final_price) },
        { id: "chk_2_appr", label: "موافقة العميل الرسمية (على النطاق التقديري أو السعر النهائي)", isRequired: true, isCompleted: pricing?.status === "customer_approved" },
      ],
    },

    // 03 — مراجعة الفاتورة المبدئية وإجراءات نافذة وACID
    {
      number: "03",
      key: "03_invoice_nafeza",
      title: "03 — مراجعة الفاتورة المبدئية وإجراءات نافذة وACID",
      icon: "ShieldCheck",
      shortDescription: "مراجعة الفاتورة المبدئية واعتمادها، واستخراج وتوثيق رقم ACID الرسمي",
      customerDescription: "مراجعة وتدقيق الفاتورة المبدئية وإصدار رقم القيد الجمركي المبدئي (ACID) عبر نافذة",
      isCompletedRaw: isS3Done,
      isApplicable: true,
      metaInfo: acid?.acid_number
        ? `ACID: ${acid.acid_number}`
        : isInvoiceApproved
        ? "الفاتورة معتمدة — بانتظار ACID"
        : null,
      prerequisiteText: "تتطلب اعتماد التسعير وموافقة العميل الرسمية أولاً",
      mappedDbKeys: ["stage_3_nafeza_acid"],
      dbStageRecord: st3,
      assignedRole: "data_entry",
      assignedRoleLabel: "مدرج بيانات / نافذة",
      checklist: [
        { id: "chk_3_inv_up", label: "التحقق من وجود ورفع الفاتورة المبدئية للشحنة", isRequired: true, isCompleted: !!preliminaryInvoiceDoc },
        { id: "chk_3_inv_appr", label: "مراجعة واعتماد الفاتورة المبدئية من العمليات", isRequired: true, isCompleted: isInvoiceApproved },
        { id: "chk_3_acid_num", label: "استخراج وتوثيق رقم ACID الرسمي المعتمد (19 رقماً)", isRequired: true, isCompleted: isAcidIssued },
      ],
    },

    // 04 — مراجعة مستندات الشحنة واستخراج رقم 46 (Final Docs + Form 46 Gate)
    {
      number: "04",
      key: "04_documents",
      title: "04 — مراجعة مستندات الشحنة واستخراج رقم 46",
      icon: "Files",
      shortDescription: "مراجعة واعتماد المستندات الأساسية الأربعة، ثم استخراج وتأكيد رقم 46 الجمركي كبوابة إلزامية قبل الميدان",
      customerDescription: "رفع وتدقيق المستندات النهائية الأربعة للشحن واستخراج رقم 46 الجمركي",
      isCompletedRaw: isS4Done,
      isApplicable: true,
      metaInfo: effectiveForm46.number
        ? `مستندات (${approvedFinalDocsCount}/4) • رقم 46: ${effectiveForm46.number}${effectiveForm46.isHistorical ? " (تاريخي)" : ""}`
        : `مستندات معتمدة (${approvedFinalDocsCount}/4) • بانتظار رقم 46`,
      prerequisiteText: "تتطلب مراجعة الفاتورة المبدئية وتوثيق رقم ACID من نافذة أولاً",
      mappedDbKeys: ["stage_4_form_46"],
      dbStageRecord: st4Form46,
      assignedRole: "data_entry",
      assignedRoleLabel: "مراجعة المستندات واستخراج رقم 46",
      form46SubProcess: {
        key: "stage_4_form_46",
        title: "استخراج رقم 46 الجمركي",
        role: "data_entry",
        roleLabel: "مدرج بيانات",
        status: (st4Form46?.status as CustomsStageStatus) || (effectiveForm46.isSatisfied ? "skipped" : "pending"),
        statusLabel: effectiveForm46.isSatisfied
          ? effectiveForm46.isHistorical
            ? "مستوفى تاريخياً"
            : "مؤكد ومكتمل"
          : "بانتظار استخراج وتأكيد رقم 46",
        isApplicable: !effectiveForm46.isExemptTerminal,
        outcome: st4Form46?.outcome,
        referenceNumber: effectiveForm46.number,
        notes: isCustomerView ? null : st4Form46?.notes,
        completedAt: effectiveForm46.recordedAt,
        completedBy: isCustomerView ? null : effectiveForm46.recordedBy,
        isHistoricalSatisfaction: effectiveForm46.isHistorical,
      },
      checklist: [
        {
          id: "chk_4_ci",
          label: "الفاتورة التجارية النهائية (Commercial Invoice)",
          isRequired: true,
          isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "commercial_invoice" && d.status === "approved"),
        },
        {
          id: "chk_4_pl",
          label: "بيان العبوة النهائي (Packing List)",
          isRequired: true,
          isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "packing_list" && d.status === "approved"),
        },
        {
          id: "chk_4_bl",
          label: "بوليصة الشحن (Bill of Lading)",
          isRequired: true,
          isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "bill_of_lading" && d.status === "approved"),
        },
        {
          id: "chk_4_co",
          label: "شهادة المنشأ الرسمية (Certificate of Origin)",
          isRequired: true,
          isCompleted: !!documents.find((d) => matchFinalDocumentType(d.document_type) === "certificate_of_origin" && d.status === "approved"),
        },
        {
          id: "chk_4_form46",
          label: "استخراج وتأكيد رقم 46 الجمركي (إلزامي قبل الكشف والمعاينة)",
          isRequired: true,
          isCompleted: effectiveForm46.isSatisfied,
        },
      ],
    },

    // 05 — الكشف الميداني (Scouting - stage_5_scouting)
    {
      number: "05",
      key: "05_scouting",
      title: "05 — الكشف الميداني",
      icon: "ShieldAlert",
      shortDescription: "التحقق الميداني من وصول الحاوية في الساحة ومراجعة إذن التسليم وسلامة الأختام الجمركية",
      customerDescription: "الكشف الميداني على الحاويات وسلامة الأختام الجمركية في ساحة الوصول",
      isCompletedRaw: isS5Done,
      isApplicable: st5?.is_applicable !== false && st5?.status !== "not_applicable",
      metaInfo: st5?.outcome || (st5?.status === "not_applicable" ? "غير منطبق" : null),
      prerequisiteText: "تتطلب اعتماد المستندات الأربعة وتأكيد استخراج رقم 46 أولاً",
      mappedDbKeys: ["stage_5_scouting"],
      dbStageRecord: st5,
      assignedRole: "scout",
      assignedRoleLabel: "كشاف ميداني",
      checklist: [
        { id: "chk_5_arrival", label: "التحقق من وصول الحاوية إلى الساحة ومطابقة رقمها", isRequired: true, isCompleted: isS5Done },
        { id: "chk_5_do", label: "مراجعة إذن التسليم (Delivery Order) والمنافست", isRequired: true, isCompleted: isS5Done },
        { id: "chk_5_seals", label: "فحص وسلامة الأختام الملاحية والجمركية وتوثيقها", isRequired: true, isCompleted: isS5Done },
      ],
    },

    // 06 — المعاينة والجهات الرقابية (stage_6_inspection + conditional stage_4_type_procedures)
    {
      number: "06",
      key: "06_inspection",
      title: "06 — المعاينة والجهات الرقابية",
      icon: "Eye",
      shortDescription: "المعاينة الجمركية الفعلية وفحص الطرود، تليها إجراءات الجهات الرقابية المعتمدة (مثل سلامة الغذاء أو الحجر الزراعي عند انطباقها)",
      customerDescription: "المعاينة الجمركية الفعلية وفحص الطرود واستيفاء موافقات الجهات الرقابية المختصة",
      isCompletedRaw: isS6Done,
      isApplicable: true,
      metaInfo:
        st6?.outcome ||
        (st6?.reference_number ? `محضر: ${st6.reference_number}` : null) ||
        (isTypeProcApplicable
          ? `تشمل ${applicableProcedures.length} جهة رقابية`
          : null),
      prerequisiteText: "تتطلب تأكيد رقم 46 واستكمال الكشف الميداني أولاً",
      mappedDbKeys: ["stage_6_inspection", "stage_4_type_procedures"],
      dbStageRecord: st6,
      assignedRole: "inspector",
      assignedRoleLabel: "معاين جمركي وجهات العرض",
      typeProceduresSubProcess: {
        key: "stage_4_type_procedures",
        title: "الإجراءات الرقابية وجهات العرض",
        role: "inspector",
        roleLabel: "معاين جهات العرض",
        status:
          (st4TypeProc?.status as CustomsStageStatus) ||
          (isTypeProcApplicable ? "pending" : "not_applicable"),
        statusLabel: st4TypeProc
          ? CUSTOMS_STAGE_STATUS_CONFIG[st4TypeProc.status as CustomsStageStatus]?.label ||
            st4TypeProc.status
          : isTypeProcApplicable
          ? "بانتظار موافقة الجهات الرقابية"
          : "غير مطلوب (لم تُحدد جهات رقابية)",
        isApplicable: isTypeProcApplicable,
        outcome: st4TypeProc?.outcome,
        referenceNumber: st4TypeProc?.reference_number,
        notes: isCustomerView ? null : st4TypeProc?.notes,
        completedAt: st4TypeProc?.completed_at,
        completedBy: isCustomerView ? null : st4TypeProc?.completed_by,
        completedByName: isCustomerView ? null : st4TypeProc?.completed_by_name,
        rejectionOrDelayReason: st4TypeProc?.rejection_or_delay_reason,
      },
      checklist: [
        { id: "chk_6_open", label: "فتح الطرود وفحص ومطابقة البضاعة بحضور المعاين الجمركي ومعاين OUT", isRequired: true, isCompleted: st6?.status === "completed" },
        { id: "chk_6_rep", label: "صدور وتوثيق محضر المعاينة الجمركية الرسمي", isRequired: true, isCompleted: st6?.status === "completed" },
        ...(isTypeProcApplicable
          ? [
              {
                id: "chk_6_reg_proc",
                label: "صدور موافقات جميع الجهات الرقابية المسجلة للشحنة",
                isRequired: true,
                isCompleted: isTypeProcSatisfied,
              },
            ]
          : []),
      ],
    },

    // 07 — إدراج البيانات
    {
      number: "07",
      key: "07_data_entry",
      title: "07 — إدراج البيانات",
      icon: "FileText",
      shortDescription: "تجميع الأصناف وإعداد بياناتها ومواصفاتها وتسعيراتها الجمركية على المنظومة",
      customerDescription: "إدراج وتدقيق البيانات الجمركية وتطبيق بنود التعريفة ومراجعة مسودة البيان الجمركي",
      isCompletedRaw: isS7Done,
      isApplicable: true,
      metaInfo: st7?.reference_number ? `بيان: ${st7.reference_number}` : null,
      prerequisiteText: "تتطلب إتمام المعاينة الجمركية والجهات الرقابية المعتمدة أولاً",
      mappedDbKeys: ["stage_7_data_entry"],
      dbStageRecord: st7,
      assignedRole: "data_entry",
      assignedRoleLabel: "مدرج بيانات جمركية",
      checklist: [
        { id: "chk_7_entry", label: "تجميع الأصناف وتفريغ بنود الفاتورة والشهادة على المنظومة", isRequired: true, isCompleted: isS7Done },
        { id: "chk_7_hs", label: "تدقيق بنود التعريفة الجمركية (HS Codes) ومطابقتها", isRequired: true, isCompleted: isS7Done },
      ],
    },

    // 08 — التقييم الجمركي
    {
      number: "08",
      key: "08_valuation",
      title: "08 — التقييم الجمركي",
      icon: "Scale",
      shortDescription: "مناقشة الأصناف والقيم مع المثمن والتوصل إلى القيمة الجمركية المعتمدة",
      customerDescription: "تحديد القيمة للأغراض الجمركية وتطبيق بنود التعريفة واحتساب الضرائب والرسوم المقررة",
      isCompletedRaw: isS8Done,
      isApplicable: true,
      metaInfo:
        st8?.outcome ||
        (st8?.stage_data?.assessed_customs_amount ??
        st8?.stage_data?.duties_amount ??
        st8?.stage_data?.customs_value_egp
          ? `قيمة معتمدة: ${Number(
              st8.stage_data.assessed_customs_amount ??
                st8.stage_data.duties_amount ??
                st8.stage_data.customs_value_egp,
            ).toLocaleString("ar-EG")} ج.م`
          : null),
      prerequisiteText: "تتطلب استكمال إدراج البيانات وتدقيق البنود الجمركية أولاً",
      mappedDbKeys: ["stage_8_valuation"],
      dbStageRecord: st8,
      assignedRole: "data_entry",
      assignedRoleLabel: "تثمين وتقييم جمركي",
      checklist: [
        { id: "chk_8_val", label: "مراجعة واعتماد القيمة المقبولة للأغراض الجمركية", isRequired: true, isCompleted: isS8Done },
        { id: "chk_8_tax", label: "تطبيق نسب الرسوم الجمركية والضرائب المقررة رسمياً", isRequired: true, isCompleted: isS8Done },
        { id: "chk_8_rep", label: "صدور وتوثيق تقرير التقييم الجمركي المعتمد", isRequired: true, isCompleted: isS8Done },
      ],
    },

    // 09 — التسوية وسداد المستحقات
    {
      number: "09",
      key: "09_settlement",
      title: "09 — التسوية وسداد المستحقات",
      icon: "CreditCard",
      shortDescription: "تسجيل سداد المستحقات الجمركية ومطابقة الإيصالات والتحقق من عدم بقاء التزام مالي معلق",
      customerDescription: "سداد ومطابقة الرسوم والضرائب الجمركية الرسمية وتوثيق إشعارات السداد البنكي",
      isCompletedRaw: isS9Done,
      isApplicable: true,
      metaInfo:
        outstandingDutiesBalance > 0
          ? `متبقي: ${outstandingDutiesBalance.toLocaleString("ar-EG")} ج.م`
          : settlementData?.assessed_customs_amount ?? settlementData?.duties_amount
          ? `رسوم: ${(settlementData?.assessed_customs_amount ?? settlementData?.duties_amount)!.toLocaleString("ar-EG")} ج.م`
          : null,
      prerequisiteText: "تتطلب اعتماد التقييم الجمركي وتثبيت السعر النهائي لأتعاب OUT أولاً",
      mappedDbKeys: ["stage_9_fees_payments"],
      dbStageRecord: st9,
      assignedRole: "admin",
      assignedRoleLabel: "إدارة الحسابات والعمليات",
      checklist: [
        { id: "chk_9_claim", label: "استلام مطالبة الرسوم الجمركية والضرائب الرسمية", isRequired: true, isCompleted: isS9Done },
        { id: "chk_9_source", label: "توثيق مصدر السداد وإيصالات الجمارك وأتعاب OUT", isRequired: true, isCompleted: isS9Done },
        { id: "chk_9_balance", label: "التحقق من عدم بقاء أي التزام مالي معلق واجب السداد", isRequired: true, isCompleted: isS9Done },
      ],
    },

    // 10 — الإفراج الجمركي وخروج الشحنة والتسليم
    {
      number: "10",
      key: "10_clearance_release",
      title: "10 — الإفراج الجمركي وخروج الشحنة والتسليم",
      icon: "Truck",
      shortDescription: "تأكيد انتهاء التخليص الجمركي وجاهزية الخروج، وطلب النقل، وتأكيد التسليم الفعلي للعميل",
      customerDescription: "صدور إذن الإفراج النهائي الرسمي، وخروج الشحنة من الدائرة الجمركية وتسليمها للعميل",
      isCompletedRaw: isS10Done,
      isApplicable: true,
      metaInfo: st10?.reference_number ? `إذن إفراج: ${st10.reference_number}` : null,
      prerequisiteText: "تتطلب تسوية وسداد كافة الرسوم الجمركية المستحقة أولاً",
      mappedDbKeys: ["stage_10_clearance_release"],
      dbStageRecord: st10,
      assignedRole: "admin",
      assignedRoleLabel: "إدارة العمليات والتسليم",
      checklist: [
        { id: "chk_10_permit", label: "صدور إذن الإفراج الجمركي النهائي الرسمي وتوثيق رقمه", isRequired: true, isCompleted: isS10Done },
        { id: "chk_10_exit", label: "تأكيد جاهزية الخروج وإنشاء طلب نقل الشحنة", isRequired: true, isCompleted: isS10Done },
        { id: "chk_10_delivery", label: "تسليم الشحنة الفعلي للعميل وتوثيق الاستلام", isRequired: true, isCompleted: isS10Done },
      ],
    },
  ];

  // 5. Sequential Status & Active Stage Resolution
  let foundActive = false;
  let activeStageNumber: AuthoritativeStageNumber = "01";
  let activeStageTitle = "01 — تقديم طلب الشحنة";

  const resolvedStages: AuthoritativeJourneyStage[] = rawStageDefinitions.map((def) => {
    let status: CustomsStageStatus = "pending";
    let statusLabel = "لم تبدأ";
    let isCurrent = false;

    const persistedStatus = def.dbStageRecord?.status;
    const hasMeaningfulPersistedStatus =
      persistedStatus &&
      persistedStatus !== "pending" &&
      persistedStatus !== "not_applicable" &&
      persistedStatus !== "skipped";

    if (def.isCompletedRaw) {
      status = "completed";
      statusLabel = "مكتملة";
    } else if (def.dbStageRecord?.status === "not_applicable" && !def.isApplicable) {
      status = "not_applicable";
      statusLabel = "غير منطبق";
    } else if (hasMeaningfulPersistedStatus && persistedStatus === "needs_correction") {
      status = "needs_correction";
      statusLabel = "مطلوب تصحيح";
      if (!foundActive) {
        foundActive = true;
        isCurrent = true;
        activeStageNumber = def.number;
        activeStageTitle = def.title;
      }
    } else if (hasMeaningfulPersistedStatus && persistedStatus === "blocked") {
      status = "blocked";
      statusLabel = "متوقفة";
      if (!foundActive) {
        foundActive = true;
        isCurrent = true;
        activeStageNumber = def.number;
        activeStageTitle = def.title;
      }
    } else if (!def.isApplicable) {
      status = "not_applicable";
      statusLabel = "غير منطبق";
    } else if (!foundActive) {
      foundActive = true;
      isCurrent = true;
      activeStageNumber = def.number;
      activeStageTitle = def.title;
      status = "in_progress";
      statusLabel = "المرحلة الحالية";

      if (def.key === "02_pricing") {
        if (pricing?.status === "proposed" || pricing?.status === "final_proposed") {
          status = "awaiting_external_response";
          statusLabel = "بانتظار موافقة العميل";
        } else if (pricing?.status === "negotiation_requested") {
          status = "needs_correction";
          statusLabel = "قيد التفاوض";
        }
      } else if (def.key === "03_invoice_nafeza") {
        if (
          shipment.status === "invoice_revision_required" ||
          preliminaryInvoiceDoc?.status === "revision_required" ||
          latestInvoiceReview?.action === "revision_requested"
        ) {
          status = "needs_correction";
          statusLabel = "مطلوب تعديل الفاتورة المبدئية";
        } else if (!preliminaryInvoiceDoc) {
          status = "awaiting_external_response";
          statusLabel = "بانتظار رفع الفاتورة المبدئية";
        } else if (acid?.status === "processing") {
          status = "awaiting_external_response";
          statusLabel = "بانتظار صدور ACID من نافذة";
        }
      } else if (def.key === "04_documents") {
        if (revisionFinalDocsCount > 0) {
          status = "needs_correction";
          statusLabel = `مطلوب تعديل مستندات (${revisionFinalDocsCount} مرفوض)`;
        } else if (uploadedFinalDocsCount < 4) {
          status = "awaiting_external_response";
          statusLabel = `بانتظار رفع المستندات (${uploadedFinalDocsCount}/4)`;
        } else if (approvedFinalDocsCount < 4) {
          status = "in_progress";
          statusLabel = `جاري مراجعة المستندات (${approvedFinalDocsCount}/4 معتمد)`;
        } else if (!effectiveForm46.isSatisfied) {
          status = "in_progress";
          statusLabel = "بانتظار استخراج وتأكيد رقم 46";
        }
      } else if (def.key === "06_inspection") {
        if (st6?.status === "completed" && isTypeProcApplicable && !isTypeProcSatisfied) {
          status = "awaiting_external_response";
          statusLabel = "بانتظار موافقة الجهات الرقابية";
        }
      } else if (def.key === "09_settlement") {
        if (settlementData?.settlement_status === "paid_by_out_awaiting_customer") {
          status = "awaiting_external_response";
          statusLabel = "بانتظار تحصيل المستحقات من العميل";
        }
      }
    } else {
      status = "pending";
      statusLabel = "لم تبدأ";
    }

    const opRecord = def.dbStageRecord;

    return {
      number: def.number,
      key: def.key,
      title: def.title,
      icon: def.icon,
      shortDescription: def.shortDescription,
      customerDescription: def.customerDescription,
      status,
      statusLabel,
      isCompleted: status === "completed",
      isCurrent,
      isUpcoming: status === "pending",
      isApplicable: def.isApplicable,
      isActionRequired:
        status === "awaiting_external_response" ||
        status === "needs_correction" ||
        status === "blocked",
      metaInfo: def.metaInfo,
      waitingReason: isCustomerView ? null : opRecord?.waiting_reason || null,
      prerequisiteText: def.prerequisiteText,
      assignedRole: isCustomerView ? undefined : def.assignedRole,
      assignedRoleLabel: isCustomerView ? undefined : def.assignedRoleLabel,
      completedAt: opRecord?.completed_at || (def.isCompletedRaw ? shipment.updated_at : null),
      activatedAt: opRecord?.activated_at || null,
      targetCompletionAt: opRecord?.target_completion_at || null,
      targetDurationHours: opRecord?.target_duration_hours || undefined,
      isOverdue: opRecord?.is_overdue || false,
      timeStatusLabel: opRecord?.time_status_label || null,
      checklist: isCustomerView ? undefined : def.checklist,
      form46SubProcess: def.form46SubProcess,
      typeProceduresSubProcess: def.typeProceduresSubProcess,
      mappedDbKeys: def.mappedDbKeys,
      dbStageRecord: isCustomerView ? null : opRecord || null,
    };
  });

  const applicableStages = resolvedStages.filter((s) => s.isApplicable);
  const completedCount = resolvedStages.filter((s) => s.isCompleted && s.isApplicable).length;
  const isCompleted =
    completedCount === applicableStages.length && applicableStages.length > 0;

  if (isCompleted) {
    activeStageNumber = "10";
    activeStageTitle = "10 — الإفراج والخروج والتسليم";
  }

  // 6. Operational Current Action (Admin Hero Banner)
  let currentOperationalAction: AuthoritativeTenStageJourney["currentOperationalAction"] = null;

  if (!isCompleted) {
    const activeStage =
      resolvedStages.find((s) => s.number === activeStageNumber) || resolvedStages[0];

    let whyActive = "المرحلة الحالية قيد الإجراء التشغيلي";
    let whatNext = "استكمال الإجراءات والمتطلبات المقررة لهذه المرحلة";
    let actionLabel = "عرض وتحديث المرحلة";
    let blockedReason: string | null = null;

    if (activeStage.number === "01") {
      whyActive = !shipment.goods_category
        ? "بانتظار تحديد نوع الشحنة (زراعية / صناعية)"
        : "بانتظار مراجعة بيانات الشحنة وتحديد الجهات الرقابية المطلوبة إن وجدت";
      whatNext = "تثبيت تصنيف البضاعة وتحديد ما إذا كانت تتطلب جهات عرض رقابية";
      actionLabel = "مراجعة وتأكيد التصنيف";
    } else if (activeStage.number === "02") {
      if (pricing?.status === "proposed" || pricing?.status === "final_proposed") {
        whyActive = "في انتظار موافقة العميل على عرض السعر";
        whatNext = "متابعة العميل لاعتماد عرض السعر أو توثيق موافقته الرسمية";
        actionLabel = "تفاصيل التسعير والموافقة";
      } else if (pricing?.status === "negotiation_requested") {
        whyActive = "العميل طلب التفاوض على عرض السعر";
        whatNext = "التواصل مع العميل وتحديد السعر النهائي المتفق عليه";
        actionLabel = "تحديث عرض السعر";
      } else {
        whyActive = "في انتظار إعداد وتقديم النطاق التقديري للسعر";
        whatNext = "حفظ النطاق التقديري لأتعاب OUT وإرساله للعميل";
        actionLabel = "تسجيل عرض السعر";
      }
    } else if (activeStage.number === "03") {
      if (
        shipment.status === "invoice_revision_required" ||
        preliminaryInvoiceDoc?.status === "revision_required" ||
        latestInvoiceReview?.action === "revision_requested"
      ) {
        whyActive = "الفاتورة المبدئية تحتاج إلى تعديل";
        whatNext = "في انتظار قيام العميل برفع النسخة المعدلة من الفاتورة المبدئية";
        actionLabel = "مراجعة الفاتورة والملاحظات";
        blockedReason = "تعديل الفاتورة مطلوب من العميل";
      } else if (!preliminaryInvoiceDoc) {
        whyActive = "في انتظار رفع الفاتورة المبدئية للشحنة";
        whatNext = "رفع الفاتورة المبدئية للبدء في مراجعتها وتدقيق بنودها";
        actionLabel = "رفع / تدقيق الفاتورة";
      } else if (!isInvoiceApproved) {
        whyActive = "في انتظار مراجعة واعتماد الفاتورة المبدئية";
        whatNext = "تدقيق الفاتورة المبدئية واعتمادها للبدء في استخراج ACID";
        actionLabel = "اعتماد الفاتورة المبدئية";
      } else {
        whyActive = "الفاتورة معتمدة — جاري استخراج رقم ACID";
        whatNext = "استخراج وتوثيق رقم القيد الجمركي المبدئي (ACID) الصادر من نافذة";
        actionLabel = "توثيق رقم ACID";
      }
    } else if (activeStage.number === "04") {
      if (revisionFinalDocsCount > 0) {
        whyActive = `توجد مستندات بحاجة لتعديل (${revisionFinalDocsCount} مستند مرفوض)`;
        whatNext = "في انتظار رفع النسخ المصححة من العميل وإعادة اعتمادها";
        actionLabel = "مراجعة المستندات";
        blockedReason = "مطلوب تصحيح المستندات من العميل";
      } else if (uploadedFinalDocsCount < 4) {
        whyActive = `في انتظار استكمال رفع المستندات المطلوبة (${uploadedFinalDocsCount}/4)`;
        whatNext = "استكمال رفع: الفاتورة التجارية، بيان العبوة، بوليصة الشحن، شهادة المنشأ";
        actionLabel = "إدارة المستندات";
      } else if (approvedFinalDocsCount < 4) {
        whyActive = `في انتظار مراجعة واعتماد المستندات المرفوعة (${approvedFinalDocsCount}/4 معتمد)`;
        whatNext = "تدقيق المستندات الأربعة واعتمادها لفتح مرحلة استخراج رقم 46";
        actionLabel = "تدقيق واعتماد المستندات";
      } else {
        whyActive = "المستندات معتمدة بالكامل — بانتظار استخراج وتأكيد رقم 46 الجمركي";
        whatNext = "تسجيل رقم 46 الجمركي وتأكيد استخراجه للسماح ببدء الكشف والمعاينة الميدانية";
        actionLabel = "تسجيل وتأكيد رقم 46";
      }
    } else if (activeStage.number === "05") {
      whyActive = "في انتظار الكشف الميداني في ساحة الوصول";
      whatNext = "التحقق الميداني من وصول الحاوية، ومراجعة إذن التسليم، وفحص سلامة الأختام (كشاف)";
      actionLabel = "تسجيل الكشف الميداني";
    } else if (activeStage.number === "06") {
      if (st6?.status === "completed" && isTypeProcApplicable && !isTypeProcSatisfied) {
        whyActive = "المعاينة مكتملة — بانتظار موافقة الجهات الرقابية المعتمدة للشحنة";
        whatNext = "متابعة الفحص وسحب العينات وتوثيق موافقة كافة الجهات الرقابية المسجلة";
        actionLabel = "إدارة الجهات الرقابية";
      } else {
        whyActive = "في انتظار المعاينة الجمركية الفعلية";
        whatNext = "فتح الطرود وفحص المحتويات بحضور المعاين الجمركي ومعاين فريقنا وتحرير المحضر";
        actionLabel = "توثيق محضر المعاينة";
      }
    } else if (activeStage.number === "07") {
      whyActive = "في انتظار إدراج البيانات الجمركية وتجميع الأصناف";
      whatNext = "تجميع الأصناف وإعداد بياناتها ومواصفاتها وتسعيراتها الجمركية";
      actionLabel = "إدراج وتدقيق البيانات";
    } else if (activeStage.number === "08") {
      whyActive = "في انتظار مناقشة الأصناف والتثمين الجمركي";
      whatNext = "مناقشة الأصناف والقيم مع المثمن والتوصل إلى القيمة الجمركية المعتمدة";
      actionLabel = "تسجيل واعتماد التثمين";
    } else if (activeStage.number === "09") {
      if (outstandingDutiesBalance > 0) {
        whyActive = `في انتظار سداد وتسوية الرسوم الجمركية المستحقة (${outstandingDutiesBalance.toLocaleString("ar-EG")} ج.م)`;
        whatNext = "توثيق السداد وإيصالات الجمارك وأتعاب OUT والتأكد من عدم بقاء التزام مالي معلق";
        actionLabel = "تسجيل السداد والتسوية";
        blockedReason = "يوجد رصيد رسوم جمركية معلق بانتظار التسوية";
      } else {
        whyActive = "في انتظار التحقق من تسوية المستحقات واعتماد المخالصة";
        whatNext = "مراجعة إشعارات السداد وتثبيت السعر النهائي لأتعاب OUT للانتقال للإفراج";
        actionLabel = "التحقق من التسوية";
      }
    } else if (activeStage.number === "10") {
      if (!st10?.reference_number && st10?.status !== "completed") {
        whyActive = "في انتظار صدور إذن الإفراج الجمركي النهائي الرسمي";
        whatNext = "تسجيل رقم إذن الإفراج وتأكيد جاهزية الخروج وإنشاء طلب نقل الشحنة";
        actionLabel = "توثيق إذن الإفراج وطلب النقل";
      } else if (shipment.status !== "delivered") {
        whyActive = "تم إنهاء التخليص الجمركي — بانتظار إتمام النقل وتأكيد استلام العميل";
        whatNext = "متابعة طلب نقل الشحنة وتوثيق التسليم الفعلي للعميل";
        actionLabel = "متابعة النقل والتسليم";
      } else {
        whyActive = "المرحلة النهائية للشحنة";
        whatNext = "إتمام وتوثيق التسليم النهائي للعميل";
        actionLabel = "عرض التفاصيل";
      }
    }

    currentOperationalAction = {
      stageNumber: activeStage.number,
      stageTitle: activeStage.title,
      assignedRoleLabel: activeStage.assignedRoleLabel || "إدارة العمليات",
      currentReason: whyActive,
      nextStepDescription: whatNext,
      actionButtonLabel: actionLabel,
      actionType:
        activeStage.number === "02"
          ? "open_pricing_tab"
          : activeStage.number === "04" && approvedFinalDocsCount < 4
          ? "open_documents_tab"
          : "open_stage_modal",
      isBlocked: !!blockedReason,
      blockReason: blockedReason,
    };
  }

  // 7. Primary Customer Action Required
  let primaryCustomerAction: AuthoritativeTenStageJourney["primaryCustomerAction"] = null;

  if (pricing?.status === "proposed" || pricing?.status === "final_proposed") {
    primaryCustomerAction = {
      actionType: "approve_price",
      title: "اعتماد عرض سعر الخدمة",
      description:
        pricing.status === "final_proposed"
          ? "قام فريق OUT بتحديد السعر النهائي لأتعاب التخليص الجمركي. يرجى مراجعة السعر النهائي واعتماده."
          : "قام فريق OUT بتقديم النطاق التقديري لأتعاب التخليص الجمركي. يمكنك الموافقة على النطاق للمتابعة أو طلب التفاوض.",
      buttonLabel: "مراجعة واعتماد السعر",
      targetTab: "pricing",
      targetStageNumber: "02",
    };
  } else if (
    shipment.status === "invoice_revision_required" ||
    preliminaryInvoiceDoc?.status === "revision_required" ||
    latestInvoiceReview?.action === "revision_requested"
  ) {
    primaryCustomerAction = {
      actionType: "revise_invoice",
      title: "تعديل الفاتورة المبدئية",
      description:
        latestInvoiceReview?.note ||
        "تم تسجيل ملاحظات على الفاتورة المبدئية وتتطلب التعديل وإعادة الرفع.",
      buttonLabel: "رفع النسخة المعدلة",
      targetTab: "documents",
      targetStageNumber: "03",
    };
  } else if (revisionFinalDocsCount > 0) {
    primaryCustomerAction = {
      actionType: "correct_document",
      title: "تعديل مستندات الشحنة",
      description: `توجد ${revisionFinalDocsCount} مستندات بحاجة لتعديلها وإعادة رفعها بناءً على تدقيق العمليات.`,
      buttonLabel: "تعديل المستندات",
      targetTab: "documents",
      targetStageNumber: "04",
    };
  } else if (acid?.status === "issued" && uploadedFinalDocsCount < 4) {
    primaryCustomerAction = {
      actionType: "upload_documents",
      title: "استكمال رفع المستندات النهائية",
      description: `تم إصدار رقم ACID بنجاح. يرجى استكمال رفع المستندات الأربعة النهائية (${uploadedFinalDocsCount}/4 مرفوعة).`,
      buttonLabel: "رفع المستندات",
      targetTab: "documents",
      targetStageNumber: "04",
    };
  } else if (settlementData?.settlement_status === "paid_by_out_awaiting_customer") {
    primaryCustomerAction = {
      actionType: "settle_duties",
      title: "تسوية الرسوم الجمركية",
      description: "سددت OUT الرسوم الجمركية الرسمية وبانتظار تحويل المستحقات لتأكيد التسوية.",
      buttonLabel: "بيانات التسوية",
      targetTab: "pricing",
      targetStageNumber: "09",
    };
  }

  return {
    shipmentId: shipment.id,
    stages: resolvedStages,
    currentStageNumber: activeStageNumber,
    currentStageTitle: activeStageTitle,
    completedCount,
    applicableCount: applicableStages.length,
    totalCount: 10,
    progressPercentage: Math.round((completedCount / Math.max(1, applicableStages.length)) * 100),
    isCompleted,
    goodsCategory,
    goodsCategoryLabel: GOODS_CATEGORY_LABELS[goodsCategory] || "بضائع عامة",
    primaryCustomerAction,
    currentOperationalAction,
  };
}

/**
 * Builds the 7 customer-facing progress stations.
 */
export function buildCustomerSevenStationJourney(
  tenStageJourney: AuthoritativeTenStageJourney,
): CustomerSevenStationJourney {
  const { shipmentId, stages, goodsCategory, goodsCategoryLabel, primaryCustomerAction } =
    tenStageJourney;

  let activeStationNumber: CustomerStationNumber = "01";
  let foundActive = false;

  const stationIcons: Record<CustomerStationNumber, string> = {
    "01": "PackageCheck",
    "02": "Receipt",
    "03": "ShieldCheck",
    "04": "Files",
    "05": "Eye",
    "06": "CreditCard",
    "07": "Truck",
  };

  const rawStations = CUSTOMER_STATIONS_CONFIG.map((cfg) => {
    const underlyingStages = cfg.underlyingStageNumbers
      .map((num) => stages.find((s) => s.number === num))
      .filter((s): s is AuthoritativeJourneyStage => Boolean(s));

    const applicableUnderlying = underlyingStages.filter((s) => s.isApplicable);

    const isCompleted =
      applicableUnderlying.length > 0 && applicableUnderlying.every((s) => s.isCompleted);

    const actionRequiredStage = applicableUnderlying.find((s) => s.isActionRequired);
    const inProgressStage = applicableUnderlying.find(
      (s) => s.isCurrent || s.status === "in_progress",
    );
    const anyCompleted = applicableUnderlying.some((s) => s.isCompleted);

    let completedAt: string | null = null;
    if (isCompleted) {
      const timestamps = applicableUnderlying
        .map((s) => s.completedAt)
        .filter((t): t is string => Boolean(t))
        .sort();
      completedAt = timestamps[timestamps.length - 1] || null;
    }

    let metaInfo: string | null = null;
    if (isCompleted) {
      metaInfo = "مكتملة بنجاح";
    } else if (actionRequiredStage?.metaInfo) {
      metaInfo = actionRequiredStage.metaInfo;
    } else if (inProgressStage?.metaInfo) {
      metaInfo = inProgressStage.metaInfo;
    } else {
      metaInfo = applicableUnderlying[0]?.metaInfo || null;
    }

    const activeSubStage = inProgressStage || actionRequiredStage || applicableUnderlying[0];
    const customerDescription =
      activeSubStage?.customerDescription || cfg.shortDescription;

    return {
      cfg,
      underlyingStages,
      applicableUnderlying,
      isCompleted,
      actionRequiredStage,
      inProgressStage,
      anyCompleted,
      completedAt,
      metaInfo,
      customerDescription,
    };
  });

  const resolvedStations: CustomerJourneyStation[] = rawStations.map((item) => {
    let status: CustomsStageStatus = "pending";
    let statusLabel = "لم تبدأ";
    let isCurrent = false;
    let customerActionRequired: string | null = null;

    if (item.isCompleted) {
      status = "completed";
      statusLabel = "مكتملة";
    } else if (!foundActive) {
      foundActive = true;
      isCurrent = true;
      activeStationNumber = item.cfg.number;

      if (item.actionRequiredStage) {
        status = item.actionRequiredStage.status;
        statusLabel = item.actionRequiredStage.statusLabel;
        customerActionRequired = item.actionRequiredStage.statusLabel;
      } else if (item.inProgressStage) {
        status = "in_progress";
        statusLabel = "قيد الإجراء";
      } else if (item.anyCompleted) {
        status = "in_progress";
        statusLabel = "قيد المتابعة";
      } else {
        status = "in_progress";
        statusLabel = "المحطة الحالية";
      }
    } else {
      status = "pending";
      statusLabel = "لم تبدأ";
    }

    return {
      number: item.cfg.number,
      key: item.cfg.key,
      title: item.cfg.title,
      shortDescription: item.cfg.shortDescription,
      customerDescription: item.customerDescription,
      status,
      statusLabel,
      isCompleted: item.isCompleted,
      isCurrent,
      isUpcoming: !item.isCompleted && !isCurrent,
      isActionRequired:
        status === "awaiting_external_response" ||
        status === "needs_correction" ||
        status === "blocked",
      metaInfo: item.metaInfo,
      icon: stationIcons[item.cfg.number] || "PackageCheck",
      underlyingStageNumbers: item.cfg.underlyingStageNumbers,
      underlyingStages: item.underlyingStages,
      completedAt: item.completedAt,
      customerActionRequired,
    };
  });

  const completedCount = resolvedStations.filter((s) => s.isCompleted).length;
  const isAllStationsCompleted = completedCount === 7;

  if (isAllStationsCompleted) {
    activeStationNumber = "07";
  }

  const currentStation =
    resolvedStations.find((s) => s.number === activeStationNumber) || resolvedStations[0];

  return {
    shipmentId,
    stations: resolvedStations,
    currentStationNumber: activeStationNumber,
    currentStationTitle: currentStation.title,
    completedCount,
    totalCount: 7,
    progressPercentage: Math.round((completedCount / 7) * 100),
    isCompleted: isAllStationsCompleted,
    goodsCategory,
    goodsCategoryLabel,
    primaryCustomerAction,
  };
}
