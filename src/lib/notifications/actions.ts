"use server";

/**
 * Notification Server Actions
 *
 * Mark notifications as read / mark all as read.
 */

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationAsReadAction(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    if (!notificationId) {
      return { success: false, error: "معرف الإشعار غير صحيح." };
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[markNotificationAsReadAction] Error:", error.message);
      return { success: false, error: "تعذر تحديث حالة الإشعار." };
    }

    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("[markNotificationAsReadAction] Exception:", err);
    return { success: false, error: "حدث خطأ غير متوقع." };
  }
}

export async function markAllNotificationsAsReadAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("[markAllNotificationsAsReadAction] Error:", error.message);
      return { success: false, error: "تعذر تحديث الإشعارات." };
    }

    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("[markAllNotificationsAsReadAction] Exception:", err);
    return { success: false, error: "حدث خطأ غير متوقع." };
  }
}
