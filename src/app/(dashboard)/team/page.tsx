import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "فريق العمل | OUT",
};

export default async function TeamPage() {
  // Enforce server-side role check: only admin and manager can access
  await requireRole(["admin", "manager"]);

  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <div className="placeholder-badge">إدارة النظام</div>
        <h1 className="placeholder-title">فريق العمل</h1>
        <p className="placeholder-desc">
          إدارة أعضاء الفريق، الموظفين، المناديب، والمفتشين. هذه الصفحة قيد التطوير.
        </p>
      </div>
    </div>
  );
}
