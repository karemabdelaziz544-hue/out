/**
 * Authentication & Authorization Types
 *
 * Role system for OUT platform.
 * Roles are enforced server-side and via Supabase RLS.
 * Do NOT trust roles from the client.
 */

// ─── User Roles ───────────────────────────────────────────────────────────────

export type UserRole =
  | "customer"
  | "admin"
  | "data_entry"
  | "scout"
  | "inspector"
  | "manager";

export const USER_ROLES: UserRole[] = [
  "customer",
  "admin",
  "data_entry",
  "scout",
  "inspector",
  "manager",
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  customer: "عميل",
  admin: "مدير النظام",
  data_entry: "مدخل بيانات",
  scout: "مندوب",
  inspector: "مفتش",
  manager: "مدير",
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  company_id: string | null;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Auth Session ─────────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string;
  companyId?: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile | null;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

// ─── Permission System ────────────────────────────────────────────────────────

/**
 * Permissions are intentionally minimal at this foundation stage.
 * Extend as business rules are defined in future phases.
 */
export type Permission =
  | "view:dashboard"
  | "view:customers"
  | "view:shipments"
  | "view:documents"
  | "view:tasks"
  | "view:team"
  | "view:reports"
  | "view:settings"
  | "manage:users"
  | "manage:settings";

export type RolePermissions = Record<UserRole, Permission[]>;
