/**
 * Notification Queries & Service
 *
 * Real in-app notification queries and creation helpers.
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AppNotification, NotificationType } from "@/types";
import type { Database } from "@/types/database";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey);
}

/**
 * Fetch notifications for a user.
 */
export async function getUserNotifications(
  userId: string,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
  },
): Promise<AppNotification[]> {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(50);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[notifications/queries] Error fetching notifications:", error.message);
    return [];
  }

  return (data || []) as AppNotification[];
}

/**
 * Get count of unread notifications for a user.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    console.error("[notifications/queries] Error fetching unread count:", error.message);
    return 0;
  }

  return count || 0;
}

/**
 * Create a notification for a user (called from Server Actions upon business events).
 * Uses admin client to bypass RLS when acting across user boundaries (e.g. Admin notifying Customer or vice versa).
 */
export async function createNotification({
  userId,
  shipmentId = null,
  title,
  message,
  type = "info",
  link = null,
}: {
  userId: string;
  shipmentId?: string | null;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string | null;
}): Promise<boolean> {
  try {
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("notifications").insert({
      user_id: userId,
      shipment_id: shipmentId,
      title,
      message,
      type,
      link,
      is_read: false,
    });

    if (error) {
      console.error("[notifications/create] DB error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifications/create] Exception:", err);
    return false;
  }
}

/**
 * Notify all admins/managers about an event.
 */
export async function notifyAdmins({
  shipmentId = null,
  title,
  message,
  type = "info",
  link = null,
}: {
  shipmentId?: string | null;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string | null;
}): Promise<void> {
  try {
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: admins } = await (admin as any)
      .from("profiles")
      .select("id")
      .in("role", ["admin", "manager"])
      .eq("is_active", true);

    if (!admins || admins.length === 0) return;

    const rows = admins.map((a: { id: string }) => ({
      user_id: a.id,
      shipment_id: shipmentId,
      title,
      message,
      type,
      link,
      is_read: false,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("notifications").insert(rows);
  } catch (err) {
    console.error("[notifications/notifyAdmins] Error:", err);
  }
}
