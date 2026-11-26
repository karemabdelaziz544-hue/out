"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction, resendConfirmationAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { DynamicIcon } from "@/components/ui/icon";
import { routes } from "@/config/app";

const initialState: ActionResult = { success: true };
const initialResendState: ActionResult = { success: true };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);
  const [resendState, resendAction, isResending] = useActionState(
    resendConfirmationAction,
    initialResendState,
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  // If email confirmation is required after successful registration
  if (state.success && (state.requiresEmailConfirmation || state.message)) {
    return (
      <div className="auth-status-card" role="status">
        <div className="auth-status-card__icon" aria-hidden="true">
          <DynamicIcon name="Mail" size={28} />
        </div>

        <h3 className="auth-status-card__title">تحقق من بريدك الإلكتروني</h3>

        {email && (
          <span className="auth-status-card__email-badge">{email}</span>
        )}

        <p className="auth-status-card__text">
          تم إنشاء حسابك بنجاح! لقد أرسلنا رابط تفعيل إلى بريدك الإلكتروني. يرجى الضغط على الرابط لتأكيد حسابك والبدء في استخدامه.
        </p>

        <p className="auth-status-card__text" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
          إذا لم تجد الرسالة في صندوق الوارد، يرجى التحقق من مجلد الرسائل غير المرغوب فيها (Spam).
        </p>

        {/* Resend feedback */}
        {!resendState.success && resendState.error && (
          <div className="login-form__error" style={{ width: "100%" }} role="alert">
            {resendState.error}
          </div>
        )}
        {resendState.success && resendState.message && (
          <div className="login-form__success" style={{ width: "100%" }} role="status">
            {resendState.message}
          </div>
        )}

        <div className="auth-status-card__actions">
          {email && (
            <form action={resendAction} style={{ width: "100%" }}>
              <input type="hidden" name="email" value={email} />
              <button
                type="submit"
                disabled={isResending}
                className="login-form__submit"
                id="resend-confirmation-btn"
              >
                {isResending ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" />
                    <span style={{ marginInlineStart: "8px" }}>جارٍ إعادة الإرسال...</span>
                  </>
                ) : (
                  "إعادة إرسال رابط التفعيل"
                )}
              </button>
            </form>
          )}

          <Link href={routes.login} className="auth-btn-secondary">
            الانتقال إلى تسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setClientError(null);
    if (password !== confirmPassword) {
      e.preventDefault();
      setClientError("كلمتا المرور غير متطابقتين.");
      return;
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="login-form">
      {/* Feedback messages */}
      {(!state.success && state.error) || clientError ? (
        <div className="login-form__error" role="alert">
          {clientError || state.error}
        </div>
      ) : null}

      {/* Full Name */}
      <div className="login-form__field">
        <label htmlFor="fullName" className="login-form__label">
          الاسم بالكامل
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          placeholder="أدخل اسمك بالكامل"
          className="login-form__input"
        />
      </div>

      {/* Phone Number */}
      <div className="login-form__field">
        <label htmlFor="phone" className="login-form__label">
          رقم الموبايل
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          disabled={isPending}
          placeholder="01xxxxxxxxx"
          className="login-form__input"
          dir="ltr"
        />
        <span className="input-group__hint">
          رقم موبايل مصري مكون من 11 رقمًا (مثال: 01012345678)
        </span>
      </div>

      {/* Email */}
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
          placeholder="example@email.com"
          className="login-form__input"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {/* Password with Strength Meter */}
      <div className="login-form__field">
        <PasswordInput
          id="password"
          name="password"
          label="كلمة المرور"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="أنشئ كلمة مرور قوية"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (clientError) setClientError(null);
          }}
        />
        <PasswordStrength password={password} />
      </div>

      {/* Confirm Password */}
      <div className="login-form__field">
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          label="تأكيد كلمة المرور"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="أعد كتابة كلمة المرور"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (clientError) setClientError(null);
          }}
        />
      </div>

      {/* Terms & Conditions */}
      <div className="login-form__field">
        <label className="login-form__checkbox-label">
          <input
            type="checkbox"
            name="terms"
            required
            disabled={isPending}
            className="login-form__checkbox"
          />
          <span>أوافق على الشروط والأحكام وسياسة الخصوصية.</span>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="login-form__submit"
        id="register-submit-btn"
      >
        {isPending ? (
          <>
            <span className="btn__spinner" aria-hidden="true" />
            <span style={{ marginInlineStart: "8px" }}>جارٍ إنشاء الحساب...</span>
          </>
        ) : (
          "إنشاء حساب"
        )}
      </button>

      {/* Login Footer */}
      <div className="login-form__footer">
        <span>لديك حساب بالفعل؟ </span>
        <Link href={routes.login} className="login-form__link login-form__link--highlight">
          تسجيل الدخول
        </Link>
      </div>
    </form>
  );
}

export default RegisterForm;
