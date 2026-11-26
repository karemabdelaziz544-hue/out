"use client";

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";

interface TasksFiltersProps {
  searchQuery: string;
  selectedStatus: string;
  selectedRole: string;
  onSearchChange: (q: string) => void;
  onStatusChange: (status: string) => void;
  onRoleChange: (role: string) => void;
  onReset: () => void;
}

export function TasksFilters({
  searchQuery,
  selectedStatus,
  selectedRole,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onReset,
}: TasksFiltersProps) {
  const hasActiveFilters =
    searchQuery.trim() !== "" || selectedStatus !== "all" || selectedRole !== "all";

  return (
    <div
      className="card"
      style={{
        padding: "1rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "1rem",
        backgroundColor: "#ffffff",
        border: "1px solid var(--color-gray-200)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          flex: 1,
          minWidth: "280px",
        }}
      >
        {/* Search Input */}
        <div
          style={{
            position: "relative",
            flex: "1 1 260px",
            minWidth: "220px",
          }}
        >
          <span
            style={{
              position: "absolute",
              right: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-gray-400)",
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <DynamicIcon name="Search" size={16} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث باسم المهمة، رقم الشحنة، العميل، أو الوصف..."
            style={{
              width: "100%",
              height: "40px",
              paddingInlineStart: "1rem",
              paddingInlineEnd: "2.5rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-gray-300)",
              fontSize: "var(--font-size-sm)",
              backgroundColor: "#fafafa",
              color: "var(--color-black)",
              outline: "none",
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ minWidth: "160px" }}>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            style={{
              width: "100%",
              height: "40px",
              padding: "0 0.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-gray-300)",
              fontSize: "var(--font-size-sm)",
              backgroundColor: "#fafafa",
              color: "var(--color-black)",
              cursor: "pointer",
              outline: "none",
            }}
            aria-label="تصفية بحسب الحالة"
          >
            <option value="all">كافة الحالات</option>
            <option value="pending">بانتظار البدء</option>
            <option value="in_progress">قيد التنفيذ والمتابعة</option>
            <option value="overdue">متأخرة (تجاوزت SLA)</option>
            <option value="blocked">متوقفة / ملاحظات</option>
            <option value="completed">مكتملة وموثقة</option>
          </select>
        </div>

        {/* Role Filter */}
        <div style={{ minWidth: "160px" }}>
          <select
            value={selectedRole}
            onChange={(e) => onRoleChange(e.target.value)}
            style={{
              width: "100%",
              height: "40px",
              padding: "0 0.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-gray-300)",
              fontSize: "var(--font-size-sm)",
              backgroundColor: "#fafafa",
              color: "var(--color-black)",
              cursor: "pointer",
              outline: "none",
            }}
            aria-label="تصفية بحسب الدور المسؤول"
          >
            <option value="all">كافة الأدوار المسؤولة</option>
            <option value="admin">إدارة العمليات (Admin)</option>
            <option value="data_entry">مدرج بيانات (Data Entry)</option>
            <option value="scout">كشاف (Scout)</option>
            <option value="inspector">معاين (Inspector)</option>
          </select>
        </div>
      </div>

      {/* Reset Filter Button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          style={{
            height: "40px",
            padding: "0 1rem",
            backgroundColor: "transparent",
            color: "var(--color-gray-600)",
            border: "1px solid var(--color-gray-300)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
          }}
        >
          <DynamicIcon name="RotateCw" size={14} />
          <span>إعادة تعيين</span>
        </button>
      )}
    </div>
  );
}
