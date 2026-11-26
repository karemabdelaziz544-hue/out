-- ============================================================
-- Migration: 0019_create_financial_ledger_and_payment_gates
-- Phase 2 — Step 1 Scope (Financial Ledger Database Foundation ONLY):
--   1. Prerequisites & Dependency Verification on Migration 0018.
--   2. Customs Obligations Table (public.shipment_customs_obligations)
--      separating official customs assessment from OUT receivables.
--   3. Immutable Append-Only Financial Ledger Table
--      (public.shipment_financial_transactions) and Internal Admin Notes Table
--      (public.shipment_financial_internal_notes).
--   4. Customs Allocation & Over-Coverage Prevention Trigger
--      supporting full OUT payment, full direct customer payment, split
--      OUT + customer payments, multiple partial direct payments, and
--      unverified pending submissions.
--   5. Append-Only Immutability & Double-Entry Reversal Trigger
--      (preserving original posted rows with direction = +1 and adding
--      equal opposite reversal rows with direction = -1, preventing double
--      subtraction and preventing double reversal).
--   6. Authoritative Financial Summary Function (public.get_shipment_financial_summary)
--      and Customer-Safe Statement Function (public.get_customer_shipment_financial_statement)
--      using exact numeric(14,2) arithmetic and reading shipment_pricing.final_price
--      from its single source of truth without double counting.
--   7. Strict Least-Privilege RLS Policies:
--      - admin: full financial management
--      - manager: read-only financial access across pricing, obligations, ledger, and Stage 9
--      - scout, inspector, data_entry: zero financial access
--      - customer: verified customer+company ownership check, customer-visible posted rows only
--   8. Database-Level Financial Workflow Gates in public.enforce_customs_stage_guards()
--      for stage_9_fees_payments and stage_10_clearance_release.
--   9. Non-Fabricating Historical Data Backfill & Ambiguity Audit View
--      (public.shipment_financial_migration_audit_v).
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

BEGIN;

-- ─── 0. Dependency Verification Guard (Requires Migration 0018) ───────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shipment_pricing'
      AND column_name = 'approval_type'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_DEPENDENCY_MISSING: Migration 0018_form46_regulatory_and_stage_security.sql must be applied before 0019.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shipment_customs_stages'
      AND column_name = 'assigned_to'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_DEPENDENCY_MISSING: shipment_customs_stages.assigned_to from Migration 0018 is required before 0019.';
  END IF;
END $$;

-- ─── 1. Hardened Role & Customer-Shipment Authorization Helpers ───────────────

-- Ensure is_admin() and is_admin_or_manager() verify active account status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
      AND COALESCE(provisioning_status, 'active') = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
      AND is_active = true
      AND COALESCE(provisioning_status, 'active') = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Verified Customer + Company Membership Authorization Helper
-- Does NOT authorize access merely because company_id matches:
-- Requires an active, provisioned customer profile whose auth.uid() owns the shipment
-- AND belongs to the shipment's linked company.
CREATE OR REPLACE FUNCTION public.is_authorized_customer_for_shipment(p_shipment_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shipments s
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE s.id = p_shipment_id
      AND p.role = 'customer'
      AND p.is_active = true
      AND COALESCE(p.provisioning_status, 'active') = 'active'
      AND s.customer_id = auth.uid()
      AND p.company_id IS NOT NULL
      AND s.company_id = p.company_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 2. Customs Obligations Table (public.shipment_customs_obligations) ──────

CREATE TABLE IF NOT EXISTS public.shipment_customs_obligations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id           uuid NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  claim_type            text NOT NULL DEFAULT 'primary_assessment'
                        CHECK (claim_type IN (
                          'primary_assessment',
                          'supplementary_assessment',
                          'penalty_or_demurrage'
                        )),
  customs_claim_number  text NULL,
  assessed_amount       numeric(14,2) NOT NULL CHECK (assessed_amount >= 0),
  currency              text NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
  status                text NOT NULL DEFAULT 'assessed'
                        CHECK (status IN (
                          'assessed',
                          'partially_covered',
                          'fully_covered',
                          'cancelled'
                        )),
  assessed_at           timestamptz NOT NULL DEFAULT now(),
  notes                 text NULL,
  created_by            uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by            uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- At most one active primary customs assessment per shipment
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_shipment_primary_customs_obligation
  ON public.shipment_customs_obligations (shipment_id)
  WHERE claim_type = 'primary_assessment' AND status <> 'cancelled';

-- Prevent duplicate claim numbers on the same shipment
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_shipment_customs_claim_number
  ON public.shipment_customs_obligations (shipment_id, btrim(lower(customs_claim_number)))
  WHERE customs_claim_number IS NOT NULL AND btrim(customs_claim_number) <> '' AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_shipment_customs_obligations_shipment
  ON public.shipment_customs_obligations (shipment_id);

DROP TRIGGER IF EXISTS shipment_customs_obligations_updated_at ON public.shipment_customs_obligations;
CREATE TRIGGER shipment_customs_obligations_updated_at
  BEFORE UPDATE ON public.shipment_customs_obligations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 3. Immutable Financial Ledger Table (public.shipment_financial_transactions) ─

CREATE TABLE IF NOT EXISTS public.shipment_financial_transactions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id                 uuid NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  customs_obligation_id       uuid NULL REFERENCES public.shipment_customs_obligations(id) ON DELETE RESTRICT,

  -- Accounting classification
  -- Note: Agreed OUT service fee is NEVER stored here (single source of truth is shipment_pricing.final_price).
  entry_category              text NOT NULL
                              CHECK (entry_category IN (
                                'out_disbursement',
                                'customer_charge',
                                'customer_payment_to_out',
                                'customer_direct_customs_payment',
                                'credit_adjustment'
                              )),
  entry_type                  text NOT NULL
                              CHECK (entry_type IN (
                                'customs_duties',
                                'government_fees',
                                'port_demurrage',
                                'inspection_fees',
                                'transport_fees',
                                'other_expense',
                                'extra_clearance_service',
                                'documentation_fee',
                                'storage_surcharge',
                                'other_charge',
                                'customer_installment',
                                'final_settlement',
                                'discount_credit'
                              )),
  entry_status                text NOT NULL DEFAULT 'posted'
                              CHECK (entry_status IN (
                                'pending_verification',
                                'posted',
                                'rejected'
                              )),

  -- Double-entry sign: +1 for original entries, -1 exclusively for reversal entries
  direction                   smallint NOT NULL DEFAULT 1
                              CHECK (direction IN (1, -1)),
  amount                      numeric(14,2) NOT NULL
                              CHECK (amount > 0),
  allocated_customs_amount    numeric(14,2) NOT NULL DEFAULT 0.00
                              CHECK (allocated_customs_amount >= 0 AND allocated_customs_amount <= amount),
  currency                    text NOT NULL DEFAULT 'EGP'
                              CHECK (currency = 'EGP'),

  -- Whether an OUT disbursement is chargeable to the customer (true) or absorbed by OUT (false)
  is_billable_to_customer     boolean NOT NULL DEFAULT true,
  customer_visible            boolean NOT NULL DEFAULT true,

  -- Payment & evidence metadata
  payment_method              text NULL
                              CHECK (payment_method IS NULL OR payment_method IN (
                                'bank_transfer',
                                'nafeza_epay',
                                'instapay',
                                'cash',
                                'cheque',
                                'pos_card',
                                'other'
                              )),
  reference_number            text NULL,
  recipient_or_counterparty   text NULL,
  transaction_date            timestamptz NOT NULL DEFAULT now(),
  attachment_document_id      uuid NULL REFERENCES public.documents(id) ON DELETE SET NULL,
  description                 text NULL,

  -- Idempotency & concurrency duplicate prevention
  idempotency_key             text NOT NULL,

  -- Traceable reversal linkage (original row stays entry_status = 'posted' with direction = +1;
  -- reversal row has direction = -1 and points to the original row via reversal_of_transaction_id)
  reversal_of_transaction_id  uuid NULL UNIQUE REFERENCES public.shipment_financial_transactions(id) ON DELETE RESTRICT,
  reversal_reason             text NULL,
  is_reversed                 boolean NOT NULL DEFAULT false,
  reversed_at                 timestamptz NULL,
  reversed_by                 uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Verification & audit actor columns
  created_by                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  verified_by                 uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at                 timestamptz NULL,
  rejection_reason            text NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),

  -- Structural Category <-> Type Consistency Constraint
  CONSTRAINT shipment_financial_tx_category_type_check CHECK (
    (
      entry_category = 'out_disbursement'
      AND entry_type IN ('customs_duties', 'government_fees', 'port_demurrage', 'inspection_fees', 'transport_fees', 'other_expense')
    )
    OR (
      entry_category = 'customer_charge'
      AND entry_type IN ('extra_clearance_service', 'documentation_fee', 'storage_surcharge', 'other_charge')
      AND is_billable_to_customer = true
    )
    OR (
      entry_category = 'customer_payment_to_out'
      AND entry_type IN ('customer_installment', 'final_settlement')
      AND is_billable_to_customer = true
    )
    OR (
      entry_category = 'customer_direct_customs_payment'
      AND entry_type = 'customs_duties'
      AND is_billable_to_customer = false
    )
    OR (
      entry_category = 'credit_adjustment'
      AND entry_type = 'discount_credit'
      AND is_billable_to_customer = true
    )
  ),

  -- Customs Allocation Consistency Constraint:
  -- Only customs_duties entries (paid by OUT or paid directly by customer) may allocate against a customs obligation,
  -- and any customs_duties entry MUST link to a customs_obligation_id with allocated_customs_amount > 0.
  CONSTRAINT shipment_financial_tx_customs_allocation_check CHECK (
    (
      entry_type = 'customs_duties'
      AND customs_obligation_id IS NOT NULL
      AND allocated_customs_amount > 0
      AND allocated_customs_amount = amount
    )
    OR (
      entry_type <> 'customs_duties'
      AND customs_obligation_id IS NULL
      AND allocated_customs_amount = 0
    )
  ),

  -- Payment Reference & Method Requirement for Posted Cash/Bank Movements
  CONSTRAINT shipment_financial_tx_payment_evidence_check CHECK (
    entry_category NOT IN ('out_disbursement', 'customer_payment_to_out', 'customer_direct_customs_payment')
    OR (
      payment_method IS NOT NULL
      AND reference_number IS NOT NULL
      AND length(btrim(reference_number)) >= 2
    )
  ),

  -- Direct Customer Customs Payment Verification Rule:
  -- When posted, a direct customer customs payment must have verified_by, verified_at, and reference_number.
  CONSTRAINT shipment_financial_tx_direct_customs_verification_check CHECK (
    entry_category <> 'customer_direct_customs_payment'
    OR entry_status <> 'posted'
    OR (
      verified_by IS NOT NULL
      AND verified_at IS NOT NULL
      AND reference_number IS NOT NULL
      AND length(btrim(reference_number)) >= 2
    )
  ),

  -- Reversal Integrity Constraint:
  -- Direction = -1 is allowed ONLY when reversal_of_transaction_id IS NOT NULL and reversal_reason is provided.
  -- Direction = +1 is allowed ONLY when reversal_of_transaction_id IS NULL.
  CONSTRAINT shipment_financial_tx_reversal_integrity_check CHECK (
    (
      direction = 1
      AND reversal_of_transaction_id IS NULL
      AND reversal_reason IS NULL
    )
    OR (
      direction = -1
      AND reversal_of_transaction_id IS NOT NULL
      AND reversal_reason IS NOT NULL
      AND length(btrim(reversal_reason)) >= 3
      AND entry_status = 'posted'
      AND is_reversed = false
    )
  ),

  -- Customer Visibility Privacy Constraint:
  -- Non-billable internal OUT expenses and unverified/rejected entries can NEVER be marked customer_visible = true.
  CONSTRAINT shipment_financial_tx_customer_visibility_check CHECK (
    customer_visible = false
    OR (
      entry_status = 'posted'
      AND (entry_category <> 'out_disbursement' OR is_billable_to_customer = true)
    )
  )
);

