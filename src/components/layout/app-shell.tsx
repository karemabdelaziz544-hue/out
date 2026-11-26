"use client";

import { useState, useSyncExternalStore } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileSidebar } from "./mobile-sidebar";
import { cn } from "@/lib/utils";
import type { UserRole, Profile, CurrentUser } from "@/types";

interface AppShellProps {
  children: React.ReactNode;
  role?: UserRole | null;
  currentUser?: CurrentUser | null;
  profile?: Profile | null;
  userEmail?: string;
  unreadNotificationsCount?: number;
}

// ─── External Store for Sidebar Collapse State ────────────────────────────────

const STORAGE_KEY = "out_sidebar_collapsed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function AppShell({
  children,
  role,
  currentUser,
  profile,
  userEmail,
  unreadNotificationsCount = 0,
}: AppShellProps) {
  const effectiveRole = role ?? currentUser?.role ?? "customer";
  const effectiveEmail = userEmail ?? currentUser?.email;
  const isCollapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleToggleCollapse = () => {
    try {
      const next = !isCollapsed;
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        "app-shell",
        isCollapsed && "app-shell--collapsed",
      )}
    >
      {/* Desktop Right Sidebar */}
      <Sidebar
        role={effectiveRole}
        currentUser={currentUser}
        profile={profile}
        userEmail={effectiveEmail}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        className="app-sidebar--desktop"
      />

      {/* Mobile Right Drawer */}
      <MobileSidebar
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        role={effectiveRole}
        currentUser={currentUser}
        profile={profile}
        userEmail={effectiveEmail}
      />

      {/* Main Container: Header + Content */}
      <div className="app-shell__body">
        <Header
          role={effectiveRole}
          currentUser={currentUser}
          profile={profile}
          userEmail={effectiveEmail}
          unreadNotificationsCount={unreadNotificationsCount}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
        />
        <main className="app-shell__content">
          <div className="app-shell__container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
