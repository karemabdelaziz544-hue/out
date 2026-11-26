/**
 * Server Actions — Authentication
 *
 * Runs strictly on the server.
 * Handles login, registration, password recovery, and signout.
 * Input is strictly validated with Zod before communicating with Supabase.
 * User-friendly Arabic error messages are returned; technical errors are never leaked.
 */

"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/session";
import { routes } from "@/config/app";
import { getSafeRedirectUrl } from "./redirect";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

// ─── Action Result Types ──────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  error?: string;
  message?: string;
  requiresEmailConfirmation?: boolean;
}

// ─── Login Action ─────────────────────────────────────────────────────────────

export async function loginAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    rememberMe: formData.get("rememberMe") === "on",
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "بيانات الدخول غير صحيحة.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (
      error.message.includes("Invalid login credentials") ||
      error.message.includes("invalid_credentials")
    ) {
      return {
        success: false,
        error: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      };
    }

    if (error.message.includes("Email not confirmed")) {
      return {
        success: false,
        error: "يرجى تأكيد بريدك الإلكتروني أولاً قبل تسجيل الدخول.",
      };
    }

    return {
      success: false,
      error: "حدث خطأ أثناء تسجيل الدخول، يرجى المحاولة مرة أخرى.",
    };
  }

  // Verify account is active
  if (data?.user) {
    const profile = await getProfile(data.user.id);

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: "حسابك غير مفعل حاليًا، يرجى التواصل مع الإدارة.",
      };
    }
  }

  // Redirect safely to destination or dashboard (Open Redirect protection)
  const redirectParam = formData.get("redirect") as string | null;
  const safeRedirectUrl = getSafeRedirectUrl(redirectParam, routes.dashboard);
  redirect(safeRedirectUrl);
}

// ─── Register Action ──────────────────────────────────────────────────────────

export async function registerAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    terms: formData.get("terms") === "on",
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "يرجى مراجعة البيانات المدخلة.",
    };
  }

  const supabase = await createClient();

  // Call Supabase signUp with user metadata (full_name and phone)
  // The database trigger handles creating the profile with role 'customer'
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
      },
    },
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("already registered") ||
      error.message.toLowerCase().includes("user_already_exists")
    ) {
      return {
        success: false,
        error: "هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول.",
      };
    }

    return {
      success: false,
      error: "حدث خطأ أثناء إنشاء الحساب، يرجى المحاولة مرة أخرى.",
    };
  }

  // If a session was created right away (email confirmation not required or disabled in Supabase)
  if (data.session) {
    redirect(routes.dashboard);
  }

  // If confirmation is required by Supabase project settings
  return {
    success: true,
    requiresEmailConfirmation: true,
    message:
      "تم إنشاء الحساب بنجاح! تم إرسال رابط تأكيد إلى بريدك الإلكتروني، يرجى التحقق منه لتفعيل حسابك.",
  };
}

// ─── Resend Confirmation Action ───────────────────────────────────────────────

export async function resendConfirmationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return {
      success: false,
      error: "يرجى إدخال بريد إلكتروني صالح.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("rate") ||
      (error as { status?: number }).status === 429
    ) {
      return {
        success: false,
        error: "يرجى الانتظار دقيقة قبل محاولة إعادة إرسال الرابط مجددًا.",
      };
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[resendConfirmationAction] error:", error.message);
    }

    return {
      success: false,
      error: "تعذر إعادة إرسال رابط التأكيد حاليًا، يرجى المحاولة لاحقًا.",
    };
  }

  return {
    success: true,
    message:
      "تمت إعادة إرسال رابط التأكيد بنجاح إلى بريدك الإلكتروني! يرجى التحقق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها (Spam).",
  };
}

// ─── Forgot Password Action ───────────────────────────────────────────────────

export async function forgotPasswordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    email: formData.get("email"),
  };

  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "من فضلك أدخل بريدًا إلكترونيًا صحيحًا.",
    };
  }

  const supabase = await createClient();

  // Determine site origin for redirect URL
  let origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    const headerList = await headers();
    const host = headerList.get("host") || "localhost:3000";
    const proto = headerList.get("x-forwarded-proto") || "http";
    origin = `${proto}://${host}`;
  }

  const redirectUrl = `${origin}/auth/callback?next=${encodeURIComponent(routes.resetPassword)}`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("rate") ||
      (error as { status?: number }).status === 429
    ) {
      return {
        success: false,
        error: "يرجى الانتظار دقيقة قبل طلب رابط جديد لاستعادة كلمة المرور.",
      };
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[forgotPasswordAction] error:", error.message);
    }
  }

  // Always return the same neutral message to prevent user enumeration
  return {
    success: true,
    message: "إذا كان البريد الإلكتروني مسجلًا لدينا، فسيتم إرسال تعليمات استعادة كلمة المرور إليه.",
  };
}

// ─── Reset Password Action ────────────────────────────────────────────────────

export async function resetPasswordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "يرجى التأكد من تطابق كلمتي المرور وقوتها.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (
      error.message.includes("Auth session missing") ||
      error.message.toLowerCase().includes("session")
    ) {
      return {
        success: false,
        error: "انتهت صلاحية جلسة استعادة كلمة المرور أو الرابط غير صالح، يرجى طلب رابط جديد.",
      };
    }

    return {
      success: false,
      error: "حدث خطأ أثناء تحديث كلمة المرور، يرجى المحاولة مرة أخرى أو طلب رابط جديد.",
    };
  }

  // Redirect to login with success flag
  redirect(`${routes.login}?reset=success`);
}

// ─── Logout Action ────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[logoutAction] error during signOut:", err);
    }
  }
  redirect(routes.login);
}
