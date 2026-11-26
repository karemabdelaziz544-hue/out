/**
 * Auth Guards — Server-Side Route Protection
 *
 * Use these in Server Components and Server Actions to enforce auth and roles.
 * They redirect or return errors — never trust client-provided state.
 */

import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser, getAuthUser } from "./session";
import { routes } from "@/config/app";
import type { CurrentUser, UserRole } from "@/types";

// ─── Authentication Guard ─────────────────────────────────────────────────────

/**
 * Require authentication.
 * Redirects to /login if the user is not authenticated.
 * Returns verified CurrentUser context with role from database.
 */
export async function requireAuth(): Promise<CurrentUser> {
  await connection();
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(routes.login);
  }
  if (!currentUser.isActive) {
    redirect(routes.unauthorized);
  }
  return currentUser;
}

// ─── Role Guard ───────────────────────────────────────────────────────────────

/**
 * Require a specific role or one of a set of roles.
 * Redirects to /login if unauthenticated.
 * Redirects to /unauthorized if the user does not have the required role or is inactive.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<CurrentUser> {
  await connection();
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(routes.login);
  }

  if (!currentUser.isActive || !allowedRoles.includes(currentUser.role)) {
    redirect(routes.unauthorized);
  }

  return currentUser;
}

// ─── Redirect-If-Authenticated Guard ─────────────────────────────────────────

/**
 * Redirect authenticated users away from auth pages (e.g. /login).
 * Use at the top of login/signup pages.
 */
export async function redirectIfAuthenticated(destination = routes.dashboard) {
  const user = await getAuthUser();
  if (user) {
    redirect(destination);
  }
}
