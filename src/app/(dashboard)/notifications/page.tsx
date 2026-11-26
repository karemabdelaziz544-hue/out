import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { getUserNotifications } from "@/lib/notifications/queries";
import { NotificationsView } from "@/components/notifications";

export const metadata: Metadata = {
  title: "الإشعارات | OUT",
  description: "مركز الإشعارات والتنبيهات الخاصة بشحناتك والعمليات الجمركية.",
};

export default async function NotificationsPage() {
  await connection();
  const currentUser = await requireAuth();

  const notifications = await getUserNotifications(currentUser.id, { limit: 50 });

  return (
    <div className="dashboard-content">
      <NotificationsView
        initialNotifications={notifications}
        currentUserId={currentUser.id}
      />
    </div>
  );
}
