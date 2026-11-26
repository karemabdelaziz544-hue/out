-- ============================================================
-- Migration: 0018_form46_regulatory_and_stage_security
-- Phase 1 Scope:
--   1. Audit & ownership columns on profiles, companies, shipments,
--      shipment_pricing, and shipment_pricing_history.
--   2. Independent Form 46 stage ('stage_4_form_46') in shipment_customs_stages,
--      assigned_to column, two-step stage_order shift, and safe historical
--      backfill without fabricating completed_at or completed_by.
--   3. Authoritative single source of truth for regulatory procedures:
--      public.shipment_regulatory_procedures with automatic synchronization
--      trigger to shipments.applicable_procedures and stage_4_type_procedures.
--   4. Removal of permissive staff policies from 0015 and enforcement of
--      role + assignment RLS policies, customer read RLS policy, and
--      BEFORE UPDATE structural-column immutability trigger.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

BEGIN;

-- ─── 1. Audit & Ownership Columns on profiles, companies, shipments ───────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_admin_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_provisioning_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_provisioning_status_check
      CHECK (provisioning_status IN (
        'pending_provisioning',
        'invited',
        'active',
        'provisioning_failed',
        'disabled'
      ));
  END IF;
END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS management_mode text NOT NULL DEFAULT 'self_service';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_management_mode_check'
  ) THEN
    ALTER TABLE public.shipments
      ADD CONSTRAINT shipments_management_mode_check
      CHECK (management_mode IN ('self_service', 'admin_managed'));
  END IF;
END $$;

-- ─── 2. Pricing Approval Distinction & Admin-Recorded Approval Audit ──────────

