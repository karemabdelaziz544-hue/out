"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, resendConfirmationAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { routes } from "@/config/app";

const initialState: ActionResult = { success: true };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState("");
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [isResending, startResendTransition] = useTransition();

  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const confirmedSuccess = searchParams.get("confirmed") === "true";
  const urlError = searchParams.get("error");
  const redirectParam = searchParams.get("redirect");

  const isUnconfirmedError =
    state.error?.includes("تأكيد بريدك الإلكتروني") ||
    urlError?.includes("تأكيد");

  const handleResendConfirmation = () => {
    if (!email) return;
    setResendFeedback(null);
    startResendTransition(async () => {
      const fd = new FormData();
      fd.append("email", email);
      const res = await resendConfirmationAction({ success: true }, fd);
      setResendFeedback(res.error || res.message || null);
    });
  };

  return (
    <form action={formAction} className="login-form">
      {redirectParam && (
        <input type="hidden" name="redirect" value={redirectParam} />
      )}

      {/* Success banner if redirected after password reset */}
      {resetSuccess && (
        <div className="login-form__success" role="status">
          تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
        </div>
      )}

      {/* Success banner if redirected after email confirmation */}
      {confirmedSuccess && (
        <div className="login-form__success" role="status">
          تم تأكيد بريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول إلى حسابك.
        </div>
      )}

      {/* Error Message */}
      {(!state.success && state.error) || urlError ? (
        <div className="login-form__error" role="alert">
          <div>{state.error || urlError}</div>
          {isUnconfirmedError && email && (
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={isResending}
                className="login-form__link login-form__link--highlight"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8125rem" }}
              >
                {isResending ? "جارٍ إرسال الرابط..." : "إعادة إرسال رابط التأكيد إلى بريدك"}
              </button>
              {resendFeedback && (
                <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "#F5C500" }}>
                  {resendFeedback}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="أدخل بريدك الإلكتروني"
          className="login-form__input"
          dir="ltr"
        />
      </div>

      {/* Password with Show/Hide toggle */}
      <div className="login-form__field">
        <PasswordInput
          id="password"
          name="password"
          label="كلمة المرور"
          autoComplete="current-password"
          required
          disabled={isPending}
          placeholder="أدخل كلمة المرور"
        />
      </div>

      {/* Remember me & Forgot password */}
      <div className="login-form__meta">
        <label className="login-form__checkbox-label">
          <input
            type="checkbox"
            name="rememberMe"
            disabled={isPending}
            className="login-form__checkbox"
          />
          <span>تذكرني</span>
        </label>

        <Link
          href={routes.forgotPassword}
          className="login-form__link"
        >
          هل نسيت كلمة المرور؟
        </Link>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="login-form__submit"
        id="login-submit-btn"
      >
        {isPending ? (
          <>
            <span className="btn__spinner" aria-hidden="true" />
            <span style={{ marginInlineStart: "8px" }}>جاري تسجيل الدخول...</span>
          </>
        ) : (
          "تسجيل الدخول"
        )}
      </button>

      {/* Register Footer */}
      <div className="login-form__footer">
        <span>ليس لديك حساب؟ </span>
        <Link href={routes.register} className="login-form__link login-form__link--highlight">
          إنشاء حساب
        </Link>
      </div>
    </form>
  );
}

export default LoginForm;
