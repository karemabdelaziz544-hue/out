import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { getAdminTasks } from "@/lib/tasks/queries";
import { TasksDashboardView } from "@/components/tasks";

export const metadata: Metadata = {
  title: "إدارة المهام والعمليات | OUT",
  description: "المركز الإداري لمتابعة وإدارة المهام والعمليات التشغيلية للتخليص الجمركي.",
};

interface TasksPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    role?: string;
    page?: string;
  }>;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  await connection();
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  // Customers are redirected away to dashboard
  if (currentUser.role === "customer") {
    redirect("/dashboard");
  }

  // Only authorized operational roles can access the tasks management center
  await requireRole(["admin", "manager", "data_entry", "scout", "inspector"]);

  const { q, status, role, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  const { tasks, stats, totalCount, totalPages } = await getAdminTasks({
    query: q,
    status: status || "all",
    role: role || "all",
    page: currentPage,
    pageSize: 15,
  });

  return (
    <div className="dashboard-content">
      <TasksDashboardView
        tasks={tasks}
        stats={stats}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