ALTER TABLE public.shipment_pricing
  ADD COLUMN IF NOT EXISTS approval_type text,
  ADD COLUMN IF NOT EXISTS approval_source text,
  ADD COLUMN IF NOT EXISTS approval_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_channel text,
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmation_reference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_pricing_approval_type_check'
  ) THEN
    ALTER TABLE public.shipment_pricing
      ADD CONSTRAINT shipment_pricing_approval_type_check
      CHECK (approval_type IS NULL OR approval_type IN ('estimated_range', 'final_fixed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_pricing_approval_source_check'
  ) THEN
    ALTER TABLE public.shipment_pricing
      ADD CONSTRAINT shipment_pricing_approval_source_check
      CHECK (approval_source IS NULL OR approval_source IN ('customer_direct', 'admin_on_behalf'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_pricing_approval_channel_check'
  ) THEN
    ALTER TABLE public.shipment_pricing
      ADD CONSTRAINT shipment_pricing_approval_channel_check
      CHECK (approval_channel IS NULL OR approval_channel IN ('portal', 'phone_call', 'whatsapp', 'in_person', 'email'));
  END IF;
END $$;

ALTER TABLE public.shipment_pricing_history
  ADD COLUMN IF NOT EXISTS approval_type text,
  ADD COLUMN IF NOT EXISTS approval_source text,
  ADD COLUMN IF NOT EXISTS approval_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_channel text,
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmation_reference text;

-- Allow Manager read-only access to shipment_pricing and shipment_pricing_history (Decision 2)
DROP POLICY IF EXISTS "pricing_select_admin" ON public.shipment_pricing;
CREATE POLICY "pricing_select_admin"
  ON public.shipment_pricing
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "pricing_history_select_admin" ON public.shipment_pricing_history;
CREATE POLICY "pricing_history_select_admin"
  ON public.shipment_pricing_history
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

-- Backfill existing approved pricing records with approval_type & approval_source
UPDATE public.shipment_pricing
SET
  approval_type = CASE WHEN final_price IS NOT NULL THEN 'final_fixed' ELSE 'estimated_range' END,
  approval_source = COALESCE(approval_source, 'customer_direct'),
  approval_channel = COALESCE(approval_channel, 'portal')
WHERE status = 'customer_approved'
  AND approval_type IS NULL;

-- ─── 3. Expand shipment_customs_stages for Independent Form 46 & Assignment ───

ALTER TABLE public.shipment_customs_stages
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shipment_customs_stages_assigned_to_idx
  ON public.shipment_customs_stages (assigned_to);

-- Drop existing anonymous/named status check constraint on shipment_customs_stages to add 'skipped'
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'shipment_customs_stages'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.shipment_customs_stages DROP CONSTRAINT IF EXISTS %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.shipment_customs_stages
  ADD CONSTRAINT shipment_customs_stages_status_check
  CHECK (status IN (
    'not_applicable',
    'skipped',
    'pending',
    'in_progress',
    'awaiting_external_response',
    'needs_correction',
    'completed',
    'blocked'
  ));

-- Add valid stage_key check constraint including 'stage_4_form_46'
ALTER TABLE public.shipment_customs_stages
  DROP CONSTRAINT IF EXISTS shipment_customs_stages_stage_key_check;

ALTER TABLE public.shipment_customs_stages
  ADD CONSTRAINT shipment_customs_stages_stage_key_check
  CHECK (stage_key IN (
    'stage_1_intake',
    'stage_2_pricing',
    'stage_3_nafeza_acid',
    'stage_4_form_46',
    'stage_4_type_procedures',
    'stage_5_scouting',
    'stage_6_inspection',
    'stage_7_data_entry',
    'stage_8_valuation',
    'stage_9_fees_payments',
    'stage_10_clearance_release'
  ));

-- Add consistency constraint between status, is_applicable, and legacy_resolution for stage_4_form_46
ALTER TABLE public.shipment_customs_stages
  DROP CONSTRAINT IF EXISTS shipment_customs_stages_form46_integrity_check;

ALTER TABLE public.shipment_customs_stages
  ADD CONSTRAINT shipment_customs_stages_form46_integrity_check
  CHECK (
    stage_key <> 'stage_4_form_46'
    OR (
      (
        status = 'completed'
        AND is_applicable = true
        AND completed_at IS NOT NULL
        AND completed_by IS NOT NULL
        AND COALESCE(NULLIF(btrim(reference_number), ''), NULLIF(btrim(stage_data->>'declaration_46_number'), '')) IS NOT NULL
      )
      OR (
        status = 'skipped'
        AND is_applicable = false
        AND completed_at IS NULL
        AND completed_by IS NULL
        AND stage_data->>'legacy_resolution' = 'satisfied_from_stage_7'
      )
      OR (
        status = 'not_applicable'
        AND is_applicable = false
        AND completed_at IS NULL
        AND completed_by IS NULL
      )
      OR (
        status IN ('pending', 'in_progress', 'awaiting_external_response', 'needs_correction', 'blocked')
        AND completed_at IS NULL
        AND completed_by IS NULL
      )
    )
  );

-- Two-Step Stage Order Shift (avoids any unique order collision)
-- Step A: Shift stages >= 4 by +100
UPDATE public.shipment_customs_stages
SET stage_order = stage_order + 100
WHERE stage_order >= 4 AND stage_order < 100;

-- Step B: Assign authoritative 1..11 stage_order
--   1: stage_1_intake
--   2: stage_2_pricing
--   3: stage_3_nafeza_acid
--   4: stage_4_form_46 (Gate before field operations)
--   5: stage_5_scouting (Scout)
--   6: stage_6_inspection (Inspector)
--   7: stage_4_type_procedures (Regulatory procedures after inspection)
--   8: stage_7_data_entry (Data entry)
--   9: stage_8_valuation (Valuation)
--  10: stage_9_fees_payments (Customs duties & settlement)
--  11: stage_10_clearance_release (Final clearance & transport)
UPDATE public.shipment_customs_stages
SET stage_order = CASE stage_key
  WHEN 'stage_1_intake' THEN 1
  WHEN 'stage_2_pricing' THEN 2
  WHEN 'stage_3_nafeza_acid' THEN 3
  WHEN 'stage_4_form_46' THEN 4
  WHEN 'stage_5_scouting' THEN 5
  WHEN 'stage_6_inspection' THEN 6
  WHEN 'stage_4_type_procedures' THEN 7
  WHEN 'stage_7_data_entry' THEN 8
  WHEN 'stage_8_valuation' THEN 9
  WHEN 'stage_9_fees_payments' THEN 10
  WHEN 'stage_10_clearance_release' THEN 11
  ELSE stage_order
END;

-- Safe Backfill of stage_4_form_46 for existing shipments without fabricating completion timestamps
INSERT INTO public.shipment_customs_stages (
  shipment_id,
  stage_key,
  stage_order,
  status,
  is_applicable,
  expected_role,
  role_confirmed,
  outcome,
  reference_number,
  notes,
  stage_data,
  completed_at,
  completed_by
)
SELECT
  s.id AS shipment_id,
  'stage_4_form_46' AS stage_key,
  4 AS stage_order,
  CASE
    -- Case 1: Historical Form 46 recorded inside stage_7_data_entry -> 'skipped' (satisfied historically)
    WHEN COALESCE(NULLIF(btrim(st7.stage_data->>'declaration_46_number'), ''), NULLIF(btrim(st7.stage_data->>'declaration_46_advisory'), ''), NULLIF(btrim(st7.reference_number), '')) IS NOT NULL
      THEN 'skipped'
    -- Case 2: Terminal legacy shipment without Form 46 -> 'not_applicable' (exempt unless reopened)
    WHEN s.status IN ('customs_cleared', 'delivered')
      THEN 'not_applicable'
    -- Case 3: Active shipment -> 'pending'
    ELSE 'pending'
  END AS status,
  CASE
    WHEN COALESCE(NULLIF(btrim(st7.stage_data->>'declaration_46_number'), ''), NULLIF(btrim(st7.stage_data->>'declaration_46_advisory'), ''), NULLIF(btrim(st7.reference_number), '')) IS NOT NULL
      THEN false
    WHEN s.status IN ('customs_cleared', 'delivered')
      THEN false
    ELSE true
  END AS is_applicable,
  'data_entry' AS expected_role,
  true AS role_confirmed,
  CASE
    WHEN COALESCE(NULLIF(btrim(st7.stage_data->>'declaration_46_number'), ''), NULLIF(btrim(st7.stage_data->>'declaration_46_advisory'), ''), NULLIF(btrim(st7.reference_number), '')) IS NOT NULL
      THEN 'مستوفى تاريخياً من سجل مرحلة إدراج البيانات السابقة'
    WHEN s.status IN ('customs_cleared', 'delivered')
      THEN 'شحنة منتهية تاريخياً قبل استحداث بوابة رقم 46 المستقلة'
    ELSE NULL
  END AS outcome,
  COALESCE(NULLIF(btrim(st7.stage_data->>'declaration_46_number'), ''), NULLIF(btrim(st7.stage_data->>'declaration_46_advisory'), ''), NULLIF(btrim(st7.reference_number), '')) AS reference_number,
  NULL AS notes,
  CASE
    WHEN COALESCE(NULLIF(btrim(st7.stage_data->>'declaration_46_number'), ''), NULLIF(btrim(st7.stage_data->>'declaration_46_advisory'), ''), NULLIF(btrim(st7.reference_number), '')) IS NOT NULL
      THEN jsonb_build_object(
        'legacy_resolution', 'satisfied_from_stage_7',
        'source_stage', 'stage_7_data_entry',
        'historical_form_46_number', COALESCE(NULLIF(btrim(st7.stage_data->>'declaration_46_number'), ''), NULLIF(btrim(st7.stage_data->>'declaration_46_advisory'), ''), NULLIF(btrim(st7.reference_number), '')),
        'historical_recorded_by', st7.completed_by,
        'historical_recorded_at', COALESCE(st7.completed_at, st7.updated_at)
      )
    WHEN s.status IN ('customs_cleared', 'delivered')
      THEN jsonb_build_object(
        'legacy_resolution', 'exempt_terminal_shipment'
      )
    WHEN EXISTS (
      SELECT 1 FROM public.shipment_customs_stages sc
      WHERE sc.shipment_id = s.id
        AND sc.stage_key IN ('stage_5_scouting', 'stage_6_inspection')
        AND sc.status = 'completed'
    )
      THEN jsonb_build_object(
        'legacy_resolution', 'field_started_before_form46_gate'
      )
    ELSE '{}'::jsonb
  END AS stage_data,
  NULL AS completed_at,
  NULL AS completed_by
FROM public.shipments s
LEFT JOIN public.shipment_customs_stages st7
  ON st7.shipment_id = s.id AND st7.stage_key = 'stage_7_data_entry'
WHERE EXISTS (
  SELECT 1 FROM public.shipment_customs_stages any_st WHERE any_st.shipment_id = s.id
)
ON CONFLICT (shipment_id, stage_key) DO NOTHING;

-- ─── 4. Authoritative Regulatory Procedures Table & Synchronization Trigger ───

CREATE TABLE IF NOT EXISTS public.shipment_regulatory_procedures (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id        uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  procedure_code     text NOT NULL,
  authority_name_ar  text NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'in_progress', 'sample_taken', 'approved', 'rejected')),
  reference_number   text,
  sample_taken       boolean NOT NULL DEFAULT false,
  inspector_name     text,
  notes              text,
  assigned_to        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at       timestamptz,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_shipment_regulatory_procedure UNIQUE (shipment_id, procedure_code)
);

