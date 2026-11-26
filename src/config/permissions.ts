/**
 * Role-Based Permission Matrix
 *
 * Defines what each role is allowed to do.
 * This is a foundation — expand permissions as business rules are defined.
 *
 * IMPORTANT: This file is the frontend convenience layer only.
 * Real authorization MUST be enforced server-side via Supabase RLS.
 */

import type { Permission, RolePermissions, UserRole } from "@/types";

// ─── Permission Matrix ────────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: RolePermissions = {
  admin: [
    "view:dashboard",
    "view:customers",
    "view:shipments",
    "view:documents",
    "view:tasks",
    "view:team",
    "view:reports",
    "view:settings",
    "manage:users",
    "manage:settings",
  ],
  manager: [
    "view:dashboard",
    "view:customers",
    "view:shipments",
    "view:documents",
    "view:tasks",
    "view:team",
    "view:reports",
    "view:settings",
  ],
  data_entry: [
    "view:dashboard",
    "view:shipments",
    "view:documents",
    "view:tasks",
  ],
  scout: ["view:dashboard", "view:shipments", "view:tasks"],
  inspector: ["view:dashboard", "view:shipments", "view:tasks", "view:documents"],
  customer: ["view:dashboard", "view:shipments", "view:documents"],
};

// ─── Permission Utilities ─────────────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 * Used on the client for UI conditional rendering ONLY.
 * Never use for actual access control.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Roles that have administrative access.
 */
export const ADMIN_ROLES: UserRole[] = ["admin", "manager"];

/**
 * Check if a role is an admin-level role.
 */
export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
