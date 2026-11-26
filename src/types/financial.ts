/**
 * Financial Ledger & Payment Architecture Types (Phase 2)
 *
 * Mirrors `supabase/migrations/0019_create_financial_ledger_and_payment_gates.sql` verbatim.
 *
 * Architectural Separation:
 *  Track A — Customs Authority Obligation (`shipment_customs_obligations`):
 *    What is officially assessed by Customs and how it is covered (either paid by OUT
 *    or paid directly by the customer with staff verification).
 *  Track B — OUT Receivable & Customer Settlement (`shipment_financial_transactions` + `shipment_pricing`):
 *    What the customer owes OUT (confirmed fixed final service fee + billable OUT disbursements
 *    + approved extra charges - approved credits) versus what OUT has actually collected.
 */

// ─── 1. Enums & Literal Unions (Matching Migration 0019 CHECK Constraints) ────

export type FinancialCurrency = "EGP";

/**
 * `shipment_customs_obligations.claim_type`
 * Matches `chk_customs_obligations_claim_type` in Migration 0019.
 */
export type FinancialObligationClaimType =
  | "primary_assessment"
  | "supplementary_assessment"
  | "penalty_or_demurrage";

export const FINANCIAL_OBLIGATION_CLAIM_TYPES: readonly FinancialObligationClaimType[] = [
  "primary_assessment",
  "supplementary_assessment",
  "penalty_or_demurrage",
] as const;

export const FINANCIAL_OBLIGATION_CLAIM_TYPE_LABELS: Record<FinancialObligationClaimType, string> = {
  primary_assessment: "مطالبة جمركية أساسية",
  supplementary_assessment: "مطالبة تكميلية / فروق تثمين",
  penalty_or_demurrage: "غرامات أو أرضيات جمركية",
};

/**
 * `shipment_customs_obligations.status`
 * Matches `chk_customs_obligations_status` in Migration 0019.
 */
export type FinancialObligationStatus =
  | "assessed"
  | "partially_covered"
  | "fully_covered"
  | "cancelled";

export const FINANCIAL_OBLIGATION_STATUSES: readonly FinancialObligationStatus[] = [
  "assessed",
  "partially_covered",
  "fully_covered",
  "cancelled",
] as const;

export const FINANCIAL_OBLIGATION_STATUS_LABELS: Record<FinancialObligationStatus, string> = {
  assessed: "مُقدّرة وبانتظار التغطية",
  partially_covered: "مُغطاة جزئياً",
  fully_covered: "مُغطاة بالكامل",
  cancelled: "ملغاة",
};

/**
 * `shipment_financial_transactions.entry_category`
 * Matches `shipment_financial_tx_category_type_check` in Migration 0019.
 */
export type FinancialTransactionCategory =
  | "out_disbursement"
  | "customer_charge"
  | "customer_payment_to_out"
  | "customer_direct_customs_payment"
  | "credit_adjustment";

export const FINANCIAL_TRANSACTION_CATEGORIES: readonly FinancialTransactionCategory[] = [
  "out_disbursement",
  "customer_charge",
  "customer_payment_to_out",
  "customer_direct_customs_payment",
  "credit_adjustment",
] as const;

export const FINANCIAL_TRANSACTION_CATEGORY_LABELS: Record<FinancialTransactionCategory, string> = {
  out_disbursement: "مصروفات ومدفوعات مسددة بواسطة OUT",
  customer_charge: "رسوم خدمات إضافية على العميل",
  customer_payment_to_out: "تحصيل من العميل لصالح OUT",
  customer_direct_customs_payment: "سداد مباشر من العميل للجمارك",
  credit_adjustment: "خصم أو تسوية دائنة للعميل",
};

/**
 * Entry types per category — matches `shipment_financial_tx_category_type_check` in Migration 0019.
 */
export type OutDisbursementEntryType =
  | "customs_duties"
  | "government_fees"
  | "port_demurrage"
  | "inspection_fees"
  | "transport_fees"
  | "other_expense";

export type CustomerChargeEntryType =
  | "extra_clearance_service"
  | "documentation_fee"
  | "storage_surcharge"
  | "other_charge";

