/**
 * Centralized Shipment Journey Workflow Rules & Stage Configuration
 *
 * Single source of truth for:
 * 1. Stage ordering and sequential advancement (including independent Form 46 gate).
 * 2. Stage prerequisites (operational status, preceding stages, document dependencies).
 * 3. Conditional procedure evaluation (Authoritative manual regulatory procedures — no auto-assumed Food Safety).
 * 4. Historical Form 46 compatibility without fabricating completion timestamps.
 * 5. Completion validation rules (Form 46 gate, regulatory procedures, duties settlement, release permit).
 */

import {
  CustomsStageKey,
  CustomsStageStatus,
  GoodsCategory,
  OperationalRole,
  computeCustomsOutstandingBalance,
  type CustomsDutiesSettlementData,
  type ShipmentRegulatoryProcedure,
} from "@/types/journey";
import { FinalShipmentDocumentType } from "@/types";

export const STAGE_KEYS_SEQUENCE: CustomsStageKey[] = [
  "stage_1_intake",
  "stage_2_pricing",
  "stage_3_nafeza_acid",
  "stage_4_form_46",
  "stage_5_scouting",
  "stage_6_inspection",
  "stage_4_type_procedures",
  "stage_7_data_entry",
  "stage_8_valuation",
  "stage_9_fees_payments",
  "stage_10_clearance_release",
];

export interface StageWorkflowRule {
  key: CustomsStageKey;
  order: number;
  title: string;
  expectedRole: OperationalRole;
  isConditional: boolean;
  prerequisiteStages: CustomsStageKey[];
  requiredDocumentTypes: FinalShipmentDocumentType[];
  targetDurationHours: number;
  initialStatus: CustomsStageStatus;
  initialWaitingReason: string | null;
  /** Stages that can satisfy this stage if skipped */
  satisfiedBy?: CustomsStageKey[];
}

