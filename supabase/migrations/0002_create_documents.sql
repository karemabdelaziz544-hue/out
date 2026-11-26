-- ============================================================
-- Migration: 0002_create_documents
-- Description: Creates the documents table, storage bucket, and RLS policies.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Documents Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shipment_id   uuid,
  title         text NOT NULL,
  file_name     text NOT NULL,
  file_path     text NOT NULL,
  file_size     bigint NOT NULL,
  mime_type     text NOT NULL,
  document_type text NOT NULL DEFAULT 'مستند عام',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON public.documents (customer_id);
CREATE INDEX IF NOT EXISTS documents_shipment_id_idx ON public.documents (shipment_id);
CREATE INDEX IF NOT EXISTS documents_document_type_idx ON public.documents (document_type);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents (created_at DESC);

-- ─── 3. Updated-At Trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. Row Level Security (Table) ───────────────────────────────────────────

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Policy: Customer can only view their own documents
DROP POLICY IF EXISTS "documents_select_own" ON public.documents;
CREATE POLICY "documents_select_own"
  ON public.documents
  FOR SELECT
  USING (auth.uid() = customer_id);

-- Policy: Customer can only insert documents for themselves
DROP POLICY IF EXISTS "documents_insert_own" ON public.documents;
CREATE POLICY "documents_insert_own"
  ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Policy: Admins and Managers can read all documents
DROP POLICY IF EXISTS "documents_select_admin" ON public.documents;
CREATE POLICY "documents_select_admin"
  ON public.documents
  FOR SELECT
  USING (public.is_admin_or_manager());

-- Policy: Admins can manage all documents
DROP POLICY IF EXISTS "documents_all_admin" ON public.documents;
CREATE POLICY "documents_all_admin"
  ON public.documents
  FOR ALL
  USING (public.is_admin());

-- ─── 5. Supabase Storage Bucket & Storage Policies ───────────────────────────

-- Create private 'documents' bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Users can upload only to their own folder: documents/{customer_id}/*
DROP POLICY IF EXISTS "documents_storage_upload_own" ON storage.objects;
CREATE POLICY "documents_storage_upload_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Storage Policy: Users can select/download only from their own folder: documents/{customer_id}/*
DROP POLICY IF EXISTS "documents_storage_select_own" ON storage.objects;
CREATE POLICY "documents_storage_select_own"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Storage Policy: Admins can select/download all files in 'documents' bucket
DROP POLICY IF EXISTS "documents_storage_select_admin" ON storage.objects;
CREATE POLICY "documents_storage_select_admin"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.is_admin()
  );