CREATE INDEX IF NOT EXISTS idx_shipment_regulatory_procedures_shipment
  ON public.shipment_regulatory_procedures (shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_regulatory_procedures_assigned
  ON public.shipment_regulatory_procedures (assigned_to);

DROP TRIGGER IF EXISTS shipment_regulatory_procedures_updated_at ON public.shipment_regulatory_procedures;
CREATE TRIGGER shipment_regulatory_procedures_updated_at
  BEFORE UPDATE ON public.shipment_regulatory_procedures
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Change default of shipments.applicable_procedures to empty array '{}' (no auto-assumed procedures)
ALTER TABLE public.shipments
  ALTER COLUMN applicable_procedures SET DEFAULT '{}'::text[];

-- Backfill existing specialized procedures from shipments.applicable_procedures into shipment_regulatory_procedures
INSERT INTO public.shipment_regulatory_procedures (
  shipment_id,
  procedure_code,
  authority_name_ar,
  status,
  reference_number,
  notes,
  completed_by,
  completed_at,
  created_by
)
SELECT
  s.id AS shipment_id,
  proc_code AS procedure_code,
  CASE proc_code
    WHEN 'plant_quarantine' THEN 'الإدارة المركزية للحجر الزراعي'
    WHEN 'food_safety_authority' THEN 'الهيئة القومية لسلامة الغذاء (NFSA)'
    WHEN 'food_safety' THEN 'الهيئة القومية لسلامة الغذاء (NFSA)'
    WHEN 'industrial_standards_inspection' THEN 'الهيئة العامة للرقابة على الصادرات والواردات (GOEIC)'
    WHEN 'radiation_clearance' THEN 'هيئة الطاقة الذرية / الكشف الإشعاعي'
    WHEN 'telecom_approval' THEN 'الجهاز القومي لتنظيم الاتصالات (NTRA)'
    ELSE proc_code
  END AS authority_name_ar,
  CASE
    WHEN st4.status = 'completed' THEN 'approved'
    WHEN st4.status = 'in_progress' OR st4.status = 'awaiting_external_response' THEN 'in_progress'
    ELSE 'pending'
  END AS status,
  st4.reference_number,
  st4.notes,
  st4.completed_by,
  st4.completed_at,
  s.classification_reviewed_by
FROM public.shipments s
CROSS JOIN LATERAL unnest(COALESCE(s.applicable_procedures, '{}'::text[])) AS proc_code
LEFT JOIN public.shipment_customs_stages st4
  ON st4.shipment_id = s.id AND st4.stage_key = 'stage_4_type_procedures'
WHERE proc_code <> 'general_customs_procedure'
ON CONFLICT (shipment_id, procedure_code) DO NOTHING;

-- Synchronization Trigger: Keeps shipments.applicable_procedures and stage_4_type_procedures in sync
CREATE OR REPLACE FUNCTION public.sync_shipment_regulatory_procedures()
RETURNS trigger AS $$
DECLARE
  v_shipment_id uuid;
  v_codes text[];
  v_total_count integer;
  v_unapproved_count integer;
  v_stage4_status text;
BEGIN
  v_shipment_id := COALESCE(NEW.shipment_id, OLD.shipment_id);

  SELECT
    COALESCE(array_agg(procedure_code ORDER BY created_at ASC), '{}'::text[]),
    COUNT(*),
    COUNT(*) FILTER (WHERE status <> 'approved')
  INTO v_codes, v_total_count, v_unapproved_count
  FROM public.shipment_regulatory_procedures
  WHERE shipment_id = v_shipment_id;

  -- Update shipments.applicable_procedures derived array
  UPDATE public.shipments
  SET applicable_procedures = v_codes
  WHERE id = v_shipment_id;

  -- Synchronize stage_4_type_procedures applicability & reopen if a new pending procedure is added after completion
  SELECT status INTO v_stage4_status
  FROM public.shipment_customs_stages
  WHERE shipment_id = v_shipment_id AND stage_key = 'stage_4_type_procedures';

  IF FOUND THEN
    IF v_total_count = 0 THEN
      IF v_stage4_status IN ('pending', 'not_applicable') THEN
        UPDATE public.shipment_customs_stages
        SET is_applicable = false, status = 'not_applicable', updated_at = now()
        WHERE shipment_id = v_shipment_id AND stage_key = 'stage_4_type_procedures';
      END IF;
    ELSE
      IF v_stage4_status = 'not_applicable' THEN
        UPDATE public.shipment_customs_stages
        SET is_applicable = true, status = 'pending', updated_at = now()
        WHERE shipment_id = v_shipment_id AND stage_key = 'stage_4_type_procedures';
      ELSIF v_stage4_status = 'completed' AND v_unapproved_count > 0 THEN
        -- Reopen stage_4_type_procedures if a newly added procedure is not yet approved
        UPDATE public.shipment_customs_stages
        SET
          is_applicable = true,
          status = 'in_progress',
          completed_at = NULL,
          completed_by = NULL,
          updated_at = now()
        WHERE shipment_id = v_shipment_id AND stage_key = 'stage_4_type_procedures';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_shipment_regulatory_procedures ON public.shipment_regulatory_procedures;
CREATE TRIGGER trg_sync_shipment_regulatory_procedures
  AFTER INSERT OR UPDATE OR DELETE ON public.shipment_regulatory_procedures
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_shipment_regulatory_procedures();

-- Guard Trigger: Prevent completing stage_4_type_procedures while any regulatory procedure is unapproved
-- AND prevent non-admin/non-manager staff from mutating structural columns on shipment_customs_stages
CREATE OR REPLACE FUNCTION public.enforce_customs_stage_guards()
RETURNS trigger AS $$
DECLARE
  v_role public.user_role;
  v_unapproved_count integer;
BEGIN
  v_role := public.get_auth_user_role();

  -- 1. If authenticated user is operational staff (not admin/manager and not service_role where auth.uid() is null)
  IF auth.uid() IS NOT NULL AND v_role NOT IN ('admin', 'manager') THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
         OR NEW.stage_key IS DISTINCT FROM OLD.stage_key
         OR NEW.stage_order IS DISTINCT FROM OLD.stage_order
         OR NEW.expected_role IS DISTINCT FROM OLD.expected_role
         OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
         OR NEW.is_applicable IS DISTINCT FROM OLD.is_applicable
      THEN
        RAISE EXCEPTION 'UNAUTHORIZED_STRUCTURAL_COLUMN_MUTATION: غير مصرح بتعديل الخصائص الهيكلية أو الإسناد للمرحلة';
      END IF;
    END IF;
  END IF;

  -- 2. Block completing stage_4_type_procedures if any regulatory procedure is not approved
  IF NEW.stage_key = 'stage_4_type_procedures' AND NEW.status = 'completed' THEN
    SELECT COUNT(*) INTO v_unapproved_count
    FROM public.shipment_regulatory_procedures
    WHERE shipment_id = NEW.shipment_id
      AND status <> 'approved';

    IF v_unapproved_count > 0 THEN
      RAISE EXCEPTION 'UNAPPROVED_REGULATORY_PROCEDURES: لا يمكن اعتماد اكتمال مرحلة الجهات الرقابية لوجود % إجراء غير معتمد بعد', v_unapproved_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_customs_stage_guards ON public.shipment_customs_stages;
CREATE TRIGGER trg_enforce_customs_stage_guards
  BEFORE UPDATE OR INSERT ON public.shipment_customs_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customs_stage_guards();

-- ─── 5. Least-Privilege RLS Policies for Stages, History, Shipments & Procedures ─

-- 5.1 Helper function: checks if current staff user is assigned to a shipment stage
CREATE OR REPLACE FUNCTION public.is_staff_assigned_to_shipment(p_shipment_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shipment_customs_stages scs
    WHERE scs.shipment_id = p_shipment_id
      AND (
        scs.assigned_to = auth.uid()
        OR (scs.assigned_to IS NULL AND scs.expected_role = (public.get_auth_user_role())::text)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.2 Drop permissive staff policies from 0015
DROP POLICY IF EXISTS "customs_stages_select_staff" ON public.shipment_customs_stages;
DROP POLICY IF EXISTS "customs_stages_write_staff" ON public.shipment_customs_stages;
DROP POLICY IF EXISTS "customs_stage_history_select_staff" ON public.shipment_customs_stage_history;
DROP POLICY IF EXISTS "customs_stage_history_insert_staff" ON public.shipment_customs_stage_history;

-- 5.3 New strict policies on shipment_customs_stages
-- Admin & Manager: full access
DROP POLICY IF EXISTS "customs_stages_all_admin_manager" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_all_admin_manager"
  ON public.shipment_customs_stages
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- Customer: read-only access to stages of their own company's shipments (excludes internal financial stage_9 details in app layer)
DROP POLICY IF EXISTS "customs_stages_select_customer_own" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_select_customer_own"
  ON public.shipment_customs_stages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_customs_stages.shipment_id
        AND (s.customer_id = auth.uid() OR s.company_id = public.get_auth_user_company_id())
    )
  );

-- Operational Staff (scout, inspector, data_entry):
-- Can SELECT stages of shipments they are assigned to, EXCLUDING financial stage_2_pricing and stage_9_fees_payments
DROP POLICY IF EXISTS "customs_stages_select_assigned_staff" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_select_assigned_staff"
  ON public.shipment_customs_stages
  FOR SELECT
  TO authenticated
  USING (
    public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
    AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
    AND public.is_staff_assigned_to_shipment(shipment_id)
  );

-- Operational Staff UPDATE: ONLY on their own role's stage AND assigned to them (or unassigned pool for their role)
DROP POLICY IF EXISTS "customs_stages_update_assigned_staff" ON public.shipment_customs_stages;
CREATE POLICY "customs_stages_update_assigned_staff"
  ON public.shipment_customs_stages
  FOR UPDATE
  TO authenticated
  USING (
    public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
    AND expected_role = (public.get_auth_user_role())::text
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
    AND expected_role = (public.get_auth_user_role())::text
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  );

-- 5.4 New strict policies on shipment_customs_stage_history
DROP POLICY IF EXISTS "customs_stage_history_select_admin_manager" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_select_admin_manager"
  ON public.shipment_customs_stage_history
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "customs_stage_history_select_assigned_staff" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_select_assigned_staff"
  ON public.shipment_customs_stage_history
  FOR SELECT
  TO authenticated
  USING (
    public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
    AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
    AND public.is_staff_assigned_to_shipment(shipment_id)
  );

DROP POLICY IF EXISTS "customs_stage_history_insert_authorized_staff" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_insert_authorized_staff"
  ON public.shipment_customs_stage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.is_admin_or_manager()
      OR (
        public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
        AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
        AND public.is_staff_assigned_to_shipment(shipment_id)
      )
    )
  );

