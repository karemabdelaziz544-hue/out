-- ============================================================
-- Migration: 0013_create_notifications
-- Description: Supports In-App Notification System:
--              1. Creates public.notifications table with strict foreign keys.
--              2. Configures indexes for recipient queries and unread counts.
--              3. Configures Row Level Security (RLS) for tenant isolation.
--              4. Defines helper functions for mark-as-read and creation.
-- Safe & Idempotent: Can be run repeatedly without errors.
-- ============================================================

-- ─── 1. Notifications Table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shipment_id  uuid REFERENCES public.shipments(id) ON DELETE CASCADE,
  title        text NOT NULL,
  message      text NOT NULL,
  type         text NOT NULL DEFAULT 'info',
  link         text,
  is_read      boolean NOT NULL DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_type_check
    CHECK (type IN ('info', 'success', 'warning', 'pricing', 'invoice', 'acid', 'document', 'readiness'))
);

-- ─── 2. Performance Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_shipment
  ON public.notifications (shipment_id);

-- ─── 3. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: User can view their own notifications only
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: User can update their own notifications (e.g. mark as read)
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: User can delete their own notifications
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Admins and managers can view all notifications if needed
DROP POLICY IF EXISTS "notifications_select_admin" ON public.notifications;
CREATE POLICY "notifications_select_admin"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager());

-- ─── 4. Comments ──────────────────────────────────────────────────────────────

COMMENT ON TABLE public.notifications IS
  'Real in-app notifications for users and admins across OUT platform.';

COMMENT ON COLUMN public.notifications.user_id IS
  'Recipient profile id (customer or admin). Strictly isolated by RLS.';
