/**
 * Database Types
 *
 * Typed representations of Supabase tables.
 * These types mirror the database schema exactly.
 *
 * As new tables are added, extend this file.
 * The types here are used throughout the application for type safety.
 */

import type { UserRole } from "./auth";
import type {
  CustomerShipmentFinancialStatementItemRaw,
  ShipmentCustomsObligationInsert,
  ShipmentCustomsObligationRow,
  ShipmentCustomsObligationUpdate,
  ShipmentFinancialInternalNoteInsert,
  ShipmentFinancialInternalNoteRow,
  ShipmentFinancialInternalNoteUpdate,
  ShipmentFinancialMigrationAuditRow,
  ShipmentFinancialSummaryRaw,
  ShipmentFinancialTransactionInsert,
  ShipmentFinancialTransactionRow,
  ShipmentFinancialTransactionUpdate,
} from "./financial";

// ─── Database Row Types ───────────────────────────────────────────────────────

/**
 * companies table — mirrors the PostgreSQL schema.
 * Represents customer corporate entities.
 */
export interface CompanyRow {
  id: string; // uuid
  name: string;
  commercial_registration_number: string | null;
  tax_card_number: string | null;
  import_card_number: string | null;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_by?: string | null; // uuid -> profiles(id)
  updated_by?: string | null; // uuid -> profiles(id)
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
}

export type CompanyInsert = Omit<CompanyRow, "id" | "created_at" | "updated_at">;
export type CompanyUpdate = Partial<Omit<CompanyRow, "id" | "created_at">>;

/**
 * profiles table — mirrors the PostgreSQL schema.
 * This is the single source of truth for user metadata.
 */
export interface ProfileRow {
  id: string; // uuid — references auth.users(id)
  company_id: string | null; // uuid -> companies(id)
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_by?: string | null; // uuid -> profiles(id)
  updated_by?: string | null; // uuid -> profiles(id)
  is_admin_created?: boolean;
  provisioning_status?:
    | "pending_provisioning"
    | "invited"
    | "active"
    | "provisioning_failed"
    | "disabled";
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
}

// ─── Insert / Update Types ────────────────────────────────────────────────────

export type ProfileInsert = Omit<ProfileRow, "created_at" | "updated_at">;

export type ProfileUpdate = Partial<
  Omit<ProfileRow, "id" | "created_at">
>;

