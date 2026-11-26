import { connection } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";
import { AppShell } from "@/components/layout";
import type { Metadata } from "next";

export const instant = false;

export const metadata: Metadata = {
  title: "لوحة التحكم | OUT",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // Enforces authentication and single source of truth database role
  const currentUser = await requireAuth();
  const unreadNotificationsCount = await getUnreadNotificationCount(currentUser.id);

  return (
    <AppShell
      role={currentUser.role}
      currentUser={currentUser}
      userEmail={currentUser.email}
      unreadNotificationsCount={unreadNotificationsCount}
    >
      {children}
    </AppShell>
  );
}

