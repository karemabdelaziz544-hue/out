import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";
import { redirectIfAuthenticated } from "@/lib/auth/guards";

export const instant = false;

export const metadata: Metadata = {
  title: "نسيت كلمة المرور | OUT",
  description: "استعادة كلمة المرور لمنصة OUT للتخليص الجمركي",
};

export default async function ForgotPasswordPage() {
  await redirectIfAuthenticated();

  return (
    <main className="login-page">
      <div className="login-container">
        {/* Brand */}
        <div className="login-brand">
          <h1 className="login-brand__name">OUT</h1>
          <p className="login-brand__tagline">منصة التخليص الجمركي والخدمات اللوجستية</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <h2 className="login-card__title">استعادة كلمة المرور</h2>
          <p className="login-card__subtitle">
            أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطًا لإعادة تعيين كلمة المرور
          </p>
          <Suspense fallback={<div className="skeleton" style={{ height: "200px" }} />}>
            <ForgotPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
