"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { routes } from "@/config/app";

const initialState: ActionResult = { success: true };

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setClientError(null);
    if (!password || password.length < 8) {
      e.preventDefault();
      setClientError("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      e.preventDefault();
      setClientError("كلمتا المرور غير متطابقتين.");
      return;
    }
  };

  const isSessionError =
    !state.success &&
    state.error &&
    (state.error.includes("جلسة") || state.error.includes("صلاحية") || state.error.includes("الرابط"));

  return (
    <form action={formAction} onSubmit={handleSubmit} className="login-form">
      {/* Error Message */}
      {((!state.success && state.error) || clientError) && (
        <div className="login-form__error" role="alert">
          {clientError || state.error}
          {isSessionError && (
            <div style={{ marginTop: "8px" }}>
              <Link
                href={routes.forgotPassword}
                className="login-form__link login-form__link--highlight"
                style={{ fontSize: "var(--font-size-xs)" }}
              >
                اضغط هنا لطلب رابط استعادة جديد
              </Link>
            </div>
          )}
        </div>
      )}

      {/* New Password */}
      <div className="login-form__field">
        <PasswordInput
          id="password"
          name="password"
          label="كلمة المرور الجديدة"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="أدخل كلمة المرور الجديدة"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (clientError) setClientError(null);
          }}
        />
        <PasswordStrength password={password} />
      </div>

      {/* Confirm New Password */}
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

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="login-form__submit"
        id="reset-password-submit-btn"
      >
        {isPending ? (
          <>
            <span className="btn__spinner" aria-hidden="true" />
            <span style={{ marginInlineStart: "8px" }}>جارٍ تحديث كلمة المرور...</span>
          </>
        ) : (
          "تحديث كلمة المرور"
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

export default ResetPasswordForm;
