/**
 * Shipment / Clearance Request Types
 *
 * Types for shipments, clearance requests, pricing, and negotiation workflows.
 */

export type ShipmentStatus =
  | "draft"
  | "submitted"
  | "awaiting_pricing"
  | "price_proposed"
  | "negotiation"
  | "price_agreed"
  | "awaiting_invoice_review"
  | "invoice_revision_required"
  | "invoice_approved"
  | "acid_processing"
  | "acid_issued"
  | "awaiting_shipment_documents"
  | "documents_completed"
  | "ready_for_external_stage"
  | "customs_in_progress"
  | "customs_cleared"
  | "delivered";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  draft: "مسودة",
  submitted: "تم إرسال الطلب",
  awaiting_pricing: "بانتظار التسعير",
  price_proposed: "تم تقديم عرض السعر",
  negotiation: "قيد التفاوض",
  price_agreed: "السعر النهائي محدد",
  awaiting_invoice_review: "بانتظار مراجعة الفاتورة المبدئية",
  invoice_revision_required: "مطلوب تعديل الفاتورة",
  invoice_approved: "تم اعتماد الفاتورة المبدئية",
  acid_processing: "معالجة ACID",
  acid_issued: "تم إصدار ACID",
  awaiting_shipment_documents: "بانتظار مستندات الشحنة",
  documents_completed: "مستندات الشحنة مكتملة",
  ready_for_external_stage: "جاهزة للمرحلة الخارجية",
  customs_in_progress: "قيد التخليص الجمركي",
  customs_cleared: "تم الإفراج الجمركي",
  delivered: "تم التسليم للعميل",
};

export interface Shipment {
  id: string; // uuid
  company_id: string; // uuid -> companies.id
  customer_id: string; // uuid -> profiles.id
  created_by?: string | null; // uuid -> profiles.id
  updated_by?: string | null; // uuid -> profiles.id
  management_mode?: "self_service" | "admin_managed";
  reference_number: string;
  status: ShipmentStatus;
  supplier_name: string | null;
  country_of_origin: string | null;
  port_of_arrival: string | null;
  goods_description: string | null;
  packages_count: number | null;
  package_type: string | null;
  gross_weight: number | null;
  notes: string | null;
  goods_category?: "agricultural" | "industrial" | "food" | "other" | null;
  applicable_procedures?: string[] | null;
  classification_notes?: string | null;
  classification_reviewed_at?: string | null;
  classification_reviewed_by?: string | null;
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export type ShipmentInsert = Omit<
  Shipment,
  "id" | "reference_number" | "created_at" | "updated_at"
> & {
  reference_number?: string;
};

export type ShipmentUpdate = Partial<
  Omit<Shipment, "id" | "company_id" | "created_at">
>;

export interface AdminShipmentItem extends Shipment {
  company_name?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
}

export interface ShipmentFilters {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

// ─── Pricing Types ────────────────────────────────────────────────────────────

export type PricingStatus =
  | "pending"
  | "proposed"
  | "negotiation_requested"
  | "final_proposed"
  | "customer_approved";

export const PRICING_STATUS_LABELS: Record<PricingStatus, string> = {
  pending: "بانتظار تحديد السعر",
  proposed: "تم تقديم تقدير السعر",
  negotiation_requested: "تم طلب التفاوض",
  final_proposed: "تم تحديد السعر النهائي",
  customer_approved: "تمت موافقة العميل",
};

export type PricingApprovalType = "estimated_range" | "final_fixed";
export type PricingApprovalSource = "customer_direct" | "admin_on_behalf";
export type PricingApprovalChannel =
  | "portal"
  | "phone_call"
  | "whatsapp"
  | "in_person"
  | "email";

export type PricingHistoryAction =
  | "estimate_created"
  | "negotiation_requested"
  | "final_price_set"
  | "customer_approved";

export const PRICING_ACTION_LABELS: Record<PricingHistoryAction, string> = {
  estimate_created: "تم إنشاء التسعير",
  negotiation_requested: "تم طلب التفاوض",
  final_price_set: "تم تحديد السعر النهائي",
  customer_approved: "تمت موافقة العميل على التسعير",
};

export interface ShipmentPricing {
  id: string;
  shipment_id: string;
  estimated_min_price: number;
  estimated_max_price: number;
  final_price: number | null;
  currency: string;
  status: PricingStatus;
  created_by?: string | null;
  updated_by?: string | null;
  customer_approved_at?: string | null;
  customer_approved_by?: string | null;
  customer_approved_by_name?: string | null;
  approval_type?: PricingApprovalType | null;
  approval_source?: PricingApprovalSource | null;
  approval_recorded_by?: string | null;
  approval_channel?: PricingApprovalChannel | null;
  confirmed_by_name?: string | null;
  confirmation_reference?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentPricingHistoryItem {
  id: string;
  shipment_id: string;
  pricing_id: string;
  action: PricingHistoryAction;
  estimated_min_price?: number | null;
  estimated_max_price?: number | null;
  final_price?: number | null;
  currency: string;
  performed_by?: string | null;
  performed_by_name?: string | null;
  performed_at: string;
  notes?: string | null;
  approval_type?: PricingApprovalType | null;
  approval_source?: PricingApprovalSource | null;
  approval_recorded_by?: string | null;
  approval_channel?: PricingApprovalChannel | null;
  confirmed_by_name?: string | null;
  confirmation_reference?: string | null;
}

// ─── Invoice Review Types (Step 6) ───────────────────────────────────────────

export type InvoiceReviewAction =
  | "approved"
  | "revision_requested"
  | "resubmitted";

export const INVOICE_REVIEW_ACTION_LABELS: Record<InvoiceReviewAction, string> = {
  approved: "تم اعتماد الفاتورة",
  revision_requested: "طلب تعديل الفاتورة",
  resubmitted: "تمت إعادة رفع الفاتورة",
};

export interface ShipmentInvoiceReview {
  id: string;
  shipment_id: string;
  document_id: string;
  action: InvoiceReviewAction;
  note?: string | null;
  performed_by?: string | null;
  performed_by_name?: string | null;
  performed_at: string;
}

// ─── ACID Workflow Types (Step 7) ────────────────────────────────────────────

export type AcidStatus = "pending" | "processing" | "issued" | "failed";

export const ACID_STATUS_LABELS: Record<AcidStatus, string> = {
  pending: "بانتظار المعالجة",
  processing: "جاري معالجة ACID",
  issued: "تم إصدار ACID",
  failed: "تعثر في المعالجة",
};

export type AcidHistoryAction =
  | "created"
  | "processing_started"
  | "issued"
  | "failed";

export const ACID_ACTION_LABELS: Record<AcidHistoryAction, string> = {
  created: "إنشاء سجل ACID",
  processing_started: "بدء معالجة ACID",
  issued: "إصدار رقم ACID",
  failed: "تسجيل تعثر العملية",
};

export interface ShipmentAcid {
  id: string;
  shipment_id: string;
  acid_number: string | null;
  status: AcidStatus;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  issued_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentAcidHistoryItem {
  id: string;
  shipment_acid_id: string;
  shipment_id: string;
  action: AcidHistoryAction;
  old_status?: string | null;
  new_status: AcidStatus;
  acid_number?: string | null;
  notes?: string | null;
  performed_by?: string | null;
  performed_by_name?: string | null;
  performed_at: string;
}