-- 5.5 Allow assigned operational staff to SELECT basic shipment rows for their assigned shipments
DROP POLICY IF EXISTS "shipments_select_assigned_staff" ON public.shipments;
CREATE POLICY "shipments_select_assigned_staff"
  ON public.shipments
  FOR SELECT
  TO authenticated
  USING (
    public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
    AND public.is_staff_assigned_to_shipment(id)
  );

-- 5.6 RLS on shipment_regulatory_procedures
ALTER TABLE public.shipment_regulatory_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_procedures_all_admin_manager" ON public.shipment_regulatory_procedures;
CREATE POLICY "regulatory_procedures_all_admin_manager"
  ON public.shipment_regulatory_procedures
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

DROP POLICY IF EXISTS "regulatory_procedures_select_customer_own" ON public.shipment_regulatory_procedures;
CREATE POLICY "regulatory_procedures_select_customer_own"
  ON public.shipment_regulatory_procedures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_regulatory_procedures.shipment_id
        AND (s.customer_id = auth.uid() OR s.company_id = public.get_auth_user_company_id())
    )
  );

DROP POLICY IF EXISTS "regulatory_procedures_select_staff" ON public.shipment_regulatory_procedures;
CREATE POLICY "regulatory_procedures_select_staff"
  ON public.shipment_regulatory_procedures
  FOR SELECT
  TO authenticated
  USING (
    public.get_auth_user_role() IN ('inspector', 'data_entry')
    AND public.is_staff_assigned_to_shipment(shipment_id)
  );

