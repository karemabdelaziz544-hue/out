-- ============================================================
-- Migration: 0011_create_shipment_document_reviews
-- Description: Supports Step 8 — Final Shipment Documents Workflow:
--              1. Updates shipments.status check constraint to include:
--                 'awaiting_shipment_documents', 'documents_completed'.
--              2. Ensures partial unique index on documents(shipment_id, document_type)
--                 to prevent duplicate records of the same document type per shipment.
--              3. Creates shipment_document_reviews table (audit history trail).
--              4. Configures Row Level Security (RLS) for reviews and documents.
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
    'documents_completed'
  ));

-- ─── 2. Partial Unique Index on documents(shipment_id, document_type) ────────

CREATE UNIQUE INDEX IF NOT EXISTS documents_shipment_document_type_idx
  ON public.documents (shipment_id, document_type)
  WHERE shipment_id IS NOT NULL;

-- ─── 3. Create shipment_document_reviews Table ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_document_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  shipment_id    uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  action         text NOT NULL CHECK (action IN ('uploaded', 'approved', 'revision_requested', 'resubmitted')),
  note           text,
  performed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Indexes for shipment_document_reviews ─────────────────────────────────

CREATE INDEX IF NOT EXISTS shipment_doc_reviews_shipment_id_idx
  ON public.shipment_document_reviews (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_doc_reviews_document_id_idx
  ON public.shipment_document_reviews (document_id);

CREATE INDEX IF NOT EXISTS shipment_doc_reviews_performed_at_idx
  ON public.shipment_document_reviews (performed_at DESC);

-- ─── 5. Row Level Security (RLS) for shipment_document_reviews ────────────────

ALTER TABLE public.shipment_document_reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Admins and Managers have full access
DROP POLICY IF EXISTS "shipment_doc_reviews_admin_all" ON public.shipment_document_reviews;
CREATE POLICY "shipment_doc_reviews_admin_all"
  ON public.shipment_document_reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- Policy: Customers can read review history for their company's shipments
DROP POLICY IF EXISTS "shipment_doc_reviews_customer_select" ON public.shipment_document_reviews;
CREATE POLICY "shipment_doc_reviews_customer_select"
  ON public.shipment_document_reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_document_reviews.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

-- Policy: Authenticated users can insert review history for their company's shipments (e.g. uploaded/resubmitted)
DROP POLICY IF EXISTS "shipment_doc_reviews_customer_insert" ON public.shipment_document_reviews;
CREATE POLICY "shipment_doc_reviews_customer_insert"
  ON public.shipment_document_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_document_reviews.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
    OR public.is_admin_or_manager()
  );