-- Idempotency constraint per shipment (prevents duplicate concurrent submissions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_financial_tx_idempotency
  ON public.shipment_financial_transactions (shipment_id, idempotency_key);

-- Active Payment Reference Uniqueness Index:
-- Prevents recording the same payment reference twice on the same shipment & category
-- unless the original transaction was reversed (is_reversed = true) or rejected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_financial_tx_active_reference
  ON public.shipment_financial_transactions (
    shipment_id,
    entry_category,
    btrim(lower(reference_number))
  )
  WHERE reference_number IS NOT NULL
    AND direction = 1
    AND is_reversed = false
    AND entry_status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_financial_tx_shipment_created
  ON public.shipment_financial_transactions (shipment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_tx_customs_obligation
  ON public.shipment_financial_transactions (customs_obligation_id)
  WHERE customs_obligation_id IS NOT NULL;

-- Separate Admin/Manager-Only Internal Notes Table (Guarantees Zero Leakage to Customers)
CREATE TABLE IF NOT EXISTS public.shipment_financial_internal_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  transaction_id  uuid NULL REFERENCES public.shipment_financial_transactions(id) ON DELETE RESTRICT,
  note            text NOT NULL CHECK (length(btrim(note)) >= 2),
  created_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_internal_notes_shipment
  ON public.shipment_financial_internal_notes (shipment_id, created_at DESC);

-- ─── 4. Append-Only Immutability, Reversal & Customs Allocation Triggers ──────

CREATE OR REPLACE FUNCTION public.enforce_financial_transaction_integrity()
RETURNS trigger AS $$
DECLARE
  v_orig public.shipment_financial_transactions%ROWTYPE;
  v_obligation public.shipment_customs_obligations%ROWTYPE;
  v_current_customs_covered numeric(14,2);
BEGIN
  -- 1. Never allow DELETE on shipment_financial_transactions
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_LEDGER: لا يمكن حذف أي قيد مالي من دفتر الأستاذ؛ استخدم قيد العكس (Reversal) لتصحيح الأخطاء.';
  END IF;

  -- 2. Restrict UPDATE on shipment_financial_transactions to state transitions ONLY
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
       OR NEW.customs_obligation_id IS DISTINCT FROM OLD.customs_obligation_id
       OR NEW.entry_category IS DISTINCT FROM OLD.entry_category
       OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
       OR NEW.direction IS DISTINCT FROM OLD.direction
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.allocated_customs_amount IS DISTINCT FROM OLD.allocated_customs_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.is_billable_to_customer IS DISTINCT FROM OLD.is_billable_to_customer
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
       OR NEW.recipient_or_counterparty IS DISTINCT FROM OLD.recipient_or_counterparty
       OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.reversal_of_transaction_id IS DISTINCT FROM OLD.reversal_of_transaction_id
       OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_LEDGER: لا يمكن تعديل المبالغ أو المراجع أو التواريخ أو الهويات في قيد مالي مسجل.';
    END IF;

    -- Once posted, entry_status can NEVER change (cannot be unposted or marked rejected)
    IF OLD.entry_status = 'posted' AND NEW.entry_status IS DISTINCT FROM 'posted' THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_LEDGER: لا يمكن تغيير حالة قيد مالي مرحّل (posted)؛ يجب إدراج قيد عكسي.';
    END IF;

    -- Once rejected, entry_status can NEVER change
    IF OLD.entry_status = 'rejected' AND NEW.entry_status IS DISTINCT FROM 'rejected' THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_LEDGER: لا يمكن إعادة تفعيل قيد مرفوض؛ قم بإنشاء قيد جديد.';
    END IF;

    -- Once marked is_reversed = true, it cannot be unmarked
    IF OLD.is_reversed = true AND NEW.is_reversed = false THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_LEDGER: لا يمكن إلغاء علامة العكس عن قيد تم عكسه مسبقاً.';
    END IF;
  END IF;

  -- 3. Validate Reversal Entry on INSERT (when direction = -1)
  IF TG_OP = 'INSERT' AND NEW.direction = -1 THEN
    SELECT * INTO v_orig
    FROM public.shipment_financial_transactions
    WHERE id = NEW.reversal_of_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_REVERSAL_TARGET: القيد الأصلي المطلوب عكسه غير موجود.';
    END IF;

    IF v_orig.shipment_id <> NEW.shipment_id THEN
      RAISE EXCEPTION 'INVALID_REVERSAL_TARGET: القيد العكسي يجب أن ينتمي لنفس الشحنة الخاصة بالقيد الأصلي.';
    END IF;

    IF v_orig.direction <> 1 THEN
      RAISE EXCEPTION 'INVALID_REVERSAL_TARGET: لا يمكن عكس قيد عكسي آخر.';
    END IF;

    IF v_orig.entry_status <> 'posted' THEN
      RAISE EXCEPTION 'INVALID_REVERSAL_TARGET: لا يمكن عكس قيد غير مرحّل (pending_verification أو rejected).';
    END IF;

    IF v_orig.is_reversed = true THEN
      RAISE EXCEPTION 'DUPLICATE_REVERSAL: هذا القيد تم عكسه مسبقاً ولا يمكن عكسه مرة أخرى.';
    END IF;

    IF NEW.amount <> v_orig.amount
       OR NEW.allocated_customs_amount <> v_orig.allocated_customs_amount
       OR NEW.entry_category <> v_orig.entry_category
       OR NEW.entry_type <> v_orig.entry_type
       OR NEW.customs_obligation_id IS DISTINCT FROM v_orig.customs_obligation_id
       OR NEW.is_billable_to_customer IS DISTINCT FROM v_orig.is_billable_to_customer
       OR NEW.customer_visible IS DISTINCT FROM v_orig.customer_visible
    THEN
      RAISE EXCEPTION 'REVERSAL_MISMATCH: القيد العكسي يجب أن يطابق القيد الأصلي تماماً في المبلغ والفئة والنوع والتخصيص الجمركي.';
    END IF;
  END IF;

  -- 4. Validate Customs Obligation Ownership & Prevent Duplicate/Over-Coverage
  IF NEW.customs_obligation_id IS NOT NULL THEN
    -- Lock the customs obligation row to serialize concurrent customs payment insertions/verifications
    SELECT * INTO v_obligation
    FROM public.shipment_customs_obligations
    WHERE id = NEW.customs_obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_CUSTOMS_OBLIGATION: سجل المطالبة الجمركية المحدد غير موجود.';
    END IF;

    IF v_obligation.shipment_id <> NEW.shipment_id THEN
      RAISE EXCEPTION 'INVALID_CUSTOMS_OBLIGATION: المطالبة الجمركية لا تنتمي لهذه الشحنة.';
    END IF;

    IF v_obligation.status = 'cancelled' THEN
      RAISE EXCEPTION 'INVALID_CUSTOMS_OBLIGATION: لا يمكن تخصيص دفعة جمركية على مطالبة ملغاة.';
    END IF;

    -- When a positive customs entry is being posted (either on INSERT with 'posted' or UPDATE from 'pending_verification' to 'posted')
    IF NEW.direction = 1
       AND NEW.entry_status = 'posted'
       AND (TG_OP = 'INSERT' OR OLD.entry_status <> 'posted')
    THEN
      SELECT COALESCE(SUM(direction * allocated_customs_amount), 0.00)::numeric(14,2)
      INTO v_current_customs_covered
      FROM public.shipment_financial_transactions
      WHERE customs_obligation_id = NEW.customs_obligation_id
        AND entry_status = 'posted'
        AND id <> NEW.id;

      IF (v_current_customs_covered + NEW.allocated_customs_amount) > v_obligation.assessed_amount THEN
        RAISE EXCEPTION 'CUSTOMS_OBLIGATION_OVERALLOCATION: مجموع مبالغ تغطية المطالبة الجمركية (% ج.م) يتجاوز قيمة المطالبة الرسمية المقررة (% ج.م).',
          (v_current_customs_covered + NEW.allocated_customs_amount),
          v_obligation.assessed_amount;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_financial_tx_integrity ON public.shipment_financial_transactions;
CREATE TRIGGER trg_enforce_financial_tx_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.shipment_financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_financial_transaction_integrity();

-- After-Insert / After-Update Trigger:
-- 1. Marks the original transaction `is_reversed = true` when a reversal row is inserted
--    (while keeping original `entry_status = 'posted'` so `SUM(direction * amount)` is exact).
-- 2. Updates `shipment_customs_obligations.status` ('assessed' | 'partially_covered' | 'fully_covered').
-- 3. Automatically reopens `stage_9_fees_payments` if a reversal or new charge makes a previously
--    completed financial stage unsettled.
CREATE OR REPLACE FUNCTION public.sync_after_financial_transaction()
RETURNS trigger AS $$
DECLARE
  v_net_covered numeric(14,2);
  v_assessed numeric(14,2);
  v_summary record;
BEGIN
  -- 1. Mark original row as reversed (informational metadata flag; original stays 'posted')
  IF TG_OP = 'INSERT' AND NEW.direction = -1 AND NEW.reversal_of_transaction_id IS NOT NULL THEN
    UPDATE public.shipment_financial_transactions
    SET
      is_reversed = true,
      reversed_at = NEW.created_at,
      reversed_by = NEW.created_by
    WHERE id = NEW.reversal_of_transaction_id;
  END IF;

  -- 2. Recompute customs obligation coverage status if linked
  IF NEW.customs_obligation_id IS NOT NULL THEN
    SELECT assessed_amount INTO v_assessed
    FROM public.shipment_customs_obligations
    WHERE id = NEW.customs_obligation_id;

    SELECT COALESCE(SUM(direction * allocated_customs_amount), 0.00)::numeric(14,2)
    INTO v_net_covered
    FROM public.shipment_financial_transactions
    WHERE customs_obligation_id = NEW.customs_obligation_id
      AND entry_status = 'posted';

    UPDATE public.shipment_customs_obligations
    SET
      status = CASE
        WHEN v_assessed > 0 AND v_net_covered >= v_assessed THEN 'fully_covered'
        WHEN v_net_covered > 0 THEN 'partially_covered'
        ELSE 'assessed'
      END,
      updated_at = now()
    WHERE id = NEW.customs_obligation_id
      AND status <> 'cancelled';
  END IF;

  -- 3. If stage_9_fees_payments was 'completed' and a reversal or new charge makes settlement incomplete,
  --    automatically transition stage_9_fees_payments back to 'in_progress' while preserving all history.
  SELECT * INTO v_summary
  FROM public.get_shipment_financial_summary(NEW.shipment_id);

  IF v_summary.is_financial_settlement_complete IS NOT TRUE THEN
    UPDATE public.shipment_customs_stages
    SET
      status = 'in_progress',
      completed_at = NULL,
      completed_by = NULL,
      updated_at = now(),
      updated_by = COALESCE(auth.uid(), NEW.created_by)
    WHERE shipment_id = NEW.shipment_id
      AND stage_key = 'stage_9_fees_payments'
      AND status = 'completed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_after_financial_tx ON public.shipment_financial_transactions;
CREATE TRIGGER trg_sync_after_financial_tx
  AFTER INSERT OR UPDATE ON public.shipment_financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_after_financial_transaction();

-- Prevent reducing assessed_amount on shipment_customs_obligations below already-posted coverage
CREATE OR REPLACE FUNCTION public.enforce_customs_obligation_bounds()
RETURNS trigger AS $$
DECLARE
  v_net_covered numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_CUSTOMS_OBLIGATION: لا يمكن حذف مطالبة جمركية مسجلة؛ يمكن إلغاؤها فقط إذا لم يكن عليها دفعات مرحّلة.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(direction * allocated_customs_amount), 0.00)::numeric(14,2)
    INTO v_net_covered
    FROM public.shipment_financial_transactions
    WHERE customs_obligation_id = NEW.id
      AND entry_status = 'posted';

    IF NEW.status = 'cancelled' AND v_net_covered > 0 THEN
      RAISE EXCEPTION 'CUSTOMS_OBLIGATION_HAS_PAYMENTS: لا يمكن إلغاء مطالبة جمركية عليها دفعات مرحّلة بقيمة % ج.م قبل عكس تلك الدفعات.', v_net_covered;
    END IF;

    IF NEW.assessed_amount < v_net_covered THEN
      RAISE EXCEPTION 'CUSTOMS_OBLIGATION_BELOW_COVERED: لا يمكن تخفيض قيمة المطالبة الجمركية (% ج.م) لأقل من المبالغ المرحّلة لتغطيتها (% ج.م).',
        NEW.assessed_amount, v_net_covered;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_customs_obligation_bounds ON public.shipment_customs_obligations;
CREATE TRIGGER trg_enforce_customs_obligation_bounds
  BEFORE UPDATE OR DELETE ON public.shipment_customs_obligations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customs_obligation_bounds();

-- ─── 5. Authoritative Financial Summary & Customer Statement Functions ────────

CREATE OR REPLACE FUNCTION public.get_shipment_financial_summary(p_shipment_id uuid)
RETURNS TABLE (
  shipment_id                           uuid,
  currency                              text,
  assessed_customs_obligation           numeric(14,2),
  out_customs_disbursements             numeric(14,2),
  other_out_disbursements               numeric(14,2),
  total_out_disbursements               numeric(14,2),
  billable_out_disbursements            numeric(14,2),
  non_billable_out_disbursements        numeric(14,2),
  verified_direct_customs_payments      numeric(14,2),
  pending_direct_customs_payments       numeric(14,2),
  total_customs_covered                 numeric(14,2),
  remaining_customs_obligation          numeric(14,2),
  has_confirmed_final_price             boolean,
  confirmed_out_service_fee             numeric(14,2),
  other_approved_customer_charges       numeric(14,2),
  approved_credits                      numeric(14,2),
  total_customer_receivable_to_out      numeric(14,2),
  total_received_by_out                 numeric(14,2),
  outstanding_balance_to_out            numeric(14,2),
  is_customs_coverage_complete          boolean,
  is_financial_settlement_complete      boolean
) AS $$
DECLARE
  v_is_authorized boolean := false;
  v_assessed_customs numeric(14,2) := 0.00;
  v_out_customs numeric(14,2) := 0.00;
  v_other_out numeric(14,2) := 0.00;
  v_billable_out numeric(14,2) := 0.00;
  v_non_billable_out numeric(14,2) := 0.00;
  v_verified_direct_customs numeric(14,2) := 0.00;
  v_pending_direct_customs numeric(14,2) := 0.00;
  v_has_final_price boolean := false;
  v_service_fee numeric(14,2) := 0.00;
  v_other_charges numeric(14,2) := 0.00;
  v_credits numeric(14,2) := 0.00;
  v_received_by_out numeric(14,2) := 0.00;
  v_total_customs_covered numeric(14,2) := 0.00;
  v_remaining_customs numeric(14,2) := 0.00;
  v_total_receivable numeric(14,2) := 0.00;
  v_outstanding_to_out numeric(14,2) := 0.00;
  v_customs_complete boolean := false;
  v_settlement_complete boolean := false;
BEGIN
  -- 1. Strict Authorization Guard:
  -- Allow service_role/postgres internal triggers (auth.uid() IS NULL) OR active Admin/Manager OR verified Shipment Customer
  IF auth.uid() IS NOT NULL THEN
    IF public.is_admin_or_manager() OR public.is_authorized_customer_for_shipment(p_shipment_id) THEN
      v_is_authorized := true;
    END IF;
    IF NOT v_is_authorized THEN
      RAISE EXCEPTION 'UNAUTHORIZED_FINANCIAL_ACCESS: غير مصرح لك بالوصول إلى البيانات المالية لهذه الشحنة.';
    END IF;
  END IF;

  -- 2. Assessed Customs Obligation (sum of active obligations on the shipment)
  SELECT COALESCE(SUM(o.assessed_amount), 0.00)::numeric(14,2)
  INTO v_assessed_customs
  FROM public.shipment_customs_obligations o
  WHERE o.shipment_id = p_shipment_id
    AND o.status <> 'cancelled';

  -- 3. Confirmed OUT Service Fee (Single Source of Truth: public.shipment_pricing)
  -- Included ONCE and ONLY when status = 'customer_approved', approval_type = 'final_fixed', and final_price IS NOT NULL
  SELECT
    (
      sp.status = 'customer_approved'
      AND sp.approval_type = 'final_fixed'
      AND sp.final_price IS NOT NULL
      AND sp.final_price > 0
    ),
    CASE
      WHEN sp.status = 'customer_approved'
           AND sp.approval_type = 'final_fixed'
           AND sp.final_price IS NOT NULL
           AND sp.final_price > 0
        THEN ROUND(sp.final_price::numeric, 2)
      ELSE 0.00
    END
  INTO v_has_final_price, v_service_fee
  FROM public.shipment_pricing sp
  WHERE sp.shipment_id = p_shipment_id;

  v_has_final_price := COALESCE(v_has_final_price, false);
  v_service_fee := COALESCE(v_service_fee, 0.00);

  -- 4. Aggregate Ledger Movements using Double-Entry Net Sum: SUM(direction * amount) WHERE entry_status = 'posted'
  --    Because original rows stay 'posted' (+1) and reversal rows are 'posted' (-1),
  --    reversed pairs sum to 0.00 without any risk of double subtraction.
  SELECT
    -- OUT customs disbursements (posted net)
    COALESCE(SUM(t.direction * t.amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'out_disbursement'
        AND t.entry_type = 'customs_duties'
    ), 0.00)::numeric(14,2),

    -- Other OUT disbursements (posted net)
    COALESCE(SUM(t.direction * t.amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'out_disbursement'
        AND t.entry_type <> 'customs_duties'
    ), 0.00)::numeric(14,2),

    -- Billable OUT disbursements charged to customer (posted net)
    COALESCE(SUM(t.direction * t.amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'out_disbursement'
        AND t.is_billable_to_customer = true
    ), 0.00)::numeric(14,2),

    -- Non-billable OUT disbursements absorbed by OUT (posted net; hidden from customer)
    CASE
      WHEN auth.uid() IS NULL OR public.is_admin_or_manager() THEN
        COALESCE(SUM(t.direction * t.amount) FILTER (
          WHERE t.entry_status = 'posted'
            AND t.entry_category = 'out_disbursement'
            AND t.is_billable_to_customer = false
        ), 0.00)::numeric(14,2)
      ELSE 0.00::numeric(14,2)
    END,

    -- Verified direct customer customs payments (posted net — NEVER counted as money received by OUT)
    COALESCE(SUM(t.direction * t.allocated_customs_amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'customer_direct_customs_payment'
    ), 0.00)::numeric(14,2),

    -- Pending (unverified) direct customer customs payments
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.entry_status = 'pending_verification'
        AND t.entry_category = 'customer_direct_customs_payment'
        AND t.direction = 1
    ), 0.00)::numeric(14,2),

    -- Other approved customer charges (posted net)
    COALESCE(SUM(t.direction * t.amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'customer_charge'
    ), 0.00)::numeric(14,2),

    -- Approved customer credits / discounts (posted net)
    COALESCE(SUM(t.direction * t.amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'credit_adjustment'
    ), 0.00)::numeric(14,2),

    -- Total payments physically received by OUT from customer (posted net)
    COALESCE(SUM(t.direction * t.amount) FILTER (
      WHERE t.entry_status = 'posted'
        AND t.entry_category = 'customer_payment_to_out'
    ), 0.00)::numeric(14,2)
  INTO
    v_out_customs,
    v_other_out,
    v_billable_out,
    v_non_billable_out,
    v_verified_direct_customs,
    v_pending_direct_customs,
    v_other_charges,
    v_credits,
    v_received_by_out
  FROM public.shipment_financial_transactions t
  WHERE t.shipment_id = p_shipment_id;

  -- 5. Compute Independent Customs Coverage Metrics
  v_total_customs_covered := (v_out_customs + v_verified_direct_customs)::numeric(14,2);
  v_remaining_customs := GREATEST(0.00, (v_assessed_customs - v_total_customs_covered))::numeric(14,2);
  v_customs_complete := (
    v_assessed_customs > 0.00
    AND v_total_customs_covered = v_assessed_customs
    AND v_pending_direct_customs = 0.00
  );

  -- 6. Compute Independent OUT Receivable & Outstanding Balance Metrics
  --    Total Customer Receivable to OUT = Billable OUT Disbursements + Confirmed OUT Service Fee + Other Approved Charges - Approved Credits
  v_total_receivable := (v_billable_out + v_service_fee + v_other_charges - v_credits)::numeric(14,2);
  v_outstanding_to_out := (v_total_receivable - v_received_by_out)::numeric(14,2);

  -- 7. Complete Financial Settlement Gate Evaluation
  v_settlement_complete := (
    v_has_final_price = true
    AND v_customs_complete = true
    AND v_total_receivable >= 0.00
    AND v_outstanding_to_out = 0.00
  );

  RETURN QUERY SELECT
    p_shipment_id,
    'EGP'::text,
    v_assessed_customs,
    v_out_customs,
    case when auth.uid() is null or public.is_admin_or_manager() then v_other_out else (v_billable_out - v_out_customs)::numeric(14,2) end,
    case when auth.uid() is null or public.is_admin_or_manager() then (v_out_customs + v_other_out)::numeric(14,2) else v_billable_out end,
    v_billable_out,
    v_non_billable_out,
    v_verified_direct_customs,
    v_pending_direct_customs,
    v_total_customs_covered,
    v_remaining_customs,
    v_has_final_price,
    v_service_fee,
    v_other_charges,
    v_credits,
    v_total_receivable,
    v_received_by_out,
    v_outstanding_to_out,
    v_customs_complete,
    v_settlement_complete;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_shipment_financial_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shipment_financial_summary(uuid) TO authenticated;

