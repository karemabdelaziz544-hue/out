/**
 * Customs Clearance Journey & Shipment-Type Branching Types
 *
 * Models the operational stages of customs clearance in OUT,
 * independent Form 46 gate, authoritative regulatory procedures,
 * operational roles, and audit trail.
 */

// ─── 1. Goods Categories ──────────────────────────────────────────────────────

export type GoodsCategory = "agricultural" | "industrial" | "food" | "other";

export const GOODS_CATEGORIES: GoodsCategory[] = [
  "agricultural",
  "industrial",
  "food",
  "other",
];

export const GOODS_CATEGORY_LABELS: Record<GoodsCategory, string> = {
  agricultural: "شحنة زراعية",
  industrial: "شحنة صناعية",
  food: "منتجات غذائية",
  other: "بضائع أخرى / إفراج عام",
};

export const GOODS_CATEGORY_DESCRIPTIONS: Record<GoodsCategory, string> = {
  agricultural: "بضائع ومحاصيل زراعية (يتم تحديد الجهات الرقابية المطلوبة مثل الحجر الزراعي أو سلامة الغذاء حسب قرار المسؤول)",
  industrial: "بضائع ومعدات ومستلزمات صناعية",
  food: "منتجات ومواد غذائية",
  other: "بضائع عامة تتبع المسار الجمركي القياسي",
};

// ─── 2. Applicable Procedure Branches ─────────────────────────────────────────

export interface ApplicableProcedureDefinition {
  id: string;
  name: string;
  authorityName: string;
  purpose: string;
  defaultCategories: GoodsCategory[];
  requiresInspection: boolean;
  expectedRole: OperationalRole;
  isConfirmedRule: boolean;
}

export const APPLICABLE_PROCEDURE_DEFINITIONS: ApplicableProcedureDefinition[] = [
  {
    id: "plant_quarantine",
    name: "فحص الحجر الزراعي",
    authorityName: "الإدارة المركزية للحجر الزراعي",
    purpose: "معاينة الإرساليات الزراعية وسحب العينات والتحقق من الشهادات الصحية النباتية",
    defaultCategories: ["agricultural"],
    requiresInspection: true,
    expectedRole: "inspector",
    isConfirmedRule: true,
  },
  {
    id: "food_safety_authority",
    name: "إجراءات سلامة الغذاء (NFSA)",
    authorityName: "الهيئة القومية لسلامة الغذاء",
    purpose: "فحص ومطابقة المنتجات الغذائية أو الزراعية للتأكد من اشتراطات الصحة والسلامة وتصاريح الإفراج",
    defaultCategories: ["agricultural", "food"],
    requiresInspection: true,
    expectedRole: "inspector",
    isConfirmedRule: true,
  },
  {
    id: "industrial_standards_inspection",
    name: "مطابقة المواصفات والرقابة الصناعية (GOEIC)",
    authorityName: "الهيئة العامة للرقابة على الصادرات والواردات / التنمية الصناعية",
    purpose: "فحص مطابقة المنتجات والسلع الهندسية أو الكيماوية لشهادات الفحص والمواصفات القياسية",
    defaultCategories: ["industrial"],
    requiresInspection: true,
    expectedRole: "inspector",
    isConfirmedRule: true,
  },
  {
    id: "radiation_clearance",
    name: "كشف إشعاعي وبيئي",
    authorityName: "هيئة الطاقة الذرية / البيئة",
    purpose: "فحص خلو البضائع من الإشعاع وفق طبيعة المنشأ والنوعية (حسب الكشف)",
    defaultCategories: ["food", "other"],
    requiresInspection: false,
    expectedRole: "inspector",
    isConfirmedRule: false,
  },
  {
    id: "telecom_approval",
    name: "اعتماد تنظيم الاتصالات (NTRA)",
    authorityName: "الجهاز القومي لتنظيم الاتصالات",
    purpose: "مطابقة الأجهزة والمعدات اللاسلكية والشبكية (عند انطباقها)",
    defaultCategories: ["industrial", "other"],
    requiresInspection: false,
    expectedRole: "data_entry",
    isConfirmedRule: false,
  },
  {
    id: "general_customs_procedure",
    name: "الإجراءات الرقابية الجمركية العامة",
    authorityName: "مصلحة الجمارك المصرية",
    purpose: "المسار القياسي للإفراج والتحقق من بنود التعريفة والمستندات",
    defaultCategories: ["other", "agricultural", "industrial", "food"],
    requiresInspection: false,
    expectedRole: "admin",
    isConfirmedRule: true,
  },
];

export type RegulatoryProcedureStatus =
  | "pending"
  | "in_progress"
  | "sample_taken"
  | "approved"
  | "rejected";