export interface DocumentRow {
  id: string; // uuid
  customer_id: string; // uuid -> profiles(id)
  company_id: string | null; // uuid -> companies(id)
  shipment_id: string | null; // uuid
  title: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  document_type: string;
  status: "pending" | "approved" | "revision_required";
  approved_at: string | null;
  approved_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentInsert = Omit<DocumentRow, "id" | "created_at" | "updated_at">;
export type DocumentUpdate = Partial<Omit<DocumentRow, "id" | "created_at">>;

export interface CompanyDocumentRow {
  id: string; // uuid
  company_id: string; // uuid -> companies(id)
  document_type: "commercial_registration" | "tax_card" | "import_card" | "vat";
  file_name: string;
  file_path: string;
  file_url: string | null;
  mime_type: string;
  file_size: number;
  status: "pending" | "approved";
  uploaded_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

export type CompanyDocumentInsert = Omit<CompanyDocumentRow, "id" | "created_at" | "updated_at">;
export type CompanyDocumentUpdate = Partial<Omit<CompanyDocumentRow, "id" | "created_at">>;

export interface ShipmentRow {
  id: string; // uuid
  company_id: string; // uuid -> companies(id)
  customer_id: string; // uuid -> profiles(id)
  created_by: string | null; // uuid -> profiles(id)
  updated_by?: string | null; // uuid -> profiles(id)
  management_mode?: "self_service" | "admin_managed";
  reference_number: string;
  status:
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
  supplier_name: string | null;
  country_of_origin: string | null;
  port_of_arrival: string | null;
  goods_description: string | null;
  packages_count: number | null;
  package_type: string | null;
  gross_weight: number | null;
  notes: string | null;
  goods_category?: "agricultural" | "industrial" | "food" | "other" | null;
  applicable_procedures?: string[];
  classification_notes?: string | null;
  classification_reviewed_at?: string | null;
  classification_reviewed_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type ShipmentInsert = Omit<
  ShipmentRow,
  "id" | "reference_number" | "created_at" | "updated_at"
> & {
  reference_number?: string;
};

export type ShipmentUpdate = Partial<
  Omit<ShipmentRow, "id" | "company_id" | "created_at">
>;

export interface ShipmentPricingRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  estimated_min_price: number;
  estimated_max_price: number;
  final_price: number | null;
  currency: string;
  status:
    | "pending"
    | "proposed"
    | "negotiation_requested"
    | "final_proposed"
    | "customer_approved";
  created_by: string | null; // uuid -> profiles(id)
  updated_by: string | null; // uuid -> profiles(id)
  customer_approved_at: string | null;
  customer_approved_by: string | null; // uuid -> profiles(id)
  approval_type?: "estimated_range" | "final_fixed" | null;
  approval_source?: "customer_direct" | "admin_on_behalf" | null;
  approval_recorded_by?: string | null;
  approval_channel?: "portal" | "phone_call" | "whatsapp" | "in_person" | "email" | null;
  confirmed_by_name?: string | null;
  confirmation_reference?: string | null;
  created_at: string;
  updated_at: string;
}

export type ShipmentPricingInsert = Omit<
  ShipmentPricingRow,
  "id" | "created_at" | "updated_at"
>;

export type ShipmentPricingUpdate = Partial<
  Omit<ShipmentPricingRow, "id" | "shipment_id" | "created_at">
>;

export interface ShipmentPricingHistoryRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  pricing_id: string; // uuid -> shipment_pricing(id)
  action:
    | "estimate_created"
    | "negotiation_requested"
    | "final_price_set"
    | "customer_approved";
  estimated_min_price: number | null;
  estimated_max_price: number | null;
  final_price: number | null;
  currency: string;
  performed_by: string | null; // uuid -> profiles(id)
  performed_at: string;
  notes: string | null;
  approval_type?: "estimated_range" | "final_fixed" | null;
  approval_source?: "customer_direct" | "admin_on_behalf" | null;
  approval_recorded_by?: string | null;
  approval_channel?: "portal" | "phone_call" | "whatsapp" | "in_person" | "email" | null;
  confirmed_by_name?: string | null;
  confirmation_reference?: string | null;
}

export type ShipmentPricingHistoryInsert = Omit<
  ShipmentPricingHistoryRow,
  "id" | "performed_at"
>;

export type ShipmentPricingHistoryUpdate = Partial<
  Omit<ShipmentPricingHistoryRow, "id">
>;

export interface ShipmentInvoiceReviewRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  document_id: string; // uuid -> documents(id)
  action: "approved" | "revision_requested" | "resubmitted";
  note: string | null;
  performed_by: string | null; // uuid -> profiles(id)
  performed_at: string;
}

export type ShipmentInvoiceReviewInsert = Omit<
  ShipmentInvoiceReviewRow,
  "id" | "performed_at"
>;

export type ShipmentInvoiceReviewUpdate = Partial<
  Omit<ShipmentInvoiceReviewRow, "id">
>;

export interface ShipmentAcidRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  acid_number: string | null;
  status: "pending" | "processing" | "issued" | "failed";
  notes: string | null;
  created_by: string | null; // uuid -> profiles(id)
  updated_by: string | null; // uuid -> profiles(id)
  issued_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ShipmentAcidInsert = Omit<
  ShipmentAcidRow,
  "id" | "created_at" | "updated_at"
>;

export type ShipmentAcidUpdate = Partial<
  Omit<ShipmentAcidRow, "id" | "shipment_id" | "created_at">
>;

export interface ShipmentAcidHistoryRow {
  id: string; // uuid
  shipment_acid_id: string; // uuid -> shipment_acids(id)
  shipment_id: string; // uuid -> shipments(id)
  action: "created" | "processing_started" | "issued" | "failed";
  old_status: string | null;
  new_status: string;
  acid_number: string | null;
  notes: string | null;
  performed_by: string | null; // uuid -> profiles(id)
  performed_at: string;
}

export type ShipmentAcidHistoryInsert = Omit<
  ShipmentAcidHistoryRow,
  "id" | "performed_at"
>;

export type ShipmentAcidHistoryUpdate = Partial<
  Omit<ShipmentAcidHistoryRow, "id">
>;