export const STAGE_WORKFLOW_RULES: Record<CustomsStageKey, StageWorkflowRule> = {
  stage_1_intake: {
    key: "stage_1_intake",
    order: 1,
    title: "استلام الشحنة وتصنيفها",
    expectedRole: "admin",
    isConditional: false,
    prerequisiteStages: [],
    requiredDocumentTypes: [],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: null,
  },
  stage_2_pricing: {
    key: "stage_2_pricing",
    order: 2,
    title: "المستندات الأولية والتسعير",
    expectedRole: "admin",
    isConditional: false,
    prerequisiteStages: ["stage_1_intake"],
    requiredDocumentTypes: [],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار إعداد عرض السعر ومراجعة الفاتورة المبدئية",
  },
  stage_3_nafeza_acid: {
    key: "stage_3_nafeza_acid",
    order: 3,
    title: "إجراءات نافذة وACID والمستندات",
    expectedRole: "data_entry",
    isConditional: false,
    prerequisiteStages: ["stage_1_intake", "stage_2_pricing"],
    requiredDocumentTypes: [],
    targetDurationHours: 48,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار إصدار رقم ACID من نافذة واستكمال المستندات الأربعة",
  },
  stage_4_form_46: {
    key: "stage_4_form_46",
    order: 4,
    title: "استخراج رقم 46 الجمركي",
    expectedRole: "data_entry",
    isConditional: false,
    prerequisiteStages: ["stage_3_nafeza_acid"],
    requiredDocumentTypes: [
      "commercial_invoice",
      "packing_list",
      "bill_of_lading",
      "certificate_of_origin",
    ],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار استخراج وتأكيد رقم 46 الجمركي قبل بدء العمل الميداني",
  },
  stage_5_scouting: {
    key: "stage_5_scouting",
    order: 5,
    title: "الكشف الميداني (Scouting)",
    expectedRole: "scout",
    isConditional: true,
    prerequisiteStages: ["stage_4_form_46"],
    requiredDocumentTypes: ["bill_of_lading"],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار الكشف الميداني على الحاويات وسلامة الأختام",
  },
  stage_6_inspection: {
    key: "stage_6_inspection",
    order: 6,
    title: "المعاينة (Inspection)",
    expectedRole: "inspector",
    isConditional: false,
    prerequisiteStages: ["stage_4_form_46", "stage_5_scouting"],
    requiredDocumentTypes: ["packing_list"],
    targetDurationHours: 48,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار فتح الطرود والمطابقة مع لجان المعاينة",
  },
  stage_4_type_procedures: {
    key: "stage_4_type_procedures",
    order: 7,
    title: "الإجراءات الرقابية وجهات العرض",
    expectedRole: "inspector",
    isConditional: true,
    prerequisiteStages: ["stage_4_form_46", "stage_5_scouting", "stage_6_inspection"],
    requiredDocumentTypes: [
      "commercial_invoice",
      "packing_list",
      "bill_of_lading",
      "certificate_of_origin",
    ],
    targetDurationHours: 72,
    initialStatus: "awaiting_external_response",
    initialWaitingReason: "بانتظار إفادات وموافقات الجهات الرقابية المختصة",
  },
  stage_7_data_entry: {
    key: "stage_7_data_entry",
    order: 8,
    title: "إدراج البيانات (Data Entry)",
    expectedRole: "data_entry",
    isConditional: false,
    prerequisiteStages: ["stage_4_form_46", "stage_6_inspection", "stage_4_type_procedures"],
    requiredDocumentTypes: ["commercial_invoice", "bill_of_lading"],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار إدراج بنود التعريفة وتفريغ الأصناف على المنظومة",
  },
  stage_8_valuation: {
    key: "stage_8_valuation",
    order: 9,
    title: "التثمين الجمركي (Valuation)",
    expectedRole: "data_entry",
    isConditional: false,
    prerequisiteStages: ["stage_4_form_46", "stage_7_data_entry"],
    requiredDocumentTypes: ["commercial_invoice", "certificate_of_origin"],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار مراجعة القيمة المقبولة للأغراض الجمركية وتطبيق التعريفة",
  },
  stage_9_fees_payments: {
    key: "stage_9_fees_payments",
    order: 10,
    title: "الرسوم الجمركية والمدفوعات",
    expectedRole: "admin",
    isConditional: false,
    prerequisiteStages: ["stage_4_form_46", "stage_8_valuation"],
    requiredDocumentTypes: ["commercial_invoice"],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار استلام مطالبة الرسوم الجمركية الرسمية وسدادها",
  },
  stage_10_clearance_release: {
    key: "stage_10_clearance_release",
    order: 11,
    title: "الإفراج والتخليص النهائي",
    expectedRole: "admin",
    isConditional: false,
    prerequisiteStages: ["stage_4_form_46", "stage_9_fees_payments"],
    requiredDocumentTypes: [
      "commercial_invoice",
      "packing_list",
      "bill_of_lading",
      "certificate_of_origin",
    ],
    targetDurationHours: 24,
    initialStatus: "in_progress",
    initialWaitingReason: "بانتظار استصدار إذن الإفراج الجمركي وخروج الشحنة",
  },
};

export interface StageStateSnapshot {
  status: string;
  is_applicable?: boolean;
  reference_number?: string | null;
  stage_data?: Record<string, unknown> | null;
  completed_at?: string | null;
  completed_by?: string | null;
}

export interface EffectiveForm46Result {
  number: string | null;
  isSatisfied: boolean;
  isHistorical: boolean;
  isExemptTerminal: boolean;
  source: "stage_4_form_46" | "stage_7_data_entry" | "terminal_exemption" | null;
  recordedBy: string | null;
  recordedAt: string | null;
}

/**
 * Evaluates the effective Form 46 status across both the new independent `stage_4_form_46`
 * record and legacy historical data in `stage_7_data_entry` without fabricating completion timestamps.
 */