export interface ShipmentRegulatoryProcedure {
  id: string;
  shipment_id: string;
  procedure_code: string;
  authority_name_ar: string;
  status: RegulatoryProcedureStatus;
  reference_number: string | null;
  sample_taken: boolean;
  inspector_name: string | null;
  notes: string | null;
  assigned_to: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── 3. Operational Roles ─────────────────────────────────────────────────────

export type OperationalRole =
  | "admin"
  | "scout"
  | "inspector"
  | "data_entry"
  | "valuer";

export interface OperationalRoleInfo {
  role: OperationalRole;
  label: string;
  badgeLabel: string;
  description: string;
  isConfirmedInSystem: boolean;
}

export const OPERATIONAL_ROLES_INFO: Record<OperationalRole, OperationalRoleInfo> = {
  admin: {
    role: "admin",
    label: "مدير النظام / العمليات",
    badgeLabel: "إدارة العمليات",
    description: "الإشراف على استلام الشحنة، مراجعة الأسعار، والاعتماد النهائي للإفراج",
    isConfirmedInSystem: true,
  },
  scout: {
    role: "scout",
    label: "كشاف (Scout)",
    badgeLabel: "كشاف",
    description: "الكشف الميداني الأولي على الحاويات/الطرود والأختام الجمركية في ساحة الوصول",
    isConfirmedInSystem: true,
  },
  inspector: {
    role: "inspector",
    label: "معاين (Inspector)",
    badgeLabel: "معاين",
    description: "المعاينة الجمركية الدقيقة للأصناف ومطابقة المواصفات مع لجان الفحص",
    isConfirmedInSystem: true,
  },
  data_entry: {
    role: "data_entry",
    label: "مدرج بيانات (Data Entry)",
    badgeLabel: "مدرج بيانات",
    description: "إدراج وتدقيق البيانات الجمركية واستخراج رقم 46 وتفاصيل بنود التعريفة",
    isConfirmedInSystem: true,
  },
  valuer: {
    role: "valuer",
    label: "مثمن (Valuer)",
    badgeLabel: "مثمن",
    description: "تحديد القيمة للأغراض الجمركية واحتساب بنود التعريفة",
    isConfirmedInSystem: false,
  },
};

// ─── 4. Stage Statuses ────────────────────────────────────────────────────────

export type CustomsStageStatus =
  | "not_applicable"
  | "skipped"
  | "pending"
  | "in_progress"
  | "awaiting_external_response"
  | "needs_correction"
  | "completed"
  | "blocked";

export const CUSTOMS_STAGE_STATUS_CONFIG: Record<
  CustomsStageStatus,
  {
    label: string;
    bg: string;
    color: string;
    borderColor: string;
    icon: string;
    summaryText: string;
  }
> = {
  not_applicable: {
    label: "غير منطبق",
    bg: "#f3f4f6",
    color: "#6b7280",
    borderColor: "#e5e7eb",
    icon: "MinusCircle",
    summaryText: "هذه المرحلة غير مطلوبة لهذا النوع من الشحنات",
  },
  skipped: {
    label: "مستوفى تاريخياً",
    bg: "#ecfdf5",
    color: "#047857",
    borderColor: "#a7f3d0",
    icon: "CheckCircle",
    summaryText: "تم استيفاء شرط المرحلة من السجل التاريخي السابق للشحنة",
  },
  pending: {
    label: "بانتظار البدء",
    bg: "#f8fafc",
    color: "#475569",
    borderColor: "#cbd5e1",
    icon: "Clock",
    summaryText: "في انتظار اكتمال المراحل السابقة أو بدء الإجراءات",
  },
  in_progress: {
    label: "قيد التنفيذ",
    bg: "#eff6ff",
    color: "#1d4ed8",
    borderColor: "#bfdbfe",
    icon: "Loader",
    summaryText: "الإجراءات قيد العمل الفعلي حالياً",
  },
  awaiting_external_response: {
    label: "بانتظار رد خارجي",
    bg: "#fef3c7",
    color: "#b45309",
    borderColor: "#fde68a",
    icon: "ExternalLink",
    summaryText: "تم التقديم وبانتظار رد الجهة الرقابية أو المنظومة الجمركية",
  },
  needs_correction: {
    label: "مطلوب تعديل / ملاحظات",
    bg: "#fff7ed",
    color: "#c2410c",
    borderColor: "#ffedd5",
    icon: "AlertTriangle",
    summaryText: "تم تسجيل ملاحظات أو فروقات تتطلب التصحيح وإعادة المراجعة",
  },
  completed: {
    label: "مكتمل وموثق",
    bg: "#ecfdf5",
    color: "#047857",
    borderColor: "#a7f3d0",
    icon: "CheckCircle",
    summaryText: "تم استيفاء كافة شروط المرحلة وتوثيق المرجع والنتائج",
  },
  blocked: {
    label: "متوقف / مانع تشغيلي",
    bg: "#fef2f2",
    color: "#b91c1c",
    borderColor: "#fecaca",
    icon: "XCircle",
    summaryText: "يوجد مانع تشغيلي أو مستندي يحول دون استكمال المرحلة",
  },
};

// ─── 5. Stage Keys & Definitions ──────────────────────────────────────────────

export type CustomsStageKey =
  | "stage_1_intake"
  | "stage_2_pricing"
  | "stage_3_nafeza_acid"
  | "stage_4_form_46"
  | "stage_5_scouting"
  | "stage_6_inspection"
  | "stage_4_type_procedures"
  | "stage_7_data_entry"
  | "stage_8_valuation"
  | "stage_9_fees_payments"
  | "stage_10_clearance_release";

export interface StageChecklistItemDefinition {
  id: string;
  label: string;
  isRequired: boolean;
  description?: string;
}

export interface StageChecklistItemState {
  id: string;
  label: string;
  isRequired: boolean;
  status: "pending" | "completed" | "blocked" | "needs_correction";
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  notes?: string | null;
}

export interface CustomsStageMeta {
  key: CustomsStageKey;
  order: number;
  title: string;
  shortDescription: string;
  purpose: string;
  expectedRole: OperationalRole;
  isRoleConfirmed: boolean;
  requiredDocuments: string[];
  completionCriteria: string;
  connectsToExistingWorkflow: boolean;
  targetDurationHours: number;
  defaultChecklist: StageChecklistItemDefinition[];
  customerVisibleDescription: string;
  customerActionRequired?: string;
  specialNotice?: string;
}

export const CUSTOMS_STAGE_DEFINITIONS: Record<CustomsStageKey, CustomsStageMeta> = {
  stage_1_intake: {
    key: "stage_1_intake",
    order: 1,
    title: "استلام الشحنة وتصنيفها",
    shortDescription: "مراجعة بيانات الشحنة وتحديد تصنيف نوع البضاعة والمسارات الواجبة",
    purpose: "فحص اكتمال بيانات الشحنة المقدمة وتحديد تصنيفها (زراعي، صناعي، غذائي، أخرى) لحساب متطلبات الإفراج.",
    expectedRole: "admin",
    isRoleConfirmed: true,
    requiredDocuments: ["الفاتورة المبدئية", "بيان العبوة الأولي"],
    completionCriteria: "اكتمال البيانات الأساسية للشحنة وتحديد تصنيف البضاعة واعتماده من فريق العمليات.",
    connectsToExistingWorkflow: true,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_data_complete", label: "فحص اكتمال بيانات الشحنة وميناء الوصول", isRequired: true },
      { id: "chk_initial_invoice", label: "مراجعة وجود الفاتورة المبدئية الأولية", isRequired: true },
      { id: "chk_classification_saved", label: "تحديد تصنيف البضاعة ومسار التخليص المعتمد", isRequired: true },
    ],
    customerVisibleDescription: "استلام طلب الشحنة وتدقيق البيانات الأساسية وتحديد المسار الإجرائي المناسب لنوع البضاعة.",
  },
  stage_2_pricing: {
    key: "stage_2_pricing",
    order: 2,
    title: "المستندات الأولية والتسعير",
    shortDescription: "مراجعة الفاتورة المبدئية، تقدير السعر، والتفاوض واعتماد العميل",
    purpose: "تدقيق المستندات المبدئية وتقديم عرض سعر أتعاب خدمة OUT والتفاوض وصولاً لاعتماد العميل.",
    expectedRole: "admin",
    isRoleConfirmed: true,
    requiredDocuments: ["الفاتورة المبدئية المعتمدة"],
    completionCriteria: "موافقة العميل الرسمية على النطاق التقديري أو السعر النهائي.",
    connectsToExistingWorkflow: true,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_invoice_review", label: "فحص وتدقيق الفاتورة المبدئية (اعتماد أو طلب تعديل)", isRequired: true },
      { id: "chk_price_proposal", label: "إعداد وتقديم عرض سعر أتعاب خدمة OUT", isRequired: true },
      { id: "chk_customer_approval", label: "اعتماد العميل لعرض السعر", isRequired: true },
    ],
    customerVisibleDescription: "مراجعة الفاتورة المبدئية وتقديم عرض سعر أتعاب خدمة OUT واعتماد السعر.",
    customerActionRequired: "مطلوب مراجعة واعتماد عرض السعر أو طلب التفاوض.",
  },
  stage_3_nafeza_acid: {
    key: "stage_3_nafeza_acid",
    order: 3,
    title: "إجراءات نافذة وACID والمستندات",
    shortDescription: "استخراج رقم ACID ومراجعة المستندات النهائية للشحنة",
    purpose: "متابعة إصدار رقم القيد الجمركي المبدئي (ACID) من منصة نافذة ومراجعة المستندات النهائية للشحن.",
    expectedRole: "data_entry",
    isRoleConfirmed: true,
    requiredDocuments: ["الفاتورة المبدئية", "الفاتورة التجارية", "بيان العبوة", "بوليصة الشحن", "شهادة المنشأ"],
    completionCriteria: "صدور وتوثيق رقم ACID المعتمد واعتماد المستندات الأربعة المطلوبة بنجاح.",
    connectsToExistingWorkflow: true,
    targetDurationHours: 48,
    defaultChecklist: [
      { id: "chk_acid_issued", label: "استخراج وتوثيق رقم ACID المعتمد من منصة نافذة", isRequired: true },
      { id: "chk_docs_uploaded", label: "تحقق من رفع المستندات الأربعة النهائية من العميل", isRequired: true },
      { id: "chk_docs_approved", label: "اعتماد المستندات الأربعة النهائية دون ملاحظات معلقة", isRequired: true },
    ],
    customerVisibleDescription: "إصدار رقم القيد الجمركي المبدئي (ACID) عبر نافذة ومراجعة المستندات النهائية للشحن.",
    customerActionRequired: "يرجى رفع المستندات النهائية المطلوبة للشحنة بمجرد صدورها.",
  },
  stage_4_form_46: {
    key: "stage_4_form_46",
    order: 4,
    title: "استخراج رقم 46 الجمركي",
    shortDescription: "استخراج وتأكيد رقم 46 الجمركي بعد اعتماد كافة المستندات وقبل بدء العمل الميداني",
    purpose: "تسجيل وتأكيد استخراج رقم 46 الجمركي كبوابة إلزامية قبل نزول الكشاف والمعاين لساحة الميناء.",
    expectedRole: "data_entry",
    isRoleConfirmed: true,
    requiredDocuments: ["الفاتورة التجارية", "بيان العبوة", "بوليصة الشحن", "شهادة المنشأ"],
    completionCriteria: "تسجيل رقم 46 الجمركي وتأكيد استخراجه رسمياً.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_form46_docs_ready", label: "التأكد من اعتماد جميع المستندات الإلزامية للشحنة", isRequired: true },
      { id: "chk_form46_issued", label: "استخراج وتسجيل رقم 46 الجمركي وتأكيده", isRequired: true },
    ],
    customerVisibleDescription: "استخراج وتأكيد رقم 46 الجمركي تمهيداً لبدء الإجراءات الجمركية الميدانية في الميناء.",
  },
  stage_5_scouting: {
    key: "stage_5_scouting",
    order: 5,
    title: "الكشف الميداني (Scouting)",
    shortDescription: "الكشف الميداني الأولي على الحاويات/الطرود والأختام الجمركية",
    purpose: "التحقق الميداني من وصول الحاوية/الطرود وسلامة الأختام الملاحية ومطابقتها لأرقام المنافستو.",
    expectedRole: "scout",
    isRoleConfirmed: true,
    requiredDocuments: ["بوليصة الشحن", "قائمة التعبئة"],
    completionCriteria: "إتمام الكشف الميداني بواسطة الكشاف وتوثيق النتيجة وسلامة الأختام.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_cargo_arrival", label: "التحقق من وصول الحاوية/الطرود لساحة الوصول الجمركية", isRequired: true },
      { id: "chk_delivery_order", label: "مراجعة إذن التسليم الملاحي ومطابقة أرقام المنافستو", isRequired: true },
      { id: "chk_seals_intact", label: "فحص سلامة الأختام الجمركية والملاحية وخلوها من التلاعب", isRequired: true },
    ],
    customerVisibleDescription: "الكشف الميداني في ساحة الوصول والتحقق من سلامة الأختام الملاحية ومطابقة إذن التسليم.",
  },
  stage_6_inspection: {
    key: "stage_6_inspection",
    order: 6,
    title: "المعاينة (Inspection)",
    shortDescription: "المعاينة الجمركية الفعلية وتدقيق محتويات الطرود وفحص الأصناف",
    purpose: "فتح الطرود ومطابقة الأصناف والأوزان والأعداد ومواصفات البضاعة بحضور المعاين الجمركي ومعاين فريق OUT.",
    expectedRole: "inspector",
    isRoleConfirmed: true,
    requiredDocuments: ["محضر المعاينة الجمركية", "بيان العبوة المفصل"],
    completionCriteria: "صدور محضر المعاينة الجمركية واعتماده دون فروقات أو تسوية الفروقات الموثقة.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 48,
    defaultChecklist: [
      { id: "chk_package_opening", label: "فتح الطرود وفحص محتوياتها بحضور لجنة المعاينة", isRequired: true },
      { id: "chk_item_match", label: "مطابقة الأصناف والأوزان والأعداد مع المستندات", isRequired: true },
      { id: "chk_inspection_report", label: "صدور محضر المعاينة الجمركية المعتمد رسمياً", isRequired: true },
    ],
    customerVisibleDescription: "المعاينة الجمركية الفعلية ومطابقة الأصناف والأوزان مع بيان العبوة وصدور محضر المعاينة.",
  },
  stage_4_type_procedures: {
    key: "stage_4_type_procedures",
    order: 7,
    title: "الإجراءات الرقابية وجهات العرض",
    shortDescription: "إجراءات سلامة الغذاء، الحجر الزراعي، أو الرقابة الصناعية المعتمدة للشحنة",
    purpose: "متابعة لجان الفحص والجهات الرقابية والعارضة المعتمدة للشحنة وسحب العينات والموافقات الفنية بعد المعاينة.",
    expectedRole: "inspector",
    isRoleConfirmed: true,
    requiredDocuments: ["الشهادات الصحية أو الزراعية", "شهادات الفحص والمطابقة الصناعية", "تصاريح الاستيراد"],
    completionCriteria: "صدور موافقات جميع الجهات الرقابية المسجلة على الشحنة وتوثيق أرقام المراجع.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 72,
    defaultChecklist: [
      { id: "chk_committee_submission", label: "تقديم طلب الفحص والعرض على لجان الجهات المختصة", isRequired: true },
      { id: "chk_sampling_done", label: "سحب العينات والمطابقة الفنية والمعملية", isRequired: true },
      { id: "chk_committee_approval", label: "صدور موافقة جميع جهات العرض المحددة للشحنة", isRequired: true },
    ],
    customerVisibleDescription: "متابعة إجراءات الفحص النوعي مع الجهات الرقابية المختصة وسحب العينات والمطابقة الفنية.",
  },
  stage_7_data_entry: {
    key: "stage_7_data_entry",
    order: 8,
    title: "إدراج البيانات (Data Entry)",
    shortDescription: "تجميع الأصناف وإعداد بياناتها ومواصفاتها وتسعيراتها على المنظومة",
    purpose: "إدراج وتدقيق البيانات الجمركية وتفاصيل بنود التعريفة وتفريغ الأصناف بعد انتهاء المعاينة والجهات الرقابية.",
    expectedRole: "data_entry",
    isRoleConfirmed: true,
    requiredDocuments: ["الشهادة الجمركية / مسودة البيان الجمركي", "الفاتورة المعتمدة"],
    completionCriteria: "اكتمال تدقيق إدراج البيانات الجمركية لكافة البنود وتوثيق الرقم المرجعي.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_data_transcription", label: "تفريغ بنود الفاتورة والشهادة على المنظومة التشغيلية", isRequired: true },
      { id: "chk_hs_code_audit", label: "تدقيق بنود التعريفة الجمركية (HS Codes) ومطابقتها", isRequired: true },
      { id: "chk_declaration_num", label: "تسجيل رقم مسودة البيان الجمركي الرسمي", isRequired: true },
    ],
    customerVisibleDescription: "إدراج وتدقيق البيانات الجمركية وتطبيق بنود التعريفة ومراجعة مسودة البيان الجمركي.",
  },
  stage_8_valuation: {
    key: "stage_8_valuation",
    order: 9,
    title: "التثمين الجمركي (Valuation)",
    shortDescription: "مناقشة الأصناف والقيم والتوصل إلى القيمة الجمركية المعتمدة",
    purpose: "تقدير القيمة الجمركية المقبولة للبضاعة وفق القواعد الجمركية واحتساب نسب الرسوم المستحقة (منفصلة تماماً عن أتعاب OUT).",
    expectedRole: "data_entry",
    isRoleConfirmed: true,
    requiredDocuments: ["تقرير التثمين الجمركي", "الفاتورة الأصلية ومستندات التحويل"],
    completionCriteria: "اعتماد التثمين الجمركي المعتمد وتوثيق مرجع التثمين والملاحظات.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_customs_value", label: "مراجعة القيمة المقبولة للأغراض الجمركية", isRequired: true },
      { id: "chk_tariff_rates", label: "تطبيق نسب الرسوم والضرائب الجمركية المقررة", isRequired: true },
      { id: "chk_valuation_report", label: "صدور تقرير التثمين الجمركي المعتمد", isRequired: true },
    ],
    customerVisibleDescription: "تحديد القيمة للأغراض الجمركية واحتساب الضرائب والرسوم الجمركية المقررة رسمياً.",
  },
  stage_9_fees_payments: {
    key: "stage_9_fees_payments",
    order: 10,
    title: "الرسوم الجمركية والمدفوعات",
    shortDescription: "تسديد ومطابقة الرسوم والضرائب الجمركية وتدقيق إشعارات الدفع",
    purpose: "متابعة الرسوم الجمركية والضريبية المقررة، مع تمييز دقيق بين المبالغ التقديرية والمؤكدة والمستحقة والتحقق الفعلي من إشعارات السداد.",
    expectedRole: "admin",
    isRoleConfirmed: true,
    requiredDocuments: ["مطالبة الرسوم الجمركية الرسمية", "إيصالات / إشعارات السداد البنكي"],
    completionCriteria: "سداد كافة المستحقات الجمركية والتحقق المعتمد من صحة إشعار السداد ومرجعه البنكي.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_claim_received", label: "استلام مطالبة الرسوم الجمركية والضريبية الرسمية", isRequired: true },
      { id: "chk_bank_payment", label: "سداد الرسوم عبر البنك وتوثيق إشعار السداد البنكي", isRequired: true },
      { id: "chk_payment_audit", label: "مطابقة إشعار السداد البنكي وتوثيق رقم الإشعار", isRequired: true },
      { id: "chk_customer_settlement", label: "تسوية سداد الرسوم مع العميل (منفصلة عن أتعاب OUT)", isRequired: true },
    ],
    customerVisibleDescription: "تسديد ومطابقة الرسوم الجمركية والضريبية الرسمية لدى مصلحة الجمارك وتدقيق إشعارات السداد.",
  },
  stage_10_clearance_release: {
    key: "stage_10_clearance_release",
    order: 11,
    title: "الإفراج والتخليص النهائي",
    shortDescription: "استصدار إذن الإفراج الجمركي وخروج الشحنة الرسمي والتسليم",
    purpose: "الحصول على إذن الإفراج الجمركي النهائي واستيفاء خروج الحاويات/الطرود من الدائرة الجمركية وتسليمها للعميل.",
    expectedRole: "admin",
    isRoleConfirmed: true,
    requiredDocuments: ["إذن الإفراج الجمركي النهائي", "إيصال سداد رسوم الموانئ / التخزين"],
    completionCriteria: "صدور إذن الإفراج النهائي الرسمي وتسجيل تاريخه ورقمه وخروج البضاعة وتسليمها للعميل.",
    connectsToExistingWorkflow: false,
    targetDurationHours: 24,
    defaultChecklist: [
      { id: "chk_release_permit", label: "صدور إذن الإفراج الجمركي النهائي الرسمي وتوثيق رقمه", isRequired: true },
      { id: "chk_port_fees", label: "تسوية رسوم الموانئ ومصاريف التخزين والأرضيات", isRequired: true },
      { id: "chk_cargo_exit", label: "خروج الشحنة الرسمي من الدائرة الجمركية وتسليمها للناقل", isRequired: true },
      { id: "chk_customer_delivery", label: "تسليم الشحنة الفعلي للعميل وتوثيق الاستلام", isRequired: true },
    ],
    customerVisibleDescription: "صدور إذن الإفراج الجمركي النهائي وخروج الشحنة من الدائرة الجمركية لتسليمها إليك.",
  },
};

