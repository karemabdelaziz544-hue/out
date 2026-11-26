/**
 * Document Management Types
 *
 * Types for the central Documents Management Center and Customer Documents.
 */

export const DEFAULT_DOCUMENT_TYPES = [
  "فاتورة مبدئية",
  "بوليصة شحن",
  "فاتورة تجارية",
  "قائمة التعبئة",
  "بيان جمركي",
  "شهادة منشأ",
  "إذن تسليم",
  "مستند عام",
] as const;

export type DocumentStatus = "pending" | "approved" | "revision_required";

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  revision_required: "مطلوب تعديل",
};

// ─── Step 8: Final Shipment Document Types ─────────────────────────────────────

export type FinalShipmentDocumentType =
  | "commercial_invoice"
  | "packing_list"
  | "bill_of_lading"
  | "certificate_of_origin";

export const FINAL_SHIPMENT_DOCUMENT_TYPES: FinalShipmentDocumentType[] = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
];

export const FINAL_DOCUMENT_TYPE_LABELS: Record<FinalShipmentDocumentType, string> = {
  commercial_invoice: "الفاتورة التجارية",
  packing_list: "قائمة التعبئة",
  bill_of_lading: "بوليصة الشحن",
  certificate_of_origin: "شهادة المنشأ",
};

export type ShipmentDocumentReviewAction =
  | "uploaded"
  | "approved"
  | "revision_requested"
  | "resubmitted";

export const SHIPMENT_DOCUMENT_ACTION_LABELS: Record<ShipmentDocumentReviewAction, string> = {
  uploaded: "تم رفع المستند",
  approved: "تم اعتماد المستند",
  revision_requested: "مطلوب تعديل المستند",
  resubmitted: "تم استبدال المستند",
};

export interface ShipmentDocumentReviewItem {
  id: string;
  document_id: string;
  shipment_id: string;
  document_type: string;
  action: ShipmentDocumentReviewAction;
  note?: string | null;
  performed_by?: string | null;
  performed_by_name?: string | null;
  performed_at: string;
}

export interface ShipmentDocumentProgress {
  totalRequired: number; // 4
  uploadedCount: number;
  approvedCount: number;
  pendingCount: number;
  revisionCount: number;
  missingCount: number;
  isAllUploaded: boolean;
  isAllApproved: boolean;
}

/**
 * Match a raw document_type string against the 4 final shipment document types.
 */
export function matchFinalDocumentType(rawType?: string | null): FinalShipmentDocumentType | null {
  if (!rawType) return null;
  const t = rawType.trim().toLowerCase();
  if (t === "commercial_invoice" || rawType === "فاتورة تجارية" || rawType === "الفاتورة التجارية") {
    return "commercial_invoice";
  }
  if (t === "packing_list" || rawType === "قائمة التعبئة" || rawType === "قائمة تعبئة") {
    return "packing_list";
  }
  if (t === "bill_of_lading" || rawType === "بوليصة شحن" || rawType === "بوليصة الشحن") {
    return "bill_of_lading";
  }
  if (t === "certificate_of_origin" || rawType === "شهادة منشأ" || rawType === "شهادة المنشأ") {
    return "certificate_of_origin";
  }
  return null;
}


export interface DocumentItem {
  id: string;
  title: string;
  file_name?: string | null;
  file_path?: string | null;
  file_url: string | null;
  file_type?: string | null; // e.g. "application/pdf", "image/png"
  file_size?: number | null; // in bytes
  document_type?: string | null; // e.g. "بوليصة شحن", "فاتورة تجارية"
  status: DocumentStatus;
  approved_at?: string | null;
  approved_by?: string | null;
  approver_name?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewer_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  company_id?: string | null;
  shipment_id?: string | null;
  shipment_number?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DocumentStats {
  totalDocuments: number;
  pendingDocuments: number;
  approvedDocuments: number;
  customerDocuments: number;
  shipmentDocuments: number;
}

export interface DocumentFilters {
  query?: string;
  documentType?: string;
  status?: "all" | DocumentStatus;
  page?: number;
  pageSize?: number;
}

export interface DocumentsData {
  documents: DocumentItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableTypes: string[];
}
