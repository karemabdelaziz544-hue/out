-- ============================================================
-- Migration: 0009_create_shipment_invoice_reviews
-- Description: Supports Step 6 — Preliminary Invoice Review:
--              1. Updates shipments.status check constraint with:
--                 'invoice_revision_required', 'invoice_approved'.
--              2. Updates documents.status check constraint to include 'revision_required'.
--              3. Adds review columns to documents table (review_note, reviewed_at, reviewed_by).
--              4. Updates RLS policies for documents and shipments to allow customer resubmission.
--              5. Creates shipment_invoice_reviews table (audit history trail) with RLS.
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
    'invoice_approved'
  ));

-- ─── 2. Update documents Columns & Status Constraint ──────────────────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending', 'approved', 'revision_required', 'rejected'));

-- ─── 3. Update documents RLS Policies ─────────────────────────────────────────

-- Customers can update own document when status is 'pending' OR 'revision_required'
-- WITH CHECK ensures that customer can only reset it to 'pending' (cannot self-approve)
DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = customer_id
    AND (status = 'pending' OR status = 'revision_required')
  )
  WITH CHECK (
    auth.uid() = customer_id
    AND status = 'pending'
  );

-- Admins and managers can update documents (approve, request revision, etc.)
DROP POLICY IF EXISTS "documents_update_admin" ON public.documents;
CREATE POLICY "documents_update_admin"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- ─── 4. Update shipments RLS Policies ─────────────────────────────────────────

-- Customer can update shipment status when:
-- - draft -> draft, submitted, awaiting_pricing
-- - price_proposed or price_agreed -> awaiting_invoice_review (pricing approval)
-- - invoice_revision_required -> awaiting_invoice_review (invoice resubmission)
DROP POLICY IF EXISTS "shipments_update_own" ON public.shipments;
CREATE POLICY "shipments_update_own"
  ON public.shipments
  FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
    AND status IN ('draft', 'price_proposed', 'price_agreed', 'invoice_revision_required')
  )
  WITH CHECK (
    company_id = public.get_auth_user_company_id()
    AND customer_id = auth.uid()
    AND status IN ('draft', 'submitted', 'awaiting_pricing', 'awaiting_invoice_review')
  );

-- Ensure admins and managers can manage all shipments
DROP POLICY IF EXISTS "shipments_all_admin" ON public.shipments;
CREATE POLICY "shipments_all_admin"
  ON public.shipments
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- ─── 5. Shipment Invoice Reviews Table (Audit Trail) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_invoice_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('approved', 'revision_requested', 'resubmitted')),
  note          text,
  performed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Indexes for shipment_invoice_reviews ──────────────────────────────────

CREATE INDEX IF NOT EXISTS shipment_invoice_reviews_shipment_idx
  ON public.shipment_invoice_reviews (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_invoice_reviews_document_idx
  ON public.shipment_invoice_reviews (document_id);

CREATE INDEX IF NOT EXISTS shipment_invoice_reviews_performed_at_idx
  ON public.shipment_invoice_reviews (performed_at);

-- ─── 7. Row Level Security (RLS) for shipment_invoice_reviews ─────────────────

ALTER TABLE public.shipment_invoice_reviews ENABLE ROW LEVEL SECURITY;

-- Customer can select review events for their company's shipments
DROP POLICY IF EXISTS "invoice_reviews_select_customer" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_select_customer"
  ON public.shipment_invoice_reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_invoice_reviews.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

-- Admins and managers can view all review history
DROP POLICY IF EXISTS "invoice_reviews_select_admin" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_select_admin"
  ON public.shipment_invoice_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

-- Admins and managers can insert review events ('approved', 'revision_requested')
DROP POLICY IF EXISTS "invoice_reviews_insert_admin" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_insert_admin"
  ON public.shipment_invoice_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_manager()
    AND action IN ('approved', 'revision_requested')
  );

-- Customer can insert review event ONLY with action 'resubmitted' for their company's shipment
DROP POLICY IF EXISTS "invoice_reviews_insert_customer" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_insert_customer"
  ON public.shipment_invoice_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    action = 'resubmitted'
    AND auth.uid() = performed_by
    AND EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_invoice_reviews.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

-- Admins full access policy
DROP POLICY IF EXISTS "invoice_reviews_all_admin" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_all_admin"
  ON public.shipment_invoice_reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
