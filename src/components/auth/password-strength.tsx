/**
 * Password Strength Meter Component
 *
 * Provides instant visual feedback on password complexity.
 * Uses brand colors (Neutral -> Yellow -> Yellow-Dark).
 */

"use client";

import { useMemo } from "react";

interface PasswordStrengthProps {
  password?: string;
}

export function PasswordStrength({ password = "" }: PasswordStrengthProps) {
  const { score, label } = useMemo(() => {
    if (!password) {
      return { score: 0, label: "" };
    }

    let calculatedScore = 0;
    if (password.length >= 8) calculatedScore += 1;
    if (/[a-zA-Z]/.test(password)) calculatedScore += 1;
    if (/[0-9]/.test(password)) calculatedScore += 1;
    if (/[^a-zA-Z0-9]/.test(password) || password.length >= 12) calculatedScore += 1;

    let strengthLabel = "ضعيفة";
    if (calculatedScore >= 3) {
      strengthLabel = "متوسطة";
    }
    if (calculatedScore >= 4) {
      strengthLabel = "قوية";
    }

    return { score: calculatedScore, label: strengthLabel };
  }, [password]);

  if (!password) return null;

  return (
    <div className="password-strength" aria-live="polite">
      <div className="password-strength__bars">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`password-strength__bar ${
              score >= level ? `password-strength__bar--active-${Math.min(score, 3)}` : ""
            }`}
          />
        ))}
      </div>
      <div className="password-strength__info">
        <span className="password-strength__label">قوة كلمة المرور:</span>
        <span className="password-strength__value">{label}</span>
      </div>
    </div>
  );
}