-- Customer-Safe Financial Statement RPC (Exposes ONLY verified, posted, customer-visible items without internal staff IDs)
CREATE OR REPLACE FUNCTION public.get_customer_shipment_financial_statement(p_shipment_id uuid)
RETURNS TABLE (
  transaction_id              uuid,
  shipment_id                 uuid,
  entry_category              text,
  entry_type                  text,
  direction                   smallint,
  amount                      numeric(14,2),
  signed_amount               numeric(14,2),
  currency                    text,
  payment_method              text,
  reference_number            text,
  transaction_date            timestamptz,
  description                 text,
  is_reversed                 boolean,
  reversal_of_transaction_id  uuid,
  reversal_reason             text,
  created_at                  timestamptz
) AS $$
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_authorized_customer_for_shipment(p_shipment_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_FINANCIAL_ACCESS: غير مصرح لك بعرض كشف الحساب المالي لهذه الشحنة.';
  END IF;

  RETURN QUERY
  SELECT
    t.id AS transaction_id,
    t.shipment_id,
    t.entry_category,
    t.entry_type,
    t.direction,
    t.amount,
    (t.direction * t.amount)::numeric(14,2) AS signed_amount,
    t.currency,
    t.payment_method,
    t.reference_number,
    t.transaction_date,
    t.description,
    t.is_reversed,
    t.reversal_of_transaction_id,
    t.reversal_reason,
    t.created_at
  FROM public.shipment_financial_transactions t
  WHERE t.shipment_id = p_shipment_id
    AND t.entry_status = 'posted'
    AND t.customer_visible = true
    AND (t.entry_category <> 'out_disbursement' OR t.is_billable_to_customer = true)
  ORDER BY t.transaction_date ASC, t.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_customer_shipment_financial_statement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_shipment_financial_statement(uuid) TO authenticated;

-- ─── 6. Least-Privilege RLS Policies for Financial Tables & Stages ────────────

ALTER TABLE public.shipment_customs_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_financial_internal_notes ENABLE ROW LEVEL SECURITY;

-- 6.1 RLS on public.shipment_customs_obligations
DROP POLICY IF EXISTS "customs_obligations_select_admin_manager" ON public.shipment_customs_obligations;
CREATE POLICY "customs_obligations_select_admin_manager"
  ON public.shipment_customs_obligations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "customs_obligations_all_admin" ON public.shipment_customs_obligations;
CREATE POLICY "customs_obligations_all_admin"
  ON public.shipment_customs_obligations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "customs_obligations_select_customer_own" ON public.shipment_customs_obligations;
CREATE POLICY "customs_obligations_select_customer_own"
  ON public.shipment_customs_obligations
  FOR SELECT
  TO authenticated
  USING (
    status <> 'cancelled'
    AND public.is_authorized_customer_for_shipment(shipment_id)
  );

-- 6.2 RLS on public.shipment_financial_transactions
-- Admin & Manager: SELECT all financial transactions
DROP POLICY IF EXISTS "financial_tx_select_admin_manager" ON public.shipment_financial_transactions;
CREATE POLICY "financial_tx_select_admin_manager"
  ON public.shipment_financial_transactions
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

-- Admin ONLY: INSERT new financial transactions
DROP POLICY IF EXISTS "financial_tx_insert_admin" ON public.shipment_financial_transactions;
CREATE POLICY "financial_tx_insert_admin"
  ON public.shipment_financial_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND created_by = auth.uid()
  );