// ─── 6. Database Stage Records ────────────────────────────────────────────────

export interface CustomsJourneyStage {
  id: string;
  shipment_id: string;
  stage_key: CustomsStageKey;
  stage_order: number;
  status: CustomsStageStatus;
  is_applicable: boolean;
  expected_role: OperationalRole;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  role_confirmed: boolean;
  outcome: string | null;
  reference_number: string | null;
  notes: string | null;
  rejection_or_delay_reason: string | null;
  stage_data: Record<string, unknown>;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name?: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;

  // Enriched timing & checklist fields
  activated_at?: string | null;
  target_completion_at?: string | null;
  target_duration_hours?: number;
  waiting_reason?: string | null;
  is_overdue?: boolean;
  time_status_label?: string | null;
  checklist: StageChecklistItemState[];
}

export interface CustomsJourneyStageHistory {
  id: string;
  shipment_id: string;
  stage_key: CustomsStageKey;
  action: string;
  from_status: CustomsStageStatus | null;
  to_status: CustomsStageStatus | null;
  outcome: string | null;
  reference_number: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  performed_by: string | null;
  performed_by_name?: string | null;
  performed_at: string;
}

// ─── 7. Full Journey Representation ───────────────────────────────────────────

export interface ShipmentCustomsJourney {
  shipment_id: string;
  goods_category: GoodsCategory;
  applicable_procedures: string[];
  regulatory_procedures?: ShipmentRegulatoryProcedure[];
  classification_notes: string | null;
  classification_reviewed_at: string | null;
  classification_reviewed_by: string | null;
  classification_reviewed_by_name?: string | null;
  stages: CustomsJourneyStage[];
  history: CustomsJourneyStageHistory[];
  activeStageKey: CustomsStageKey;
  nextStageKey: CustomsStageKey | null;
  completedStagesCount: number;
  applicableStagesCount: number;
  progressPercentage: number;
  isFullyCleared: boolean;
}

