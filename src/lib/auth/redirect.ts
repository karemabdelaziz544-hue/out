/**
 * Safe Redirect Helper
 *
 * Validates and sanitizes redirect destinations to strictly prevent Open Redirect attacks.
 * Disallows external URLs, double slashes, protocol injection, and auth loops.
 */

import { routes } from "@/config/app";

export function getSafeRedirectUrl(
  target: string | null | undefined,
  defaultUrl: string = routes.dashboard,
): string {
  if (!target || typeof target !== "string") return defaultUrl;
  const trimmed = target.trim();

  // Must begin with a single slash, disallow protocol-relative (//) and any backslashes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return defaultUrl;
  }

  // Disallow scheme injections like javascript:, data:, https:
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return defaultUrl;
  }

  // Prevent redirect loops back to authentication pages
  const pathname = trimmed.split("?")[0].split("#")[0];
  if (
    pathname === routes.login ||
    pathname === routes.register ||
    pathname === routes.forgotPassword
  ) {
    return defaultUrl;
  }

  return trimmed;
}
