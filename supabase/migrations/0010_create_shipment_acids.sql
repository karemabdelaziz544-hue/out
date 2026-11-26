-- ============================================================
-- Migration: 0010_create_shipment_acids
-- Description: Supports Step 7 — ACID Management & Workflow:
--              1. Updates shipments.status check constraint to include:
--                 'acid_processing', 'acid_issued'.
--              2. Creates shipment_acids table (1-to-1 with shipments)
--                 with statuses ('pending', 'processing', 'issued', 'failed').
--              3. Creates shipment_acid_history table (audit trail).
--              4. Implements database trigger preventing modification of issued ACIDs.
--              5. Configures strict Row Level Security (RLS) for tenant isolation and Admin control.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Update shipments.status Check Constraint ──────────────────────────────

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_status_check;

ALTER TABLE public.shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'awaiting_pricing',
    'price_proposed',
    'negotiation',
    'price_agreed',
    'awaiting_invoice_review',
    'invoice_revision_required',
    'invoice_approved',
    'acid_processing',
    'acid_issued'
  ));

-- ─── 2. Create shipment_acids Table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_acids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   uuid NOT NULL UNIQUE REFERENCES public.shipments(id) ON DELETE CASCADE,
  acid_number   text UNIQUE,
  status        text NOT NULL DEFAULT 'pending',
  notes         text,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shipment_acids_status_check
    CHECK (status IN ('pending', 'processing', 'issued', 'failed')),

  CONSTRAINT shipment_acids_issued_check
    CHECK (
      status != 'issued' OR (
        acid_number IS NOT NULL AND
        length(trim(acid_number)) >= 5 AND
        issued_at IS NOT NULL
      )
    )
);

-- ─── 3. Create shipment_acid_history Table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_acid_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_acid_id  uuid NOT NULL REFERENCES public.shipment_acids(id) ON DELETE CASCADE,
  shipment_id       uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  action            text NOT NULL CHECK (action IN ('created', 'processing_started', 'issued', 'failed')),
  old_status        text,
  new_status        text NOT NULL,
  acid_number       text,
  notes             text,
  performed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS shipment_acids_shipment_idx
  ON public.shipment_acids (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_acids_status_idx
  ON public.shipment_acids (status);

CREATE INDEX IF NOT EXISTS shipment_acids_acid_number_idx
  ON public.shipment_acids (acid_number);

CREATE INDEX IF NOT EXISTS shipment_acid_history_acid_idx
  ON public.shipment_acid_history (shipment_acid_id);

CREATE INDEX IF NOT EXISTS shipment_acid_history_shipment_idx
  ON public.shipment_acid_history (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_acid_history_performed_at_idx
  ON public.shipment_acid_history (performed_at);

-- ─── 5. Triggers ──────────────────────────────────────────────────────────────

-- Auto-update updated_at on shipment_acids
DROP TRIGGER IF EXISTS shipment_acids_updated_at ON public.shipment_acids;
CREATE TRIGGER shipment_acids_updated_at
  BEFORE UPDATE ON public.shipment_acids
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Prevent modification of issued ACID records
CREATE OR REPLACE FUNCTION public.prevent_issued_acid_modification()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'issued' THEN
    IF NEW.acid_number IS DISTINCT FROM OLD.acid_number OR NEW.status IS DISTINCT FROM 'issued' THEN
      RAISE EXCEPTION 'Cannot modify or revert an issued ACID record';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_issued_acid_modification ON public.shipment_acids;
CREATE TRIGGER trigger_prevent_issued_acid_modification
  BEFORE UPDATE ON public.shipment_acids
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_issued_acid_modification();

-- ─── 6. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.shipment_acids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_acid_history ENABLE ROW LEVEL SECURITY;

-- ─── shipment_acids RLS Policies ───

-- Customers can view ACID records only for shipments of their company
DROP POLICY IF EXISTS "shipment_acids_select_customer" ON public.shipment_acids;
CREATE POLICY "shipment_acids_select_customer"
  ON public.shipment_acids
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_acids.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

-- Admins and managers can view all ACID records
DROP POLICY IF EXISTS "shipment_acids_select_admin" ON public.shipment_acids;
CREATE POLICY "shipment_acids_select_admin"
  ON public.shipment_acids
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

-- Admins and managers can manage ACID records
DROP POLICY IF EXISTS "shipment_acids_all_admin" ON public.shipment_acids;
CREATE POLICY "shipment_acids_all_admin"
  ON public.shipment_acids
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- ─── shipment_acid_history RLS Policies ───

-- Customers can view ACID history only for shipments of their company
DROP POLICY IF EXISTS "shipment_acid_history_select_customer" ON public.shipment_acid_history;
CREATE POLICY "shipment_acid_history_select_customer"
  ON public.shipment_acid_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_acid_history.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

-- Admins and managers can view all ACID history
DROP POLICY IF EXISTS "shipment_acid_history_select_admin" ON public.shipment_acid_history;
CREATE POLICY "shipment_acid_history_select_admin"
  ON public.shipment_acid_history
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

-- Admins and managers can insert/manage ACID history
DROP POLICY IF EXISTS "shipment_acid_history_all_admin" ON public.shipment_acid_history;
CREATE POLICY "shipment_acid_history_all_admin"
  ON public.shipment_acid_history
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());