export type CustomerPaymentToOutEntryType =
  | "customer_installment"
  | "final_settlement";

export type CustomerDirectCustomsPaymentEntryType = "customs_duties";

export type CreditAdjustmentEntryType = "discount_credit";

/**
 * `shipment_financial_transactions.entry_type`
 */
export type FinancialTransactionType =
  | OutDisbursementEntryType
  | CustomerChargeEntryType
  | CustomerPaymentToOutEntryType
  | CustomerDirectCustomsPaymentEntryType
  | CreditAdjustmentEntryType;

export const FINANCIAL_TRANSACTION_TYPES: readonly FinancialTransactionType[] = [
  "customs_duties",
  "government_fees",
  "port_demurrage",
  "inspection_fees",
  "transport_fees",
  "other_expense",
  "extra_clearance_service",
  "documentation_fee",
  "storage_surcharge",
  "other_charge",
  "customer_installment",
  "final_settlement",
  "discount_credit",
] as const;

export const FINANCIAL_CATEGORY_ALLOWED_TYPES: Record<
  FinancialTransactionCategory,
  readonly FinancialTransactionType[]
> = {
  out_disbursement: [
    "customs_duties",
    "government_fees",
    "port_demurrage",
    "inspection_fees",
    "transport_fees",
    "other_expense",
  ],
  customer_charge: [
    "extra_clearance_service",
    "documentation_fee",
    "storage_surcharge",
    "other_charge",
  ],
  customer_payment_to_out: ["customer_installment", "final_settlement"],
  customer_direct_customs_payment: ["customs_duties"],
  credit_adjustment: ["discount_credit"],
};

export const FINANCIAL_TRANSACTION_TYPE_LABELS: Record<FinancialTransactionType, string> = {
  customs_duties: "رسوم وضرائب جمركية",
  government_fees: "رسوم جهات حكومية ورقابية",
  port_demurrage: "أرضيات وغرامات موانئ وتخزين",
  inspection_fees: "مصاريف معاينة وفحص وسحب عينات",
  transport_fees: "مصاريف نقل وتحميل",
  other_expense: "مصروفات تشغيلية أخرى",
  extra_clearance_service: "خدمات تخليص إضافية",
  documentation_fee: "رسوم تجهيز وتوثيق مستندات",
  storage_surcharge: "رسوم تخزين إضافية",
  other_charge: "رسوم إضافية أخرى",
  customer_installment: "دفعة تحت الحساب من العميل",
  final_settlement: "دفعة تسوية نهائية من العميل",
  discount_credit: "خصم مكتسب / تسوية دائنة",
};

/**
 * `shipment_financial_transactions.entry_status`
 */
export type FinancialTransactionStatus =
  | "pending_verification"
  | "posted"
  | "rejected";

export const FINANCIAL_TRANSACTION_STATUSES: readonly FinancialTransactionStatus[] = [
  "pending_verification",
  "posted",
  "rejected",
] as const;

export const FINANCIAL_TRANSACTION_STATUS_LABELS: Record<FinancialTransactionStatus, string> = {
  pending_verification: "بانتظار المراجعة والتحقق",
  posted: "معتمد ومرحّل للدفتر",
  rejected: "مرفوض",
};

/**
 * `shipment_financial_transactions.payment_method`
 */
export type FinancialPaymentMethod =
  | "bank_transfer"
  | "nafeza_epay"
  | "instapay"
  | "cash"
  | "cheque"
  | "pos_card"
  | "other";

export const FINANCIAL_PAYMENT_METHODS: readonly FinancialPaymentMethod[] = [
  "bank_transfer",
  "nafeza_epay",
  "instapay",
  "cash",
  "cheque",
  "pos_card",
  "other",
] as const;

export const FINANCIAL_PAYMENT_METHOD_LABELS: Record<FinancialPaymentMethod, string> = {
  bank_transfer: "تحويل بنكي",
  nafeza_epay: "منظومة الدفع الإلكتروني (نافذة)",
  instapay: "إنستا باي (InstaPay)",
  cash: "نقدي",
  cheque: "شيك بنكي",
  pos_card: "بطاقة بنكية / نقاط بيع (POS)",
  other: "وسيلة دفع أخرى",
};