// ─── 8. Workflow Templates & Shipment-Type Paths ─────────────────────────────

export interface CustomsWorkflowTemplate {
  id: GoodsCategory;
  name: string;
  badge: string;
  regulatoryAuthority: string;
  description: string;
  applicableStageKeys: CustomsStageKey[];
  optionalStageKeys: CustomsStageKey[];
  /** Suggested procedures shown to Admin as non-mandatory recommendations */
  suggestedProcedures: string[];
  /** Default enforced procedures (empty per Owner Decision: Admin selects manually) */
  defaultProcedures: string[];
  notes: string;
}

export const CUSTOMS_WORKFLOW_TEMPLATES: Record<GoodsCategory, CustomsWorkflowTemplate> = {
  agricultural: {
    id: "agricultural",
    name: "مسار الشحنات الزراعية",
    badge: "شحنة زراعية",
    regulatoryAuthority: "تُحدد بواسطة المسؤول (سلامة الغذاء / الحجر الزراعي)",
    description: "شحنة زراعية: تبدأ بالكشف ثم المعاينة، ويحدد المسؤول الجهات الرقابية المطلوبة (مثل سلامة الغذاء أو الحجر الزراعي) حسب طبيعة الشحنة.",
    applicableStageKeys: [
      "stage_1_intake",
      "stage_2_pricing",
      "stage_3_nafeza_acid",
      "stage_4_form_46",
      "stage_5_scouting",
      "stage_6_inspection",
      "stage_7_data_entry",
      "stage_8_valuation",
      "stage_9_fees_payments",
      "stage_10_clearance_release",
    ],
    optionalStageKeys: ["stage_4_type_procedures"],
    suggestedProcedures: ["food_safety_authority", "plant_quarantine"],
    defaultProcedures: [],
    notes: "لا تُفرض جهة رقابية تلقائياً؛ يعتمد المسؤول الجهات الرقابية اللازمة لكل شحنة.",
  },
  food: {
    id: "food",
    name: "مسار المنتجات الغذائية",
    badge: "منتجات غذائية",
    regulatoryAuthority: "الهيئة القومية لسلامة الغذاء (NFSA)",
    description: "مسار المنتجات الغذائية الخاضعة لمطابقة واشتراطات الجهات الرقابية المحددة للشحنة.",
    applicableStageKeys: [
      "stage_1_intake",
      "stage_2_pricing",
      "stage_3_nafeza_acid",
      "stage_4_form_46",
      "stage_5_scouting",
      "stage_6_inspection",
      "stage_7_data_entry",
      "stage_8_valuation",
      "stage_9_fees_payments",
      "stage_10_clearance_release",
    ],
    optionalStageKeys: ["stage_4_type_procedures"],
    suggestedProcedures: ["food_safety_authority"],
    defaultProcedures: [],
    notes: "يحدد المسؤول الجهات الرقابية المطلوبة للشحنة.",
  },
  industrial: {
    id: "industrial",
    name: "مسار الشحنات الصناعية",
    badge: "شحنة صناعية",
    regulatoryAuthority: "مصلحة الجمارك المصرية",
    description: "مسار الشحنات الصناعية: الكشف الميداني ثم المعاينة ثم إدراج البيانات والتثمين وسداد المستحقات، مع إمكانية إضافة جهة رقابية يدوياً عند الحاجة.",
    applicableStageKeys: [
      "stage_1_intake",
      "stage_2_pricing",
      "stage_3_nafeza_acid",
      "stage_4_form_46",
      "stage_5_scouting",
      "stage_6_inspection",
      "stage_7_data_entry",
      "stage_8_valuation",
      "stage_9_fees_payments",
      "stage_10_clearance_release",
    ],
    optionalStageKeys: ["stage_4_type_procedures", "stage_5_scouting"],
    suggestedProcedures: ["industrial_standards_inspection"],
    defaultProcedures: [],
    notes: "تتخطى الشحنة الصناعية مرحلة الجهات الرقابية تلقائياً ما لم يضف المسؤول جهة عرض صريحة.",
  },
  other: {
    id: "other",
    name: "مسار البضائع العامة / الإفراج القياسي",
    badge: "إفراج عام",
    regulatoryAuthority: "مصلحة الجمارك المصرية",
    description: "المسار القياسي للبضائع العامة التي لا تخضع لجهات عرض نوعية متخصصة ما لم يحدد المسؤول خلاف ذلك.",
    applicableStageKeys: [
      "stage_1_intake",
      "stage_2_pricing",
      "stage_3_nafeza_acid",
      "stage_4_form_46",
      "stage_5_scouting",
      "stage_6_inspection",
      "stage_7_data_entry",
      "stage_8_valuation",
      "stage_9_fees_payments",
      "stage_10_clearance_release",
    ],
    optionalStageKeys: ["stage_4_type_procedures", "stage_5_scouting"],
    suggestedProcedures: [],
    defaultProcedures: [],
    notes: "المسار القياسي دون لجان عرض نوعية؛ يمكن إضافة جهات عرض محددة عند الحاجة.",
  },
};

