"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { DynamicIcon } from "@/components/ui/icon";
import type { UserRole, Profile, CurrentUser } from "@/types";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  role?: UserRole | null;
  currentUser?: CurrentUser | null;
  profile?: Profile | null;
  userEmail?: string;
}

export function MobileSidebar({
  isOpen,
  onClose,
  role,
  currentUser,
  profile,
  userEmail,
}: MobileSidebarProps) {
  // Prevent background scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="mobile-drawer-portal" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
      {/* Backdrop */}
      <div
        className="mobile-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="mobile-drawer-content">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="mobile-drawer-close-btn"
          aria-label="إغلاق القائمة"
        >
          <DynamicIcon name="X" size={20} />
        </button>

        {/* Sidebar */}
        <Sidebar
          role={role}
          currentUser={currentUser}
          profile={profile}
          userEmail={userEmail}
          isCollapsed={false}
          onNavigate={onClose}
          className="app-sidebar--mobile"
        />
      </div>
    </div>
  );
}