/**
 * `shipment_financial_transactions.direction`
 * `1` = normal entry, `-1` = reversal entry (`reversal_of_transaction_id IS NOT NULL`).
 */
export type FinancialTransactionDirection = 1 | -1;

/**
 * Legacy Stage 9 backfill classification written by Migration 0019.
 */
export type LegacyFinancialResolution =
  | "no_prior_financial_data"
  | "migrated_verified_records"
  | "exempt_terminal_shipment"
  | "ambiguous_preserved_for_admin_review"
  | "reopened_requires_full_ledger_settlement";

/**
 * PostgreSQL `numeric(14,2)` values may arrive from Supabase/PostgREST as `number` or `string`.
 */
export type MonetaryNumericValue = number | string;

// ─── 2. Raw Database Row / Insert / Update Types ──────────────────────────────

/**
 * Raw row from `public.shipment_customs_obligations`.
 * Note: `assessed_amount` is `numeric(14,2)` in PostgreSQL and may arrive as `number | string`.
 */
export interface ShipmentCustomsObligationRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  claim_type: FinancialObligationClaimType;
  customs_claim_number: string | null;
  assessed_amount: MonetaryNumericValue; // numeric(14,2)
  currency: FinancialCurrency;
  status: FinancialObligationStatus;
  assessed_at: string; // timestamptz
  notes: string | null;
  created_by: string | null; // uuid -> profiles(id)
  updated_by: string | null; // uuid -> profiles(id)
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
}

export type ShipmentCustomsObligationInsert = {
  id?: string;
  shipment_id: string;
  claim_type?: FinancialObligationClaimType;
  customs_claim_number?: string | null;
  assessed_amount: MonetaryNumericValue;
  currency?: FinancialCurrency;
  status?: FinancialObligationStatus;
  assessed_at?: string;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ShipmentCustomsObligationUpdate = Partial<
  Omit<ShipmentCustomsObligationRow, "id" | "shipment_id" | "created_at">
>;

/**
 * Normalized domain representation of `shipment_customs_obligations` with exact 2-decimal `number`.
 */
export interface ShipmentCustomsObligation
  extends Omit<ShipmentCustomsObligationRow, "assessed_amount"> {
  assessed_amount: number;
}

/**
 * Raw row from `public.shipment_financial_transactions`.
 * Note: `amount` and `allocated_customs_amount` are `numeric(14,2)` in PostgreSQL
 * and may arrive as `number | string`.
 */
export interface ShipmentFinancialTransactionRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  customs_obligation_id: string | null; // uuid -> shipment_customs_obligations(id)
  entry_category: FinancialTransactionCategory;
  entry_type: FinancialTransactionType;
  entry_status: FinancialTransactionStatus;
  direction: FinancialTransactionDirection;
  amount: MonetaryNumericValue; // numeric(14,2) > 0
  allocated_customs_amount: MonetaryNumericValue; // numeric(14,2) >= 0 and <= amount
  currency: FinancialCurrency;
  is_billable_to_customer: boolean;
  customer_visible: boolean;
  payment_method: FinancialPaymentMethod | null;
  reference_number: string | null;
  recipient_or_counterparty: string | null;
  transaction_date: string; // timestamptz
  attachment_document_id: string | null; // uuid -> documents(id)
  description: string | null;
  idempotency_key: string;
  reversal_of_transaction_id: string | null; // uuid -> shipment_financial_transactions(id)
  reversal_reason: string | null;
  is_reversed: boolean;
  reversed_at: string | null; // timestamptz
  reversed_by: string | null; // uuid -> profiles(id)
  created_by: string; // uuid -> profiles(id)
  verified_by: string | null; // uuid -> profiles(id)
  verified_at: string | null; // timestamptz
  rejection_reason: string | null;
  created_at: string; // timestamptz
}

