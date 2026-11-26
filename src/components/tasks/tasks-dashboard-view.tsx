"use client";

import React, { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TasksKpiCards } from "./tasks-kpi-cards";
import { TasksFilters } from "./tasks-filters";
import { TasksTable } from "./tasks-table";
import { TasksMobileList } from "./tasks-mobile-list";
import { TaskDetailModal } from "./task-detail-modal";
import { DynamicIcon } from "@/components/ui/icon";
import type { AdminTaskItem, TaskStats } from "@/types/task";

interface TasksDashboardViewProps {
  tasks: AdminTaskItem[];
  stats: TaskStats;
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export function TasksDashboardView({
  tasks,
  stats,
  totalCount,
  currentPage,
  totalPages,
}: TasksDashboardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentQuery = searchParams.get("q") || "";
  const currentStatus = searchParams.get("status") || "all";
  const currentRole = searchParams.get("role") || "all";

  const [selectedTask, setSelectedTask] = useState<AdminTaskItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Update query params in URL
  const updateFilters = (params: { q?: string; status?: string; role?: string; page?: number }) => {
    const sp = new URLSearchParams(searchParams.toString());

    if (params.q !== undefined) {
      if (params.q.trim()) sp.set("q", params.q.trim());
      else sp.delete("q");
    }

    if (params.status !== undefined) {
      if (params.status && params.status !== "all") sp.set("status", params.status);
      else sp.delete("status");
    }

    if (params.role !== undefined) {
      if (params.role && params.role !== "all") sp.set("role", params.role);
      else sp.delete("role");
    }

    if (params.page !== undefined) {
      if (params.page > 1) sp.set("page", String(params.page));
      else sp.delete("page");
    } else {
      // Reset to page 1 on filter changes
      sp.delete("page");
    }

    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleOpenTask = (task: AdminTaskItem) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        direction: "rtl",
        width: "100%",
      }}
    >
      {/* ─── 1. Header Banner ─────────────────────────────────────────────────── */}
      <section className="dashboard-welcome-banner">
        <div className="dashboard-welcome-banner__content">
          <div className="dashboard-welcome-banner__badge">
            مركز متابعة العمليات والمهام الجمركية
          </div>
          <h1 className="dashboard-welcome-banner__title">
            المهام والعمليات التشغيلية
          </h1>
          <p className="dashboard-welcome-banner__desc">
            متابعة وإدارة كافة المراحل والمهام الجمركية المطلوبة عبر الشحنات، توزيع المسؤوليات، ومراقبة مواعيد الإنجاز (SLA).
          </p>
        </div>

        <div className="dashboard-welcome-banner__role-card">
          <span className="dashboard-welcome-banner__role-label">إجمالي المهام النشطة</span>
          <span className="dashboard-welcome-banner__role-val" style={{ color: "var(--color-yellow)" }}>
            {stats.totalTasks} مهمة
          </span>
        </div>
      </section>

      {/* ─── 2. KPI Summary Cards ─────────────────────────────────────────────── */}
      <TasksKpiCards
        stats={stats}
        activeStatus={currentStatus}
        onSelectStatus={(status) => updateFilters({ status, page: 1 })}
      />

      {/* ─── 3. Search and Filters Toolbar ────────────────────────────────────── */}
      <TasksFilters
        searchQuery={currentQuery}
        selectedStatus={currentStatus}
        selectedRole={currentRole}
        onSearchChange={(q) => updateFilters({ q, page: 1 })}
        onStatusChange={(status) => updateFilters({ status, page: 1 })}
        onRoleChange={(role) => updateFilters({ role, page: 1 })}
        onReset={() => router.push(pathname)}
      />

      {/* ─── 4. Tasks List (Desktop Table + Mobile Cards) ──────────────────────── */}
      {/* Desktop view (visible on screen widths > 768px) */}
      <div className="tasks-desktop-container">
        <TasksTable
          tasks={tasks}
          onOpenTask={handleOpenTask}
          onResetFilters={() => router.push(pathname)}
        />
      </div>

      {/* Mobile view (visible on screen widths <= 768px) */}
      <div className="tasks-mobile-container">
        <TasksMobileList tasks={tasks} onOpenTask={handleOpenTask} />
      </div>

      {/* ─── 5. Pagination Controls ───────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <div style={{ color: "var(--color-gray-500)" }}>
            عرض صفحة {currentPage} من {totalPages} (إجمالي {totalCount} مهمة)
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => updateFilters({ page: currentPage - 1 })}
              style={{
                height: "36px",
                padding: "0 0.85rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-gray-300)",
                backgroundColor: currentPage <= 1 ? "#f3f4f6" : "#ffffff",
                color: currentPage <= 1 ? "#9ca3af" : "#1f2937",
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <DynamicIcon name="ChevronRight" size={14} />
              <span>السابق</span>
            </button>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => updateFilters({ page: currentPage + 1 })}
              style={{
                height: "36px",
                padding: "0 0.85rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-gray-300)",
                backgroundColor: currentPage >= totalPages ? "#f3f4f6" : "#ffffff",
                color: currentPage >= totalPages ? "#9ca3af" : "#1f2937",
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <span>التالي</span>
              <DynamicIcon name="ChevronLeft" size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── 6. Task Details and Update Modal ─────────────────────────────────── */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onTaskUpdated={() => {
          // Re-fetch
          router.refresh();
        }}
      />
    </div>
  );
}