-- Admin ONLY: UPDATE verification/rejection state (all amount/reference columns locked by trigger)
DROP POLICY IF EXISTS "financial_tx_update_admin" ON public.shipment_financial_transactions;
CREATE POLICY "financial_tx_update_admin"
  ON public.shipment_financial_transactions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Customer: SELECT only posted, customer-visible, billable rows for shipments they are authorized to access
DROP POLICY IF EXISTS "financial_tx_select_customer_own" ON public.shipment_financial_transactions;
CREATE POLICY "financial_tx_select_customer_own"
  ON public.shipment_financial_transactions
  FOR SELECT
  TO authenticated
  USING (
    entry_status = 'posted'
    AND customer_visible = true
    AND (entry_category <> 'out_disbursement' OR is_billable_to_customer = true)
    AND public.is_authorized_customer_for_shipment(shipment_id)
  );

-- 6.3 RLS on public.shipment_financial_internal_notes (Strictly Admin & Manager ONLY; zero customer/staff access)
DROP POLICY IF EXISTS "financial_internal_notes_select_admin_manager" ON public.shipment_financial_internal_notes;
CREATE POLICY "financial_internal_notes_select_admin_manager"
  ON public.shipment_financial_internal_notes
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "financial_internal_notes_insert_admin" ON public.shipment_financial_internal_notes;
CREATE POLICY "financial_internal_notes_insert_admin"
  ON public.shipment_financial_internal_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND created_by = auth.uid()
  );

