-- ============================================================
-- Migration: 0014_create_shipment_external_operations
-- Description: Supports Phase 3: Manual Nafeza & CargoX External Operations Log:
--              1. Creates shipment_external_operations table for recording
--                 actions performed externally on Nafeza and CargoX.
--              2. Distinct operation_date (actual) vs created_at (system timestamp).
--              3. Configures Row Level Security (RLS) restricting access
--                 strictly to authorized internal staff (admin, manager, data_entry, inspector).
--              4. Explicitly excludes customers from accessing internal logs.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Create shipment_external_operations Table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_external_operations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id         uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  platform            text NOT NULL CHECK (platform IN ('nafeza', 'cargox')),
  operation_type      text NOT NULL,
  title               text NOT NULL,
  description         text,
  operation_date      timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  external_reference  text,
  acid_number         text,
  outcome             text NOT NULL CHECK (outcome IN ('pending', 'successful', 'failed', 'rejected', 'requires_follow_up')),
  external_response   text,
  document_id         uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ─── 2. Performance & Audit Indexes ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS shipment_ext_ops_shipment_idx
  ON public.shipment_external_operations (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_ext_ops_platform_idx
  ON public.shipment_external_operations (platform);

CREATE INDEX IF NOT EXISTS shipment_ext_ops_outcome_idx
  ON public.shipment_external_operations (outcome);

CREATE INDEX IF NOT EXISTS shipment_ext_ops_op_date_idx
  ON public.shipment_external_operations (operation_date DESC);

CREATE INDEX IF NOT EXISTS shipment_ext_ops_created_at_idx
  ON public.shipment_external_operations (created_at DESC);

-- ─── 3. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.shipment_external_operations ENABLE ROW LEVEL SECURITY;

-- Internal staff can read all external operations
DROP POLICY IF EXISTS "shipment_ext_ops_select_staff" ON public.shipment_external_operations;
CREATE POLICY "shipment_ext_ops_select_staff"
  ON public.shipment_external_operations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector')
    )
  );

-- Only authorized internal staff can insert operation records
DROP POLICY IF EXISTS "shipment_ext_ops_insert_staff" ON public.shipment_external_operations;
CREATE POLICY "shipment_ext_ops_insert_staff"
  ON public.shipment_external_operations
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector')
    )
  );

-- Authorized internal staff can update records for audit corrections
DROP POLICY IF EXISTS "shipment_ext_ops_update_staff" ON public.shipment_external_operations;
CREATE POLICY "shipment_ext_ops_update_staff"
  ON public.shipment_external_operations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector')
    )
  );

-- Customers have NO access policies. By default under RLS with no matching policy,
-- all SELECT/INSERT/UPDATE/DELETE queries from customers are denied.
