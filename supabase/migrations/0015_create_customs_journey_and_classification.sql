-- ============================================================
-- Migration: 0015_create_customs_journey_and_classification
-- Description:
--   1. Adds goods classification to public.shipments:
--      - goods_category ('agricultural', 'industrial', 'food', 'other')
--      - applicable_procedures (text array of active operational procedures)
--      - classification_notes (text)
--      - classification_reviewed_at (timestamptz)
--      - classification_reviewed_by (uuid references profiles)
--   2. Creates public.shipment_customs_stages table for tracking
--      the 10 operational customs clearance stages.
--   3. Creates public.shipment_customs_stage_history table for auditing
--      stage updates, status transitions, and operational corrections.
--   4. RLS policies restricting access to authenticated internal staff.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Add Classification Columns to public.shipments ────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'goods_category'
  ) THEN
    ALTER TABLE public.shipments
      ADD COLUMN goods_category text NOT NULL DEFAULT 'other'
      CHECK (goods_category IN ('agricultural', 'industrial', 'food', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'applicable_procedures'
  ) THEN
    ALTER TABLE public.shipments
      ADD COLUMN applicable_procedures text[] NOT NULL DEFAULT ARRAY['general_customs_procedure']::text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'classification_notes'
  ) THEN
    ALTER TABLE public.shipments
      ADD COLUMN classification_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'classification_reviewed_at'
  ) THEN
    ALTER TABLE public.shipments
      ADD COLUMN classification_reviewed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'classification_reviewed_by'
  ) THEN
    ALTER TABLE public.shipments
      ADD COLUMN classification_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shipments_goods_category_idx ON public.shipments (goods_category);

-- ─── 2. Create shipment_customs_stages Table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_customs_stages (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id                uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  stage_key                  text NOT NULL,
  stage_order                integer NOT NULL,
  status                     text NOT NULL DEFAULT 'pending'
                             CHECK (status IN (
                               'not_applicable',
                               'pending',
                               'in_progress',
                               'awaiting_external_response',
                               'needs_correction',
                               'completed',
                               'blocked'
                             )),
  is_applicable              boolean NOT NULL DEFAULT true,
  expected_role              text NOT NULL DEFAULT 'admin',
  role_confirmed             boolean NOT NULL DEFAULT false,
  outcome                    text,
  reference_number           text,
  notes                      text,
  rejection_or_delay_reason  text,
  stage_data                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at               timestamptz,
  completed_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT shipment_customs_stages_unique_stage UNIQUE (shipment_id, stage_key)
);

CREATE INDEX IF NOT EXISTS shipment_customs_stages_shipment_idx
  ON public.shipment_customs_stages (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_customs_stages_status_idx
  ON public.shipment_customs_stages (status);

CREATE INDEX IF NOT EXISTS shipment_customs_stages_order_idx
  ON public.shipment_customs_stages (shipment_id, stage_order ASC);

-- ─── 3. Create shipment_customs_stage_history Table ───────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_customs_stage_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id        uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  stage_key          text NOT NULL,
  action             text NOT NULL, -- 'status_updated', 'classification_changed', 'reopened', 'completed', 'blocked'
  from_status        text,
  to_status          text,
  outcome            text,
  reference_number   text,
  notes              text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipment_customs_stage_history_shipment_idx
  ON public.shipment_customs_stage_history (shipment_id);

CREATE INDEX IF NOT EXISTS shipment_customs_stage_history_performed_at_idx
  ON public.shipment_customs_stage_history (performed_at DESC);

-- ─── 4. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.shipment_customs_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_customs_stage_history ENABLE ROW LEVEL SECURITY;

-- 4.1 Internal Staff SELECT on stages
DROP POLICY IF EXISTS "customs_stages_select_staff" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_select_staff"
  ON public.shipment_customs_stages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector', 'scout')
    )
  );

-- 4.2 Internal Staff INSERT/UPDATE on stages
DROP POLICY IF EXISTS "customs_stages_write_staff" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_write_staff"
  ON public.shipment_customs_stages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector', 'scout')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector', 'scout')
    )
  );

-- 4.3 Internal Staff SELECT on stage history
DROP POLICY IF EXISTS "customs_stage_history_select_staff" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_select_staff"
  ON public.shipment_customs_stage_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector', 'scout')
    )
  );

-- 4.4 Internal Staff INSERT on stage history
DROP POLICY IF EXISTS "customs_stage_history_insert_staff" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_insert_staff"
  ON public.shipment_customs_stage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'data_entry', 'inspector', 'scout')
    )
  );
