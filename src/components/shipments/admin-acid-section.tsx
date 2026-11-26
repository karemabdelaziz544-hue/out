"use client";

/**
 * Admin ACID Management Section (Step 7)
 *
 * Back-office panel for staff to manage the internal OUT ACID workflow:
 *  - View ACID processing stage in workflow timeline
 *  - Start processing ('pending' -> 'processing')
 *  - Enter and issue official ACID number ('processing' -> 'issued')
 *  - Mark processing as failed with mandatory reason ('failed')
 *  - Restart processing from failed state
 *  - Immutable locked state once issued
 *  - Audit trail history timeline
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import {
  adminStartAcidProcessingAction,
  adminIssueAcidAction,
  adminFailAcidAction,
} from "@/lib/shipments/acid-actions";
import type {
  Shipment,
  ShipmentAcid,
  ShipmentAcidHistoryItem,
} from "@/types";
import { ACID_STATUS_LABELS, ACID_ACTION_LABELS } from "@/types";

interface AdminAcidSectionProps {
  shipment: Shipment;
  acid: ShipmentAcid | null;
  acidHistory?: ShipmentAcidHistoryItem[];
}

export function AdminAcidSection({
  shipment,
  acid,
  acidHistory = [],
}: AdminAcidSectionProps) {
  const router = useRouter();

  // Issue Form State
  const [acidNumberInput, setAcidNumberInput] = useState(acid?.acid_number || "");
  const [issueNotes, setIssueNotes] = useState("");
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  // Start Processing State
  const [isSubmittingStart, setIsSubmittingStart] = useState(false);

  // Failure Modal / Form State
  const [isFailModalOpen, setIsFailModalOpen] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [isSubmittingFail, setIsSubmittingFail] = useState(false);

  // Feedback State
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);

  const currentStatus = acid?.status || (shipment.status === "acid_processing" ? "pending" : null);
  const isIssued = currentStatus === "issued";
  const isProcessing = currentStatus === "processing";
  const isPending = currentStatus === "pending";
  const isFailed = currentStatus === "failed";

  // Check if shipment is at or past ACID stage
  const isEligibleStage =
    shipment.status === "acid_processing" ||
    shipment.status === "acid_issued" ||
    shipment.status === "invoice_approved" ||
    Boolean(acid);

  if (!isEligibleStage) {
    return null;
  }

  // 1. Handle Start Processing
  const handleStartProcessing = async () => {
    setIsSubmittingStart(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);

    try {
      const res = await adminStartAcidProcessingAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر بدء معالجة ACID.");
      } else {
        setActionSuccess(res.message || "تم بدء معالجة ACID بنجاح.");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء بدء المعالجة.");
    } finally {
      setIsSubmittingStart(false);
    }
  };

  // 2. Handle Issue ACID
  const handleIssueAcid = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = acidNumberInput.trim();

    if (!cleanNumber) {
      setActionError("يرجى إدخال رقم ACID الصادر.");
      return;
    }

    if (cleanNumber.length < 5) {
      setActionError("رقم ACID قصير جدًا (يجب ألا يقل عن 5 خانات).");
      return;
    }

    setIsSubmittingIssue(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("acid_number", cleanNumber);
    if (issueNotes.trim()) {
      formData.append("notes", issueNotes.trim());
    }

    try {
      const res = await adminIssueAcidAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر تسجيل وإصدار رقم ACID.");
      } else {
        setActionSuccess(res.message || "تم تسجيل وإصدار رقم ACID بنجاح.");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء تسجيل رقم ACID.");
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  // 3. Handle Mark as Failed
  const handleMarkFailed = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReason = failReason.trim();

    if (!cleanReason) {
      setActionError("يرجى توضيح سبب تعثر العملية بالتفصيل.");
      return;
    }

    setIsSubmittingFail(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("reason", cleanReason);

    try {
      const res = await adminFailAcidAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر تسجيل حالة التعثر.");
      } else {
        setActionSuccess(res.message || "تم تسجيل حالة التعثر.");
        setIsFailModalOpen(false);
        setFailReason("");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء تسجيل حالة التعثر.");
    } finally {
      setIsSubmittingFail(false);
    }
  };

  // Copy ACID number to clipboard
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.75rem",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "var(--radius-md)",
              backgroundColor: isIssued
                ? "rgba(16, 185, 129, 0.12)"
                : isProcessing
                ? "rgba(99, 102, 241, 0.12)"
                : isFailed
                ? "rgba(239, 68, 68, 0.1)"
                : "rgba(245, 158, 11, 0.12)",
              color: isIssued
                ? "#047857"
                : isProcessing
                ? "#4338ca"
                : isFailed
                ? "#b91c1c"
                : "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon
              name={isIssued ? "CheckCircle" : isProcessing ? "Loader" : isFailed ? "AlertTriangle" : "FileText"}
              size={22}
            />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                إدارة رقم ACID (ACID Workflow)
              </h2>
              {currentStatus && (
                <span
                  style={{
                    padding: "0.2rem 0.625rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: isIssued
                      ? "rgba(16, 185, 129, 0.15)"
                      : isProcessing
                      ? "rgba(99, 102, 241, 0.12)"
                      : isFailed
                      ? "rgba(239, 68, 68, 0.1)"
                      : "rgba(245, 158, 11, 0.12)",
                    color: isIssued
                      ? "#065f46"
                      : isProcessing
                      ? "#4338ca"
                      : isFailed
                      ? "#b91c1c"
                      : "#b45309",
                    border: isIssued
                      ? "1px solid rgba(16, 185, 129, 0.3)"
                      : isProcessing
                      ? "1px solid rgba(99, 102, 241, 0.3)"
                      : isFailed
                      ? "1px solid rgba(239, 68, 68, 0.3)"
                      : "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  {ACID_STATUS_LABELS[currentStatus] || currentStatus}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
                margin: "0.25rem 0 0 0",
              }}
            >
              نظام إدارة وتسجيل الرقم الجمركي المبدئي (ACID) للشحنة قبل الشحن
            </p>
          </div>
        </div>

        {/* Locked state indicator if issued */}
        {isIssued && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-100)",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-gray-700)",
              border: "1px solid var(--color-gray-300)",
            }}
          >
            <DynamicIcon name="Lock" size={14} />
            <span>السجل معتمد ومقفل</span>
          </div>
        )}
      </div>

      {/* Visual Workflow Stage Indicators (Section 18) */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "var(--color-gray-50)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-gray-500)",
            display: "block",
            marginBottom: "0.875rem",
          }}
        >
          مراحل الشحنة
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Step 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              طلب التخليص
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              التسعير
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 3 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              موافقة العميل
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 4 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              اعتماد الفاتورة
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 5: ACID */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.25rem 0.5rem",
              backgroundColor: isIssued ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.12)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {isIssued ? (
              <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            ) : (
              <span style={{ color: "#4338ca", fontWeight: "bold" }}>●</span>
            )}
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                color: isIssued ? "#065f46" : "#4338ca",
              }}
            >
              {isIssued ? "تم إصدار ACID" : "معالجة ACID"}
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 6 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "var(--color-gray-400)" }}>○</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-400)" }}>
              المرحلة التالية
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {actionError && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#b91c1c",
            fontSize: "var(--font-size-sm)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <DynamicIcon name="AlertTriangle" size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#047857",
            fontSize: "var(--font-size-sm)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <DynamicIcon name="CheckCircle" size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* State 1: PENDING */}
      {isPending && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "var(--color-gray-50)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <div
              style={{
                color: "#b45309",
                marginTop: "0.125rem",
              }}
            >
              <DynamicIcon name="Clock" size={20} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-semibold)",
                  margin: "0 0 0.25rem 0",
                  color: "var(--color-black)",
                }}
              >
                حالة ACID: بانتظار المعالجة
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-gray-600)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                تم اعتماد الفاتورة المبدئية لهذه الشحنة. يمكنك الآن بدء معالجة وتجهيز إجراءات استخراج رقم ACID من خلال فريق العمل.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={handleStartProcessing}
              disabled={isSubmittingStart}
              className="btn btn--primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              {isSubmittingStart ? (
                <>
                  <DynamicIcon name="Loader" size={16} />
                  <span>جاري البدء...</span>
                </>
              ) : (
                <>
                  <DynamicIcon name="ArrowRight" size={16} />
                  <span>بدء معالجة ACID</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* State 2: PROCESSING */}
      {isProcessing && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "rgba(99, 102, 241, 0.04)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "#6366f1",
                  boxShadow: "0 0 0 4px rgba(99, 102, 241, 0.2)",
                }}
              />
              <span
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-bold)",
                  color: "#4338ca",
                }}
              >
                جاري معالجة واستخراج رقم ACID
              </span>
            </div>

            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
              {acid?.updated_by_name && (
                <span>تم بدء المعالجة بواسطة: <strong>{acid.updated_by_name}</strong> • </span>
              )}
              {acid?.updated_at && (
                <span>آخر تحديث: {formatDateAr(acid.updated_at)}</span>
              )}
            </div>
          </div>

          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-gray-600)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            عند استلام رقم ACID الصادر، أدخل الرقم في الحقل أدناه لاعتماده وتثبيته في النظام والانتقال إلى المرحلة التالية.
          </p>

          {/* Issue Form */}
          <form
            onSubmit={handleIssueAcid}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              backgroundColor: "#ffffff",
              padding: "1.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div>
              <label
                htmlFor="acid_number_input"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-black)",
                  marginBottom: "0.375rem",
                }}
              >
                رقم ACID الصادر <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                id="acid_number_input"
                type="text"
                dir="ltr"
                value={acidNumberInput}
                onChange={(e) => setAcidNumberInput(e.target.value)}
                placeholder="مثال: 4612345678901234567"
                disabled={isSubmittingIssue}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.875rem",
                  fontSize: "var(--font-size-base)",
                  fontFamily: "var(--font-family-mono)",
                  fontWeight: "var(--font-weight-semibold)",
                  letterSpacing: "0.05em",
                  border: "1px solid var(--color-gray-300)",
                  borderRadius: "var(--radius-md)",
                  outline: "none",
                  backgroundColor: "#ffffff",
                }}
                required
              />
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  display: "block",
                  marginTop: "0.25rem",
                }}
              >
                تأكد من صحة الرقم بالكامل، حيث يتم قفل السجل تلقائياً بعد التسجيل.
              </span>
            </div>

            <div>
              <label
                htmlFor="issue_notes_input"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  color: "var(--color-gray-700)",
                  marginBottom: "0.375rem",
                }}
              >
                ملاحظات داخلية (اختياري)
              </label>
              <input
                id="issue_notes_input"
                type="text"
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="أية ملاحظات إجرائية تخص إصدار هذا الرقم..."
                disabled={isSubmittingIssue}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  fontSize: "var(--font-size-sm)",
                  border: "1px solid var(--color-gray-300)",
                  borderRadius: "var(--radius-md)",
                  outline: "none",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => setIsFailModalOpen(true)}
                disabled={isSubmittingIssue}
                className="btn btn--ghost"
                style={{
                  color: "#b91c1c",
                  fontSize: "var(--font-size-xs)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                <DynamicIcon name="AlertTriangle" size={14} />
                <span>تسجيل تعثر العملية</span>
              </button>

              <button
                type="submit"
                disabled={isSubmittingIssue || !acidNumberInput.trim()}
                className="btn btn--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1.5rem",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-semibold)",
                }}
              >
                {isSubmittingIssue ? (
                  <>
                    <DynamicIcon name="Loader" size={16} />
                    <span>جاري التسجيل...</span>
                  </>
                ) : (
                  <>
                    <DynamicIcon name="CheckCircle" size={16} />
                    <span>تسجيل ACID</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* State 3: ISSUED (Locked & Read-only, Section 10 & 18) */}
      {isIssued && (
        <div
          style={{
            padding: "1.75rem",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                }}
              >
                ✓
              </div>
              <span
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  color: "#065f46",
                }}
              >
                تم إصدار ACID بنجاح ✅
              </span>
            </div>

            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
              {acid?.issued_at && (
                <span>تاريخ الإصدار: <strong>{formatDateAr(acid.issued_at)}</strong></span>
              )}
            </div>
          </div>

          {/* ACID Display Box */}
          <div
            style={{
              padding: "1.25rem 1.5rem",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                رقم ACID المعتمد:
              </span>
              <span
                dir="ltr"
                style={{
                  fontSize: "var(--font-size-2xl)",
                  fontFamily: "var(--font-family-mono)",
                  fontWeight: "var(--font-weight-bold)",
                  letterSpacing: "0.08em",
                  color: "var(--color-black)",
                }}
              >
                {acid?.acid_number}
              </span>
            </div>

            {acid?.acid_number && (
              <button
                type="button"
                onClick={() => handleCopy(acid.acid_number!)}
                className="btn btn--outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <DynamicIcon name={copiedNumber ? "Check" : "Copy"} size={16} />
                <span>{copiedNumber ? "تم النسخ بنجاح!" : "نسخ الرقم"}</span>
              </button>
            )}
          </div>

          {/* Notes or Issuer Details */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-gray-600)",
            }}
          >
            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>
                مسجل بواسطة:
              </span>
              <strong>{acid?.updated_by_name || acid?.created_by_name || "مسؤول النظام"}</strong>
            </div>

            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>
                حالة القيد:
              </span>
              <strong style={{ color: "#065f46" }}>مقفل ومحمي من التعديل المباشر</strong>
            </div>

            {acid?.notes && (
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "var(--color-gray-500)", display: "block" }}>
                  ملاحظات:
                </span>
                <span>{acid.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* State 4: FAILED (Section 23) */}
      {isFailed && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <div style={{ color: "#b91c1c", marginTop: "0.125rem" }}>
              <DynamicIcon name="AlertTriangle" size={22} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: "0 0 0.25rem 0",
                  color: "#b91c1c",
                }}
              >
                فشل في معالجة ACID
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-gray-700)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                سبب التعثر: <strong>{acid?.notes || "تعذر إكمال إصدار ACID."}</strong>
              </p>
              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  marginTop: "0.5rem",
                }}
              >
                {acid?.updated_by_name && <span>سجل بواسطة: {acid.updated_by_name} • </span>}
                {acid?.updated_at && <span>بتاريخ: {formatDateAr(acid.updated_at)}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={handleStartProcessing}
              disabled={isSubmittingStart}
              className="btn btn--primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "var(--font-size-sm)",
              }}
            >
              {isSubmittingStart ? (
                <>
                  <DynamicIcon name="Loader" size={16} />
                  <span>جاري إعادة البدء...</span>
                </>
              ) : (
                <>
                  <DynamicIcon name="RefreshCw" size={16} />
                  <span>إعادة معالجة ACID</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Mark Failed Modal */}
      {isFailModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "480px",
              width: "100%",
              padding: "1.75rem",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
                color: "#b91c1c",
              }}
            >
              <DynamicIcon name="AlertTriangle" size={24} />
              <h3
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                تسجيل تعثر معالجة ACID
              </h3>
            </div>

            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                marginBottom: "1rem",
                lineHeight: 1.5,
              }}
            >
              يرجى ذكر سبب التعثر أو المشكلة التي واجهت العملية حتى يتسنى للفريق متابعتها وحلها.
            </p>

            <form onSubmit={handleMarkFailed}>
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  htmlFor="fail_reason_input"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    marginBottom: "0.375rem",
                  }}
                >
                  سبب التعثر <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  id="fail_reason_input"
                  rows={3}
                  value={failReason}
                  onChange={(e) => setFailReason(e.target.value)}
                  placeholder="اكتب سبب المشكلة بوضوح..."
                  disabled={isSubmittingFail}
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    fontSize: "var(--font-size-sm)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-gray-300)",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setIsFailModalOpen(false)}
                  disabled={isSubmittingFail}
                  className="btn btn--outline"
                  style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFail || !failReason.trim()}
                  className="btn btn--primary"
                  style={{
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    borderColor: "#ef4444",
                    padding: "0.5rem 1rem",
                    fontSize: "var(--font-size-sm)",
                  }}
                >
                  {isSubmittingFail ? "جاري الحفظ..." : "تأكيد التعثر"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit History Timeline (Section 14) */}
      {acidHistory && acidHistory.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DynamicIcon name="Clock" size={16} />
            <h4
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              سجل التدقيق لمراحل ACID (Audit Trail)
            </h4>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {acidHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  padding: "0.625rem 0.875rem",
                  backgroundColor: "var(--color-gray-50)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-xs)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      fontWeight: "var(--font-weight-semibold)",
                      color:
                        item.action === "issued"
                          ? "#047857"
                          : item.action === "failed"
                          ? "#b91c1c"
                          : "var(--color-black)",
                    }}
                  >
                    {ACID_ACTION_LABELS[item.action] || item.action}
                  </span>
                  {item.acid_number && (
                    <span
                      dir="ltr"
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontWeight: "bold",
                        backgroundColor: "rgba(16, 185, 129, 0.12)",
                        padding: "0.1rem 0.375rem",
                        borderRadius: "4px",
                      }}
                    >
                      {item.acid_number}
                    </span>
                  )}
                  {item.notes && (
                    <span style={{ color: "var(--color-gray-600)" }}>
                      ({item.notes})
                    </span>
                  )}
                </div>

                <div style={{ color: "var(--color-gray-500)" }}>
                  <span>بواسطة: {item.performed_by_name || "النظام"}</span>
                  <span style={{ margin: "0 0.375rem" }}>•</span>
                  <span>{formatDateAr(item.performed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