-- 6.4 Tighten Customer RLS on shipment_pricing & shipment_pricing_history to use verified customer helper
DROP POLICY IF EXISTS "pricing_select_own" ON public.shipment_pricing;
CREATE POLICY "pricing_select_own"
  ON public.shipment_pricing
  FOR SELECT
  TO authenticated
  USING (public.is_authorized_customer_for_shipment(shipment_id));

DROP POLICY IF EXISTS "pricing_update_customer" ON public.shipment_pricing;
CREATE POLICY "pricing_update_customer"
  ON public.shipment_pricing
  FOR UPDATE
  TO authenticated
  USING (public.is_authorized_customer_for_shipment(shipment_id))
  WITH CHECK (
    public.is_authorized_customer_for_shipment(shipment_id)
    AND status IN ('negotiation_requested', 'customer_approved')
  );

DROP POLICY IF EXISTS "pricing_history_select_own" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_select_own"
  ON public.shipment_pricing_history
  FOR SELECT
  TO authenticated
  USING (public.is_authorized_customer_for_shipment(shipment_id));

DROP POLICY IF EXISTS "pricing_history_insert_customer" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_insert_customer"
  ON public.shipment_pricing_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_authorized_customer_for_shipment(shipment_id)
    AND performed_by = auth.uid()
    AND action IN ('negotiation_requested', 'customer_approved')
  );

