import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";
import { getAuthUser } from "@/lib/auth/session";
import { DynamicIcon } from "@/components/ui/icon";
import { routes } from "@/config/app";

export const instant = false;

export const metadata: Metadata = {
  title: "إعادة تعيين كلمة المرور | OUT",
  description: "إنشاء كلمة مرور جديدة لحسابك على منصة OUT للتخليص الجمركي",
};

export default async function ResetPasswordPage() {
  await connection();
  const user = await getAuthUser();

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
          {user ? (
            <>
              <h2 className="login-card__title">تعيين كلمة المرور الجديدة</h2>
              <p className="login-card__subtitle">
                أدخل كلمة المرور الجديدة لتأمين حسابك
              </p>
              <Suspense fallback={<div className="skeleton" style={{ height: "240px" }} />}>
                <ResetPasswordForm />
              </Suspense>
            </>
          ) : (
            <div className="auth-status-card" role="alert">
              <div className="auth-status-card__icon auth-status-card__icon--error" aria-hidden="true">
                <DynamicIcon name="AlertCircle" size={28} />
              </div>

              <h2 className="auth-status-card__title">رابط الاستعادة غير صالح أو منتهي</h2>

              <p className="auth-status-card__text">
                يبدو أن رابط استعادة كلمة المرور قد انتهت صلاحيته أو تم استخدامه مسبقًا. لأسباب أمنية، روابط استعادة كلمة المرور صالحة للاستخدام لمرة واحدة فقط ولفترة زمنية محدودة.
              </p>

              <div className="auth-status-card__actions">
                <Link
                  href={routes.forgotPassword}
                  className="login-form__submit"
                  style={{ textDecoration: "none" }}
                  id="request-new-reset-link-btn"
                >
                  طلب رابط استعادة جديد
                </Link>

                <Link href={routes.login} className="auth-btn-secondary">
                  العودة إلى تسجيل الدخول
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
