/**
 * Auth Session Utilities — Server Side
 *
 * Use these in Server Components, Server Actions, Route Handlers.
 * These functions NEVER trust client-provided data for authorization.
 */
import { createClient } from "@/lib/supabase/server";
import type { AuthUser, CurrentUser, Profile, UserRole } from "@/types";

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Get the current Supabase session (server-side).
 * Returns null if no session exists.
 */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Get the current authenticated user (server-side).
 * Uses getUser() which validates the JWT with Supabase — more secure than getSession().
 * Returns null if unauthenticated.
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * Fetch the profile for a given user id from the database.
 * Returns null if no profile found or on error.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    // Only log in development — never expose DB errors to users
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/session] getProfile error:", error.message);
    }
    return null;
  }

  return data as Profile;
}

// ─── Current User (Single Source of Truth) ────────────────────────────────────

/**
 * Get the current authenticated user context with verified database role.
 *
 * Flow:
 *  1. Supabase Auth validates JWT -> user.id
 *  2. Database `profiles` table -> fresh role & status (Single Source of Truth)
 *  3. Returns unified CurrentUser object.
 *
 * This function NEVER relies on user_metadata, app_metadata, localStorage,
 * or cookies for role determination.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const profile = await getProfile(user.id);
  if (!profile) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[auth] User ${user.id} has no profile in profiles table.`);
    }
    return null;
  }

  // Safe development debug logging (no secrets / tokens)
  if (process.env.NODE_ENV === "development") {
    console.log(`[auth] Authenticated user id: ${user.id}`);
    console.log(`[auth] Profile role: ${profile.role}`);
    console.log(`[auth] Navigation role: ${profile.role}`);
  }

  return {
    id: user.id,
    email: user.email ?? profile.email,
    fullName: profile.full_name || user.email || "المستخدم",
    phone: profile.phone,
    role: profile.role,
    isActive: profile.is_active,
  };
}

// ─── Full Auth User ───────────────────────────────────────────────────────────

/**
 * Get the authenticated user with their profile.
 * Returns null if unauthenticated or profile missing.
 */
export async function getAuthUserWithProfile(): Promise<AuthUser | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const profile = await getProfile(user.id);

  return {
    id: user.id,
    email: user.email ?? "",
    profile,
  };
}

// ─── Role ─────────────────────────────────────────────────────────────────────

/**
 * Get the role of the current authenticated user.
 * Returns null if unauthenticated or profile missing.
 *
 * Role is fetched directly from the database profiles table.
 */
export async function getUserRole(): Promise<UserRole | null> {
  const currentUser = await getCurrentUser();
  return currentUser?.role ?? null;
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

/**
 * Sign out the current user (server-side).
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