-- 6.5 Enforce Manager Read-Only Financial Access on shipment_customs_stages & history
--     (Manager can SELECT all stages, and write non-financial stages 1, 3..8, 10,
--      but ONLY Admin can write stage_2_pricing and stage_9_fees_payments!)
DROP POLICY IF EXISTS "customs_stages_all_admin_manager" ON public.shipment_customs_stages;
DROP POLICY IF EXISTS "customs_stages_select_admin_manager" ON public.shipment_customs_stages;
DROP POLICY IF EXISTS "customs_stages_write_admin" ON public.shipment_customs_stages;
DROP POLICY IF EXISTS "customs_stages_write_manager_non_financial" ON public.shipment_customs_stages;

CREATE POLICY "customs_stages_select_admin_manager"
  ON public.shipment_customs_stages
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

CREATE POLICY "customs_stages_write_admin"
  ON public.shipment_customs_stages
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "customs_stages_write_manager_non_financial"
  ON public.shipment_customs_stages
  FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_manager()
    AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
  )
  WITH CHECK (
    public.is_admin_or_manager()
    AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
  );

-- Tighten customer stage SELECT to use verified customer helper
DROP POLICY IF EXISTS "customs_stages_select_customer_own" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_select_customer_own"
  ON public.shipment_customs_stages
  FOR SELECT
  TO authenticated
  USING (public.is_authorized_customer_for_shipment(shipment_id));

-- Tighten stage history INSERT so Manager cannot insert history for financial stages
DROP POLICY IF EXISTS "customs_stage_history_insert_authorized_staff" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_insert_authorized_staff"
  ON public.shipment_customs_stage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.is_admin()
      OR (
        public.is_admin_or_manager()
        AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
      )
      OR (
        public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
        AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
        AND public.is_staff_assigned_to_shipment(shipment_id)
      )
    )
  );

-- ─── 7. Database-Level Financial Workflow Gates in enforce_customs_stage_guards ─

CREATE OR REPLACE FUNCTION public.enforce_customs_stage_guards()
RETURNS trigger AS $$
DECLARE
  v_role public.user_role;
  v_unapproved_count integer;
  v_fin_summary record;
  v_stage9_row public.shipment_customs_stages%ROWTYPE;
  v_shipment_status text;
BEGIN
  v_role := public.get_auth_user_role();

  -- 1. Operational staff structural column immutability guard
  IF auth.uid() IS NOT NULL AND v_role NOT IN ('admin', 'manager') THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
         OR NEW.stage_key IS DISTINCT FROM OLD.stage_key
         OR NEW.stage_order IS DISTINCT FROM OLD.stage_order
         OR NEW.expected_role IS DISTINCT FROM OLD.expected_role
         OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
         OR NEW.is_applicable IS DISTINCT FROM OLD.is_applicable
      THEN
        RAISE EXCEPTION 'UNAUTHORIZED_STRUCTURAL_COLUMN_MUTATION: غير مصرح بتعديل الخصائص الهيكلية أو الإسناد للمرحلة';
      END IF;
    END IF;
  END IF;

  -- 2. Manager read-only financial guard on stage_2_pricing and stage_9_fees_payments
  IF auth.uid() IS NOT NULL AND v_role = 'manager' AND NEW.stage_key IN ('stage_2_pricing', 'stage_9_fees_payments') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_MANAGER_FINANCIAL_WRITE: صلاحية المدير (Manager) قراءة فقط للبيانات والمراحل المالية.';
  END IF;

  -- 3. Regulatory procedures completion gate on stage_4_type_procedures
  IF NEW.stage_key = 'stage_4_type_procedures' AND NEW.status = 'completed' THEN
    SELECT COUNT(*) INTO v_unapproved_count
    FROM public.shipment_regulatory_procedures
    WHERE shipment_id = NEW.shipment_id
      AND status <> 'approved';

    IF v_unapproved_count > 0 THEN
      RAISE EXCEPTION 'UNAPPROVED_REGULATORY_PROCEDURES: لا يمكن اعتماد اكتمال مرحلة الجهات الرقابية لوجود % إجراء غير معتمد بعد', v_unapproved_count;
    END IF;
  END IF;

  -- 4. Financial Stage (stage_9_fees_payments) Completion & Reopen Gates
  IF NEW.stage_key = 'stage_9_fees_payments' THEN
    -- If reopening a completed Stage 9, revoke any legacy terminal financial exemption
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'completed'
       AND NEW.status <> 'completed'
       AND NEW.stage_data ? 'legacy_financial_resolution'
    THEN
      NEW.stage_data := jsonb_set(
        NEW.stage_data,
        '{legacy_financial_resolution}',
        '"reopened_requires_full_ledger_settlement"'::jsonb,
        true
      );
    END IF;

    -- Gate when transitioning stage_9_fees_payments to 'completed'
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status <> 'completed') THEN
      SELECT status INTO v_shipment_status
      FROM public.shipments
      WHERE id = NEW.shipment_id;

      -- Allow legacy terminal exemption ONLY while shipment remains in a historical terminal state
      -- and was explicitly marked during migration backfill
      IF NOT (
        v_shipment_status IN ('customs_cleared', 'delivered')
        AND NEW.stage_data->>'legacy_financial_resolution' = 'exempt_terminal_shipment'
      ) THEN
        SELECT * INTO v_fin_summary
        FROM public.get_shipment_financial_summary(NEW.shipment_id);

        IF v_fin_summary.has_confirmed_final_price IS NOT TRUE THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_UNCONFIRMED_FINAL_PRICE: لا يمكن إغلاق مرحلة الرسوم والمدفوعات قبل تثبيت واعتماد السعر النهائي لأتعاب خدمة OUT.';
        END IF;

        IF v_fin_summary.assessed_customs_obligation <= 0.00 THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_MISSING_CUSTOMS_ASSESSMENT: لا يمكن إغلاق مرحلة الرسوم والمدفوعات قبل تسجيل قيمة المطالبة الجمركية الرسمية المقررة.';
        END IF;

        IF v_fin_summary.pending_direct_customs_payments > 0.00 THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_UNVERIFIED_CUSTOMS_PAYMENT: توجد إيصالات سداد جمركي مباشر من العميل بقيمة % ج.م بانتظار التحقق والاعتماد.',
            v_fin_summary.pending_direct_customs_payments;
        END IF;

        IF v_fin_summary.is_customs_coverage_complete IS NOT TRUE THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_INCOMPLETE_CUSTOMS_COVERAGE: الالتزام الجمركي غير مغطى بالكامل (المتبقي لتغطية الجمارك: % ج.م).',
            v_fin_summary.remaining_customs_obligation;
        END IF;

        IF v_fin_summary.outstanding_balance_to_out > 0.00 THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_OUTSTANDING_BALANCE: لا يمكن إغلاق مرحلة الرسوم والمدفوعات لوجود رصيد مستحق لصالح OUT على العميل بقيمة % ج.م لم يتم تحصيله بعد.',
            v_fin_summary.outstanding_balance_to_out;
        END IF;

        IF v_fin_summary.outstanding_balance_to_out < 0.00 THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_OVERPAYMENT_UNSETTLED: يوجد رصيد دائن/فائض تحصيل للعميل بقيمة % ج.م يتطلب تسوية قبل إغلاق المرحلة المالية.',
            ABS(v_fin_summary.outstanding_balance_to_out);
        END IF;

        IF v_fin_summary.is_financial_settlement_complete IS NOT TRUE THEN
          RAISE EXCEPTION 'FINANCIAL_GATE_NOT_SETTLED: لم تكتمل شروط التسوية المالية الإلزامية للشحنة.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 5. Final Clearance Stage (stage_10_clearance_release) Prerequisite Gate on Stage 9
  IF NEW.stage_key = 'stage_10_clearance_release'
     AND NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'completed')
  THEN
    SELECT status INTO v_shipment_status
    FROM public.shipments
    WHERE id = NEW.shipment_id;

    SELECT * INTO v_stage9_row
    FROM public.shipment_customs_stages
    WHERE shipment_id = NEW.shipment_id
      AND stage_key = 'stage_9_fees_payments';

    IF NOT FOUND OR v_stage9_row.status <> 'completed' THEN
      RAISE EXCEPTION 'STAGE_10_REQUIRES_FINANCIAL_COMPLETION: لا يمكن إغلاق مرحلة الإفراج النهائي قبل اكتمال واعتماد مرحلة الرسوم الجمركية والتسوية المالية (المرحلة 9).';
    END IF;

    -- Also verify live financial settlement unless shipment is a historical exempt terminal shipment
    IF NOT (
      v_shipment_status IN ('customs_cleared', 'delivered')
      AND v_stage9_row.stage_data->>'legacy_financial_resolution' = 'exempt_terminal_shipment'
    ) THEN
      SELECT * INTO v_fin_summary
      FROM public.get_shipment_financial_summary(NEW.shipment_id);

      IF v_fin_summary.is_financial_settlement_complete IS NOT TRUE THEN
        RAISE EXCEPTION 'STAGE_10_REQUIRES_FINANCIAL_COMPLETION: لا يمكن إغلاق مرحلة الإفراج النهائي لوجود التزامات مالية معلقة أو عدم اكتمال التسوية المالية في دفتر الأستاذ.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 8. Non-Fabricating Historical Data Backfill & Ambiguity Audit ────────────