export function getEffectiveForm46Data(
  stagesMap: Map<string, StageStateSnapshot>,
  shipmentStatus?: string,
): EffectiveForm46Result {
  const st4Form46 = stagesMap.get("stage_4_form_46");
  const st7DataEntry = stagesMap.get("stage_7_data_entry");

  const form46Data = (st4Form46?.stage_data || {}) as Record<string, unknown>;
  const st7Data = (st7DataEntry?.stage_data || {}) as Record<string, unknown>;

  const directNumber =
    (typeof st4Form46?.reference_number === "string" && st4Form46.reference_number.trim()) ||
    (typeof form46Data.declaration_46_number === "string" && form46Data.declaration_46_number.trim()) ||
    null;

  const historicalNumber =
    (typeof form46Data.historical_form_46_number === "string" && form46Data.historical_form_46_number.trim()) ||
    (typeof st7Data.declaration_46_number === "string" && st7Data.declaration_46_number.trim()) ||
    (typeof st7Data.declaration_46_advisory === "string" && st7Data.declaration_46_advisory.trim()) ||
    (typeof st7DataEntry?.reference_number === "string" && st7DataEntry.reference_number.trim()) ||
    null;

  // Case 1: Completed directly in stage_4_form_46
  if (st4Form46?.status === "completed" && directNumber) {
    return {
      number: directNumber,
      isSatisfied: true,
      isHistorical: false,
      isExemptTerminal: false,
      source: "stage_4_form_46",
      recordedBy: st4Form46.completed_by || null,
      recordedAt: st4Form46.completed_at || null,
    };
  }

  // Case 2: Satisfied historically via skipped stage_4_form_46 or existing stage_7_data_entry record
  if (
    historicalNumber &&
    (st4Form46?.status === "skipped" ||
      form46Data.legacy_resolution === "satisfied_from_stage_7" ||
      !st4Form46)
  ) {
    return {
      number: historicalNumber,
      isSatisfied: true,
      isHistorical: true,
      isExemptTerminal: false,
      source: "stage_7_data_entry",
      recordedBy:
        (typeof form46Data.historical_recorded_by === "string"
          ? form46Data.historical_recorded_by
          : st7DataEntry?.completed_by) || null,
      recordedAt:
        (typeof form46Data.historical_recorded_at === "string"
          ? form46Data.historical_recorded_at
          : st7DataEntry?.completed_at) || null,
    };
  }

  // Case 3: Exempt terminal legacy shipment (ONLY valid while shipment remains in a terminal status)
  const isTerminalShipment =
    shipmentStatus === "customs_cleared" ||
    shipmentStatus === "delivered" ||
    shipmentStatus === "delivered_with_shortage";

  if (
    isTerminalShipment &&
    st4Form46?.status === "not_applicable" &&
    form46Data.legacy_resolution === "exempt_terminal_shipment"
  ) {
    return {
      number: null,
      isSatisfied: true,
      isHistorical: true,
      isExemptTerminal: true,
      source: "terminal_exemption",
      recordedBy: null,
      recordedAt: null,
    };
  }

  return {
    number: directNumber || historicalNumber,
    isSatisfied: false,
    isHistorical: false,
    isExemptTerminal: false,
    source: null,
    recordedBy: null,
    recordedAt: null,
  };
}

/**
 * Evaluates whether a stage is applicable for a shipment.
 * Per Owner Decision: Agricultural or Industrial classification NEVER automatically activates
 * Food Safety or any regulatory procedure. Only explicitly selected procedures activate `stage_4_type_procedures`.
 */
export function isStageApplicable(
  stageKey: CustomsStageKey,
  _goodsCategory: GoodsCategory = "other",
  applicableProcedures: string[] = [],
  explicitOverride?: boolean | null,
): boolean {
  void _goodsCategory;
  // Stage 4 Form 46 is mandatory for all shipments unless explicitly marked skipped/not_applicable for legacy
  if (stageKey === "stage_4_form_46") {
    if (explicitOverride === false) return false;
    return true;
  }

  // Stage 4 Type Procedures (Order 7): Authoritative check based strictly on active regulatory procedures
  if (stageKey === "stage_4_type_procedures") {
    const specializedProcedures = (applicableProcedures || []).filter(
      (p) => p && p !== "general_customs_procedure",
    );
    if (specializedProcedures.length > 0) {
      return true;
    }
    if (typeof explicitOverride === "boolean") {
      return explicitOverride;
    }
    return false;
  }

  if (typeof explicitOverride === "boolean") {
    return explicitOverride;
  }

  if (!STAGE_WORKFLOW_RULES[stageKey]?.isConditional) {
    return true;
  }

  if (stageKey === "stage_5_scouting") {
    return true;
  }

  return true;
}

