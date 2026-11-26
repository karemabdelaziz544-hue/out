-- ============================================================
-- Migration: 0004_create_companies_and_link_customer
-- Description: Creates the companies table, links profiles (customers)
--              and documents to companies, and defines secure RLS policies.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Companies Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            text NOT NULL,
  commercial_registration_number  text,
  tax_card_number                 text,
  import_card_number              text,
  vat_number                      text,
  phone                           text,
  email                           text,
  address                         text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Indexes for companies ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS companies_name_idx ON public.companies (name);
CREATE INDEX IF NOT EXISTS companies_created_at_idx ON public.companies (created_at DESC);

-- ─── 3. Updated-At Trigger for companies ──────────────────────────────────────

DROP TRIGGER IF EXISTS companies_updated_at ON public.companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. Link Profiles (Customers) to Company ──────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);

-- ─── 5. Link Documents to Company ─────────────────────────────────────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_company_id_idx ON public.documents (company_id);

-- ─── 6. Auto-associate company_id on new Document insert ──────────────────────

CREATE OR REPLACE FUNCTION public.handle_document_company_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    NEW.company_id = (SELECT company_id FROM public.profiles WHERE id = NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_documents_set_company ON public.documents;
CREATE TRIGGER trg_documents_set_company
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_document_company_id();

-- ─── 7. Backfill existing documents if customer already has company ───────────

UPDATE public.documents d
SET company_id = p.company_id
FROM public.profiles p
WHERE d.customer_id = p.id
  AND p.company_id IS NOT NULL
  AND d.company_id IS NULL;

-- ─── 8. Helper Functions for RLS ──────────────────────────────────────────────

-- Returns the company_id of the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_auth_user_company_id()
RETURNS uuid AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ─── 9. Row Level Security for Companies ──────────────────────────────────────

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Policy: Customer can only view their own company
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
CREATE POLICY "companies_select_own"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    id = public.get_auth_user_company_id()
  );

-- Policy: Admins and managers can view all companies
DROP POLICY IF EXISTS "companies_select_admin" ON public.companies;
CREATE POLICY "companies_select_admin"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_manager()
  );

-- Policy: Admins can manage all companies (insert, update, delete)
DROP POLICY IF EXISTS "companies_all_admin" ON public.companies;
CREATE POLICY "companies_all_admin"
  ON public.companies
  FOR ALL
  TO authenticated
  USING (
    public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
  );

-- ─── 10. Update Profile RLS: Prevent customer from changing company_id ────────

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_auth_user_role()
    AND (company_id IS NOT DISTINCT FROM public.get_auth_user_company_id())
  );

-- ─── 11. Update Documents RLS for Company Context ─────────────────────────────

-- Policy: Customer can view their own documents OR their company's documents
DROP POLICY IF EXISTS "documents_select_own" ON public.documents;
CREATE POLICY "documents_select_own"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = customer_id
    OR (
      company_id IS NOT NULL
      AND company_id = public.get_auth_user_company_id()
    )
  );

-- Policy: Customer can only insert documents for themselves and their own company
DROP POLICY IF EXISTS "documents_insert_own" ON public.documents;
CREATE POLICY "documents_insert_own"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND (
      company_id IS NULL
      OR public.get_auth_user_company_id() IS NULL
      OR company_id = public.get_auth_user_company_id()
    )
  );

-- Policy: Customer can update pending document without reassigning to another company
DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = customer_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = customer_id
    AND status = 'pending'
    AND (
      company_id IS NULL
      OR public.get_auth_user_company_id() IS NULL
      OR company_id = public.get_auth_user_company_id()
    )
  );
