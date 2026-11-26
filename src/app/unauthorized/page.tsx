import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { DynamicIcon } from "@/components/ui/icon";
import { routes } from "@/config/app";

export const metadata: Metadata = {
  title: "غير مصرح بالوصول | OUT",
  description: "ليس لديك الصلاحية للوصول إلى هذه الصفحة على منصة OUT",
};

export default function UnauthorizedPage() {
  return (
    <div className="auth-layout">
      <main className="login-page">
        <div className="login-container">
          {/* Brand */}
          <div className="login-brand">
            <h1 className="login-brand__name">OUT</h1>
            <p className="login-brand__tagline">منصة التخليص الجمركي والخدمات اللوجستية</p>
          </div>

          {/* Unauthorized Card */}
          <div className="login-card">
            <div className="auth-status-card" role="alert">
              <div className="auth-status-card__icon auth-status-card__icon--error" aria-hidden="true">
                <DynamicIcon name="Shield" size={28} />
              </div>

              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "bold",
                  color: "#ef4444",
                  letterSpacing: "0.05em",
                }}
              >
                رمز الخطأ: 403
              </span>

              <h2 className="auth-status-card__title">غير مصرح لك بالوصول</h2>

              <p className="auth-status-card__text">
                عذرًا، حسابك الحالي لا يمتلك الصلاحيات المطلوبة لعرض هذه الصفحة أو تنفيذ هذا الإجراء. إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع مسؤول النظام.
              </p>

              <div className="auth-status-card__actions">
                <Link
                  href={routes.dashboard}
                  className="login-form__submit"
                  style={{ textDecoration: "none" }}
                  id="return-to-dashboard-btn"
                >
                  العودة إلى لوحة التحكم
                </Link>

                <form action={logoutAction} style={{ width: "100%" }}>
                  <button
                    type="submit"
                    className="auth-btn-secondary"
                    id="switch-account-btn"
                  >
                    تسجيل الخروج والتبديل لحساب آخر
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