export type ShipmentFinancialTransactionInsert = {
  id?: string;
  shipment_id: string;
  customs_obligation_id?: string | null;
  entry_category: FinancialTransactionCategory;
  entry_type: FinancialTransactionType;
  entry_status?: FinancialTransactionStatus;
  direction?: FinancialTransactionDirection;
  amount: MonetaryNumericValue;
  allocated_customs_amount?: MonetaryNumericValue;
  currency?: FinancialCurrency;
  is_billable_to_customer?: boolean;
  customer_visible?: boolean;
  payment_method?: FinancialPaymentMethod | null;
  reference_number?: string | null;
  recipient_or_counterparty?: string | null;
  transaction_date?: string;
  attachment_document_id?: string | null;
  description?: string | null;
  idempotency_key: string;
  reversal_of_transaction_id?: string | null;
  reversal_reason?: string | null;
  is_reversed?: boolean;
  reversed_at?: string | null;
  reversed_by?: string | null;
  created_by: string;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
};

/**
 * Only verification/rejection, visibility, description/attachment, or reversal linkage columns
 * are mutable on `shipment_financial_transactions` per trigger `enforce_financial_transaction_integrity()` in Migration 0019.
 */
export type ShipmentFinancialTransactionUpdate = Partial<
  Pick<
    ShipmentFinancialTransactionRow,
    | "entry_status"
    | "customer_visible"
    | "verified_by"
    | "verified_at"
    | "rejection_reason"
    | "attachment_document_id"
    | "description"
    | "is_reversed"
    | "reversed_at"
    | "reversed_by"
  >
>;

/**
 * Normalized domain representation of `shipment_financial_transactions` with exact 2-decimal `number` fields.
 */
export interface ShipmentFinancialTransaction
  extends Omit<
    ShipmentFinancialTransactionRow,
    "amount" | "allocated_customs_amount"
  > {
  amount: number;
  allocated_customs_amount: number;
  /** Signed effective amount (`direction * amount`), e.g. `-amount` for reversal rows */
  signed_amount: number;
  /** Signed effective customs allocation (`direction * allocated_customs_amount`) */
  signed_allocated_customs_amount: number;
}

/**
 * Raw row from `public.shipment_financial_internal_notes` (Admin/Manager-only internal financial notes).
 */
export interface ShipmentFinancialInternalNoteRow {
  id: string; // uuid
  shipment_id: string; // uuid -> shipments(id)
  transaction_id: string | null; // uuid -> shipment_financial_transactions(id)
  note: string;
  created_by: string; // uuid -> profiles(id)
  created_at: string; // timestamptz
}

export type ShipmentFinancialInternalNoteInsert = {
  id?: string;
  shipment_id: string;
  transaction_id?: string | null;
  note: string;
  created_by: string;
  created_at?: string;
};

export type ShipmentFinancialInternalNoteUpdate = Partial<
  Pick<ShipmentFinancialInternalNoteRow, "note">
>;

export type ShipmentFinancialInternalNote = ShipmentFinancialInternalNoteRow;

/**
 * View row from `public.shipment_financial_migration_audit_v` (Admin/Manager audit view for legacy Stage 9).
 */