export interface ShipmentDocumentReviewRow {
  id: string; // uuid
  document_id: string; // uuid -> documents(id)
  shipment_id: string; // uuid -> shipments(id)
  document_type: string;
  action: "uploaded" | "approved" | "revision_requested" | "resubmitted";
  note: string | null;
  performed_by: string | null; // uuid -> profiles(id)
  performed_at: string;
}

export type ShipmentDocumentReviewInsert = Omit<
  ShipmentDocumentReviewRow,
  "id" | "performed_at"
>;

export type ShipmentDocumentReviewUpdate = Partial<
  Omit<ShipmentDocumentReviewRow, "id">
>;

export interface ShipmentStageHistoryRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  action: string;
  note: string | null;
  performed_by: string | null; // uuid -> profiles(id)
  performed_at: string;
}

export type ShipmentStageHistoryInsert = Omit<
  ShipmentStageHistoryRow,
  "id" | "performed_at"
>;

export type ShipmentStageHistoryUpdate = Partial<
  Omit<ShipmentStageHistoryRow, "id">
>;

export interface NotificationRow {
  id: string; // uuid
  user_id: string; // uuid -> profiles(id)
  shipment_id: string | null; // uuid -> shipments(id)
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "pricing" | "invoice" | "acid" | "document" | "readiness";
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export type NotificationInsert = Omit<
  NotificationRow,
  "id" | "created_at"
> & {
  id?: string;
  is_read?: boolean;
  read_at?: string | null;
};

export type NotificationUpdate = Partial<
  Omit<NotificationRow, "id" | "user_id" | "created_at">
>;

export interface ShipmentCustomsStageRow {
  id: string;
  shipment_id: string;
  stage_key:
    | "stage_1_intake"
    | "stage_2_pricing"
    | "stage_3_nafeza_acid"
    | "stage_4_form_46"
    | "stage_4_type_procedures"
    | "stage_5_scouting"
    | "stage_6_inspection"
    | "stage_7_data_entry"
    | "stage_8_valuation"
    | "stage_9_fees_payments"
    | "stage_10_clearance_release";
  stage_order: number;
  status:
    | "not_applicable"
    | "skipped"
    | "pending"
    | "in_progress"
    | "awaiting_external_response"
    | "needs_correction"
    | "completed"
    | "blocked";
  is_applicable: boolean;
  expected_role: string;
  assigned_to: string | null;
  role_confirmed: boolean;
  outcome: string | null;
  reference_number: string | null;
  notes: string | null;
  rejection_or_delay_reason: string | null;
  stage_data: Record<string, unknown>;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type ShipmentCustomsStageInsert = Omit<
  ShipmentCustomsStageRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ShipmentCustomsStageUpdate = Partial<
  Omit<ShipmentCustomsStageRow, "id" | "shipment_id" | "created_at">
>;

export interface ShipmentCustomsStageHistoryRow {
  id: string;
  shipment_id: string;
  stage_key: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  outcome: string | null;
  reference_number: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  performed_by: string | null;
  performed_at: string;
}

export type ShipmentCustomsStageHistoryInsert = Omit<
  ShipmentCustomsStageHistoryRow,
  "id" | "performed_at"
>;

export type ShipmentCustomsStageHistoryUpdate = Partial<
  Omit<ShipmentCustomsStageHistoryRow, "id">
>;

export interface ShipmentRegulatoryProcedureRow {
  id: string;
  shipment_id: string;
  procedure_code: string;
  authority_name_ar: string;
  status: "pending" | "in_progress" | "sample_taken" | "approved" | "rejected";
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

export type ShipmentRegulatoryProcedureInsert = Omit<
  ShipmentRegulatoryProcedureRow,
  "id" | "created_at" | "updated_at"
>;

export type ShipmentRegulatoryProcedureUpdate = Partial<
  Omit<ShipmentRegulatoryProcedureRow, "id" | "shipment_id" | "created_at">
>;

export type {
  ShipmentCustomsObligationRow,
  ShipmentCustomsObligationInsert,
  ShipmentCustomsObligationUpdate,
  ShipmentFinancialTransactionRow,
  ShipmentFinancialTransactionInsert,
  ShipmentFinancialTransactionUpdate,
  ShipmentFinancialInternalNoteRow,
  ShipmentFinancialInternalNoteInsert,
  ShipmentFinancialInternalNoteUpdate,
  ShipmentFinancialMigrationAuditRow,
  ShipmentFinancialSummaryRaw,
  CustomerShipmentFinancialStatementItemRaw,
};

// ─── Supabase Database Type (extend as tables are added) ──────────────────────

/**
 * This is the root Database type passed to the Supabase client.
 * Each table in `public` schema should be listed here.
 */
export interface Database {
  public: {
    Tables: {
      companies: {
        Row: CompanyRow;
        Insert: CompanyInsert;
        Update: CompanyUpdate;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      documents: {
        Row: DocumentRow;
        Insert: DocumentInsert;
        Update: DocumentUpdate;
        Relationships: [];
      };
      company_documents: {
        Row: CompanyDocumentRow;
        Insert: CompanyDocumentInsert;
        Update: CompanyDocumentUpdate;
        Relationships: [];
      };
      shipments: {
        Row: ShipmentRow;
        Insert: ShipmentInsert;
        Update: ShipmentUpdate;
        Relationships: [];
      };
      shipment_pricing: {
        Row: ShipmentPricingRow;
        Insert: ShipmentPricingInsert;
        Update: ShipmentPricingUpdate;
        Relationships: [];
      };
      shipment_pricing_history: {
        Row: ShipmentPricingHistoryRow;
        Insert: ShipmentPricingHistoryInsert;
        Update: ShipmentPricingHistoryUpdate;
        Relationships: [];
      };
      shipment_invoice_reviews: {
        Row: ShipmentInvoiceReviewRow;
        Insert: ShipmentInvoiceReviewInsert;
        Update: ShipmentInvoiceReviewUpdate;
        Relationships: [];
      };
      shipment_acids: {
        Row: ShipmentAcidRow;
        Insert: ShipmentAcidInsert;
        Update: ShipmentAcidUpdate;
        Relationships: [];
      };
      shipment_acid_history: {
        Row: ShipmentAcidHistoryRow;
        Insert: ShipmentAcidHistoryInsert;
        Update: ShipmentAcidHistoryUpdate;
        Relationships: [];
      };
      shipment_document_reviews: {
        Row: ShipmentDocumentReviewRow;
        Insert: ShipmentDocumentReviewInsert;
        Update: ShipmentDocumentReviewUpdate;
        Relationships: [];
      };
      shipment_stage_history: {
        Row: ShipmentStageHistoryRow;
        Insert: ShipmentStageHistoryInsert;
        Update: ShipmentStageHistoryUpdate;
        Relationships: [];
      };
      shipment_customs_stages: {
        Row: ShipmentCustomsStageRow;
        Insert: ShipmentCustomsStageInsert;
        Update: ShipmentCustomsStageUpdate;
        Relationships: [];
      };
      shipment_customs_stage_history: {
        Row: ShipmentCustomsStageHistoryRow;
        Insert: ShipmentCustomsStageHistoryInsert;
        Update: ShipmentCustomsStageHistoryUpdate;
        Relationships: [];
      };
      shipment_regulatory_procedures: {
        Row: ShipmentRegulatoryProcedureRow;
        Insert: ShipmentRegulatoryProcedureInsert;
        Update: ShipmentRegulatoryProcedureUpdate;
        Relationships: [];
      };
      shipment_customs_obligations: {
        Row: ShipmentCustomsObligationRow;
        Insert: ShipmentCustomsObligationInsert;
        Update: ShipmentCustomsObligationUpdate;
        Relationships: [];
      };
      shipment_financial_transactions: {
        Row: ShipmentFinancialTransactionRow;
        Insert: ShipmentFinancialTransactionInsert;
        Update: ShipmentFinancialTransactionUpdate;
        Relationships: [];
      };
      shipment_financial_internal_notes: {
        Row: ShipmentFinancialInternalNoteRow;
        Insert: ShipmentFinancialInternalNoteInsert;
        Update: ShipmentFinancialInternalNoteUpdate;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
        Relationships: [];
      };
    };
    Views: {
      shipment_financial_migration_audit_v: {
        Row: ShipmentFinancialMigrationAuditRow;
        Relationships: [];
      };
    };
    Functions: {
      get_shipment_financial_summary: {
        Args: {
          p_shipment_id: string;
        };
        Returns: ShipmentFinancialSummaryRaw[];
      };
      get_customer_shipment_financial_statement: {
        Args: {
          p_shipment_id: string;
        };
        Returns: CustomerShipmentFinancialStatementItemRaw[];
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: {
      [_: string]: never;
    };
  };
}