export function getWorkflowTemplateForCategory(
  category?: GoodsCategory | null,
): CustomsWorkflowTemplate {
  if (category && CUSTOMS_WORKFLOW_TEMPLATES[category]) {
    return CUSTOMS_WORKFLOW_TEMPLATES[category];
  }
  return CUSTOMS_WORKFLOW_TEMPLATES.other;
}

// ─── 9. Stage 9 Financial Settlement Data Structure (Legacy Read-Only) ──────

/**
 * @deprecated Frozen legacy Stage 9 JSONB structure (`stage_9_fees_payments.stage_data`).
 * Preserved strictly for historical audit and backward-compatibility until Phase 2 Step 3/4 UI cutover.
 * Do NOT use for new financial mutations or Stage 9 completion gate decisions; use the authoritative
 * financial ledger types in `@/types/financial` and calculations in `@/lib/shipments/financial-calculations`.
 */
export type CustomsSettlementStatus =
  | "pending_payment"
  | "pending_assessment"
  | "assessed_pending_payment"
  | "paid_by_out_awaiting_customer"
  | "settled"
  | "customer_paid_direct"
  | "partial_paid";

/**
 * @deprecated Legacy Stage 9 JSONB payload. Replaced by `shipment_customs_obligations`
 * and `shipment_financial_transactions` in Migration 0019.
 */
