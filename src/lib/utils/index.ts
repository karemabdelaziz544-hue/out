/**
 * Utility Functions
 *
 * General-purpose helpers used across the application.
 * Keep this file lean — only add genuinely reusable utilities.
 */

import { type UserRole, USER_ROLE_LABELS } from "@/types";

// ─── String Utilities ─────────────────────────────────────────────────────────

/**
 * Concatenate class names, filtering out falsy values.
 * Lightweight alternative to clsx for simple cases.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─── Role Utilities ───────────────────────────────────────────────────────────

/**
 * Get the Arabic display label for a role.
 */
export function getRoleLabel(role: UserRole): string {
  return USER_ROLE_LABELS[role] ?? role;
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

/**
 * Format a date string to Arabic locale.
 */
export function formatDateAr(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

/**
 * Format currency amount with locale-aware thousand separators.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return Number(amount).toLocaleString("ar-EG");
}

// ─── Error Utilities ──────────────────────────────────────────────────────────

/**
 * Extract a user-friendly error message from unknown errors.
 * Never expose raw database or server errors to users.
 */
export function getErrorMessage(
  error: unknown,
  fallback = "حدث خطأ غير متوقع",
): string {
  if (process.env.NODE_ENV === "development") {
    if (error instanceof Error) {
      console.error("[error]", error.message);
    }
  }
  // In production, always return the fallback to avoid leaking details
  if (process.env.NODE_ENV === "production") return fallback;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
