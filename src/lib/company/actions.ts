"use server";

/**
 * Company Server Actions
 *
 * Secure server mutations for viewing and updating company information.
 * Enforces customer authentication and RLS ownership.
 */

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types";

export interface CompanyActionResult {
  success: boolean;
  message?: string;
  error?: string;
  company?: Company;
}

export async function saveCustomerCompanyAction(
  formData: FormData,
): Promise<CompanyActionResult> {
  try {
    const currentUser = await requireAuth();

    // Only customers are expected to use this action
    if (currentUser.role !== "customer") {
      return {
        success: false,
        error: "هذا الإجراء مخصص لحسابات العملاء فقط.",
      };
    }

    const name = (formData.get("name") as string)?.trim();
    const crn = (formData.get("commercial_registration_number") as string)?.trim() || null;
    const tax = (formData.get("tax_card_number") as string)?.trim() || null;
    const imp = (formData.get("import_card_number") as string)?.trim() || null;
    const vat = (formData.get("vat_number") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;

    // Validation
    if (!name || name.length === 0) {
      return {
        success: false,
        error: "اسم الشركة مطلوب ولا يمكن تركه فارغاً.",
      };
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        success: false,
        error: "البريد الإلكتروني للشركة غير صالح.",
      };
    }

    const supabase = await createClient();

    // Check user's current profile for existing company_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profErr } = await (supabase.from("profiles") as any)
      .select("company_id")
      .eq("id", currentUser.id)
      .single();

    if (profErr || !profile) {
      return {
        success: false,
        error: "تعذر التحقق من ملف المستخدم.",
      };
    }

    let savedCompany: Company;

    if (profile.company_id) {
      // 1. Update existing company
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("companies") as any)
        .update({
          name,
          commercial_registration_number: crn,
          tax_card_number: tax,
          import_card_number: imp,
          vat_number: vat,
          phone,
          email,
          address,
        })
        .eq("id", profile.company_id)
        .select()
        .single();

      if (error || !data) {
        if (process.env.NODE_ENV === "development") {
          console.error("[saveCustomerCompanyAction] Update error:", error?.message);
        }
        return {
          success: false,
          error: "تعذر حفظ بيانات الشركة. يرجى المحاولة مرة أخرى.",
        };
      }

      savedCompany = data as Company;
    } else {
      // 2. User has no company yet — use setup_customer_company RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("setup_customer_company", {
        p_name: name,
        p_commercial_registration_number: crn,
        p_tax_card_number: tax,
        p_import_card_number: imp,
        p_vat_number: vat,
        p_phone: phone,
        p_email: email,
        p_address: address,
      });

      if (error || !data) {
        if (process.env.NODE_ENV === "development") {
          console.error("[saveCustomerCompanyAction] Setup error:", error?.message);
        }
        return {
          success: false,
          error: "تعذر إعداد بيانات الشركة. يرجى المحاولة مرة أخرى.",
        };
      }

      savedCompany = data as Company;
    }

    revalidatePath("/company");
    revalidatePath("/dashboard");
    revalidatePath("/my-documents");

    return {
      success: true,
      message: "تم حفظ بيانات الشركة بنجاح.",
      company: savedCompany,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[saveCustomerCompanyAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ غير متوقع أثناء حفظ البيانات.",
    };
  }
}
