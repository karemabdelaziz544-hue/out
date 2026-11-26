-- ============================================================
-- Migration: 0005_add_company_update_and_setup
-- Description: Adds UPDATE RLS policy for companies, and a secure
--              function to set up initial company for customers.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Policy for Customer to update their own company ───────

DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
CREATE POLICY "companies_update_own"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (
    id = public.get_auth_user_company_id()
  )
  WITH CHECK (
    id = public.get_auth_user_company_id()
  );

-- ─── 2. Secure Function for Customer Initial Company Setup ────

CREATE OR REPLACE FUNCTION public.setup_customer_company(
  p_name text,
  p_commercial_registration_number text DEFAULT NULL,
  p_tax_card_number text DEFAULT NULL,
  p_import_card_number text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_current_company_id uuid;
  v_company_record public.companies%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT company_id INTO v_current_company_id FROM public.profiles WHERE id = v_user_id;

  IF v_current_company_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already has a linked company';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  INSERT INTO public.companies (
    name,
    commercial_registration_number,
    tax_card_number,
    import_card_number,
    vat_number,
    phone,
    email,
    address
  ) VALUES (
    trim(p_name),
    NULLIF(trim(p_commercial_registration_number), ''),
    NULLIF(trim(p_tax_card_number), ''),
    NULLIF(trim(p_import_card_number), ''),
    NULLIF(trim(p_vat_number), ''),
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_address), '')
  )
  RETURNING * INTO v_company_record;

  -- Link newly created company to the user's profile
  UPDATE public.profiles
  SET company_id = v_company_record.id,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN to_jsonb(v_company_record);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.setup_customer_company FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_customer_company TO authenticated;
