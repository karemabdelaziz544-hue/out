/**
 * External Operations Types & Catalog
 *
 * Types for logging manual actions performed outside OUT on Nafeza (نافذة).
 * These are internal logging records, not API automated actions.
 *
 * NOTE: CargoX is explicitly excluded from the OUT workflow.
 * The active external platform is strictly Nafeza (نافذة).
 */

export type ExternalPlatform = "nafeza" | "cargox"; // cargox kept in union only for non-destructive legacy DB compatibility

export type ExternalOperationOutcome =
  | "pending"
  | "successful"
  | "failed"
  | "rejected"
  | "requires_follow_up";

export interface OperationTypeOption {
  value: string;
  label: string;
  platform: ExternalPlatform | "both";
  defaultTitle: string;
  descriptionPlaceholder?: string;
}

// Active operation catalog: Strictly Nafeza & generic customs procedures (No CargoX)
export const EXTERNAL_OPERATION_TYPES: OperationTypeOption[] = [
  {
    value: "nafeza_acid_registration",
    label: "تسجيل قيد طلب ACID",
    platform: "nafeza",
    defaultTitle: "تسجيل قيد طلب ACID على نافذة",
    descriptionPlaceholder: "تفاصيل تسجيل الطلب وتاريخ التقديم على المنظومة",
  },
  {
    value: "nafeza_document_submission",
    label: "تسجيل تقديم مستندات الشحنة",
    platform: "nafeza",
    defaultTitle: "تقديم مستندات الشحنة على نافذة",
    descriptionPlaceholder: "بيان المستندات التي تم تقديمها لمصلحة الجمارك عبر نافذة",
  },
  {
    value: "nafeza_document_review",
    label: "تسجيل مراجعة أو ملاحظات جمركية",
    platform: "nafeza",
    defaultTitle: "تسجيل ملاحظات مراجعة المستندات الجمركية",
    descriptionPlaceholder: "ملاحظات الفاحص الجمركي أو بنود المراجعة",
  },
  {
    value: "nafeza_declaration_46",
    label: "تسجيل استخراج أو قيد رقم 46 (استرشادي)",
    platform: "nafeza",
    defaultTitle: "تسجيل قيد رقم 46 جمركي",
    descriptionPlaceholder: "تفاصيل استخراج رقم 46 وتاريخ التسجيل (بانتظار التأكيد التشغيلي)",
  },
  {
    value: "nafeza_external_response",
    label: "تسجيل إشعار أو رد من نافذة",
    platform: "nafeza",
    defaultTitle: "استلام إشعار / رد من نافذة",
    descriptionPlaceholder: "نص الرد أو التوجيه الجمركي الصادر من المنظومة",
  },
  {
    value: "nafeza_other",
    label: "إجراء آخر على نافذة",
    platform: "nafeza",
    defaultTitle: "إجراء تشغيلي آخر على نافذة",
    descriptionPlaceholder: "وصف الإجراء المنفذ (إلزامي)",
  },
  {
    value: "other",
    label: "إجراء جمركي خارجي عام",
    platform: "both",
    defaultTitle: "إجراء خارجي مسجل",
    descriptionPlaceholder: "وصف مفصل للإجراء الخارجي المنفذ (إلزامي)",
  },
];

export const OUTCOME_LABELS: Record<ExternalOperationOutcome, string> = {
  pending: "قيد الانتظار",
  successful: "ناجح ومكتمل",
  failed: "فشلت المحاولة",
  rejected: "مرفوض من المنظومة",
  requires_follow_up: "يتطلب متابعة",
};

export const PLATFORM_LABELS: Record<ExternalPlatform, string> = {
  nafeza: "منظومة نافذة (Nafeza)",
  cargox: "سجل أرشيفي خارجي (غير مستخدم في سير العمل)",
};

export interface ShipmentExternalOperation {
  id: string;
  shipment_id: string;
  platform: ExternalPlatform;
  operation_type: string;
  title: string;
  description: string | null;
  operation_date: string;
  created_at: string;
  created_by: string;
  created_by_name?: string | null;
  created_by_role?: string | null;
  external_reference: string | null;
  acid_number: string | null;
  outcome: ExternalOperationOutcome;
  external_response: string | null;
  document_id: string | null;
  document_title?: string | null;
  document_file_url?: string | null;
  updated_at: string;
  updated_by: string | null;
}