DO $$
DECLARE
  rec record;
  v_assessed numeric(14,2);
  v_paid_by_out numeric(14,2);
  v_collected numeric(14,2);
  v_claim_num text;
  v_out_ref text;
  v_coll_ref text;
  v_direct_ref text;
  v_settlement_status text;
  v_actor uuid;
  v_tx_date timestamptz;
  v_obligation_id uuid;
  v_additional_auth boolean;
  v_migration_status text;
  v_ambiguity_notes text[];
BEGIN
  FOR rec IN
    SELECT
      st9.id AS stage_id,
      st9.shipment_id,
      st9.status AS stage_status,
      st9.reference_number AS stage_ref,
      st9.stage_data,
      st9.completed_by,
      st9.updated_by,
      st9.completed_at,
      st9.updated_at,
      st9.created_at,
      s.status AS shipment_status
    FROM public.shipment_customs_stages st9
    JOIN public.shipments s ON s.id = st9.shipment_id
    WHERE st9.stage_key = 'stage_9_fees_payments'
  LOOP
    v_ambiguity_notes := ARRAY[]::text[];
    v_obligation_id := NULL;

    -- Extract raw historical fields from stage_data or stage_data->'customs_duties_settlement'
    v_assessed := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,assessed_customs_amount}'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data->>'assessed_customs_amount'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,duties_amount}'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data->>'duties_amount'), '')::numeric(14,2),
      0.00
    );

    v_paid_by_out := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,amount_paid_by_out}'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data->>'amount_paid_by_out'), '')::numeric(14,2),
      0.00
    );

    v_collected := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,amount_collected_from_customer}'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data->>'amount_collected_from_customer'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,collected_from_customer}'), '')::numeric(14,2),
      NULLIF(btrim(rec.stage_data->>'collected_from_customer'), '')::numeric(14,2),
      0.00
    );

    v_claim_num := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,customs_claim_number}'), ''),
      NULLIF(btrim(rec.stage_data->>'customs_claim_number'), '')
    );

    v_out_ref := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,out_payment_reference}'), ''),
      NULLIF(btrim(rec.stage_data->>'out_payment_reference'), '')
    );

    v_coll_ref := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,customer_collection_reference}'), ''),
      NULLIF(btrim(rec.stage_data->>'customer_collection_reference'), '')
    );

    v_direct_ref := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,customer_direct_payment_reference}'), ''),
      NULLIF(btrim(rec.stage_data->>'customer_direct_payment_reference'), '')
    );

    v_settlement_status := COALESCE(
      NULLIF(btrim(rec.stage_data #>> '{customs_duties_settlement,settlement_status}'), ''),
      NULLIF(btrim(rec.stage_data->>'settlement_status'), '')
    );

    v_additional_auth := COALESCE(
      (rec.stage_data #>> '{customs_duties_settlement,additional_disbursement_authorized}')::boolean,
      (rec.stage_data->>'additional_disbursement_authorized')::boolean,
      false
    );

    v_actor := COALESCE(rec.completed_by, rec.updated_by);
    v_tx_date := COALESCE(rec.completed_at, rec.updated_at, rec.created_at);

    -- Step A: Backfill Customs Obligation if a positive assessed amount exists
    IF v_assessed > 0.00 THEN
      INSERT INTO public.shipment_customs_obligations (
        shipment_id,
        claim_type,
        customs_claim_number,
        assessed_amount,
        currency,
        status,
        assessed_at,
        notes,
        created_by,
        updated_by
      )
      VALUES (
        rec.shipment_id,
        'primary_assessment',
        v_claim_num,
        v_assessed,
        'EGP',
        'assessed',
        v_tx_date,
        'تم ترحيل المطالبة الجمركية من سجل المرحلة التاسعة السابق',
        v_actor,
        v_actor
      )
      ON CONFLICT (shipment_id) WHERE claim_type = 'primary_assessment' AND status <> 'cancelled'
      DO UPDATE SET updated_at = public.shipment_customs_obligations.updated_at
      RETURNING id INTO v_obligation_id;
    END IF;

    -- Step B: Backfill OUT Customs Disbursement ONLY if amount, reference, actor, and obligation are verifiably known
    IF v_paid_by_out > 0.00 AND v_settlement_status IS DISTINCT FROM 'customer_paid_direct' THEN
      IF v_actor IS NOT NULL AND v_out_ref IS NOT NULL AND v_obligation_id IS NOT NULL AND v_assessed > 0.00 THEN
        -- 1) Allocate up to v_assessed against the primary customs obligation
        INSERT INTO public.shipment_financial_transactions (
          shipment_id,
          customs_obligation_id,
          entry_category,
          entry_type,
          entry_status,
          direction,
          amount,
          allocated_customs_amount,
          currency,
          is_billable_to_customer,
          customer_visible,
          payment_method,
          reference_number,
          recipient_or_counterparty,
          transaction_date,
          description,
          idempotency_key,
          created_by
        )
        VALUES (
          rec.shipment_id,
          v_obligation_id,
          'out_disbursement',
          'customs_duties',
          'posted',
          1,
          LEAST(v_paid_by_out, v_assessed),
          LEAST(v_paid_by_out, v_assessed),
          'EGP',
          true,
          true,
          'other',
          v_out_ref,
          'مصلحة الجمارك المصرية',
          v_tx_date,
          'سداد رسوم جمركية بواسطة OUT (مرحل من السجل التاريخي)',
          'legacy_backfill_out_customs_' || rec.shipment_id::text,
          v_actor
        )
        ON CONFLICT (shipment_id, idempotency_key) DO NOTHING;

        -- 2) If v_paid_by_out exceeded v_assessed, record the excess as a separate non-customs OUT disbursement
        --    with is_billable_to_customer and customer_visible governed strictly by v_additional_auth
        IF v_paid_by_out > v_assessed THEN
          INSERT INTO public.shipment_financial_transactions (
            shipment_id,
            customs_obligation_id,
            entry_category,
            entry_type,
            entry_status,
            direction,
            amount,
            allocated_customs_amount,
            currency,
            is_billable_to_customer,
            customer_visible,
            payment_method,
            reference_number,
            recipient_or_counterparty,
            transaction_date,
            description,
            idempotency_key,
            created_by
          )
          VALUES (
            rec.shipment_id,
            NULL,
            'out_disbursement',
            'other_expense',
            'posted',
            1,
            (v_paid_by_out - v_assessed)::numeric(14,2),
            0.00,
            'EGP',
            v_additional_auth,
            v_additional_auth,
            'other',
            v_out_ref || '-ADD',
            'مصروفات إضافية مرتبطة بالشحنة',
            v_tx_date,
            'فارق مصروفات إضافية مسددة بواسطة OUT (مرحل من السجل التاريخي)',
            'legacy_backfill_out_excess_' || rec.shipment_id::text,
            v_actor
          )
          ON CONFLICT (shipment_id, idempotency_key) DO NOTHING;
        END IF;
      ELSE
        v_ambiguity_notes := array_append(
          v_ambiguity_notes,
          'ambiguous_out_disbursement: missing actor, payment reference, or matching customs obligation'
        );
      END IF;
    END IF;

    -- Step C: Backfill Verified Direct Customer Customs Payment ONLY if amount, reference, and actor are verifiably known
    IF v_settlement_status = 'customer_paid_direct' THEN
      IF v_actor IS NOT NULL AND v_direct_ref IS NOT NULL AND v_obligation_id IS NOT NULL AND v_assessed > 0.00 THEN
        INSERT INTO public.shipment_financial_transactions (
          shipment_id,
          customs_obligation_id,
          entry_category,
          entry_type,
          entry_status,
          direction,
          amount,
          allocated_customs_amount,
          currency,
          is_billable_to_customer,
          customer_visible,
          payment_method,
          reference_number,
          recipient_or_counterparty,
          transaction_date,
          description,
          idempotency_key,
          created_by,
          verified_by,
          verified_at
        )
        VALUES (
          rec.shipment_id,
          v_obligation_id,
          'customer_direct_customs_payment',
          'customs_duties',
          'posted',
          1,
          v_assessed,
          v_assessed,
          'EGP',
          false,
          true,
          'other',
          v_direct_ref,
          'مصلحة الجمارك المصرية',
          v_tx_date,
          'سداد مباشر للرسوم الجمركية من العميل للجمارك (مرحل من السجل التاريخي)',
          'legacy_backfill_direct_customs_' || rec.shipment_id::text,
          v_actor,
          v_actor,
          v_tx_date
        )
        ON CONFLICT (shipment_id, idempotency_key) DO NOTHING;
      ELSE
        v_ambiguity_notes := array_append(
          v_ambiguity_notes,
          'ambiguous_direct_customs_payment: missing actor, direct receipt reference, or assessed amount'
        );
      END IF;
    END IF;

    -- Step D: Backfill Customer Payment to OUT ONLY if amount, reference, and actor are verifiably known
    IF v_collected > 0.00 AND v_settlement_status IS DISTINCT FROM 'customer_paid_direct' THEN
      IF v_actor IS NOT NULL AND v_coll_ref IS NOT NULL THEN
        INSERT INTO public.shipment_financial_transactions (
          shipment_id,
          customs_obligation_id,
          entry_category,
          entry_type,
          entry_status,
          direction,
          amount,
          allocated_customs_amount,
          currency,
          is_billable_to_customer,
          customer_visible,
          payment_method,
          reference_number,
          recipient_or_counterparty,
          transaction_date,
          description,
          idempotency_key,
          created_by
        )
        VALUES (
          rec.shipment_id,
          NULL,
          'customer_payment_to_out',
          'customer_installment',
          'posted',
          1,
          v_collected,
          0.00,
          'EGP',
          true,
          true,
          'other',
          v_coll_ref,
          'خزينة / حسابات شركة OUT',
          v_tx_date,
          'تحصيل مسدد من العميل لصالح OUT (مرحل من السجل التاريخي)',
          'legacy_backfill_customer_collection_' || rec.shipment_id::text,
          v_actor
        )
        ON CONFLICT (shipment_id, idempotency_key) DO NOTHING;
      ELSE
        v_ambiguity_notes := array_append(
          v_ambiguity_notes,
          'ambiguous_customer_payment: missing actor or collection reference'
        );
      END IF;
    END IF;

    -- Step E: Record Non-Fabricating Migration Audit Metadata on stage_9_fees_payments.stage_data
    IF array_length(v_ambiguity_notes, 1) > 0 THEN
      v_migration_status := 'ambiguous_preserved_for_admin_review';
    ELSIF rec.shipment_status IN ('customs_cleared', 'delivered') AND v_assessed = 0.00 AND v_paid_by_out = 0.00 AND v_collected = 0.00 THEN
      v_migration_status := 'exempt_terminal_shipment';
    ELSIF v_assessed > 0.00 OR v_paid_by_out > 0.00 OR v_collected > 0.00 THEN
      v_migration_status := 'migrated_verified_records';
    ELSE
      v_migration_status := 'no_prior_financial_data';
    END IF;

    UPDATE public.shipment_customs_stages
    SET stage_data = jsonb_set(
      COALESCE(stage_data, '{}'::jsonb),
      '{legacy_financial_resolution}',
      to_jsonb(v_migration_status),
      true
    ) || jsonb_build_object(
      'legacy_financial_ambiguities', to_jsonb(v_ambiguity_notes)
    )
    WHERE id = rec.stage_id;
  END LOOP;
END $$;

-- Diagnostic View for Admin/Manager to inspect any historical shipment whose Stage 9 JSONB data had ambiguities
CREATE OR REPLACE VIEW public.shipment_financial_migration_audit_v
WITH (security_invoker = true) AS
SELECT
  s.id AS shipment_id,
  s.reference_number,
  s.status AS shipment_status,
  st9.status AS stage_9_status,
  st9.stage_data->>'legacy_financial_resolution' AS legacy_financial_resolution,
  st9.stage_data->'legacy_financial_ambiguities' AS legacy_financial_ambiguities,
  st9.stage_data AS preserved_stage_9_data,
  st9.completed_by,
  st9.completed_at,
  st9.updated_by,
  st9.updated_at
FROM public.shipment_customs_stages st9
JOIN public.shipments s ON s.id = st9.shipment_id
WHERE st9.stage_key = 'stage_9_fees_payments';

GRANT SELECT ON public.shipment_financial_migration_audit_v TO authenticated;

COMMIT;

-- ============================================================
-- DOWN / ROLLBACK SCRIPT (For isolated test environment reversal)
-- ============================================================
-- BEGIN;
-- DROP VIEW IF EXISTS public.shipment_financial_migration_audit_v;
-- DROP FUNCTION IF EXISTS public.get_customer_shipment_financial_statement(uuid);
-- DROP FUNCTION IF EXISTS public.get_shipment_financial_summary(uuid);
-- DROP TABLE IF EXISTS public.shipment_financial_internal_notes;
-- DROP TABLE IF EXISTS public.shipment_financial_transactions;
-- DROP TABLE IF EXISTS public.shipment_customs_obligations;
-- DROP FUNCTION IF EXISTS public.enforce_customs_obligation_bounds();
-- DROP FUNCTION IF EXISTS public.sync_after_financial_transaction();
-- DROP FUNCTION IF EXISTS public.enforce_financial_transaction_integrity();
-- DROP FUNCTION IF EXISTS public.is_authorized_customer_for_shipment(uuid);
-- COMMIT;
