"use client";

import Link from "next/link";
import { SidebarItem } from "./sidebar-item";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/ui/icon";
import { logoutAction } from "@/lib/auth/actions";
import { getNavigationForRole, BOTTOM_NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { UserRole, Profile, CurrentUser } from "@/types";

interface SidebarProps {
  role?: UserRole | null;
  currentUser?: CurrentUser | null;
  profile?: Profile | null;
  userEmail?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({
  role,
  currentUser,
  profile,
  userEmail,
  isCollapsed = false,
  onToggleCollapse,
  onNavigate,
  className,
}: SidebarProps) {
  const activeRole = role ?? currentUser?.role ?? "customer";
  const navItems = getNavigationForRole(activeRole);
  const displayName = currentUser?.fullName || profile?.full_name || userEmail || "المستخدم";

  return (
    <aside
      className={cn(
        "app-sidebar",
        isCollapsed && "app-sidebar--collapsed",
        className,
      )}
      aria-label="القائمة الجانبية الرئيسية"
    >
      {/* ─── Top: Brand ──────────────────────────────────────────────────────── */}
      <div className="sidebar-brand">
        <Link href="/dashboard" className="sidebar-brand__link" onClick={onNavigate}>
          <span className="sidebar-brand__logo">OUT</span>
          {!isCollapsed && (
            <span className="sidebar-brand__sub">لوجستيات وتخليص جمركي</span>
          )}
        </Link>

        {/* Desktop Collapse Button */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="sidebar-collapse-btn"
            aria-label={isCollapsed ? "توسيع القائمة" : "تصغير القائمة"}
            title={isCollapsed ? "توسيع القائمة" : "تصغير القائمة"}
          >
            <DynamicIcon
              name={isCollapsed ? "PanelRightOpen" : "PanelRightClose"}
              size={18}
            />
          </button>
        )}
      </div>

      {/* ─── User Profile Card ──────────────────────────────────────────────── */}
      <div className="sidebar-user">
        <Avatar
          name={displayName}
          src={profile?.avatar_url}
          size={isCollapsed ? "sm" : "md"}
          className="sidebar-user__avatar"
        />
        {!isCollapsed && (
          <div className="sidebar-user__info">
            <span className="sidebar-user__name" title={displayName}>
              {displayName}
            </span>
            <div className="sidebar-user__role">
              {activeRole && <RoleBadge role={activeRole} />}
            </div>
          </div>
        )}
      </div>

      {/* ─── Main Navigation ────────────────────────────────────────────────── */}
      <nav className="sidebar-nav" aria-label="تنقل المنصة">
        <div className="sidebar-nav__list">
          {navItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      {/* ─── Bottom Navigation & Logout ─────────────────────────────────────── */}
      <div className="sidebar-bottom">
        <div className="sidebar-nav__list">
          {BOTTOM_NAVIGATION.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
          ))}

          {/* Logout Action */}
          <form action={logoutAction} className="sidebar-logout-form">
            <button
              type="submit"
              className={cn(
                "sidebar-nav__item",
                "sidebar-nav__item--logout",
                isCollapsed && "sidebar-nav__item--collapsed",
              )}
              title={isCollapsed ? "تسجيل الخروج" : undefined}
            >
              <span className="sidebar-nav__icon" aria-hidden="true">
                <DynamicIcon name="LogOut" size={20} />
              </span>
              {!isCollapsed && (
                <span className="sidebar-nav__label">تسجيل الخروج</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