DROP POLICY IF EXISTS "regulatory_procedures_update_inspector" ON public.shipment_regulatory_procedures;
CREATE POLICY "regulatory_procedures_update_inspector"
  ON public.shipment_regulatory_procedures
  FOR UPDATE
  TO authenticated
  USING (
    public.get_auth_user_role() = 'inspector'
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
    AND public.is_staff_assigned_to_shipment(shipment_id)
  )
  WITH CHECK (
    public.get_auth_user_role() = 'inspector'
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  );

COMMIT;

-- ============================================================
-- DOWN / ROLLBACK SCRIPT (For isolated test environment reversal)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_customs_stage_guards ON public.shipment_customs_stages;
-- DROP FUNCTION IF EXISTS public.enforce_customs_stage_guards();
-- DROP TRIGGER IF EXISTS trg_sync_shipment_regulatory_procedures ON public.shipment_regulatory_procedures;
-- DROP FUNCTION IF EXISTS public.sync_shipment_regulatory_procedures();
-- DROP TABLE IF EXISTS public.shipment_regulatory_procedures;
-- DELETE FROM public.shipment_customs_stages WHERE stage_key = 'stage_4_form_46';
-- UPDATE public.shipment_customs_stages SET stage_order = CASE stage_key
--   WHEN 'stage_1_intake' THEN 1
--   WHEN 'stage_2_pricing' THEN 2
--   WHEN 'stage_3_nafeza_acid' THEN 3
--   WHEN 'stage_4_type_procedures' THEN 4
--   WHEN 'stage_5_scouting' THEN 5
--   WHEN 'stage_6_inspection' THEN 6
--   WHEN 'stage_7_data_entry' THEN 7
--   WHEN 'stage_8_valuation' THEN 8
--   WHEN 'stage_9_fees_payments' THEN 9
--   WHEN 'stage_10_clearance_release' THEN 10
--   ELSE stage_order END;
-- COMMIT;
