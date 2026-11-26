import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SettingsView } from "@/components/settings";

export const metadata: Metadata = {
  title: "الإعدادات | OUT",
  description: "تخصيص تفضيلات الحساب والإشعارات والأمان.",
};

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();

  return <SettingsView user={currentUser} />;
}
