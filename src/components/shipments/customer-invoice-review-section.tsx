"use client";

/**
 * Customer Preliminary Invoice Review Section (Step 6)
 *
 * Dedicated section for the customer to:
 *  - View review status of their preliminary invoice
 *  - See simple progress timeline
 *  - Preview the uploaded invoice (locked while in review)
 *  - If revision required: view admin's exact note and upload a replacement version
 *  - If approved: see official approval confirmation and locked state
 */

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { customerResubmitInvoiceAction } from "@/lib/shipments/invoice-review-actions";
import type { Shipment, DocumentItem } from "@/types";

interface CustomerInvoiceReviewSectionProps {
  shipment: Shipment;
  preliminaryInvoice: DocumentItem | null;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function CustomerInvoiceReviewSection({
  shipment,
  preliminaryInvoice,
}: CustomerInvoiceReviewSectionProps) {
  const router = useRouter();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  // Replace / Resubmit Modal State
  const [isResubmitModalOpen, setIsResubmitModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // DEF-03: Keep approved preliminary invoice accessible after shipment advances to ACID and later stages.
  const isPostReviewStage = [
    "acid_processing",
    "acid_issued",
    "awaiting_shipment_documents",
    "documents_completed",
    "ready_for_external_stage",
  ].includes(shipment.status);

  // Render this workflow card if the shipment is currently in review lifecycle OR has already passed it
  const isInReviewLifecycle =
    shipment.status === "awaiting_invoice_review" ||
    shipment.status === "invoice_revision_required" ||
    shipment.status === "invoice_approved" ||
    isPostReviewStage;

  if (!isInReviewLifecycle) {
    return null;
  }

  const isRevisionRequired = shipment.status === "invoice_revision_required";
  const isPendingReview = shipment.status === "awaiting_invoice_review";
  const isApproved =
    shipment.status === "invoice_approved" ||
    isPostReviewStage ||
    (!isRevisionRequired && !isPendingReview && preliminaryInvoice?.status === "approved");

  // File Validation
  const handleValidateFile = (file: File): boolean => {
    setErrorMessage(null);
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage("حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت).");
      return false;
    }

    const lower = file.name.toLowerCase();
    const hasValidExt = [".pdf", ".jpg", ".jpeg", ".png", ".webp"].some((ext) =>
      lower.endsWith(ext),
    );

    if (!hasValidExt) {
      setErrorMessage("صيغة الملف غير مدعومة. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP).");
      return false;
    }

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && handleValidateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && handleValidateFile(file)) {
      setSelectedFile(file);
    }
  };

