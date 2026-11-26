/**
 * Company Types & Interfaces
 *
 * Defines the core Company entity for the OUT platform.
 */

export interface Company {
  id: string; // uuid
  name: string;
  commercial_registration_number: string | null;
  tax_card_number: string | null;
  import_card_number: string | null;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export type CompanyInsert = Omit<Company, "id" | "created_at" | "updated_at">;
export type CompanyUpdate = Partial<Omit<Company, "id" | "created_at">>;

// ─── Company Document Types ───────────────────────────────────────────────────

export type CompanyDocumentType =
  | "commercial_registration"
  | "tax_card"
  | "import_card"
  | "vat";

export const COMPANY_DOCUMENT_TYPES: CompanyDocumentType[] = [
  "commercial_registration",
  "tax_card",
  "import_card",
  "vat",
];

export const COMPANY_DOCUMENT_TYPE_LABELS: Record<CompanyDocumentType, string> = {
  commercial_registration: "السجل التجاري",
  tax_card: "البطاقة الضريبية",
  import_card: "البطاقة الاستيرادية",
  vat: "القيمة المضافة",
};

export type CompanyDocumentStatus = "pending" | "approved";

export const COMPANY_DOCUMENT_STATUS_LABELS: Record<CompanyDocumentStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
};

export interface CompanyDocument {
  id: string; // uuid
  company_id: string; // uuid -> companies.id
  document_type: CompanyDocumentType;
  file_name: string;
  file_path: string;
  file_url: string | null;
  mime_type: string;
  file_size: number;
  status: CompanyDocumentStatus;
  uploaded_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  approved_at: string | null;
  approved_by: string | null;
  created_at: string; // ISO 8601
}

export type CompanyDocumentInsert = Omit<CompanyDocument, "id" | "created_at" | "updated_at">;
export type CompanyDocumentUpdate = Partial<Omit<CompanyDocument, "id" | "created_at">>;

/**
 * Extended Company Document row with joined company and profile info (for Admin table).
 */
export interface AdminCompanyDocumentItem extends CompanyDocument {
  company_name?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

