-- ============================================================
-- Migration: 0006_create_company_documents
-- Description: Creates independent company_documents table, dedicated
--              storage bucket 'company-documents', and role-based RLS policies.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Company Documents Table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name     text NOT NULL,
  file_path     text NOT NULL,
  file_url      text,
  mime_type     text NOT NULL,
  file_size     bigint NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz,
  approved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_documents_type_check
    CHECK (document_type IN ('commercial_registration', 'tax_card', 'import_card', 'vat')),
  CONSTRAINT company_documents_status_check
    CHECK (status IN ('pending', 'approved')),
  CONSTRAINT company_documents_company_type_unique
    UNIQUE (company_id, document_type)
);

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS company_documents_company_id_idx ON public.company_documents (company_id);
CREATE INDEX IF NOT EXISTS company_documents_status_idx ON public.company_documents (status);
CREATE INDEX IF NOT EXISTS company_documents_type_idx ON public.company_documents (document_type);
CREATE INDEX IF NOT EXISTS company_documents_uploaded_at_idx ON public.company_documents (uploaded_at DESC);

-- ─── 3. Updated-At Trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS company_documents_updated_at ON public.company_documents;
CREATE TRIGGER company_documents_updated_at
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. Row Level Security for company_documents ──────────────────────────────

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Customer can only view their own company documents
DROP POLICY IF EXISTS "company_documents_select_own" ON public.company_documents;
CREATE POLICY "company_documents_select_own"
  ON public.company_documents
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
  );

-- Policy: Admins and managers can view all company documents
DROP POLICY IF EXISTS "company_documents_select_admin" ON public.company_documents;
CREATE POLICY "company_documents_select_admin"
  ON public.company_documents
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_manager()
  );

-- Policy: Customer can only insert documents for their own company with status 'pending'
DROP POLICY IF EXISTS "company_documents_insert_own" ON public.company_documents;
CREATE POLICY "company_documents_insert_own"
  ON public.company_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_auth_user_company_id()
    AND status = 'pending'
  );

-- Policy: Customer can only update their own pending company documents (cannot change company or approve)
DROP POLICY IF EXISTS "company_documents_update_own" ON public.company_documents;
CREATE POLICY "company_documents_update_own"
  ON public.company_documents
  FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
    AND status = 'pending'
  )
  WITH CHECK (
    company_id = public.get_auth_user_company_id()
    AND status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
  );

-- Policy: Customer can only delete their own pending company documents
DROP POLICY IF EXISTS "company_documents_delete_own" ON public.company_documents;
CREATE POLICY "company_documents_delete_own"
  ON public.company_documents
  FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_auth_user_company_id()
    AND status = 'pending'
  );

-- Policy: Admins can manage all company documents
DROP POLICY IF EXISTS "company_documents_all_admin" ON public.company_documents;
CREATE POLICY "company_documents_all_admin"
  ON public.company_documents
  FOR ALL
  TO authenticated
  USING (
    public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
  );

-- ─── 5. Dedicated Storage Bucket & Policies ───────────────────────────────────

-- Create private 'company-documents' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Customer can view/download their company files: company-documents/{company_id}/*
DROP POLICY IF EXISTS "company_documents_storage_select_own" ON storage.objects;
CREATE POLICY "company_documents_storage_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND (public.get_auth_user_company_id())::text = (storage.foldername(name))[1]
  );

-- Storage Policy: Admins can view/download all files in company-documents bucket
DROP POLICY IF EXISTS "company_documents_storage_select_admin" ON storage.objects;
CREATE POLICY "company_documents_storage_select_admin"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND public.is_admin_or_manager()
  );

-- Storage Policy: Customer can upload to their company folder: company-documents/{company_id}/*
DROP POLICY IF EXISTS "company_documents_storage_insert_own" ON storage.objects;
CREATE POLICY "company_documents_storage_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-documents'
    AND (public.get_auth_user_company_id())::text = (storage.foldername(name))[1]
  );

-- Storage Policy: Customer can update files in their company folder
DROP POLICY IF EXISTS "company_documents_storage_update_own" ON storage.objects;
CREATE POLICY "company_documents_storage_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND (public.get_auth_user_company_id())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'company-documents'
    AND (public.get_auth_user_company_id())::text = (storage.foldername(name))[1]
  );

-- Storage Policy: Customer can delete from their company folder
DROP POLICY IF EXISTS "company_documents_storage_delete_own" ON storage.objects;
CREATE POLICY "company_documents_storage_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND (public.get_auth_user_company_id())::text = (storage.foldername(name))[1]
  );

-- Storage Policy: Admin can manage all files in company-documents bucket
DROP POLICY IF EXISTS "company_documents_storage_all_admin" ON storage.objects;
CREATE POLICY "company_documents_storage_all_admin"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND public.is_admin()
  );
