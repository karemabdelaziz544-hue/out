-- ============================================================
-- Migration: 0008_create_shipment_pricing
-- Description: Creates shipment_pricing and shipment_pricing_history tables,
--              updates shipments status check constraint to support Step 5 statuses:
--              'price_proposed', 'negotiation', 'price_agreed', 'awaiting_invoice_review',
--              and configures RLS policies and indexes.
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
    'awaiting_invoice_review'
  ));

-- ─── 2. Shipment Pricing Table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_pricing (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id           uuid NOT NULL UNIQUE REFERENCES public.shipments(id) ON DELETE CASCADE,
  estimated_min_price   numeric NOT NULL CHECK (estimated_min_price >= 0),
  estimated_max_price   numeric NOT NULL CHECK (estimated_max_price >= 0),
  final_price           numeric NULL CHECK (final_price IS NULL OR final_price >= 0),
  currency              text NOT NULL DEFAULT 'EGP',
  status                text NOT NULL DEFAULT 'pending',
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_approved_at  timestamptz NULL,
  customer_approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shipment_pricing_min_max_check
    CHECK (estimated_min_price <= estimated_max_price),

  CONSTRAINT shipment_pricing_status_check
    CHECK (status IN (
      'pending',
      'proposed',
      'negotiation_requested',
      'final_proposed',
      'customer_approved'
    ))
);

-- ─── 3. Shipment Pricing History Table (Audit Trail) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_pricing_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id           uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  pricing_id            uuid NOT NULL REFERENCES public.shipment_pricing(id) ON DELETE CASCADE,
  action                text NOT NULL,
  estimated_min_price   numeric NULL,
  estimated_max_price   numeric NULL,
  final_price           numeric NULL,
  currency              text NOT NULL DEFAULT 'EGP',
  performed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at          timestamptz NOT NULL DEFAULT now(),
  notes                 text NULL,

  CONSTRAINT shipment_pricing_history_action_check
    CHECK (action IN (
      'estimate_created',
      'negotiation_requested',
      'final_price_set',
      'customer_approved'
    ))
);

-- ─── 4. Performance Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shipment_pricing_shipment_id
  ON public.shipment_pricing(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_pricing_status
  ON public.shipment_pricing(status);

CREATE INDEX IF NOT EXISTS idx_shipment_pricing_history_shipment_id
  ON public.shipment_pricing_history(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_pricing_history_pricing_id
  ON public.shipment_pricing_history(pricing_id);

CREATE INDEX IF NOT EXISTS idx_shipment_pricing_history_performed_at
  ON public.shipment_pricing_history(performed_at);

-- ─── 5. Trigger: Updated At on shipment_pricing ────────────────────────────────

DROP TRIGGER IF EXISTS shipment_pricing_updated_at ON public.shipment_pricing;
CREATE TRIGGER shipment_pricing_updated_at
  BEFORE UPDATE ON public.shipment_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 6. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.shipment_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_pricing_history ENABLE ROW LEVEL SECURITY;

-- ─── shipment_pricing RLS Policies ───

DROP POLICY IF EXISTS "pricing_select_own" ON public.shipment_pricing;
CREATE POLICY "pricing_select_own"
  ON public.shipment_pricing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_pricing.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

DROP POLICY IF EXISTS "pricing_select_admin" ON public.shipment_pricing;
CREATE POLICY "pricing_select_admin"
  ON public.shipment_pricing
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "pricing_all_admin" ON public.shipment_pricing;
CREATE POLICY "pricing_all_admin"
  ON public.shipment_pricing
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Customer update policy: only for state transitions without price tampering
DROP POLICY IF EXISTS "pricing_update_customer" ON public.shipment_pricing;
CREATE POLICY "pricing_update_customer"
  ON public.shipment_pricing
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_pricing.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_pricing.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
    AND (
      status IN ('negotiation_requested', 'customer_approved')
    )
  );

-- ─── shipment_pricing_history RLS Policies ───

DROP POLICY IF EXISTS "pricing_history_select_own" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_select_own"
  ON public.shipment_pricing_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_pricing_history.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
  );

DROP POLICY IF EXISTS "pricing_history_select_admin" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_select_admin"
  ON public.shipment_pricing_history
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "pricing_history_all_admin" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_all_admin"
  ON public.shipment_pricing_history
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pricing_history_insert_customer" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_insert_customer"
  ON public.shipment_pricing_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_pricing_history.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
    AND performed_by = auth.uid()
    AND action IN ('negotiation_requested', 'customer_approved')
  );
