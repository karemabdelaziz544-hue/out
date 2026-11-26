"use client";

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";
import type { TaskStats } from "@/types/task";

interface TasksKpiCardsProps {
  stats: TaskStats;
  activeStatus: string;
  onSelectStatus: (status: string) => void;
}

export function TasksKpiCards({
  stats,
  activeStatus,
  onSelectStatus,
}: TasksKpiCardsProps) {
  const cards = [
    {
      id: "all",
      label: "إجمالي المهام التشغيلية",
      count: stats.totalTasks,
      icon: "CheckSquare",
      color: "var(--color-black)",
      accent: "var(--color-yellow)",
      bg: "#ffffff",
    },
    {
      id: "pending",
      label: "بانتظار البدء",
      count: stats.pendingTasks,
      icon: "Clock",
      color: "#475569",
      accent: "#94a3b8",
      bg: "#f8fafc",
    },
    {
      id: "in_progress",
      label: "قيد التنفيذ والمتابعة",
      count: stats.inProgressTasks,
      icon: "Loader",
      color: "#1d4ed8",
      accent: "#3b82f6",
      bg: "#eff6ff",
    },
    {
      id: "overdue",
      label: "مهام متأخرة (تجاوزت الـ SLA)",
      count: stats.overdueTasks,
      icon: "AlertTriangle",
      color: "#b91c1c",
      accent: "#ef4444",
      bg: stats.overdueTasks > 0 ? "#fef2f2" : "#ffffff",
      highlightBorder: stats.overdueTasks > 0,
    },
    {
      id: "completed",
      label: "مهام مكتملة وموثقة",
      count: stats.completedTasks,
      icon: "CheckCircle",
      color: "#047857",
      accent: "#10b981",
      bg: "#ecfdf5",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem",
        width: "100%",
      }}
    >
      {cards.map((c) => {
        const isActive = activeStatus === c.id || (activeStatus === "all" && c.id === "all");
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectStatus(c.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-lg)",
              backgroundColor: c.bg,
              border: isActive
                ? "2px solid var(--color-yellow)"
                : c.highlightBorder
                ? "1px solid rgba(239, 68, 68, 0.4)"
                : "1px solid var(--color-gray-200)",
              boxShadow: isActive ? "0 4px 12px rgba(245, 197, 0, 0.2)" : "var(--shadow-sm)",
              cursor: "pointer",
              textAlign: "right",
              transition: "all var(--transition-fast)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "4px",
                }}
              >
                {c.label}
              </span>
              <span
                style={{
                  fontSize: "var(--font-size-2xl)",
                  fontWeight: "var(--font-weight-bold)",
                  color: c.color,
                  lineHeight: 1,
                }}
              >
                {c.count}
              </span>
            </div>

            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "rgba(0,0,0,0.03)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: c.accent,
              }}
            >
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <DynamicIcon name={c.icon as any} size={20} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
