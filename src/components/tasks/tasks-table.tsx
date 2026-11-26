"use client";

import React from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { AdminTaskItem } from "@/types/task";
import { CUSTOMS_STAGE_STATUS_CONFIG } from "@/types/journey";

interface TasksTableProps {
  tasks: AdminTaskItem[];
  onOpenTask: (task: AdminTaskItem) => void;
  onResetFilters: () => void;
}

export function TasksTable({ tasks, onOpenTask, onResetFilters }: TasksTableProps) {
  if (tasks.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: "3rem 1.5rem",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "rgba(245, 197, 0, 0.1)",
            color: "var(--color-yellow-dark)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DynamicIcon name="CheckSquare" size={28} />
        </div>
        <h3 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)" }}>
          لا توجد مهام مطابقة للبحث أو التصفية الحالية
        </h3>
        <p style={{ color: "var(--color-gray-500)", fontSize: "var(--font-size-sm)", maxWidth: "420px" }}>
          جرب تغيير معايير البحث أو تصفية الحالات والأدوار لعرض المزيد من المهام التشغيلية.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="btn btn--secondary"
          style={{ height: "40px", marginTop: "0.5rem" }}
        >
          عرض كافة المهام
        </button>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        backgroundColor: "#ffffff",
        border: "1px solid var(--color-gray-200)",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "right",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "#f8fafc",
                borderBottom: "1px solid var(--color-gray-200)",
                color: "var(--color-gray-600)",
                fontWeight: "var(--font-weight-semibold)",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <th style={{ padding: "0.85rem 1rem", width: "60px" }}>#</th>
              <th style={{ padding: "0.85rem 1rem" }}>المهمة والمرحلة</th>
              <th style={{ padding: "0.85rem 1rem" }}>الشحنة المرتبطة</th>
              <th style={{ padding: "0.85rem 1rem" }}>الدور المسؤول</th>
              <th style={{ padding: "0.85rem 1rem" }}>الحالة التشغيلية</th>
              <th style={{ padding: "0.85rem 1rem" }}>الأولوية والموعد</th>
              <th style={{ padding: "0.85rem 1rem", textAlign: "center", width: "120px" }}>
                الإجراء
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, idx) => {
              const statusCfg = CUSTOMS_STAGE_STATUS_CONFIG[task.status];
              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={task.id}
                  style={{
                    backgroundColor: isEven ? "#ffffff" : "#fcfcfd",
                    borderBottom: "1px solid var(--color-gray-100)",
                    transition: "background-color var(--transition-fast)",
                  }}
                >
                  {/* Stage Order */}
                  <td style={{ padding: "1rem", fontWeight: "var(--font-weight-bold)", color: "var(--color-gray-400)" }}>
                    {String(task.stageOrder).padStart(2, "0")}
                  </td>

                  {/* Task Title & Short Desc */}
                  <td style={{ padding: "1rem" }}>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                      {task.title}
                    </div>
                    {task.shortDescription && (
                      <div
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-gray-500)",
                          marginTop: "2px",
                          maxWidth: "320px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {task.shortDescription}
                      </div>
                    )}
                  </td>

                  {/* Shipment Reference & Customer */}
                  <td style={{ padding: "1rem" }}>
                    <Link
                      href={`/shipments/${task.shipmentId}`}
                      style={{
                        fontWeight: "var(--font-weight-bold)",
                        color: "var(--color-black)",
                        textDecoration: "none",
                        fontFamily: "monospace",
                        direction: "ltr",
                        display: "inline-block",
                      }}
                      title="فتح صفحة تفاصيل الشحنة"
                    >
                      {task.shipmentReference}
                    </Link>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", marginTop: "2px" }}>
                      {task.companyName || task.customerName || "عميل غير محدد"}
                    </div>
                  </td>

                  {/* Responsible Role */}
                  <td style={{ padding: "1rem" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        padding: "0.25rem 0.65rem",
                        borderRadius: "var(--radius-full)",
                        backgroundColor: "#f1f5f9",
                        color: "#334155",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <DynamicIcon name="User" size={12} />
                      <span>{task.roleLabel}</span>
                    </span>
                  </td>

                  {/* Operational Status */}
                  <td style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "var(--font-size-xs)",
                          fontWeight: "var(--font-weight-semibold)",
                          padding: "0.25rem 0.65rem",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: statusCfg?.bg || "#f3f4f6",
                          color: statusCfg?.color || "#374151",
                          border: `1px solid ${statusCfg?.borderColor || "#e5e7eb"}`,
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: statusCfg?.color || "#6b7280",
                          }}
                        />
                        <span>{task.statusLabel}</span>
                      </span>

                      {task.isOverdue && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "10px",
                            fontWeight: "bold",
                            color: "#b91c1c",
                            backgroundColor: "#fef2f2",
                            border: "1px solid #fecaca",
                            padding: "1px 6px",
                            borderRadius: "var(--radius-xs)",
                          }}
                        >
                          <DynamicIcon name="AlertTriangle" size={10} />
                          <span>متأخرة عن الموعد</span>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Priority & Target Due Date */}
                  <td style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "var(--font-size-xs)",
                          fontWeight: "var(--font-weight-medium)",
                          color:
                            task.priority === "urgent"
                              ? "#b91c1c"
                              : task.priority === "high"
                              ? "#c2410c"
                              : task.priority === "medium"
                              ? "#1d4ed8"
                              : "#64748b",
                        }}
                      >
                        {task.priorityLabel}
                      </span>
                    </div>

                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-400)", marginTop: "2px" }}>
                      {task.targetCompletionAt
                        ? formatDateAr(task.targetCompletionAt)
                        : `الهدف: ${task.targetDurationHours} ساعة`}
                    </div>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "1rem", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      style={{
                        padding: "0.35rem 0.85rem",
                        backgroundColor: "var(--color-black)",
                        color: "var(--color-white)",
                        borderRadius: "var(--radius-md)",
                        border: "none",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "background-color var(--transition-fast)",
                      }}
                    >
                      <DynamicIcon name="Eye" size={12} />
                      <span>متابعة</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
