-- ============================================================
-- Migration 0017: Create Shipment Tracking Cache Table
-- STATUS: DRAFT / PENDING APPROVAL (DO NOT APPLY AUTOMATICALLY)
-- ============================================================
-- Purpose:
-- Provides persistent server-side caching for external SeaRates maritime
-- tracking API responses. Reduces external API costs and respects rate limits.
--
-- Security Rules Enforced:
-- 1. RLS is ENABLED immediately upon creation.
-- 2. NO PUBLIC READ/WRITE ACCESS.
-- 3. Anonymous/public visitors CANNOT query this table directly.
-- 4. Only the server-side backend (via service role) manages cache entries.
-- 5. System administrators can inspect cache metadata for diagnostics.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shipment_tracking_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  carrier_code TEXT,
  provider TEXT NOT NULL DEFAULT 'searates',
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Compound index for fast lookups by tracking number and identifier type
CREATE INDEX IF NOT EXISTS idx_tracking_cache_lookup 
  ON public.shipment_tracking_cache (tracking_number, identifier_type);

-- Expiration index for automated cleanup routines
CREATE INDEX IF NOT EXISTS idx_tracking_cache_expires 
  ON public.shipment_tracking_cache (expires_at);

-- Enable Row Level Security
ALTER TABLE public.shipment_tracking_cache ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ─────────────────────────────────────────────────────────────
-- Strictly NO public/anon policies. Public access is 100% blocked.

-- Admin read-only policy for diagnostics and auditing
CREATE POLICY "Admins can view tracking cache diagnostics"
  ON public.shipment_tracking_cache
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role retains full bypass privileges for server-side lookup routines.
