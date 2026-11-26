"use server";

/**
 * Customer Server Actions
 *
 * Secure server-side mutations for customer management.
 * Enforces admin authorization on every request.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Toggle customer account active status (activate / deactivate).
 * Strictly requires admin role.
 */
export async function toggleCustomerStatusAction(
  customerId: string,
  nextStatus: boolean,
): Promise<ActionResult> {
  try {
    // 1. Enforce admin role server-side
    await requireRole(["admin"]);

    // 2. Validate input
    if (!customerId || typeof customerId !== "string") {
      return { success: false, error: "معرّف العميل غير صالح" };
    }

    if (typeof nextStatus !== "boolean") {
      return { success: false, error: "حالة الحساب غير صالحة" };
    }

    const supabase = await createClient();
    // Postgrest client types require cast here due to custom database schema definitions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("profiles") as any)
      .update({
        is_active: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
      .eq("role", "customer");

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[toggleCustomerStatusAction] Error:", error.message);
      }
      return { success: false, error: "تعذر تحديث حالة الحساب في قاعدة البيانات" };
    }

    // 4. Revalidate cache for customer pages
    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);

    return {
      success: true,
      message: nextStatus
        ? "تم تفعيل حساب العميل بنجاح"
        : "تم تعطيل حساب العميل بنجاح",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[toggleCustomerStatusAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ أثناء تنفيذ الإجراء أو ليس لديك الصلاحية الكافية",
    };
  }
}
