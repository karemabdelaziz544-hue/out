import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "./register-form";
import { redirectIfAuthenticated } from "@/lib/auth/guards";

export const instant = false;

export const metadata: Metadata = {
  title: "إنشاء حساب جديد | OUT",
  description: "إنشاء حساب جديد على منصة OUT للتخليص الجمركي والخدمات اللوجستية",
};

export default async function RegisterPage() {
  await redirectIfAuthenticated();

  return (
    <main className="login-page">
      <div className="login-container">
        {/* Brand */}
        <div className="login-brand">
          <h1 className="login-brand__name">OUT</h1>
          <p className="login-brand__tagline">منصة التخليص الجمركي والخدمات اللوجستية</p>
        </div>

        {/* Register Card */}
        <div className="login-card">
          <h2 className="login-card__title">إنشاء حساب جديد</h2>
          <p className="login-card__subtitle">سجّل بياناتك للبدء في استخدام المنصة</p>
          <Suspense fallback={<div className="skeleton" style={{ height: "350px" }} />}>
            <RegisterForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
