-- ============================================================
-- Migration: 0001_create_profiles
-- Description: Creates the profiles table and RLS policies.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Role Enum ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM (
      'customer',
      'admin',
      'data_entry',
      'scout',
      'inspector',
      'manager'
    );
  END IF;
END $$;

-- ─── 2. Profiles Table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  -- Primary key — references the authenticated Supabase user
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  full_name     text,
  email         text NOT NULL,
  phone         text,
  avatar_url    text,

  -- Authorization
  role          public.user_role NOT NULL DEFAULT 'customer',
  is_active     boolean NOT NULL DEFAULT true,

  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Ensure phone column exists if table was created in an earlier run
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────

-- Email lookups (unique — one profile per email)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

-- Role-based filtering
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- Active user filtering
CREATE INDEX IF NOT EXISTS profiles_is_active_idx ON public.profiles (is_active);

-- ─── 4. Updated-At Trigger ────────────────────────────────────────────────────

-- Auto-update `updated_at` on every row modification
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 5. New User Profile Trigger ──────────────────────────────────────────────

-- Automatically create a profile row when a new auth user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, avatar_url, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url',
    'customer',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── 6. Enable Row Level Security ─────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─── 7. Helper Functions for RLS (SECURITY DEFINER to prevent recursion) ──────

-- Returns current user's role without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Checks if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Checks if current user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ─── 8. RLS Policies ──────────────────────────────────────────────────────────

-- Policy: Users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Admins and managers can read all profiles (uses SECURITY DEFINER helper)
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin_or_manager());

-- Policy: Users can update their own profile (cannot change role or is_active)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_auth_user_role()
  );

-- Policy: Admins can update any profile (including role and is_active)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());

-- ─── 9. Comments ──────────────────────────────────────────────────────────────

COMMENT ON TABLE public.profiles IS
  'User profiles for the OUT platform. One profile per auth user. '
  'Role is set by admins only — never trusted from the client.';

COMMENT ON COLUMN public.profiles.role IS
  'Authorization role. Enforced server-side via RLS. '
  'Never trust the role from the frontend JWT claims.';

COMMENT ON COLUMN public.profiles.is_active IS
  'Soft deactivation flag. Inactive users cannot access the platform '
  'even if they have a valid session (enforced via RLS and middleware).';