export interface CustomsDutiesSettlementData {
  // 1. المطالبة الجمركية التقديرية
  customs_claim_number?: string | null;
  assessed_customs_amount?: number | null;
  duties_amount?: number | null; // For backward-compat

  // 2. سداد OUT الفعلي للجهات الجمركية
  amount_paid_by_out?: number | null;
  duties_paid_by_out?: boolean; // For backward-compat
  out_payment_reference?: string | null;
  out_payment_date?: string | null;

  // 2b. تفويض المصروفات والمدفوعات الإضافية لـ OUT (مثل غرامات أو أرضيات)
  additional_disbursement_authorized?: boolean;
  additional_disbursement_reason?: string | null;
  additional_disbursement_approved_by?: string | null;

  // 3. التحصيل من العميل
  amount_collected_from_customer?: number | null;
  collected_from_customer?: number | null; // For backward-compat
  customer_collection_reference?: string | null;
  customer_collection_date?: string | null;

  // 3b. سداد العميل المباشر للجهات الجمركية
  customer_direct_payment_reference?: string | null;
  customer_direct_payment_date?: string | null;
  direct_payment_verified_by?: string | null;
  direct_payment_verified_at?: string | null;

  // 4. حالة السداد والتسوية
  settlement_status?: CustomsSettlementStatus;

  settlement_notes?: string | null;
}

export function computeCustomsOutstandingBalance(data?: CustomsDutiesSettlementData | null): number {
  if (!data) return 0;

  const collected =
    typeof data.amount_collected_from_customer === "number" && !isNaN(data.amount_collected_from_customer)
      ? data.amount_collected_from_customer
      : typeof data.collected_from_customer === "number" && !isNaN(data.collected_from_customer)
      ? data.collected_from_customer
      : 0;

  if (data.settlement_status === "customer_paid_direct") {
    return 0 - collected;
  }

  const paidByOut =
    typeof data.amount_paid_by_out === "number" && !isNaN(data.amount_paid_by_out) && data.amount_paid_by_out > 0
      ? data.amount_paid_by_out
      : 0;

  const assessed =
    typeof data.assessed_customs_amount === "number" && !isNaN(data.assessed_customs_amount) && data.assessed_customs_amount > 0
      ? data.assessed_customs_amount
      : typeof data.duties_amount === "number" && !isNaN(data.duties_amount) && data.duties_amount > 0
      ? data.duties_amount
      : 0;

  let target = assessed;

  if (paidByOut > assessed) {
    if (data.additional_disbursement_authorized === true) {
      target = paidByOut;
    } else {
      target = assessed > 0 ? assessed : paidByOut;
    }
  } else if (paidByOut > 0 && assessed === 0) {
    target = paidByOut;
  }

  return target - collected;
}

// ─── 9b. Stage 10 Decoupled Clearance, Exit & Delivery Data Structure ─────────

export interface ClearanceReleaseStageData {
  release_permit_number?: string | null;
  customs_released_at?: string | null;
  customs_released_by?: string | null;

  port_exit_at?: string | null;
  port_exit_gate_pass?: string | null;
  transporter_name?: string | null;
  driver_phone?: string | null;
  port_exited_by?: string | null;

