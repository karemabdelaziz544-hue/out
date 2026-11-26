"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/config/navigation";

interface SidebarItemProps {
  item: NavItem;
  isCollapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarItem({ item, isCollapsed = false, onNavigate }: SidebarItemProps) {
  const pathname = usePathname();

  // Active if exact match, or prefix match for subpages (except for root/dashboard)
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && item.href !== "/" && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "sidebar-nav__item",
        isActive && "sidebar-nav__item--active",
        isCollapsed && "sidebar-nav__item--collapsed",
      )}
      title={isCollapsed ? item.label : undefined}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="sidebar-nav__icon" aria-hidden="true">
        <DynamicIcon name={item.icon} size={20} />
      </span>

      {!isCollapsed && <span className="sidebar-nav__label">{item.label}</span>}

      {!isCollapsed && item.badge && (
        <span className="sidebar-nav__badge">{item.badge}</span>
      )}
    </Link>
  );
}