export interface ShipmentFinancialMigrationAuditRow {
  shipment_id: string;
  reference_number: string;
  shipment_status: string;
  stage_9_status: string;
  legacy_financial_resolution: LegacyFinancialResolution | string | null;
  legacy_financial_ambiguities: string[] | null;
  preserved_stage_9_data: Record<string, unknown>;
  completed_by: string | null;
  completed_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

// ─── 3. Authoritative Financial Summary & Customer Statement Types ────────────

/**
 * Raw RPC return row from `public.get_shipment_financial_summary(p_shipment_id uuid)`.
 * Numeric fields may be serialized as `number | string` by PostgREST.
 */
export interface ShipmentFinancialSummaryRaw {
  shipment_id: string;
  currency: FinancialCurrency;
  assessed_customs_obligation: MonetaryNumericValue;
  out_customs_disbursements: MonetaryNumericValue;
  other_out_disbursements: MonetaryNumericValue;
  total_out_disbursements: MonetaryNumericValue;
  billable_out_disbursements: MonetaryNumericValue;
  non_billable_out_disbursements: MonetaryNumericValue;
  verified_direct_customs_payments: MonetaryNumericValue;
  pending_direct_customs_payments: MonetaryNumericValue;
  total_customs_covered: MonetaryNumericValue;
  remaining_customs_obligation: MonetaryNumericValue;
  has_confirmed_final_price: boolean;
  confirmed_out_service_fee: MonetaryNumericValue;
  other_approved_customer_charges: MonetaryNumericValue;
  approved_credits: MonetaryNumericValue;
  total_customer_receivable_to_out: MonetaryNumericValue;
  total_received_by_out: MonetaryNumericValue;
  outstanding_balance_to_out: MonetaryNumericValue;
  is_customs_coverage_complete: boolean;
  is_financial_settlement_complete: boolean;
}

/**
 * Normalized authoritative financial summary for a shipment.
 * Matches `public.get_shipment_financial_summary(p_shipment_id uuid)` column-for-column
 * with normalized 2-decimal `number` values.
 */
export interface ShipmentFinancialSummary {
  shipment_id: string;
  currency: FinancialCurrency;
  // Track A: Customs Authority Obligation
  assessed_customs_obligation: number;
  out_customs_disbursements: number;
  other_out_disbursements: number;
  total_out_disbursements: number;
  billable_out_disbursements: number;
  non_billable_out_disbursements: number;
  verified_direct_customs_payments: number;
  pending_direct_customs_payments: number;
  total_customs_covered: number;
  remaining_customs_obligation: number;
  // Track B: OUT Receivable & Customer Settlement
  has_confirmed_final_price: boolean;
  confirmed_out_service_fee: number;
  other_approved_customer_charges: number;
  approved_credits: number;
  total_customer_receivable_to_out: number;
  total_received_by_out: number;
  outstanding_balance_to_out: number;
  // Authoritative Completion Gates
  is_customs_coverage_complete: boolean;
  is_financial_settlement_complete: boolean;
}

/**
 * Raw RPC return row from `public.get_customer_shipment_financial_statement(p_shipment_id uuid)`.
 */
export interface CustomerShipmentFinancialStatementItemRaw {
  transaction_id: string;
  shipment_id: string;
  entry_category: FinancialTransactionCategory;
  entry_type: FinancialTransactionType;
  direction: FinancialTransactionDirection;
  amount: MonetaryNumericValue;
  signed_amount: MonetaryNumericValue;
  currency: FinancialCurrency;
  payment_method: FinancialPaymentMethod | null;
  reference_number: string | null;
  transaction_date: string;
  description: string | null;
  is_reversed: boolean;
  reversal_of_transaction_id: string | null;
  reversal_reason: string | null;
  created_at: string;
}

/**
 * Customer-safe financial statement row.
 * Strictly excludes internal staff/audit fields (`created_by`, `verified_by`, `reversed_by`,
 * `idempotency_key`, `is_billable_to_customer`, `customer_visible`, `rejection_reason`,
 * and internal notes).
 */
export interface CustomerShipmentFinancialStatementItem {
  transaction_id: string;
  shipment_id: string;
  entry_category: FinancialTransactionCategory;
  entry_type: FinancialTransactionType;
  direction: FinancialTransactionDirection;
  amount: number;
  signed_amount: number;
  currency: FinancialCurrency;
  payment_method: FinancialPaymentMethod | null;
  reference_number: string | null;
  transaction_date: string;
  description: string | null;
  is_reversed: boolean;
  reversal_of_transaction_id: string | null;
  reversal_reason: string | null;
  created_at: string;
}

// ─── 4. Stage 9 Financial Gate Evaluation Types ───────────────────────────────

export type Stage9FinancialBlockingCode =
  | "final_price_not_confirmed"
  | "missing_customs_assessment"
  | "unverified_customs_payment"
  | "customs_coverage_incomplete"
  | "outstanding_balance_unpaid"
  | "overpayment_unsettled";

export interface Stage9FinancialBlockingReason {
  code: Stage9FinancialBlockingCode;
  message: string;
}

export interface Stage9FinancialGateEvaluation {
  canComplete: boolean;
  isCustomsCoverageComplete: boolean;
  hasConfirmedFinalPrice: boolean;
  isOutReceivableSettled: boolean;
  blockingReasons: Stage9FinancialBlockingReason[];
}
