/**
 * Auth Callback Route Handler
 *
 * Handles exchange of authorization code for user session.
 * Used for email confirmation, magic links, and password reset flows.
 * Strictly validates redirect destinations to prevent Open Redirect attacks.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/config/app";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const safeNext = getSafeRedirectUrl(rawNext, routes.dashboard);

  // Check for error parameters sent by Supabase Auth
  const errCode = searchParams.get("error_code");
  const errDesc = searchParams.get("error_description") || "";

  if (errCode || errDesc) {
    let arabicError = "فشلت عملية التحقق، يرجى المحاولة مجددًا.";
    if (errCode === "otp_expired" || errDesc.toLowerCase().includes("expired")) {
      arabicError = "رابط التأكيد منتهي الصلاحية، يرجى طلب رابط جديد.";
    } else if (errDesc.toLowerCase().includes("invalid")) {
      arabicError = "رابط التأكيد غير صالح أو تم استخدامه مسبقًا.";
    }

    return NextResponse.redirect(
      `${origin}${routes.login}?error=${encodeURIComponent(arabicError)}`,
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // If landing on reset-password, redirect directly
      if (safeNext === routes.resetPassword) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
      // For general sign-ins / email confirmations
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    // Exchange error translation
    let exchangeErrorMessage = "فشلت عملية المصادقة، يرجى المحاولة مجددًا.";
    if (error.message.toLowerCase().includes("expired")) {
      exchangeErrorMessage = "انتهت صلاحية رابط التحقق، يرجى طلب رابط جديد.";
    } else if (error.message.toLowerCase().includes("invalid")) {
      exchangeErrorMessage = "رمز التحقق غير صالح أو تم استخدامه مسبقًا.";
    }

    return NextResponse.redirect(
      `${origin}${routes.login}?error=${encodeURIComponent(exchangeErrorMessage)}`,
    );
  }

  // If code is missing, redirect to login with clear error
  return NextResponse.redirect(
    `${origin}${routes.login}?error=${encodeURIComponent("رمز المصادقة مفقود أو غير صالح.")}`,
  );
}
