import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "التقارير والإحصائيات | OUT",
};

export default async function ReportsPage() {
  // Enforce server-side role check: only admin and manager can access
  await requireRole(["admin", "manager"]);

  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <div className="placeholder-badge">إدارة النظام</div>
        <h1 className="placeholder-title">التقارير والإحصائيات</h1>
        <p className="placeholder-desc">
          متابعة مؤشرات الأداء، التحليلات، وإحصائيات العمليات اللوجستية. هذه الصفحة قيد التطوير.
        </p>
      </div>
    </div>
  );
}