  // Handle Resubmit Submission
  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !preliminaryInvoice) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("document_id", preliminaryInvoice.id);
    formData.append("file", selectedFile);

    try {
      const res = await customerResubmitInvoiceAction(formData);
      if (!res.success) {
        setErrorMessage(res.error || "تعذر إعادة رفع الفاتورة.");
      } else {
        setSuccessMessage(res.message || "تم إعادة رفع الفاتورة بنجاح.");
        setIsResubmitModalOpen(false);
        setSelectedFile(null);
        router.refresh();
      }
    } catch {
      setErrorMessage("حدث خطأ أثناء رفع الفاتورة المحدثة.");
    } finally {
      setIsSubmitting(false);
    }
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
      {/* ─── 1. Shipment Simple Step Timeline ──────────────────────────────── */}
      <div
        style={{
          padding: "1.25rem",
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
          مراحل معالجة الطلب
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          {/* Step 1: Created */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
              }}
            >
              ✓
            </div>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-black)",
              }}
            >
              تم إنشاء طلب التخليص
            </span>
          </div>

          <div
            style={{
              flex: 1,
              height: "2px",
              backgroundColor: "#10b981",
              minWidth: "20px",
            }}
          />

          {/* Step 2: Pricing Approved */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
              }}
            >
              ✓
            </div>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-black)",
              }}
            >
              تمت الموافقة على التسعير
            </span>
          </div>

          <div
            style={{
              flex: 1,
              height: "2px",
              backgroundColor: isApproved ? "#10b981" : "var(--color-gray-300)",
              minWidth: "20px",
            }}
          />

          {/* Step 3: Preliminary Invoice Review */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: isApproved
                  ? "#10b981"
                  : isRevisionRequired
                  ? "#ef4444"
                  : "#f59e0b",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              {isApproved ? "✓" : isRevisionRequired ? "!" : "●"}
            </div>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                color: isApproved
                  ? "#047857"
                  : isRevisionRequired
                  ? "#b91c1c"
                  : "#b45309",
              }}
            >
              {isApproved
                ? "تم اعتماد الفاتورة المبدئية"
                : isRevisionRequired
                ? "مطلوب تعديل الفاتورة"
                : "مراجعة الفاتورة المبدئية"}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              height: "2px",
              backgroundColor: "var(--color-gray-300)",
              minWidth: "20px",
            }}
          />

          {/* Step 4: Next Stage */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "var(--color-gray-200)",
                color: "var(--color-gray-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
              }}
            >
              ●
            </div>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
              }}
            >
              الخطوة التالية (ACID)
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
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
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
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
          <span>{successMessage}</span>
        </div>
      )}

      {/* ─── 2. State-Specific Views ────────────────────────────────────────── */}

      {/* STATE A: Awaiting Invoice Review (Pending) */}
      {isPendingReview && (
        <div
          style={{
            border: "1px solid rgba(245, 158, 11, 0.3)",
            backgroundColor: "rgba(245, 158, 11, 0.04)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
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
              borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
              paddingBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(245, 158, 11, 0.15)",
                  color: "#b45309",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <DynamicIcon name="Clock" size={22} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: "var(--font-size-base)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "var(--color-black)",
                  }}
                >
                  الفاتورة المبدئية — قيد المراجعة
                </h3>
                <p
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-600)",
                    margin: "0.25rem 0 0",
                  }}
                >
                  يقوم فريق العمل بمراجعة الفاتورة المبدئية المرفوعة للتحقق من كافة البنود الجمركية.
                </p>
              </div>
            </div>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "rgba(245, 158, 11, 0.15)",
                color: "#b45309",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              <DynamicIcon name="Clock" size={13} />
              قيد المراجعة
            </span>
          </div>

          {/* Preliminary Invoice File Card */}
          {preliminaryInvoice && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                padding: "1rem",
                backgroundColor: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <DynamicIcon name="FileText" size={24} color="#d97706" />
                <div>
                  <strong
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-black)",
                      display: "block",
                    }}
                  >
                    {preliminaryInvoice.file_name}
                  </strong>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-gray-500)",
                    }}
                  >
                    {formatFileSize(preliminaryInvoice.file_size)} • تاريخ الرفع:{" "}
                    {formatDateAr(preliminaryInvoice.created_at)}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(preliminaryInvoice)}
                  className="btn btn--outline"
                  style={{
                    padding: "0.4rem 0.875rem",
                    fontSize: "var(--font-size-xs)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                  }}
                >
                  <DynamicIcon name="Eye" size={14} />
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
                      padding: "0.4rem 0.75rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      color: "var(--color-gray-700)",
                    }}
                  >
                    <DynamicIcon name="Download" size={14} />
                    <span>تحميل</span>
                  </a>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--font-size-xs)",
              color: "#92400e",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <DynamicIcon name="Info" size={16} />
            <span>
              لا يمكن استبدال أو تعديل الفاتورة أثناء المراجعة. في حال وجود أي ملاحظات سيتم طلب تعديلها من خلال هذا القسم.
            </span>
          </div>
        </div>
      )}

      {/* STATE B: Revision Required */}
      {isRevisionRequired && (
        <div
          style={{
            border: "1px solid rgba(239, 68, 68, 0.35)",
            backgroundColor: "rgba(239, 68, 68, 0.04)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
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
              borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
              paddingBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  color: "#b91c1c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <DynamicIcon name="AlertTriangle" size={22} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: "var(--font-size-base)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "#b91c1c",
                  }}
                >
                  مطلوب تعديل الفاتورة ⚠️
                </h3>
                <p
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-600)",
                    margin: "0.25rem 0 0",
                  }}
                >
                  طلب فريق OUT مراجعة وتعديل الفاتورة المبدئية قبل المتابعة في الإجراءات الجمركية.
                </p>
              </div>
            </div>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                color: "#b91c1c",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              <DynamicIcon name="AlertTriangle" size={13} />
              مطلوب تعديل
            </span>
          </div>

          {/* Admin Review Note Callout */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                color: "#991b1b",
                marginBottom: "0.375rem",
              }}
            >
              ملاحظة فريق OUT:
            </span>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-sm)",
                color: "#7f1d1d",
                lineHeight: "1.6",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              {preliminaryInvoice?.review_note ||
                "برجاء مراجعة بيانات الفاتورة المبدئية وتعديلها وإعادة رفع النسخة المحدثة."}
            </p>
          </div>

          {/* Current File Info + Replace Button */}
          {preliminaryInvoice && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                padding: "1rem",
                backgroundColor: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <DynamicIcon name="FileText" size={24} color="#ef4444" />
                <div>
                  <strong
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-black)",
                      display: "block",
                    }}
                  >
                    {preliminaryInvoice.file_name} (النسخة الحالية)
                  </strong>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-gray-500)",
                    }}
                  >
                    {formatFileSize(preliminaryInvoice.file_size)}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
                  <DynamicIcon name="Eye" size={14} />
                  <span>معاينة الحالية</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setSelectedFile(null);
                    setIsResubmitModalOpen(true);
                  }}
                  className="btn btn--primary"
                  style={{
                    padding: "0.5rem 1.25rem",
                    fontSize: "var(--font-size-sm)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    backgroundColor: "var(--color-yellow)",
                    color: "var(--color-black)",
                    fontWeight: "var(--font-weight-bold)",
                  }}
                >
                  <DynamicIcon name="Upload" size={16} />
                  <span>استبدال الفاتورة</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STATE C: Approved */}
      {isApproved && (
        <div
          style={{
            border: "1px solid rgba(16, 185, 129, 0.35)",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            borderRadius: "var(--radius-md)",
            padding: "1.5rem",
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
              borderBottom: "1px solid rgba(16, 185, 129, 0.2)",
              paddingBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#047857",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <DynamicIcon name="CheckCircle" size={24} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: "var(--font-size-base)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "#047857",
                  }}
                >
                  تم اعتماد الفاتورة المبدئية ✅
                </h3>
                <p
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-600)",
                    margin: "0.25rem 0 0",
                  }}
                >
                  تم التحقق من الفاتورة المبدئية واعتمادها بنجاح من قِبل فريق OUT.
                </p>
              </div>
            </div>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.35rem 0.875rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "#047857",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              <DynamicIcon name="CheckCircle" size={13} />
              معتمدة
            </span>
          </div>

          {/* Preliminary Invoice File Card */}
          {preliminaryInvoice && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                padding: "1rem",
                backgroundColor: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <DynamicIcon name="FileCheck" size={24} color="#059669" />
                <div>
                  <strong
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-black)",
                      display: "block",
                    }}
                  >
                    {preliminaryInvoice.file_name}
                  </strong>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-gray-500)",
                    }}
                  >
                    {formatFileSize(preliminaryInvoice.file_size)}
                    {preliminaryInvoice.approved_at && (
                      <> • تاريخ الاعتماد: {formatDateAr(preliminaryInvoice.approved_at)}</>
                    )}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(preliminaryInvoice)}
                  className="btn btn--outline"
                  style={{
                    padding: "0.4rem 0.875rem",
                    fontSize: "var(--font-size-xs)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                  }}
                >
                  <DynamicIcon name="Eye" size={14} />
                  <span>معاينة الفاتورة المعتمدة</span>
                </button>

                {preliminaryInvoice.file_url && (
                  <a
                    href={preliminaryInvoice.file_url}
                    download={preliminaryInvoice.file_name || "preliminary_invoice"}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--ghost"
                    style={{
                      padding: "0.4rem 0.75rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      color: "var(--color-gray-700)",
                    }}
                  >
                    <DynamicIcon name="Download" size={14} />
                    <span>تحميل</span>
                  </a>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              padding: "0.875rem",
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--font-size-xs)",
              color: "#065f46",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <DynamicIcon name="Check" size={16} />
            <span>
              الفاتورة معتمدة الآن ولا يمكن تعديلها. سيتم استكمال الإجراءات الجمركية التالية قريباً.
            </span>
          </div>
        </div>
      )}

      {/* ─── 3. Resubmit / Replacement Modal ─────────────────────────────────── */}
      {isResubmitModalOpen && (
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
                    backgroundColor: "var(--color-yellow-light)",
                    color: "var(--color-yellow-dark)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DynamicIcon name="RefreshCw" size={18} />
                </div>
                <h3
                  style={{
                    fontSize: "var(--font-size-lg)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "var(--color-black)",
                  }}
                >
                  استبدال الفاتورة المبدئية
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmitting) setIsResubmitModalOpen(false);
                }}
                className="btn btn--ghost"
                style={{ padding: "0.25rem", color: "var(--color-gray-500)" }}
              >
                <DynamicIcon name="X" size={20} />
              </button>
            </div>

            <form onSubmit={handleResubmit}>
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging
                    ? "2px dashed var(--color-yellow-dark)"
                    : "2px dashed var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "2rem 1.5rem",
                  textAlign: "center",
                  backgroundColor: isDragging
                    ? "var(--color-yellow-light)"
                    : selectedFile
                    ? "rgba(16, 185, 129, 0.04)"
                    : "var(--color-gray-50)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.75rem",
                  marginBottom: "1.25rem",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />

                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: selectedFile
                      ? "rgba(16, 185, 129, 0.15)"
                      : "var(--color-yellow-light)",
                    color: selectedFile ? "#047857" : "var(--color-yellow-dark)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DynamicIcon
                    name={selectedFile ? "Check" : "UploadCloud"}
                    size={24}
                  />
                </div>

                <div>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: "var(--font-weight-semibold)",
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-black)",
                    }}
                  >
                    {selectedFile
                      ? selectedFile.name
                      : "اضغط لاختيار النسخة المحدثة من الفاتورة أو اسحب الملف هنا"}
                  </p>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-gray-500)",
                      display: "block",
                      marginTop: "0.25rem",
                    }}
                  >
                    {selectedFile
                      ? formatFileSize(selectedFile.size)
                      : "الصيغ المدعومة: PDF أو صور (JPG, PNG, WebP) بحد أقصى 20 ميجابايت"}
                  </span>
                </div>
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
                  onClick={() => setIsResubmitModalOpen(false)}
                  disabled={isSubmitting}
                  className="btn btn--outline"
                  style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="btn btn--primary"
                  style={{
                    padding: "0.5rem 1.25rem",
                    fontSize: "var(--font-size-sm)",
                    backgroundColor: "var(--color-yellow)",
                    color: "var(--color-black)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    fontWeight: "var(--font-weight-bold)",
                  }}
                >
                  <DynamicIcon name="Upload" size={15} />
                  <span>{isSubmitting ? "جاري الرفع..." : "تأكيد وإرسال للمراجعة"}</span>
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
