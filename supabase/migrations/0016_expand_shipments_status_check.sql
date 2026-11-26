-- ============================================================
-- Migration: 0016_expand_shipments_status_check
-- Description: Expands shipments.status CHECK constraint to include
--              operational customs and terminal delivery statuses:
--              'customs_in_progress', 'customs_cleared', 'delivered'.
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
    'ready_for_external_stage',
    'customs_in_progress',
    'customs_cleared',
    'delivered'
  ));
