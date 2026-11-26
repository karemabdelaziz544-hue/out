/**
 * Next.js Proxy (replaces deprecated middleware convention)
 *
 * Runs on every matched request.
 * Responsibilities:
 *  1. Refresh the Supabase auth session (required by @supabase/ssr)
 *  2. Protect routes — redirect unauthenticated users to /login
 *  3. Redirect authenticated users away from /login
 */

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { routes } from "@/config/app";

// ─── Route Config ─────────────────────────────────────────────────────────────

/** Routes that require authentication */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/shipments",
  "/documents",
  "/tasks",
  "/team",
  "/notifications",
  "/reports",
  "/settings",
  "/my-shipments",
  "/my-documents",
  "/company",
  "/company-documents",
  "/profile",
];

/** Routes that authenticated users should be redirected away from */
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

// ─── Proxy ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  // Always refresh the session — required by @supabase/ssr
  const supabase = createMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Redirect authenticated users away from auth routes
  if (user && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL(routes.dashboard, request.url));
  }

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!user && isProtected) {
    const loginUrl = new URL(routes.login, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// ─── Matcher Config ───────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