/**
 * Checks whether a prerequisite stage is satisfied:
 * - For `stage_4_form_46`: verified via `getEffectiveForm46Data` (with legacy field-started exception for already completed scouting/inspection).
 * - Completed in the database (`status === 'completed'` or `'skipped'`).
 * - Marked legitimately not applicable (`is_applicable === false` or `status === 'not_applicable'`).
 */
export function isPrerequisiteSatisfied(
  prerequisiteKey: CustomsStageKey,
  targetStageKey: CustomsStageKey,
  stagesMap: Map<string, StageStateSnapshot>,
  shipmentStatus?: string,
): boolean {
  if (prerequisiteKey === "stage_4_form_46") {
    const form46State = getEffectiveForm46Data(stagesMap, shipmentStatus);
    if (form46State.isSatisfied) {
      return true;
    }

    // Legacy exception: if a shipment already started or completed scouting/inspection before the Form 46 gate existed,
    // allow updating scouting/inspection itself, but NEVER allow completing stage_7_data_entry, stage_8_valuation,
    // stage_9_fees_payments, or stage_10_clearance_release without Form 46!
    if (targetStageKey === "stage_5_scouting" || targetStageKey === "stage_6_inspection") {
      const targetRec = stagesMap.get(targetStageKey);
      const form46Rec = stagesMap.get("stage_4_form_46");
      const isLegacyFieldStarted =
        form46Rec?.stage_data?.legacy_resolution === "field_started_before_form46_gate" ||
        targetRec?.status === "completed" ||
        targetRec?.status === "in_progress";
      if (isLegacyFieldStarted) {
        return true;
      }
    }

    return false;
  }

  const prereqRecord = stagesMap.get(prerequisiteKey);

  if (
    prereqRecord &&
    (prereqRecord.is_applicable === false ||
      prereqRecord.status === "not_applicable" ||
      prereqRecord.status === "skipped")
  ) {
    return true;
  }

  if (prereqRecord && prereqRecord.status === "completed") {
    return true;
  }

  const prereqRule = STAGE_WORKFLOW_RULES[prerequisiteKey];
  if (prereqRule?.satisfiedBy) {
    if (prereqRule.satisfiedBy.includes(targetStageKey)) {
      return true;
    }
    for (const satisfyingKey of prereqRule.satisfiedBy) {
      const satisfyingRecord = stagesMap.get(satisfyingKey);
      if (satisfyingRecord && satisfyingRecord.status === "completed") {
        return true;
      }
    }
  }

  return false;
}