  delivered_at?: string | null;
  delivery_location?: string | null;
  recipient_name?: string | null;
  delivery_notes?: string | null;
  delivered_by?: string | null;
}

// ─── 9c. CargoX Manual Verification Data Structure ────────────────────────────

export const CARGOX_EXEMPTION_REASONS = [
  "air_freight_exemption",
  "free_zone_transit",
  "postal_or_express_cargo",
  "customs_authorized_exemption",
] as const;

export type CargoXExemptionReason = (typeof CARGOX_EXEMPTION_REASONS)[number];

export function isValidCargoXExemptionReason(
  reason: unknown,
): reason is CargoXExemptionReason {
  return (
    typeof reason === "string" &&
    (CARGOX_EXEMPTION_REASONS as readonly string[]).includes(reason.trim())
  );
}

export const CARGOX_EXEMPTION_REASON_LABELS: Record<CargoXExemptionReason, string> = {
  air_freight_exemption: "إعفاء الشحن الجوي",
  free_zone_transit: "بضائع ترانزيت / مناطق حرة",
  postal_or_express_cargo: "طرود بريدية وشحن سريع",
  customs_authorized_exemption: "إعفاء رسمي مسبب من مصلحة الجمارك",
};

export interface CargoXManualVerificationData {
  is_applicable: boolean;
  exemption_reason?: CargoXExemptionReason | null;
  supplier_upload_verified: boolean;
  cargox_envelope_number?: string | null;
  acid_matched: boolean;
  data_consistency_verified: boolean;
  verified_by?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
}

// ─── 10. Customer-Safe Synchronized Journey Interfaces ────────────────────────

export interface CustomerCustomsStage {
  key: CustomsStageKey;
  order: number;
  title: string;
  shortDescription: string;
  customerDescription: string;
  status: CustomsStageStatus;
  isApplicable: boolean;
  completedAt: string | null;
  isCurrentActive: boolean;
  isWaitingForCustomer: boolean;
  customerActionRequired: string | null;
  approvedPublicReference: string | null;
  regulatoryAuthority?: string;
  timeStatusLabel?: string | null;
}

export interface CustomerCustomsJourney {
  shipmentId: string;
  goodsCategory: GoodsCategory;
  categoryLabel: string;
  stages: CustomerCustomsStage[];
  activeStageKey: CustomsStageKey;
  activeStageTitle: string;
  completedStagesCount: number;
  applicableStagesCount: number;
  progressPercentage: number;
  isFullyCleared: boolean;
  financialSummary?: import("./financial").ShipmentFinancialSummary | null;
  primaryActionRequired: {
    actionType: "approve_price" | "upload_documents" | "revise_invoice" | "correct_document" | null;
    title: string;
    description: string;
    buttonLabel: string;
    targetTab: "documents" | "pricing" | "specs";
  } | null;
}

// ─── 11. High-Level 7-Stage Canonical Journey Model ──────────────────────────

export type UnifiedJourneyStageKey =
  | "01_intake"
  | "02_pricing"
  | "03_invoice_review"
  | "04_acid"
  | "05_documents"
  | "06_customs_procedures"
  | "07_clearance_release";

export type UnifiedStageStatus =
  | "completed"
  | "current"
  | "upcoming"
  | "waiting_customer"
  | "needs_correction"
  | "blocked";

export interface UnifiedJourneyStageChecklistItem {
  id: string;
  label: string;
  isRequired: boolean;
  isCompleted: boolean;
}

export interface UnifiedJourneyStage {
  number: string;
  key: UnifiedJourneyStageKey;
  title: string;
  status: UnifiedStageStatus;
  statusLabel: string;
  shortDescription: string;
  customerDescription: string;
  metaInfo?: string | null;
  waitingReason?: string | null;
  prerequisiteText?: string | null;
  checklist?: UnifiedJourneyStageChecklistItem[];
  isCompleted: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
  isActionRequired: boolean;
  completedAt?: string | null;
  activatedAt?: string | null;
  targetCompletionAt?: string | null;
  targetDurationHours?: number;
  isOverdue?: boolean;
  timeStatusLabel?: string | null;
}

export interface UnifiedSevenStageJourney {
  shipmentId: string;
  stages: UnifiedJourneyStage[];
  currentStageNumber: string;
  currentStageTitle: string;
  completedCount: number;
  totalCount: number;
  progressPercentage: number;
  isCompleted: boolean;
}

// ─── 12. Authoritative 10-Stage Journey Model (Package 6 Reference) ─────────

export type AuthoritativeStageNumber =
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | "09"
  | "10";

export type AuthoritativeStageKey =
  | "01_intake"
  | "02_pricing"
  | "03_invoice_nafeza"
  | "04_documents"
  | "05_scouting"
  | "06_inspection"
  | "07_data_entry"
  | "08_valuation"
  | "09_settlement"
  | "10_clearance_release";

export interface AuthoritativeStageDefinition {
  number: AuthoritativeStageNumber;
  key: AuthoritativeStageKey;
  title: string;
}

export const AUTHORITATIVE_STAGES_CONFIG: AuthoritativeStageDefinition[] = [
  { number: "01", key: "01_intake", title: "01 — تقديم طلب الشحنة" },
  { number: "02", key: "02_pricing", title: "02 — التسعير وموافقة العميل" },
  { number: "03", key: "03_invoice_nafeza", title: "03 — مراجعة الفاتورة المبدئية وإجراءات نافذة وACID" },
  { number: "04", key: "04_documents", title: "04 — مراجعة مستندات الشحنة واستخراج رقم 46" },
  { number: "05", key: "05_scouting", title: "05 — الكشف الميداني" },
  { number: "06", key: "06_inspection", title: "06 — المعاينة والجهات الرقابية" },
  { number: "07", key: "07_data_entry", title: "07 — إدراج البيانات" },
  { number: "08", key: "08_valuation", title: "08 — التقييم الجمركي" },
  { number: "09", key: "09_settlement", title: "09 — التسوية وسداد المستحقات" },
  { number: "10", key: "10_clearance_release", title: "10 — الإفراج الجمركي وخروج الشحنة والتسليم" },
];

export interface StageSubProcessDetails {
  key: string;
  title: string;
  role: OperationalRole | string;
  roleLabel: string;
  status: CustomsStageStatus;
  statusLabel: string;
  isApplicable: boolean;
  outcome?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  rejectionOrDelayReason?: string | null;
  isHistoricalSatisfaction?: boolean;
}

