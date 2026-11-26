"use client";

/**
 * Admin Preliminary Invoice Review Section (Step 6)
 *
 * Dedicated review card for staff to inspect the customer's preliminary invoice,
 * approve it, or request revision with a mandatory note.
 *
 * Adheres strictly to OUT design guidelines (RTL, yellow/dark palette, micro-animations).
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr, formatCurrency } from "@/lib/utils";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import {
  adminApproveInvoiceAction,
  adminRequestInvoiceRevisionAction,
} from "@/lib/shipments/invoice-review-actions";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentInvoiceReview,
} from "@/types";

interface AdminInvoiceReviewSectionProps {
  shipment: Shipment;
  preliminaryInvoice: DocumentItem | null;
  pricing?: ShipmentPricing | null;
  invoiceReviews?: ShipmentInvoiceReview[];
}

export function AdminInvoiceReviewSection({
  shipment,
  preliminaryInvoice,
  pricing = null,
  invoiceReviews = [],
}: AdminInvoiceReviewSectionProps) {
  const router = useRouter();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  // Revision Modal State
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Format bytes
  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isReviewStage =
    shipment.status === "awaiting_invoice_review" ||
    shipment.status === "invoice_revision_required" ||
    shipment.status === "invoice_approved";

  // Check if invoice has resubmitted history
  const hasResubmittedVersion = invoiceReviews.some(
    (rev) => rev.action === "resubmitted",
  );

  // Handle Approve
  const handleApprove = async () => {
    if (!preliminaryInvoice) return;

    if (!confirm("هل أنت متأكد من اعتماد الفاتورة المبدئية لهذه الشحنة؟")) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("document_id", preliminaryInvoice.id);

    try {
      const res = await adminApproveInvoiceAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر اعتماد الفاتورة.");
      } else {
        setActionSuccess(res.message || "تم اعتماد الفاتورة المبدئية بنجاح.");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء معالجة الطلب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revision Submission
  const handleRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preliminaryInvoice) return;

    const trimmed = revisionNote.trim();
    if (!trimmed) {
      setActionError("يرجى كتابة سبب طلب التعديل للعميل بالتفصيل.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("document_id", preliminaryInvoice.id);
    formData.append("note", trimmed);

    try {
      const res = await adminRequestInvoiceRevisionAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر إرسال طلب التعديل.");
      } else {
        setActionSuccess(res.message || "تم إرسال طلب التعديل بنجاح.");
        setIsRevisionModalOpen(false);
        setRevisionNote("");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء إرسال طلب التعديل.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pricing display
  const agreedPrice =
    pricing?.final_price !== null && pricing?.final_price !== undefined
      ? pricing.final_price
      : pricing?.estimated_min_price;

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
              backgroundColor:
                shipment.status === "invoice_approved"
                  ? "rgba(16, 185, 129, 0.15)"
                  : shipment.status === "invoice_revision_required"
                  ? "rgba(239, 68, 68, 0.12)"
                  : "var(--color-yellow-light)",
              color:
                shipment.status === "invoice_approved"
                  ? "#047857"
                  : shipment.status === "invoice_revision_required"
                  ? "#b91c1c"
                  : "var(--color-yellow-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon
              name={
                shipment.status === "invoice_approved"
                  ? "CheckCircle"
                  : shipment.status === "invoice_revision_required"
                  ? "AlertTriangle"
                  : "FileText"
              }
              size={22}
            />
          </div>
          <div>
            <h2
              style={{
                fontSize: "var(--font-size-xl)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              مراجعة الفاتورة المبدئية (Preliminary Invoice Review)
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
              }}
            >
              مراجعة الفاتورة المرفوعة والتحقق من مطابقتها للتسعير والبيانات الجمركية
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div>
          {shipment.status === "invoice_approved" ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.875rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                color: "#047857",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              <DynamicIcon name="CheckCircle" size={14} />
              تم اعتماد الفاتورة ✅
            </span>
          ) : shipment.status === "invoice_revision_required" ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.875rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                color: "#b91c1c",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              <DynamicIcon name="AlertTriangle" size={14} />
              مطلوب تعديل من العميل ⚠️
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.875rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "rgba(245, 158, 11, 0.12)",
                color: "#b45309",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              <DynamicIcon name="Clock" size={14} />
              {hasResubmittedVersion
                ? "نسخة جديدة — قيد المراجعة"
                : "قيد المراجعة"}
            </span>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div
          style={{
            padding: "0.75rem 1rem",
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
          <DynamicIcon name="AlertCircle" size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            padding: "0.75rem 1rem",
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

      {/* Summary Row: Associated Shipment Data & Agreed Pricing */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          backgroundColor: "var(--color-gray-50)",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-gray-200)",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-gray-500)",
              display: "block",
            }}
          >
            رقم الشحنة المرجعي
          </span>
          <strong
            dir="ltr"
            style={{
              fontSize: "var(--font-size-sm)",
              fontFamily: "var(--font-family-mono)",
              color: "var(--color-black)",
            }}
          >
            {shipment.reference_number}
          </strong>
        </div>

        <div>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-gray-500)",
              display: "block",
            }}
          >
            وصف البضاعة
          </span>
          <span
            style={{
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-black)",
            }}
          >
            {shipment.goods_description || "—"}
          </span>
        </div>

        <div>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-gray-500)",
              display: "block",
            }}
          >
            السعر المتفق عليه
          </span>
          <strong
            style={{
              fontSize: "var(--font-size-sm)",
              color: "#047857",
            }}
          >
            {agreedPrice !== undefined && agreedPrice !== null
              ? `${formatCurrency(agreedPrice)} ${pricing?.currency || "EGP"}`
              : "غير محدد"}
          </strong>
        </div>

        <div>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--color-gray-500)",
              display: "block",
            }}
          >
            ميناء الوصول / المنشأ
          </span>
          <span
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-gray-700)",
            }}
          >
            {shipment.port_of_arrival || "—"} / {shipment.country_of_origin || "—"}
          </span>
        </div>
      </div>

      {/* Preliminary Invoice Card */}
      {!preliminaryInvoice ? (
        <div
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            backgroundColor: "var(--color-gray-50)",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--color-border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <DynamicIcon name="FileWarning" size={32} />
          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-gray-600)",
              margin: 0,
            }}
          >
            لم يقم العميل برفع الفاتورة المبدئية لهذه الشحنة حتى الآن.
          </p>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "1.25rem",
            backgroundColor: "var(--color-surface)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* File Metadata & Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-yellow-light)",
                  color: "var(--color-yellow-dark)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <DynamicIcon name="FileText" size={24} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h3
                    style={{
                      fontSize: "var(--font-size-base)",
                      fontWeight: "var(--font-weight-bold)",
                      margin: 0,
                      color: "var(--color-black)",
                    }}
                  >
                    {preliminaryInvoice.file_name || "الفاتورة المبدئية"}
                  </h3>
                  {hasResubmittedVersion && preliminaryInvoice.status === "pending" && (
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "rgba(59, 130, 246, 0.12)",
                        color: "#1d4ed8",
                        fontWeight: "var(--font-weight-bold)",
                      }}
                    >
                      نسخة محدثة
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginTop: "0.25rem",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-500)",
                    flexWrap: "wrap",
                  }}
                >
                  <span>النوع: {preliminaryInvoice.file_type || "PDF / صورة"}</span>
                  <span>•</span>
                  <span>الحجم: {formatFileSize(preliminaryInvoice.file_size)}</span>
                  <span>•</span>
                  <span>
                    تاريخ الرفع: {formatDateAr(preliminaryInvoice.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Preview & Download */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setPreviewDoc(preliminaryInvoice)}
                className="btn btn--outline"
                style={{
                  padding: "0.45rem 0.875rem",
                  fontSize: "var(--font-size-xs)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                <DynamicIcon name="Eye" size={15} />
                <span>معاينة الفاتورة</span>
              </button>

              {preliminaryInvoice.file_url && (
                <a
                  href={preliminaryInvoice.file_url}
                  download={preliminaryInvoice.file_name || "preliminary_invoice"}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--ghost"
                  style={{
                    padding: "0.45rem 0.75rem",
                    fontSize: "var(--font-size-xs)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    color: "var(--color-gray-700)",
                  }}
                  title="تحميل الملف"
                >
                  <DynamicIcon name="Download" size={15} />
                  <span>تحميل</span>
                </a>
              )}
            </div>
          </div>

          {/* Revision Note Banner if Revision Required */}
          {preliminaryInvoice.status === "revision_required" && (
            <div
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.05)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.375rem",
                  color: "#b91c1c",
                  fontWeight: "var(--font-weight-bold)",
                  fontSize: "var(--font-size-xs)",
                }}
              >
                <DynamicIcon name="AlertTriangle" size={16} />
                <span>ملاحظة طلب التعديل المرسلة للعميل:</span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-gray-800)",
                  lineHeight: "1.6",
                }}
              >
                {preliminaryInvoice.review_note || "يرجى تعديل الفاتورة وإعادة رفعها."}
              </p>
              {preliminaryInvoice.reviewed_at && (
                <span
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-500)",
                  }}
                >
                  تاريخ طلب التعديل: {formatDateAr(preliminaryInvoice.reviewed_at)}
                </span>
              )}
            </div>
          )}

          {/* Approved Info Banner */}
          {preliminaryInvoice.status === "approved" && (
            <div
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.06)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DynamicIcon name="CheckCircle" size={18} color="#047857" />
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    color: "#047857",
                    fontWeight: "var(--font-weight-semibold)",
                  }}
                >
                  تم اعتماد هذه الفاتورة رسمياً من قبل الإدارة.
                </span>
              </div>
              {preliminaryInvoice.approved_at && (
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-600)",
                  }}
                >
                  تاريخ الاعتماد: {formatDateAr(preliminaryInvoice.approved_at)}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons for Admin (Approve / Request Revision) */}
          {isReviewStage && preliminaryInvoice.status !== "approved" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setIsRevisionModalOpen(true);
                }}
                disabled={isSubmitting}
                className="btn btn--outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.5rem 1.125rem",
                  fontSize: "var(--font-size-sm)",
                  color: "#b45309",
                  borderColor: "rgba(245, 158, 11, 0.4)",
                  backgroundColor: "rgba(245, 158, 11, 0.05)",
                }}
              >
                <DynamicIcon name="Edit" size={15} />
                <span>
                  {preliminaryInvoice.status === "revision_required"
                    ? "تحديث طلب التعديل"
                    : "طلب تعديل الفاتورة"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleApprove}
                disabled={isSubmitting}
                className="btn btn--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.5rem 1.25rem",
                  fontSize: "var(--font-size-sm)",
                  backgroundColor: "#059669",
                  color: "#ffffff",
                  borderColor: "#059669",
                }}
              >
                <DynamicIcon name="CheckCircle" size={16} />
                <span>{isSubmitting ? "جاري الاعتماد..." : "اعتماد الفاتورة"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Review History Audit Trail */}
      {invoiceReviews.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <DynamicIcon name="Clock" size={16} />
            <h4
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              سجل مراجعات الفاتورة (Review History)
            </h4>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
              backgroundColor: "var(--color-gray-50)",
              borderRadius: "var(--radius-md)",
              padding: "1rem",
              border: "1px solid var(--color-border)",
            }}
          >
            {invoiceReviews.map((item) => {
              const isApprove = item.action === "approved";
              const isRevision = item.action === "revision_requested";

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    backgroundColor: "var(--color-surface)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-200)",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: isApprove
                        ? "rgba(16, 185, 129, 0.15)"
                        : isRevision
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(59, 130, 246, 0.15)",
                      color: isApprove
                        ? "#047857"
                        : isRevision
                        ? "#b91c1c"
                        : "#1d4ed8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  >
                    <DynamicIcon
                      name={
                        isApprove
                          ? "Check"
                          : isRevision
                          ? "AlertTriangle"
                          : "Upload"
                      }
                      size={14}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <strong
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: isApprove
                            ? "#047857"
                            : isRevision
                            ? "#b91c1c"
                            : "#1d4ed8",
                        }}
                      >
                        {isApprove
                          ? "اعتماد الفاتورة المبدئية"
                          : isRevision
                          ? "طلب تعديل الفاتورة من العميل"
                          : "إعادة رفع نسخة محدثة من العميل"}
                      </strong>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-gray-500)",
                        }}
                      >
                        {formatDateAr(item.performed_at)}
                      </span>
                    </div>

                    {item.note && (
                      <p
                        style={{
                          margin: "0.375rem 0 0 0",
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-gray-700)",
                          backgroundColor: "var(--color-gray-50)",
                          padding: "0.5rem",
                          borderRadius: "var(--radius-sm)",
                          borderLeft: "2px solid #ef4444",
                        }}
                      >
                        {item.note}
                      </p>
                    )}

                    {item.performed_by_name && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-gray-500)",
                          display: "block",
                          marginTop: "0.25rem",
                        }}
                      >
                        بواسطة: {item.performed_by_name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revision Request Modal */}
      {isRevisionModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "520px",
              padding: "1.75rem",
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.25rem",
                borderBottom: "1px solid var(--color-border)",
                paddingBottom: "0.875rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    color: "#b45309",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DynamicIcon name="AlertTriangle" size={20} />
                </div>
                <h3
                  style={{
                    fontSize: "var(--font-size-lg)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "var(--color-black)",
                  }}
                >
                  سبب طلب التعديل
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmitting) setIsRevisionModalOpen(false);
                }}
                className="btn btn--ghost"
                style={{ padding: "0.25rem", color: "var(--color-gray-500)" }}
              >
                <DynamicIcon name="X" size={20} />
              </button>
            </div>

            <form onSubmit={handleRevisionSubmit}>
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  htmlFor="revision-note-textarea"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-black)",
                    marginBottom: "0.5rem",
                  }}
                >
                  الملاحظات والتعديلات المطلوبة من العميل *
                </label>
                <textarea
                  id="revision-note-textarea"
                  rows={4}
                  required
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="اكتب للعميل المطلوب تعديله في الفاتورة..."
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    fontFamily: "inherit",
                    fontSize: "var(--font-size-sm)",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span
                  style={{
                    display: "block",
                    marginTop: "0.375rem",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-500)",
                  }}
                >
                  مثال: برجاء تعديل وصف الأصناف في الفاتورة وإعادة رفع النسخة المحدثة.
                </span>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsRevisionModalOpen(false)}
                  disabled={isSubmitting}
                  className="btn btn--outline"
                  style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !revisionNote.trim()}
                  className="btn btn--primary"
                  style={{
                    padding: "0.5rem 1.25rem",
                    fontSize: "var(--font-size-sm)",
                    backgroundColor: "#d97706",
                    borderColor: "#d97706",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                  }}
                >
                  <DynamicIcon name="Send" size={15} />
                  <span>{isSubmitting ? "جاري الإرسال..." : "إرسال طلب التعديل"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
