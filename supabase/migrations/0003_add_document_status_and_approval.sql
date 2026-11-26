-- ============================================================
-- Migration: 0003_add_document_status_and_approval
-- Description: Adds status, approved_at, approved_by to documents table,
--              updates RLS policies to lock approved documents for customers,
--              and adds update/delete policies for pending documents.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Add Columns to documents table ────────────────────────────────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);

-- Add check constraint for status values (pending, approved)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_status_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_status_check
      CHECK (status IN ('pending', 'approved'));
  END IF;
END $$;

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS documents_status_idx ON public.documents (status);

-- ─── 3. Update Table RLS Policies ─────────────────────────────────────────────

-- Policy: Customer can update own document ONLY when status is 'pending'
DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own"
  ON public.documents
  FOR UPDATE
  USING (
    auth.uid() = customer_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = customer_id
    AND status = 'pending'
  );

-- Policy: Customer can delete own document ONLY when status is 'pending'
DROP POLICY IF EXISTS "documents_delete_own" ON public.documents;
CREATE POLICY "documents_delete_own"
  ON public.documents
  FOR DELETE
  USING (
    auth.uid() = customer_id
    AND status = 'pending'
  );

-- Policy: Admins can update any document (including approving documents)
DROP POLICY IF EXISTS "documents_update_admin" ON public.documents;
CREATE POLICY "documents_update_admin"
  ON public.documents
  FOR UPDATE
  USING (public.is_admin());

-- ─── 4. Storage Delete Policies ───────────────────────────────────────────────

-- Storage Policy: Users can delete only files in their own folder
DROP POLICY IF EXISTS "documents_storage_delete_own" ON storage.objects;
CREATE POLICY "documents_storage_delete_own"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
