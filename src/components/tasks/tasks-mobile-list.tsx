"use client";

import React from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { AdminTaskItem } from "@/types/task";
import { CUSTOMS_STAGE_STATUS_CONFIG } from "@/types/journey";

interface TasksMobileListProps {
  tasks: AdminTaskItem[];
  onOpenTask: (task: AdminTaskItem) => void;
}

export function TasksMobileList({ tasks, onOpenTask }: TasksMobileListProps) {
  if (tasks.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        width: "100%",
      }}
    >
      {tasks.map((task) => {
        const statusCfg = CUSTOMS_STAGE_STATUS_CONFIG[task.status];

        return (
          <div
            key={task.id}
            className="card"
            style={{
              padding: "1rem",
              backgroundColor: "#ffffff",
              border: "1px solid var(--color-gray-200)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              borderRadius: "var(--radius-lg)",
            }}
          >
            {/* Top row: Stage Order, Title & Status */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "bold",
                    color: "var(--color-black)",
                    backgroundColor: "var(--color-yellow)",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-xs)",
                    lineHeight: 1,
                  }}
                >
                  {String(task.stageOrder).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontWeight: "var(--font-weight-bold)",
                    fontSize: "var(--font-size-base)",
                    color: "var(--color-black)",
                  }}
                >
                  {task.title}
                </span>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-semibold)",
                  padding: "0.2rem 0.5rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: statusCfg?.bg || "#f3f4f6",
                  color: statusCfg?.color || "#374151",
                  border: `1px solid ${statusCfg?.borderColor || "#e5e7eb"}`,
                  whiteSpace: "nowrap",
                }}
              >
                <span>{task.statusLabel}</span>
              </span>
            </div>

            {/* Overdue alert if applicable */}
            {task.isOverdue && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "bold",
                  color: "#b91c1c",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <DynamicIcon name="AlertTriangle" size={12} />
                <span>المهمة متأخرة عن الموعد المستهدف (SLA)</span>
              </div>
            )}

            {/* Middle Row: Shipment Ref & Customer */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                padding: "0.6rem 0.75rem",
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <div>
                <span style={{ color: "var(--color-gray-500)", display: "block" }}>الشحنة المرتبطة</span>
                <Link
                  href={`/shipments/${task.shipmentId}`}
                  style={{
                    fontWeight: "bold",
                    color: "var(--color-black)",
                    textDecoration: "underline",
                    fontFamily: "monospace",
                    direction: "ltr",
                    display: "inline-block",
                  }}
                >
                  {task.shipmentReference}
                </Link>
              </div>

              <div style={{ textAlign: "left" }}>
                <span style={{ color: "var(--color-gray-500)", display: "block" }}>العميل / الشركة</span>
                <span style={{ fontWeight: "var(--font-weight-medium)", color: "var(--color-black)" }}>
                  {task.companyName || task.customerName || "غير محدد"}
                </span>
              </div>
            </div>

            {/* Bottom Row: Role & Due Date */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <DynamicIcon name="User" size={12} />
                <span>المسؤول: {task.roleLabel}</span>
              </div>

              <div>
                <span>{task.targetCompletionAt ? formatDateAr(task.targetCompletionAt) : `SLA: ${task.targetDurationHours} س`}</span>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={() => onOpenTask(task)}
              style={{
                width: "100%",
                height: "44px",
                backgroundColor: "var(--color-black)",
                color: "var(--color-white)",
                borderRadius: "var(--radius-md)",
                border: "none",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                cursor: "pointer",
                marginTop: "0.25rem",
              }}
            >
              <DynamicIcon name="Eye" size={16} />
              <span>عرض تفاصيل المهمة ومتابعتها</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
