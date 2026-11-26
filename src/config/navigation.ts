/**
 * Navigation Configuration
 *
 * Central configuration for role-based navigation menus across OUT platform.
 * Supports: customer, admin, manager, data_entry, scout, inspector.
 */

import type { UserRole, Permission } from "@/types";
import { routes } from "./app";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string; // Lucide icon identifier
  badge?: string;
  permission?: Permission;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export type RoleNavigation = Record<UserRole, NavItem[]>;

// ─── Primary Role Menus ───────────────────────────────────────────────────────

export const ROLE_NAVIGATION: RoleNavigation = {
  // Customer navigation
  customer: [
    {
      id: "dashboard",
      label: "الرئيسية",
      href: routes.dashboard,
      icon: "LayoutDashboard",
    },
    {
      id: "company",
      label: "بيانات الشركة",
      href: routes.company,
      icon: "Building2",
    },
    {
      id: "my-shipments",
      label: "شحناتي",
      href: "/my-shipments",
      icon: "Package",
    },
    {
      id: "my-documents",
      label: "مستنداتي",
      href: "/my-documents",
      icon: "FileText",
    },
    {
      id: "notifications",
      label: "الإشعارات",
      href: routes.notifications,
      icon: "Bell",
    },
    {
      id: "profile",
      label: "حسابي",
      href: "/profile",
      icon: "User",
    },
  ],

  // Admin navigation
  admin: [
    {
      id: "dashboard",
      label: "الرئيسية",
      href: routes.dashboard,
      icon: "LayoutDashboard",
    },
    {
      id: "customers",
      label: "العملاء",
      href: routes.customers,
      icon: "Users",
    },
    {
      id: "shipments",
      label: "الشحنات",
      href: routes.shipments,
      icon: "Package",
    },
    {
      id: "documents",
      label: "المستندات",
      href: routes.documents,
      icon: "FileText",
    },
    {
      id: "tasks",
      label: "المهام",
      href: routes.tasks,
      icon: "CheckSquare",
    },
    {
      id: "team",
      label: "الفريق",
      href: routes.team,
      icon: "UsersRound",
    },
    {
      id: "notifications",
      label: "الإشعارات",
      href: routes.notifications,
      icon: "Bell",
    },
    {
      id: "reports",
      label: "التقارير",
      href: routes.reports,
      icon: "BarChart3",
    },
  ],

  // Manager navigation (future ready)
  manager: [
    {
      id: "dashboard",
      label: "الرئيسية",
      href: routes.dashboard,
      icon: "LayoutDashboard",
    },
    {
      id: "customers",
      label: "العملاء",
      href: routes.customers,
      icon: "Users",
    },
    {
      id: "shipments",
      label: "الشحنات",
      href: routes.shipments,
      icon: "Package",
    },
    {
      id: "documents",
      label: "المستندات",
      href: routes.documents,
      icon: "FileText",
    },
    {
      id: "tasks",
      label: "المهام",
      href: routes.tasks,
      icon: "CheckSquare",
    },
    {
      id: "team",
      label: "الفريق",
      href: routes.team,
      icon: "UsersRound",
    },
    {
      id: "notifications",
      label: "الإشعارات",
      href: routes.notifications,
      icon: "Bell",
    },
    {
      id: "reports",
      label: "التقارير",
      href: routes.reports,
      icon: "BarChart3",
    },
  ],

  // Data Entry navigation (future ready)
  data_entry: [
    {
      id: "dashboard",
      label: "الرئيسية",
      href: routes.dashboard,
      icon: "LayoutDashboard",
    },
    {
      id: "shipments",
      label: "الشحنات",
      href: routes.shipments,
      icon: "Package",
    },
    {
      id: "documents",
      label: "المستندات",
      href: routes.documents,
      icon: "FileText",
    },
    {
      id: "tasks",
      label: "المهام",
      href: routes.tasks,
      icon: "CheckSquare",
    },
    {
      id: "notifications",
      label: "الإشعارات",
      href: routes.notifications,
      icon: "Bell",
    },
  ],

  // Scout navigation (future ready)
  scout: [
    {
      id: "dashboard",
      label: "الرئيسية",
      href: routes.dashboard,
      icon: "LayoutDashboard",
    },
    {
      id: "shipments",
      label: "الشحنات",
      href: routes.shipments,
      icon: "Package",
    },
    {
      id: "tasks",
      label: "المهام الميدانية",
      href: routes.tasks,
      icon: "CheckSquare",
    },
    {
      id: "notifications",
      label: "الإشعارات",
      href: routes.notifications,
      icon: "Bell",
    },
  ],

  // Inspector navigation (future ready)
  inspector: [
    {
      id: "dashboard",
      label: "الرئيسية",
      href: routes.dashboard,
      icon: "LayoutDashboard",
    },
    {
      id: "shipments",
      label: "الشحنات",
      href: routes.shipments,
      icon: "Package",
    },
    {
      id: "tasks",
      label: "معاينات الكشف",
      href: routes.tasks,
      icon: "CheckSquare",
    },
    {
      id: "documents",
      label: "المستندات",
      href: routes.documents,
      icon: "FileText",
    },
    {
      id: "notifications",
      label: "الإشعارات",
      href: routes.notifications,
      icon: "Bell",
    },
  ],
};

// ─── Secondary Bottom Menu (Consistent across all roles) ─────────────────────

export const BOTTOM_NAVIGATION: NavItem[] = [
  {
    id: "settings",
    label: "الإعدادات",
    href: routes.settings,
    icon: "Settings",
  },
];

/**
 * Get the navigation items for a specific role
 */
export function getNavigationForRole(role?: UserRole | null): NavItem[] {
  if (!role || !(role in ROLE_NAVIGATION)) {
    return ROLE_NAVIGATION.customer;
  }
  return ROLE_NAVIGATION[role];
}
