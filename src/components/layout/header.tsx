"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { DynamicIcon } from "@/components/ui/icon";
import { RoleBadge } from "@/components/ui/badge";
import type { UserRole, Profile, CurrentUser } from "@/types";

interface HeaderProps {
  role?: UserRole | null;
  currentUser?: CurrentUser | null;
  profile?: Profile | null;
  userEmail?: string;
  unreadNotificationsCount?: number;
  onOpenMobileMenu?: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "الرئيسية",
  "/customers": "إدارة العملاء",
  "/shipments": "إدارة الشحنات",
  "/shipments/new": "إنشاء طلب تخليص شحنة",
  "/my-shipments": "شحناتي",
  "/documents": "إدارة المستندات",
  "/my-documents": "مستنداتي",
  "/company": "بيانات الشركة",
  "/company-documents": "مستندات الشركات",
  "/tasks": "المهام والعمليات",
  "/team": "فريق العمل",
  "/notifications": "الإشعارات",
  "/reports": "التقارير والإحصائيات",
  "/settings": "الإعدادات",
  "/profile": "حسابي",
};

export function Header({
  role,
  currentUser,
  profile,
  userEmail,
  unreadNotificationsCount = 0,
  onOpenMobileMenu,
}: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] || "لوحة التحكم";
  const activeRole = role ?? currentUser?.role ?? "customer";
  const displayName = currentUser?.fullName || profile?.full_name || userEmail || "المستخدم";

  return (
    <header className="app-header" aria-label="الشريط العلوي">
      {/* ─── Right: Mobile Menu + Current Page Title ────────────────────────── */}
      <div className="app-header__right">
        {onOpenMobileMenu && (
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={onOpenMobileMenu}
            aria-label="فتح القائمة الرئيسية"
          >
            <DynamicIcon name="Menu" size={22} />
          </button>
        )}

        <div className="app-header__title-wrapper">
          <h1 className="app-header__title">{pageTitle}</h1>
        </div>
      </div>

      {/* ─── Left: Notifications & User Summary ─────────────────────────────── */}
      <div className="app-header__left">
        {/* Notification Bell */}
        <Link
          href="/notifications"
          className="header-icon-btn"
          aria-label={
            unreadNotificationsCount > 0
              ? `عرض الإشعارات (${unreadNotificationsCount} غير مقروء)`
              : "عرض الإشعارات"
          }
          title={
            unreadNotificationsCount > 0
              ? `الإشعارات (${unreadNotificationsCount} جديدة)`
              : "الإشعارات"
          }
        >
          <DynamicIcon name="Bell" size={20} />
          {unreadNotificationsCount > 0 ? (
            <span className="header-icon-btn__badge-count" aria-hidden="true">
              {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
            </span>
          ) : null}
        </Link>

        {/* User Mini Profile */}
        <div className="header-user">
          <Avatar
            name={displayName}
            src={profile?.avatar_url}
            size="sm"
            className="header-user__avatar"
          />
          <div className="header-user__details">
            <span className="header-user__name">{displayName}</span>
            {activeRole && <RoleBadge role={activeRole} />}
          </div>
        </div>
      </div>
    </header>
  );
}
