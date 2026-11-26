import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { redirectIfAuthenticated } from "@/lib/auth/guards";

export const instant = false;

export const metadata: Metadata = {
  title: "تسجيل الدخول | OUT",
  description: "تسجيل الدخول إلى منصة OUT للتخليص الجمركي والخدمات اللوجستية",
};

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <main className="login-page">
      <div className="login-container">
        {/* Brand */}
        <div className="login-brand">
          <h1 className="login-brand__name">OUT</h1>
          <p className="login-brand__tagline">منصة التخليص الجمركي والخدمات اللوجستية</p>
        </div>

        {/* Login Form */}
        <div className="login-card">
          <h2 className="login-card__title">تسجيل الدخول</h2>
          <p className="login-card__subtitle">أدخل بياناتك للوصول إلى المنصة</p>
          <Suspense fallback={<div className="skeleton" style={{ height: "260px" }} />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
