-- ============================================================
-- Migration: 0007_create_shipments
-- Description: Creates shipments table (clearance request foundation),
--              reference number sequence, RLS policies, and links
--              shipments to companies, customers, and documents.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Sequence & Reference Generator ────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.shipment_reference_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_shipment_reference()
RETURNS text AS $$
DECLARE
  next_val bigint;
  year_str text;
BEGIN
  next_val := nextval('public.shipment_reference_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'OUT-' || year_str || '-' || lpad(next_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Shipments Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference_number    text NOT NULL UNIQUE DEFAULT public.generate_shipment_reference(),
  status              text NOT NULL DEFAULT 'draft',
  supplier_name       text,
  country_of_origin   text,
  port_of_arrival     text,
  goods_description   text,
  packages_count      integer,
  package_type        text,
  gross_weight        numeric,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shipments_status_check
    CHECK (status IN ('draft', 'submitted', 'awaiting_pricing'))
);

-- ─── 3. Link documents.shipment_id as Foreign Key ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_shipment'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT fk_documents_shipment
      FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS shipments_company_id_idx ON public.shipments (company_id);
CREATE INDEX IF NOT EXISTS shipments_customer_id_idx ON public.shipments (customer_id);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON public.shipments (status);
CREATE INDEX IF NOT EXISTS shipments_reference_number_idx ON public.shipments (reference_number);
CREATE INDEX IF NOT EXISTS shipments_created_at_idx ON public.shipments (created_at DESC);

-- ─── 5. Updated-At Trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS shipments_updated_at ON public.shipments;
CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 6. Row Level Security for Shipments ──────────────────────────────────────

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- Policy: Customer can only view shipments for their own company
DROP POLICY IF EXISTS "shipments_select_own" ON public.shipments;
CREATE POLICY "shipments_select_own"
  ON public.shipments
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
  );

-- Policy: Admins and managers can view all shipments
DROP POLICY IF EXISTS "shipments_select_admin" ON public.shipments;
CREATE POLICY "shipments_select_admin"
  ON public.shipments
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_manager()
  );

-- Policy: Customer can insert shipments for their own company
DROP POLICY IF EXISTS "shipments_insert_own" ON public.shipments;
CREATE POLICY "shipments_insert_own"
  ON public.shipments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_auth_user_company_id()
    AND customer_id = auth.uid()
  );

-- Policy: Customer can update draft shipments of their own company (or submit to awaiting_pricing)
DROP POLICY IF EXISTS "shipments_update_own" ON public.shipments;
CREATE POLICY "shipments_update_own"
  ON public.shipments
  FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
    AND status = 'draft'
  )
  WITH CHECK (
    company_id = public.get_auth_user_company_id()
    AND customer_id = auth.uid()
    AND status IN ('draft', 'submitted', 'awaiting_pricing')
  );

-- Policy: Customer can delete draft shipments of their own company
DROP POLICY IF EXISTS "shipments_delete_own" ON public.shipments;
CREATE POLICY "shipments_delete_own"
  ON public.shipments
  FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
    AND status = 'draft'
  );

-- Policy: Admins can manage all shipments
DROP POLICY IF EXISTS "shipments_all_admin" ON public.shipments;
CREATE POLICY "shipments_all_admin"
  ON public.shipments
  FOR ALL
  TO authenticated
  USING (
    public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
  );
