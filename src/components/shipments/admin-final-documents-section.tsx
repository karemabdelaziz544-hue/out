"use client";

/**
 * Admin Final Shipment Documents Section (Step 8)
 *
 * Dedicated back-office review card for staff to inspect and review the 4 final shipment documents:
 *  1. Commercial Invoice — الفاتورة التجارية
 *  2. Packing List — قائمة التعبئة
 *  3. Bill of Lading — بوليصة الشحن
 *  4. Certificate of Origin — شهادة المنشأ
 *
 * Actions:
 *  - Preview document (PDF & Images)
 *  - Approve document
 *  - Request revision with mandatory note via modal
 *  - Overview metrics (مطلوبة، مرفوعة، معتمدة، قيد المراجعة، يحتاج تعديل)
 *  - Full audit trail review history timeline
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import {
  adminApproveShipmentDocumentAction,
  adminRequestShipmentDocumentRevisionAction,
} from "@/lib/shipments/document-actions";
import {
  FINAL_SHIPMENT_DOCUMENT_TYPES,
  FINAL_DOCUMENT_TYPE_LABELS,
  matchFinalDocumentType,
  SHIPMENT_DOCUMENT_ACTION_LABELS,
  type FinalShipmentDocumentType,
  type DocumentItem,
  type Shipment,
  type ShipmentDocumentReviewItem,
} from "@/types";

interface AdminFinalDocumentsSectionProps {
  shipment: Shipment;
  documents: DocumentItem[];
  documentReviews?: ShipmentDocumentReviewItem[];
}

export function AdminFinalDocumentsSection({
  shipment,
  documents,
  documentReviews = [],
}: AdminFinalDocumentsSectionProps) {
  const router = useRouter();

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  // Revision Modal State
  const [revisionDoc, setRevisionDoc] = useState<DocumentItem | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  // Approve Loading State
  const [approvingDocId, setApprovingDocId] = useState<string | null>(null);

  // Feedback State
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Map documents by normalized type
  const docMap = new Map<FinalShipmentDocumentType, DocumentItem>();
  for (const doc of documents) {
    const matched = matchFinalDocumentType(doc.document_type);
    if (matched) {
      docMap.set(matched, doc);
    }
  }

  // Calculate metrics
  let approvedCount = 0;
  let pendingCount = 0;
  let revisionCount = 0;

  for (const type of FINAL_SHIPMENT_DOCUMENT_TYPES) {
    const doc = docMap.get(type);
    if (doc) {
      if (doc.status === "approved") approvedCount++;
      else if (doc.status === "revision_required") revisionCount++;
      else pendingCount++;
    }
  }

  const uploadedCount = docMap.size;
  const isAllApproved = approvedCount >= 4;

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle Approve
  const handleApprove = async (doc: DocumentItem) => {
    if (!confirm(`هل أنت متأكد من اعتماد ${doc.title}؟`)) {
      return;
    }

    setApprovingDocId(doc.id);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("document_id", doc.id);

    try {
      const res = await adminApproveShipmentDocumentAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر اعتماد المستند.");
      } else {
        setActionSuccess(res.message || "تم اعتماد المستند بنجاح.");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء اعتماد المستند.");
    } finally {
      setApprovingDocId(null);
    }
  };

  // Open Revision Modal
  const openRevisionModal = (doc: DocumentItem) => {
    setRevisionDoc(doc);
    setRevisionNote(doc.review_note || "");
    setActionError(null);
    setActionSuccess(null);
  };

  // Handle Revision Submission
  const handleRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionDoc) return;

    const cleanNote = revisionNote.trim();
    if (!cleanNote) {
      setActionError("يرجى كتابة سبب طلب التعديل بوضوح.");
      return;
    }

    setIsSubmittingRevision(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("document_id", revisionDoc.id);
    formData.append("note", cleanNote);

    try {
      const res = await adminRequestShipmentDocumentRevisionAction(formData);
      if (!res.success) {
        setActionError(res.error || "تعذر إرسال طلب التعديل.");
      } else {
        setActionSuccess(res.message || "تم إرسال طلب التعديل بنجاح.");
        setRevisionDoc(null);
        setRevisionNote("");
        router.refresh();
      }
    } catch {
      setActionError("حدث خطأ غير متوقع أثناء معالجة طلب التعديل.");
    } finally {
      setIsSubmittingRevision(false);
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
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-md)",
              backgroundColor: isAllApproved
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(245, 158, 11, 0.12)",
              color: isAllApproved ? "#047857" : "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon
              name={isAllApproved ? "CheckCircle" : "FileCheck"}
              size={24}
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
                مراجعة مستندات الشحنة النهائية
              </h2>
              {isAllApproved && (
                <span
                  style={{
                    padding: "0.2rem 0.625rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-medium)",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "#065f46",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                  }}
                >
                  اكتملت جميع المستندات ✅
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
              فحص واعتماد مستندات الشحنة الأربعة الأساسية لإنهاء إجراءات التخليص
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: isAllApproved
              ? "rgba(16, 185, 129, 0.1)"
              : "var(--color-gray-50)",
            border: "1px solid var(--color-border)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <strong>{approvedCount}</strong> / <strong>4</strong> معتمدة
        </div>
      </div>

      {/* Overview Metrics Badges (Section 19) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-gray-50)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
            مستندات مطلوبة
          </span>
          <strong style={{ fontSize: "var(--font-size-lg)", color: "var(--color-black)" }}>
            4
          </strong>
        </div>

        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--color-gray-50)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
            تم الرفع
          </span>
          <strong style={{ fontSize: "var(--font-size-lg)", color: "var(--color-black)" }}>
            {uploadedCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", color: "#047857", display: "block" }}>
            معتمدة
          </span>
          <strong style={{ fontSize: "var(--font-size-lg)", color: "#065f46" }}>
            {approvedCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "rgba(99, 102, 241, 0.05)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", color: "#4338ca", display: "block" }}>
            قيد المراجعة
          </span>
          <strong style={{ fontSize: "var(--font-size-lg)", color: "#3730a3" }}>
            {pendingCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", color: "#b91c1c", display: "block" }}>
            مطلوب تعديل
          </span>
          <strong style={{ fontSize: "var(--font-size-lg)", color: "#991b1b" }}>
            {revisionCount}
          </strong>
        </div>
      </div>

      {/* Messages */}
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
          <DynamicIcon name="AlertTriangle" size={18} />
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

      {/* Documents Review Grid / Cards (Section 10) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {FINAL_SHIPMENT_DOCUMENT_TYPES.map((type) => {
          const label = FINAL_DOCUMENT_TYPE_LABELS[type];
          const doc = docMap.get(type);

          const isDocApproved = doc?.status === "approved";
          const isDocRevisionRequired = doc?.status === "revision_required";
          const isDocPending = doc?.status === "pending";
          const isMissing = !doc;

          return (
            <div
              key={type}
              style={{
                padding: "1.25rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: isDocApproved
                  ? "rgba(16, 185, 129, 0.03)"
                  : isDocRevisionRequired
                  ? "rgba(239, 68, 68, 0.03)"
                  : "#ffffff",
                border: isDocApproved
                  ? "1px solid rgba(16, 185, 129, 0.35)"
                  : isDocRevisionRequired
                  ? "1px solid rgba(239, 68, 68, 0.35)"
                  : "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "var(--font-size-base)",
                      fontWeight: "var(--font-weight-bold)",
                      color: "var(--color-black)",
                      margin: 0,
                    }}
                  >
                    {label}
                  </h3>

                  {isMissing && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        backgroundColor: "var(--color-gray-100)",
                        color: "var(--color-gray-600)",
                        border: "1px solid var(--color-gray-300)",
                      }}
                    >
                      لم يتم الرفع
                    </span>
                  )}

                  {isDocPending && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                        color: "#4338ca",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                      }}
                    >
                      قيد المراجعة
                    </span>
                  )}

                  {isDocApproved && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "rgba(16, 185, 129, 0.15)",
                        color: "#065f46",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      معتمد ✅
                    </span>
                  )}

                  {isDocRevisionRequired && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "#b91c1c",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                      }}
                    >
                      مطلوب تعديل ⚠️
                    </span>
                  )}
                </div>

                {/* File Details */}
                {doc ? (
                  <div
                    style={{
                      padding: "0.625rem 0.75rem",
                      backgroundColor: "var(--color-gray-50)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-gray-200)",
                      fontSize: "var(--font-size-xs)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <DynamicIcon name="File" size={14} className="text-gray-500" />
                      <strong
                        style={{
                          color: "var(--color-black)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {doc.file_name}
                      </strong>
                    </div>

                    <div style={{ color: "var(--color-gray-500)", fontSize: "11px" }}>
                      <span>{formatFileSize(doc.file_size)}</span> •{" "}
                      <span>تاريخ الرفع: {formatDateAr(doc.created_at)}</span>
                    </div>

                    {isDocApproved && doc.approved_at && (
                      <div style={{ color: "#065f46", fontSize: "11px", marginTop: "0.25rem" }}>
                        <span>تم الاعتماد في: {formatDateAr(doc.approved_at)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-gray-400)",
                      margin: "0.5rem 0",
                    }}
                  >
                    بانتظار قيام العميل برفع هذا المستند.
                  </p>
                )}

                {/* Revision Note Box if requested */}
                {isDocRevisionRequired && doc?.review_note && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.625rem 0.75rem",
                      backgroundColor: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--font-size-xs)",
                      color: "#b91c1c",
                    }}
                  >
                    <strong>ملاحظة التعديل المرسلة للعميل:</strong>
                    <p style={{ margin: "0.25rem 0 0 0", lineHeight: 1.4 }}>{doc.review_note}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.5rem",
                  paddingTop: "0.75rem",
                  borderTop: "1px solid var(--color-gray-200)",
                }}
              >
                {/* Preview Button */}
                {doc && (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="btn btn--outline"
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <DynamicIcon name="Eye" size={14} />
                    <span>معاينة</span>
                  </button>
                )}

                {/* Approve Button */}
                {doc && !isDocApproved && (
                  <button
                    type="button"
                    onClick={() => handleApprove(doc)}
                    disabled={approvingDocId === doc.id}
                    className="btn btn--primary"
                    style={{
                      padding: "0.375rem 0.875rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    {approvingDocId === doc.id ? (
                      <>
                        <DynamicIcon name="Loader" size={14} />
                        <span>جاري الاعتماد...</span>
                      </>
                    ) : (
                      <>
                        <DynamicIcon name="CheckCircle" size={14} />
                        <span>اعتماد</span>
                      </>
                    )}
                  </button>
                )}

                {/* Request Revision Button */}
                {doc && !isDocApproved && (
                  <button
                    type="button"
                    onClick={() => openRevisionModal(doc)}
                    className="btn btn--ghost"
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "var(--font-size-xs)",
                      color: "#b91c1c",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <DynamicIcon name="AlertTriangle" size={14} />
                    <span>طلب تعديل</span>
                  </button>
                )}

                {/* Locked indicator if approved */}
                {isDocApproved && (
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "#065f46",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <DynamicIcon name="Lock" size={12} />
                    <span>معتمد ومقفل</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Revision Modal (Section 12) */}
      {revisionDoc && (
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
              maxWidth: "500px",
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
                gap: "0.5rem",
                color: "#b91c1c",
                marginBottom: "0.75rem",
              }}
            >
              <DynamicIcon name="AlertTriangle" size={22} />
              <h3
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                طلب تعديل {revisionDoc.title}
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
              يرجى كتابة سبب طلب التعديل بوضوح. ستظهر هذه الملاحظة للعميل حتى يقوم بتصحيح المستند وإعادة رفعه.
            </p>

            <form onSubmit={handleRevisionSubmit}>
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  htmlFor="revision_note_textarea"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    marginBottom: "0.375rem",
                  }}
                >
                  سبب طلب التعديل <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  id="revision_note_textarea"
                  rows={4}
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="مثال: المستند غير واضح، أو ينقصه الختم الرسمي وتاريخ الصدور..."
                  disabled={isSubmittingRevision}
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
                  onClick={() => setRevisionDoc(null)}
                  disabled={isSubmittingRevision}
                  className="btn btn--outline"
                  style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRevision || !revisionNote.trim()}
                  className="btn btn--primary"
                  style={{
                    backgroundColor: "#b91c1c",
                    borderColor: "#b91c1c",
                    color: "#ffffff",
                    padding: "0.5rem 1.25rem",
                    fontSize: "var(--font-size-sm)",
                  }}
                >
                  {isSubmittingRevision ? "جاري الإرسال..." : "إرسال طلب التعديل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review History Audit Trail (Section 13) */}
      {documentReviews && documentReviews.length > 0 && (
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
              سجل تدقيق مستندات الشحنة (Document Audit Trail)
            </h4>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {documentReviews.map((item) => (
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
                        item.action === "approved"
                          ? "#047857"
                          : item.action === "revision_requested"
                          ? "#b91c1c"
                          : "var(--color-black)",
                    }}
                  >
                    {SHIPMENT_DOCUMENT_ACTION_LABELS[item.action] || item.action}
                  </span>
                  <span style={{ color: "var(--color-gray-600)" }}>
                    ({FINAL_DOCUMENT_TYPE_LABELS[item.document_type as FinalShipmentDocumentType] || item.document_type})
                  </span>
                  {item.note && (
                    <span style={{ color: "var(--color-gray-700)", fontStyle: "italic" }}>
                      — &ldquo;{item.note}&rdquo;
                    </span>
                  )}
                </div>

                <div style={{ color: "var(--color-gray-500)" }}>
                  <span>بواسطة: {item.performed_by_name || "المستخدم"}</span>
                  <span style={{ margin: "0 0.375rem" }}>•</span>
                  <span>{formatDateAr(item.performed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
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
