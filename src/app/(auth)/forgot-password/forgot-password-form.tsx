"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { DynamicIcon } from "@/components/ui/icon";
import { routes } from "@/config/app";

const initialState: ActionResult = { success: true };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);
  const [email, setEmail] = useState("");
  const [dismissSuccess, setDismissSuccess] = useState(false);

  // If request succeeded, show the neutral status card
  if (state.success && state.message && !dismissSuccess) {
    return (
      <div className="auth-status-card" role="status">
        <div className="auth-status-card__icon" aria-hidden="true">
          <DynamicIcon name="Mail" size={28} />
        </div>

        <h3 className="auth-status-card__title">تم إرسال رابط الاستعادة</h3>

        {email && (
          <span className="auth-status-card__email-badge">{email}</span>
        )}

        <p className="auth-status-card__text">
          {state.message}
        </p>

        <p className="auth-status-card__text" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
          يرجى التحقق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها (Spam). رابط الاستعادة صالح للاستخدام مرة واحدة فقط.
        </p>

        <div className="auth-status-card__actions">
          <Link href={routes.login} className="login-form__submit" style={{ textDecoration: "none" }}>
            العودة إلى تسجيل الدخول
          </Link>

          <button
            type="button"
            onClick={() => setDismissSuccess(true)}
            className="auth-btn-secondary"
          >
            إرسال رابط إلى بريد آخر
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="login-form">
      {/* Error Message */}
      {!state.success && state.error && (
        <div className="login-form__error" role="alert">
          {state.error}
        </div>
      )}

      {/* Email Field */}
      <div className="login-form__field">
        <label htmlFor="email" className="login-form__label">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="أدخل بريدك الإلكتروني"
          className="login-form__input"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="login-form__submit"
        id="forgot-password-submit-btn"
      >
        {isPending ? (
          <>
            <span className="btn__spinner" aria-hidden="true" />
            <span style={{ marginInlineStart: "8px" }}>جارٍ الإرسال...</span>
          </>
        ) : (
          "إرسال رابط إعادة تعيين كلمة المرور"
        )}
      </button>

      {/* Back to Login */}
      <div className="login-form__footer">
        <Link href={routes.login} className="login-form__link login-form__link--highlight">
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    </form>
  );
}

export default ForgotPasswordForm;
