-- ============================================================
-- Seed: Development Data
-- ============================================================
-- IMPORTANT: This file is for LOCAL DEVELOPMENT ONLY.
-- NEVER run this against a production database.
-- All data is clearly fake — no real personal information.
-- ============================================================
--
-- USAGE:
--   1. Create users in Supabase Auth Dashboard (or use supabase CLI)
--   2. Note the UUIDs assigned to each user
--   3. Replace the placeholder UUIDs below with real ones
--   4. Run this script to set roles and names
--
-- OR use the Supabase CLI:
--   supabase db seed
--
-- ============================================================

-- ─── Instructions ─────────────────────────────────────────────────────────────
-- Step 1: Create these users via Supabase Auth (Dashboard or CLI)
--   admin@out.dev          password: DevAdmin123!
--   manager@out.dev        password: DevManager123!
--   dataentry@out.dev      password: DevData123!
--   scout@out.dev          password: DevScout123!
--   inspector@out.dev      password: DevInspect123!
--   customer@out.dev       password: DevCustomer123!
--
-- Step 2: After creating them, replace UUIDs below and run this SQL
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: The trigger `on_auth_user_created` will auto-create profile rows.
-- This seed only UPDATES those rows to set correct roles and names.

-- Update admin user
UPDATE public.profiles SET
  full_name  = 'Ahmed Admin (DEV)',
  role       = 'admin',
  is_active  = true
WHERE email = 'admin@out.dev';

-- Update manager user
UPDATE public.profiles SET
  full_name  = 'Sara Manager (DEV)',
  role       = 'manager',
  is_active  = true
WHERE email = 'manager@out.dev';

-- Update data entry user
UPDATE public.profiles SET
  full_name  = 'Mohamed Data Entry (DEV)',
  role       = 'data_entry',
  is_active  = true
WHERE email = 'dataentry@out.dev';

-- Update scout user
UPDATE public.profiles SET
  full_name  = 'Khaled Scout (DEV)',
  role       = 'scout',
  is_active  = true
WHERE email = 'scout@out.dev';

-- Update inspector user
UPDATE public.profiles SET
  full_name  = 'Fatma Inspector (DEV)',
  role       = 'inspector',
  is_active  = true
WHERE email = 'inspector@out.dev';

-- Update customer user
UPDATE public.profiles SET
  full_name  = 'Omar Customer (DEV)',
  role       = 'customer',
  is_active  = true
WHERE email = 'customer@out.dev';

-- ─── Verification ─────────────────────────────────────────────────────────────
-- Run this to verify the seed worked correctly:
-- SELECT id, full_name, email, role, is_active FROM public.profiles;
