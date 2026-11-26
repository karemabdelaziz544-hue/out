-- ============================================================
-- Migration: 0012_create_shipment_stage_readiness
-- Description: Supports Step 9 — Nafeza & CargoX Preparation (Internal Readiness):
--              1. Updates shipments.status check constraint to include:
--                 'ready_for_external_stage'.
--              2. Creates shipment_stage_history table for auditing stage transitions.
--              3. Configures Row Level Security (RLS) for shipment_stage_history.
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
    'acid_issued',
    'awaiting_shipment_documents',
    'documents_completed',
    'ready_for_external_stage'
  ));

-- ─── 2. Create shipment_stage_history Table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_stage_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  action       text NOT NULL,
  note         text,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Indexes for shipment_stage_history ────────────────────────────────────

CREATE INDEX IF NOT EXISTS shipment_stage_history_shipment_idx
  ON public.shipment_stage_history (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_stage_history_performed_at_idx
  ON public.shipment_stage_history (performed_at DESC);

-- ─── 4. Row Level Security for shipment_stage_history ─────────────────────────

ALTER TABLE public.shipment_stage_history ENABLE ROW LEVEL SECURITY;

-- Customers can view stage history of their own shipments
DROP POLICY IF EXISTS "shipment_stage_history_select_customer" ON public.shipment_stage_history;
CREATE POLICY "shipment_stage_history_select_customer"
  ON public.shipment_stage_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_stage_history.shipment_id
        AND s.customer_id = auth.uid()
    )
  );

-- Admins and managers can view all stage history records
DROP POLICY IF EXISTS "shipment_stage_history_select_admin" ON public.shipment_stage_history;
CREATE POLICY "shipment_stage_history_select_admin"
  ON public.shipment_stage_history
  FOR SELECT
  USING (public.is_admin_or_manager());

-- Admins and managers can insert/manage stage history
DROP POLICY IF EXISTS "shipment_stage_history_all_admin" ON public.shipment_stage_history;
CREATE POLICY "shipment_stage_history_all_admin"
  ON public.shipment_stage_history
  FOR ALL
  USING (public.is_admin_or_manager());