export interface ValidationContext {
  shipmentStatus: string;
  stageKey: CustomsStageKey;
  targetStatus: CustomsStageStatus;
  currentStatus?: CustomsStageStatus;
  stagesMap: Map<string, StageStateSnapshot>;
  documentStatuses?: Map<string, string>;
  regulatoryProcedures?: ShipmentRegulatoryProcedure[];
  stageData?: Record<string, unknown>;
  referenceNumber?: string | null;
  notes?: string | null;
  rejectionOrDelayReason?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Centralized prerequisite validation for all stage transitions.
 */
export function validateStagePrerequisites(ctx: ValidationContext): ValidationResult {
  const rule = STAGE_WORKFLOW_RULES[ctx.stageKey];
  if (!rule) {
    return { valid: false, error: "مرحلة التخليص المحددة غير معرفة." };
  }

  // ─── 1. Operational Readiness Check for Stages >= 4 ───
  if (rule.order >= 4) {
    const allowedStatuses = [
      "documents_completed",
      "ready_for_external_stage",
      "customs_in_progress",
      "customs_cleared",
      "delivered",
    ];
    if (!allowedStatuses.includes(ctx.shipmentStatus)) {
      return {
        valid: false,
        error: `لا يمكن تحديث مراحل التخليص الجمركي لأن حالة الشحنة الحالية هي '${ctx.shipmentStatus}' ولم تكمل اعتماد المستندات بعد.`,
      };
    }
  }

  // ─── 2. Granular Document Dependencies ───
  if ((ctx.targetStatus === "completed" || ctx.targetStatus === "in_progress") && ctx.documentStatuses) {
    const docLabels: Record<FinalShipmentDocumentType, string> = {
      commercial_invoice: "الفاتورة التجارية",
      packing_list: "قائمة التعبئة",
      bill_of_lading: "بوليصة الشحن",
      certificate_of_origin: "شهادة المنشأ",
    };

    const requiredDocs = new Set<FinalShipmentDocumentType>(rule.requiredDocumentTypes);
    if (rule.order >= 4) {
      requiredDocs.add("commercial_invoice");
      requiredDocs.add("packing_list");
      requiredDocs.add("bill_of_lading");
      requiredDocs.add("certificate_of_origin");
    }

    for (const docType of Array.from(requiredDocs)) {
      const docStat = ctx.documentStatuses.get(docType);
      const label = docLabels[docType] || docType;
      if (docStat === "revision_required") {
        return {
          valid: false,
          error: `لا يمكن استكمال مرحلة «${rule.title}» لوجود طلب تعديل غير مكتمل في ${label}. يرجى اعتماد النسخة المصححة أولاً.`,
        };
      }
      if (docStat === "rejected") {
        return {
          valid: false,
          error: `لا يمكن استكمال مرحلة «${rule.title}» لوجود رفض في ${label}. يرجى معالجة المستند أولاً.`,
        };
      }
      if (!docStat || docStat !== "approved") {
        return {
          valid: false,
          error: `لا يمكن استكمال مرحلة «${rule.title}» بانتظار مراجعة واعتماد ${label}.`,
        };
      }
    }
  }

  // ─── 3. Sequential & Explicit Stage Prerequisite Checks ───
  if (ctx.targetStatus === "completed" || ctx.targetStatus === "in_progress") {
    for (const key of STAGE_KEYS_SEQUENCE) {
      const prevRule = STAGE_WORKFLOW_RULES[key];
      if (prevRule.order < rule.order) {
        const prevRecord = ctx.stagesMap.get(key);
        const pStatus = prevRecord ? prevRecord.status : "pending";
        const isApp = prevRecord
          ? prevRecord.is_applicable !== false &&
            pStatus !== "not_applicable" &&
            pStatus !== "skipped"
          : key !== "stage_4_type_procedures";

        if (isApp || key === "stage_4_form_46") {
          if (pStatus === "blocked" || pStatus === "needs_correction") {
            return {
              valid: false,
              error: `لا يمكن تحديث هذه المرحلة لوجود توقف أو ملاحظات معلقة في المرحلة السابقة «${prevRule.title}».`,
            };
          }

          const isActivatingFromPending =
            ctx.targetStatus === "in_progress" && (!ctx.currentStatus || ctx.currentStatus === "pending");

          if (ctx.targetStatus === "completed" || isActivatingFromPending) {
            const satisfied = isPrerequisiteSatisfied(
              key,
              ctx.stageKey,
              ctx.stagesMap,
              ctx.shipmentStatus,
            );
            if (!satisfied) {
              const actionVerb = ctx.targetStatus === "completed" ? "اعتماد اكتمال" : "بدء تفعيل";
              if (key === "stage_4_form_46") {
                return {
                  valid: false,
                  error: `لا يمكن ${actionVerb} مرحلة «${rule.title}» قبل استخراج وتأكيد رقم 46 الجمركي أولاً.`,
                };
              }
              return {
                valid: false,
                error: `لا يمكن ${actionVerb} مرحلة «${rule.title}» قبل استيفاء واكتمال المرحلة السابقة «${prevRule.title}».`,
              };
            }
          }
        }
      }
    }
  }

  // ─── 4. Stage-Specific Completion Rules ───
  if (ctx.targetStatus === "completed") {
    // Stage 4: Form 46 Gate requires non-empty Form 46 number
    if (ctx.stageKey === "stage_4_form_46") {
      const form46Num =
        (typeof ctx.referenceNumber === "string" && ctx.referenceNumber.trim()) ||
        (typeof ctx.stageData?.declaration_46_number === "string" &&
          ctx.stageData.declaration_46_number.trim()) ||
        null;
      if (!form46Num) {
        return {
          valid: false,
          error: "لا يمكن تأكيد اكتمال مرحلة استخراج رقم 46 بدون إدخال رقم 46 الجمركي.",
        };
      }
    }

    // Stage 4 Type Procedures (Order 7): All registered regulatory procedures must be approved
    if (ctx.stageKey === "stage_4_type_procedures" && Array.isArray(ctx.regulatoryProcedures)) {
      const unapproved = ctx.regulatoryProcedures.filter((p) => p.status !== "approved");
      if (unapproved.length > 0) {
        const names = unapproved.map((p) => p.authority_name_ar).join("، ");
        return {
          valid: false,
          error: `لا يمكن اعتماد اكتمال مرحلة الجهات الرقابية لوجود إجراءات لم تحصل على موافقة نهائية بعد: (${names}).`,
        };
      }
    }

    // Stage 9: Customs Duties Settlement
    if (ctx.stageKey === "stage_9_fees_payments") {
      const sData = ctx.stageData as CustomsDutiesSettlementData | undefined;
      if (sData?.settlement_status === "paid_by_out_awaiting_customer") {
        return {
          valid: false,
          error: "لا يمكن اعتماد اكتمال مرحلة الرسوم الجمركية في حين أنها لا تزال بانتظار تحصيل المستحقات من العميل.",
        };
      }
      if (sData?.settlement_status === "customer_paid_direct") {
        const directRef = sData.customer_direct_payment_reference || ctx.referenceNumber;
        if (!directRef) {
          return {
            valid: false,
            error: "يتطلب اكتمال مرحلة الرسوم بسداد العميل المباشر إدخال وتوثيق رقم إيصال أو مرجع السداد الرسمي الصادر من الجمارك أو البنك.",
          };
        }
      } else {
        const remainingBalance = computeCustomsOutstandingBalance(sData);
        if (remainingBalance > 0) {
          return {
            valid: false,
            error: `لا يمكن اعتماد اكتمال مرحلة الرسوم الجمركية لوجود رصيد رسوم جمركية مستحق على العميل بقيمة ${remainingBalance.toLocaleString("ar-EG")} ج.م لم يتم تحصيله بعد.`,
          };
        }
        if (!ctx.referenceNumber && !ctx.notes) {
          return {
            valid: false,
            error: "يتطلب اكتمال مرحلة الرسوم إدخال رقم إيصال/مرجع السداد أو ملاحظات التحقق المعتمدة.",
          };
        }
      }
    }

    // Stage 10: Clearance & Release
    if (ctx.stageKey === "stage_10_clearance_release") {
      const releasePermit = ctx.referenceNumber || (ctx.stageData?.release_permit_number as string | undefined);
      if (!releasePermit) {
        return {
          valid: false,
          error: "يتطلب اعتماد الإفراج النهائي إدخال رقم إذن الإفراج الجمركي الرسمي.",
        };
      }
    }
  }

  // ─── 5. Rejection & Block Reason Requirement ───
  if (
    (ctx.targetStatus === "needs_correction" || ctx.targetStatus === "blocked") &&
    !ctx.rejectionOrDelayReason &&
    !ctx.notes
  ) {
    return {
      valid: false,
      error: "يرجى توضيح سبب التوقف أو الملاحظات المطلوبة لتصحيح المرحلة.",
    };
  }

  return { valid: true };
}

/**
 * Resolves the next active stage in sequence from persisted stage records.
 * Skips stages that are legitimately inapplicable, skipped historically, or already completed.
 */
export function resolveNextApplicableStageKey(
  currentStageKey: CustomsStageKey,
  stages: Array<{ stage_key: string; status: string; is_applicable?: boolean }>,
): CustomsStageKey | null {
  const stagesMap = new Map(stages.map((s) => [s.stage_key, s]));
  const currentIdx = STAGE_KEYS_SEQUENCE.indexOf(currentStageKey);

  if (currentIdx < 0) return null;

  for (let i = currentIdx + 1; i < STAGE_KEYS_SEQUENCE.length; i++) {
    const candidateKey = STAGE_KEYS_SEQUENCE[i];
    const record = stagesMap.get(candidateKey);
    const isApp = record
      ? record.is_applicable !== false &&
        record.status !== "not_applicable" &&
        record.status !== "skipped"
      : candidateKey !== "stage_4_type_procedures";

    if (isApp && record?.status !== "completed") {
      return candidateKey;
    }
  }

  return null;
}