export interface AuthoritativeJourneyStage {
  number: AuthoritativeStageNumber;
  key: AuthoritativeStageKey;
  title: string;
  shortDescription: string;
  customerDescription: string;
  status: CustomsStageStatus;
  statusLabel: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
  isApplicable: boolean;
  isActionRequired: boolean;
  metaInfo?: string | null;
  waitingReason?: string | null;
  prerequisiteText?: string | null;
  assignedRole?: OperationalRole | string;
  assignedRoleLabel?: string;
  completedAt?: string | null;
  activatedAt?: string | null;
  targetCompletionAt?: string | null;
  targetDurationHours?: number;
  isOverdue?: boolean;
  timeStatusLabel?: string | null;
  checklist?: UnifiedJourneyStageChecklistItem[];
  icon?: string;

  // Sub-process tracking for Form 46 or Type-specific regulatory procedures
  form46SubProcess?: StageSubProcessDetails;
  typeProceduresSubProcess?: StageSubProcessDetails;

  // Sub-process dual tracking (retained for backward-compat)
  scoutingSubProcess?: StageSubProcessDetails;
  inspectionSubProcess?: StageSubProcessDetails;

  // Underlying DB mapped keys and records
  mappedDbKeys: CustomsStageKey[];
  dbStageRecord?: CustomsJourneyStage | null;
}

export interface AuthoritativeTenStageJourney {
  shipmentId: string;
  stages: AuthoritativeJourneyStage[];
  currentStageNumber: AuthoritativeStageNumber;
  currentStageTitle: string;
  completedCount: number;
  applicableCount: number;
  totalCount: 10;
  progressPercentage: number;
  isCompleted: boolean;
  goodsCategory: GoodsCategory;
  goodsCategoryLabel: string;
  currentOperationalAction?: {
    stageNumber: AuthoritativeStageNumber;
    stageTitle: string;
    assignedRoleLabel: string;
    currentReason: string;
    nextStepDescription: string;
    actionButtonLabel: string;
    actionType: "open_stage_modal" | "open_pricing_tab" | "open_documents_tab";
    isBlocked: boolean;
    blockReason: string | null;
  } | null;
  primaryCustomerAction?: {
    actionType: "approve_price" | "upload_documents" | "revise_invoice" | "correct_document" | "settle_duties" | null;
    title: string;
    description: string;
    buttonLabel: string;
    targetTab: "documents" | "pricing" | "specs";
    targetStageNumber?: AuthoritativeStageNumber;
  } | null;
}

// ─── 13. Customer 7 Progress Stations Model (Visual Presentation Grouping) ───

export type CustomerStationNumber = "01" | "02" | "03" | "04" | "05" | "06" | "07";

export type CustomerStationKey =
  | "01_intake"
  | "02_pricing_approval"
  | "03_invoice_nafeza_acid"
  | "04_documents_procedures"
  | "05_inspection_data_entry"
  | "06_valuation_settlement"
  | "07_release_delivery";

export interface CustomerStationDefinition {
  number: CustomerStationNumber;
  key: CustomerStationKey;
  title: string;
  shortDescription: string;
  underlyingStageNumbers: AuthoritativeStageNumber[];
}

export const CUSTOMER_STATIONS_CONFIG: CustomerStationDefinition[] = [
  {
    number: "01",
    key: "01_intake",
    title: "تقديم طلب الشحنة",
    shortDescription: "استلام طلب الشحنة وتدقيق البيانات الأساسية وتحديد نوع الشحنة",
    underlyingStageNumbers: ["01"],
  },
  {
    number: "02",
    key: "02_pricing_approval",
    title: "التسعير والموافقة",
    shortDescription: "مراجعة واعتماد عرض السعر لخدمة التخليص الجمركي",
    underlyingStageNumbers: ["02"],
  },
  {
    number: "03",
    key: "03_invoice_nafeza_acid",
    title: "الفاتورة ونافذة وACID",
    shortDescription: "مراجعة وتدقيق الفاتورة المبدئية وإصدار رقم ACID عبر نافذة",
    underlyingStageNumbers: ["03"],
  },
  {
    number: "04",
    key: "04_documents_procedures",
    title: "المستندات واستخراج رقم 46",
    shortDescription: "رفع واعتماد المستندات النهائية للشحن واستخراج وتأكيد رقم 46 الجمركي",
    underlyingStageNumbers: ["04"],
  },
  {
    number: "05",
    key: "05_inspection_data_entry",
    title: "الإجراءات الجمركية الميدانية وإدراج البيانات",
    shortDescription: "الكشف الميداني والمعاينة والجهات الرقابية وتدقيق البيانات الجمركية",
    underlyingStageNumbers: ["05", "06", "07"],
  },
  {
    number: "06",
    key: "06_valuation_settlement",
    title: "التقييم الجمركي والتسوية",
    shortDescription: "التقييم الجمركي وتحديد الضرائب والرسوم وسدادها ومطابقة التسوية المالية",
    underlyingStageNumbers: ["08", "09"],
  },
  {
    number: "07",
    key: "07_release_delivery",
    title: "الإفراج وخروج الشحنة والتسليم",
    shortDescription: "صدور إذن الإفراج النهائي الرسمي وخروج الشحنة من الميناء وتسليمها الفعلي",
    underlyingStageNumbers: ["10"],
  },
];

export interface CustomerJourneyStation {
  number: CustomerStationNumber;
  key: CustomerStationKey;
  title: string;
  shortDescription: string;
  customerDescription: string;
  status: CustomsStageStatus;
  statusLabel: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
  isActionRequired: boolean;
  metaInfo?: string | null;
  icon: string;
  underlyingStageNumbers: AuthoritativeStageNumber[];
  underlyingStages: AuthoritativeJourneyStage[];
  completedAt?: string | null;
  customerActionRequired?: string | null;
}

export interface CustomerSevenStationJourney {
  shipmentId: string;
  stations: CustomerJourneyStation[];
  currentStationNumber: CustomerStationNumber;
  currentStationTitle: string;
  completedCount: number;
  totalCount: 7;
  progressPercentage: number;
  isCompleted: boolean;
  goodsCategory: GoodsCategory;
  goodsCategoryLabel: string;
  primaryCustomerAction?: AuthoritativeTenStageJourney["primaryCustomerAction"];
}
