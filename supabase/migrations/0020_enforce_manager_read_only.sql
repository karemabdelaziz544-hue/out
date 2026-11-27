-- =============================================================================
-- Migration 0020: Strictly Enforce Manager Role as Read-Only Across All RLS Policies
-- =============================================================================
-- Purpose:
--   Audit and harden all Row Level Security policies so the `manager` role has
--   zero INSERT, UPDATE, or DELETE permissions on any operational, shipment,
--   document, ACID, review, or customs-journey table, while preserving full
--   SELECT visibility via `public.is_admin_or_manager()`.
--
-- Scope (RLS policies only — DO NOT modify Migration 0019 directly):
--   1. public.shipments                      (shipments_all_admin -> is_admin())
--   2. public.documents                      (documents_update_admin -> is_admin())
--   3. public.shipment_invoice_reviews       (invoice_reviews_insert_admin -> is_admin())
--   4. public.shipment_acids                 (shipment_acids_all_admin -> is_admin())
--   5. public.shipment_acid_history          (shipment_acid_history_all_admin -> is_admin())
--   6. public.shipment_document_reviews      (select admin/manager; writes admin or own company)
--   7. public.shipment_stage_history         (shipment_stage_history_all_admin -> is_admin())
--   8. public.shipment_external_operations   (remove 'manager' from insert/update policies)
--   9. public.shipment_customs_stages        (drop customs_stages_write_manager_non_financial)
--  10. public.shipment_customs_stage_history (remove manager write branch)
--  11. public.shipment_regulatory_procedures (split select admin/manager from all admin)
-- =============================================================================

-- ─── 1. public.shipments ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "shipments_select_admin" ON public.shipments;
CREATE POLICY "shipments_select_admin"
  ON public.shipments
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "shipments_all_admin" ON public.shipments;
CREATE POLICY "shipments_all_admin"
  ON public.shipments
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── 2. public.documents ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_select_admin" ON public.documents;
CREATE POLICY "documents_select_admin"
  ON public.documents
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "documents_update_admin" ON public.documents;
CREATE POLICY "documents_update_admin"
  ON public.documents
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── 3. public.shipment_invoice_reviews ───────────────────────────────────────
DROP POLICY IF EXISTS "invoice_reviews_select_admin" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_select_admin"
  ON public.shipment_invoice_reviews
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "invoice_reviews_insert_admin" ON public.shipment_invoice_reviews;
CREATE POLICY "invoice_reviews_insert_admin"
  ON public.shipment_invoice_reviews
  FOR INSERT
  WITH CHECK (public.is_admin());

-- ─── 4. public.shipment_acids & 5. public.shipment_acid_history ───────────────
DROP POLICY IF EXISTS "shipment_acids_select_admin" ON public.shipment_acids;
CREATE POLICY "shipment_acids_select_admin"
  ON public.shipment_acids
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "shipment_acids_all_admin" ON public.shipment_acids;
CREATE POLICY "shipment_acids_all_admin"
  ON public.shipment_acids
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "shipment_acid_history_select_admin" ON public.shipment_acid_history;
CREATE POLICY "shipment_acid_history_select_admin"
  ON public.shipment_acid_history
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "shipment_acid_history_all_admin" ON public.shipment_acid_history;
CREATE POLICY "shipment_acid_history_all_admin"
  ON public.shipment_acid_history
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── 6. public.shipment_document_reviews ──────────────────────────────────────
DROP POLICY IF EXISTS "shipment_doc_reviews_admin_all" ON public.shipment_document_reviews;
DROP POLICY IF EXISTS "shipment_doc_reviews_admin_manager_select" ON public.shipment_document_reviews;
CREATE POLICY "shipment_doc_reviews_admin_manager_select"
  ON public.shipment_document_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "shipment_doc_reviews_admin_write" ON public.shipment_document_reviews;
CREATE POLICY "shipment_doc_reviews_admin_write"
  ON public.shipment_document_reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "shipment_doc_reviews_customer_insert" ON public.shipment_document_reviews;
CREATE POLICY "shipment_doc_reviews_customer_insert"
  ON public.shipment_document_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_document_reviews.shipment_id
        AND s.company_id = public.get_auth_user_company_id()
    )
    OR public.is_admin()
  );

-- ─── 7. public.shipment_stage_history ─────────────────────────────────────────
DROP POLICY IF EXISTS "shipment_stage_history_select_admin" ON public.shipment_stage_history;
CREATE POLICY "shipment_stage_history_select_admin"
  ON public.shipment_stage_history
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "shipment_stage_history_all_admin" ON public.shipment_stage_history;
CREATE POLICY "shipment_stage_history_all_admin"
  ON public.shipment_stage_history
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── 8. public.shipment_external_operations ───────────────────────────────────
DROP POLICY IF EXISTS "shipment_ext_ops_insert_staff" ON public.shipment_external_operations;
CREATE POLICY "shipment_ext_ops_insert_staff"
  ON public.shipment_external_operations
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_active = true
        AND COALESCE(provisioning_status, 'active') = 'active'
        AND role IN ('admin', 'data_entry', 'inspector')
    )
  );

DROP POLICY IF EXISTS "shipment_ext_ops_update_staff" ON public.shipment_external_operations;
CREATE POLICY "shipment_ext_ops_update_staff"
  ON public.shipment_external_operations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_active = true
        AND COALESCE(provisioning_status, 'active') = 'active'
        AND role IN ('admin', 'data_entry', 'inspector')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_active = true
        AND COALESCE(provisioning_status, 'active') = 'active'
        AND role IN ('admin', 'data_entry', 'inspector')
    )
  );

-- ─── 9. public.shipment_customs_stages ────────────────────────────────────────
-- Keep customs_stages_select_admin_manager and customs_stages_write_admin;
-- drop manager write policy completely.
DROP POLICY IF EXISTS "customs_stages_write_manager_non_financial" ON public.shipment_customs_stages;

-- ─── 10. public.shipment_customs_stage_history ────────────────────────────────
DROP POLICY IF EXISTS "customs_stage_history_insert_authorized_staff" ON public.shipment_customs_stage_history;
CREATE POLICY "customs_stage_history_insert_authorized_staff"
  ON public.shipment_customs_stage_history
  FOR INSERT
  WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.is_admin()
      OR (
        public.get_auth_user_role() IN ('scout', 'inspector', 'data_entry')
        AND stage_key NOT IN ('stage_2_pricing', 'stage_9_fees_payments')
        AND public.is_staff_assigned_to_shipment(shipment_id)
      )
    )
  );

-- ─── 11. public.shipment_regulatory_procedures ────────────────────────────────
DROP POLICY IF EXISTS "regulatory_procedures_all_admin_manager" ON public.shipment_regulatory_procedures;

DROP POLICY IF EXISTS "regulatory_procedures_select_admin_manager" ON public.shipment_regulatory_procedures;
CREATE POLICY "regulatory_procedures_select_admin_manager"
  ON public.shipment_regulatory_procedures
  FOR SELECT
  USING (public.is_admin_or_manager());

DROP POLICY IF EXISTS "regulatory_procedures_all_admin" ON public.shipment_regulatory_procedures;
CREATE POLICY "regulatory_procedures_all_admin"
  ON public.shipment_regulatory_procedures
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
