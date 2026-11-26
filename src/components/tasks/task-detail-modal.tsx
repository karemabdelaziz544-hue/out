"use client";

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { AdminTaskItem } from "@/types/task";
import type { CustomsStageStatus } from "@/types/journey";
import { updateTaskStatusAction } from "@/lib/tasks/actions";

interface TaskDetailModalProps {
  task: AdminTaskItem | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export function TaskDetailModal(props: TaskDetailModalProps) {
  if (!props.isOpen || !props.task) return null;
  return (
    <TaskDetailModalContent
      key={`${props.task.id}_${props.task.updatedAt}`}
      {...props}
      task={props.task}
    />
  );
}

function TaskDetailModalContent({
  task,
  onClose,
  onTaskUpdated,
}: {
  task: AdminTaskItem;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form local state initialized cleanly from task props
  const [status, setStatus] = useState<CustomsStageStatus>(task.status);
  const [referenceNumber, setReferenceNumber] = useState(task.referenceNumber || "");
  const [notes, setNotes] = useState(task.notes || "");
  const [rejectionOrDelayReason, setRejectionOrDelayReason] = useState(
    task.rejectionOrDelayReason || "",
  );

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    const fd = new FormData(e.currentTarget);
    fd.set("shipment_id", task.shipmentId);
    fd.set("stage_key", task.stageKey);
    fd.set("status", status);
    fd.set("reference_number", referenceNumber);
    fd.set("notes", notes);
    fd.set("rejection_or_delay_reason", rejectionOrDelayReason);
    fd.set("expected_updated_at", task.updatedAt);

    startTransition(async () => {
      const res = await updateTaskStatusAction(fd);
      if (res.success) {
        setFeedback({
          type: "success",
          message: res.message || "تم تحديث المهمة التشغيلية بنجاح.",
        });
        if (onTaskUpdated) onTaskUpdated();
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "حدث خطأ أثناء تحديث المهمة.",
        });
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "640px",
          maxHeight: "90vh",
          overflowY: "auto",
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-xl)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          direction: "rtl",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-gray-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#fafafa",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "bold",
                color: "var(--color-black)",
                backgroundColor: "var(--color-yellow)",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
              }}
            >
              مرحلة {String(task.stageOrder).padStart(2, "0")}
            </span>
            <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
              {task.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-gray-400)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm)",
            }}
            aria-label="إغلاق النافذة"
          >
            <DynamicIcon name="X" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Feedback Banner */}
          {feedback && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-sm)",
                backgroundColor: feedback.type === "success" ? "#ecfdf5" : "#fef2f2",
                color: feedback.type === "success" ? "#047857" : "#b91c1c",
                border: `1px solid ${feedback.type === "success" ? "#a7f3d0" : "#fecaca"}`,
              }}
              role="status"
            >
              {feedback.message}
            </div>
          )}

          {/* Shipment & Context Info Card */}
          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid var(--color-gray-200)",
              borderRadius: "var(--radius-lg)",
              padding: "1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.85rem",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>الشحنة المرتبطة:</span>
              <Link
                href={`/shipments/${task.shipmentId}`}
                style={{
                  fontWeight: "bold",
                  color: "var(--color-black)",
                  fontSize: "var(--font-size-sm)",
                  fontFamily: "monospace",
                  direction: "ltr",
                  display: "inline-block",
                  marginTop: "2px",
                }}
              >
                {task.shipmentReference}
              </Link>
            </div>

            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>العميل / الشركة:</span>
              <strong style={{ display: "block", color: "var(--color-black)", marginTop: "2px" }}>
                {task.companyName || task.customerName || "غير محدد"}
              </strong>
            </div>

            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>الدور المسؤول:</span>
              <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)", marginTop: "2px", display: "inline-block" }}>
                {task.roleLabel}
              </span>
            </div>

            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>المدة المستهدفة (SLA):</span>
              <span style={{ color: "var(--color-black)", marginTop: "2px", display: "inline-block" }}>
                {task.targetDurationHours} ساعة
                {task.targetCompletionAt && ` (الموعد: ${formatDateAr(task.targetCompletionAt)})`}
              </span>
            </div>
          </div>

          {/* Description */}
          {task.shortDescription && (
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)", margin: 0, lineHeight: 1.6 }}>
              {task.shortDescription}
            </p>
          )}

          {/* Update Task Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold", color: "var(--color-black)", margin: 0 }}>
              تحديث الحالة التشغيلية للمهمة
            </h3>

            {/* Status Select */}
            <div>
              <label htmlFor="task-status-select" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: "medium", color: "var(--color-gray-700)", marginBottom: "4px" }}>
                حالة المهمة:
              </label>
              <select
                id="task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as CustomsStageStatus)}
                style={{
                  width: "100%",
                  height: "42px",
                  padding: "0 0.75rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-gray-300)",
                  fontSize: "var(--font-size-sm)",
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="pending">بانتظار البدء (Pending)</option>
                <option value="in_progress">قيد التنفيذ والمتابعة (In Progress)</option>
                <option value="awaiting_external_response">بانتظار رد خارجي من الجهة (Awaiting External)</option>
                <option value="needs_correction">مطلوب تعديل / ملاحظات (Needs Correction)</option>
                <option value="blocked">متوقفة / مانع تشغيلي (Blocked)</option>
                <option value="completed">مكتملة وموثقة رسميًا (Completed)</option>
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label htmlFor="task-ref-input" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: "medium", color: "var(--color-gray-700)", marginBottom: "4px" }}>
                الرقم المرجعي / رقم المعاملة (إن وجد):
              </label>
              <input
                id="task-ref-input"
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="مثال: رقم طلب الفحص، رقم المحضر، أو مرجع نافذة"
                style={{
                  width: "100%",
                  height: "42px",
                  padding: "0 0.75rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-gray-300)",
                  fontSize: "var(--font-size-sm)",
                }}
              />
            </div>

            {/* Blocker or Delay Reason (shown when blocked or needs correction) */}
            {(status === "blocked" || status === "needs_correction") && (
              <div>
                <label htmlFor="task-delay-reason" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: "medium", color: "#b91c1c", marginBottom: "4px" }}>
                  سبب التوقف أو الملاحظات المطلوبة *:
                </label>
                <input
                  id="task-delay-reason"
                  type="text"
                  required
                  value={rejectionOrDelayReason}
                  onChange={(e) => setRejectionOrDelayReason(e.target.value)}
                  placeholder="حدد بدقة سبب التوقف أو الملاحظة الإجرائية"
                  style={{
                    width: "100%",
                    height: "42px",
                    padding: "0 0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid #f87171",
                    fontSize: "var(--font-size-sm)",
                    backgroundColor: "#fffafb",
                  }}
                />
              </div>
            )}

            {/* Operational Notes */}
            <div>
              <label htmlFor="task-notes-textarea" style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: "medium", color: "var(--color-gray-700)", marginBottom: "4px" }}>
                ملاحظات المتابعة والتوثيق التشغيلي:
              </label>
              <textarea
                id="task-notes-textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أدخل أي ملاحظات هامة أو نتائج تمت متابعتها مع الجهات المختصة..."
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-gray-300)",
                  fontSize: "var(--font-size-sm)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "0.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--color-gray-200)",
              }}
            >
              <Link
                href={`/shipments/${task.shipmentId}`}
                style={{
                  height: "44px",
                  padding: "0 1.25rem",
                  backgroundColor: "transparent",
                  color: "var(--color-black)",
                  border: "1px solid var(--color-gray-300)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  textDecoration: "none",
                }}
              >
                <DynamicIcon name="ExternalLink" size={16} />
                <span>مساحة عمل الشحنة</span>
              </Link>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    height: "44px",
                    padding: "0 1.25rem",
                    backgroundColor: "#f1f5f9",
                    color: "var(--color-gray-700)",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-sm)",
                    cursor: "pointer",
                  }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    height: "44px",
                    padding: "0 1.5rem",
                    backgroundColor: "var(--color-yellow)",
                    color: "var(--color-black)",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    cursor: isPending ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  id="save-task-update-btn"
                >
                  {isPending ? (
                    <>
                      <span className="btn__spinner" aria-hidden="true" />
                      <span>جارٍ الحفظ...</span>
                    </>
                  ) : (
                    <span>حفظ التعديلات</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
