"use client";

/**
 * Company Documents Section Component
 *
 * Placed inside /company page.
 * Displays summary progress, 4 document cards (commercial_registration, tax_card, import_card, vat),
 * preview modal, upload/replace modal, and delete handling.
 * Completely independent from shipment documents.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { deleteCompanyDocumentAction } from "@/lib/company-documents/actions";
import { CompanyDocumentPreviewModal } from "./company-document-preview-modal";
import { CompanyDocumentUploadModal } from "./company-document-upload-modal";
import type {
  CompanyDocument,
  CompanyDocumentType,
} from "@/types";
import {
  COMPANY_DOCUMENT_TYPES,
  COMPANY_DOCUMENT_TYPE_LABELS,
  COMPANY_DOCUMENT_STATUS_LABELS,
} from "@/types";

interface CompanyDocumentsSectionProps {
  documentsMap: Record<CompanyDocumentType, CompanyDocument | null>;
  completedCount: number;
  totalCount: number;
}

export function CompanyDocumentsSection({
  documentsMap,
  completedCount,
  totalCount = 4,
}: CompanyDocumentsSectionProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Modal states
  const [previewDoc, setPreviewDoc] = useState<CompanyDocument | null>(null);
  const [uploadModalState, setUploadModalState] = useState<{
    isOpen: boolean;
    type: CompanyDocumentType;
    existingDoc?: CompanyDocument | null;
  } | null>(null);

  // Delete state
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<CompanyDocument | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const remainingCount = totalCount - completedCount;
  const isAllComplete = remainingCount === 0;

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteDoc) return;
    setDeletingDocId(confirmDeleteDoc.id);
    setFeedbackMessage(null);

    try {
      const res = await deleteCompanyDocumentAction(confirmDeleteDoc.id);
      if (res.success) {
        setFeedbackMessage({ type: "success", text: res.message || "تم حذف المستند بنجاح." });
        setConfirmDeleteDoc(null);
        handleRefresh();
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "تعذر حذف المستند." });
      }
    } catch {
      setFeedbackMessage({ type: "error", text: "حدث خطأ غير متوقع أثناء الحذف." });
    } finally {
      setDeletingDocId(null);
    }
  };

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* ─── Section Header & Summary ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2
              style={{
                fontSize: "var(--font-size-lg)",
                fontWeight: 700,
                color: "var(--foreground)",
                margin: 0,
              }}
            >
              مستندات الشركة
            </h2>
            <span
              style={{
                backgroundColor: isAllComplete ? "#ecfdf5" : "#fef3c7",
                color: isAllComplete ? "#059669" : "#d97706",
                fontSize: "var(--font-size-xs)",
                fontWeight: 700,
                padding: "0.2rem 0.6rem",
                borderRadius: "var(--radius-full)",
                border: `1px solid ${isAllComplete ? "#a7f3d0" : "#fde68a"}`,
              }}
            >
              {`${completedCount} من ${totalCount} مكتملة`}
            </span>
          </div>
          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--muted-foreground)",
              marginTop: "0.25rem",
              margin: 0,
            }}
          >
            المستندات الأساسية الخاصة بالشركة والمستخدمة في إجراءات التخليص.
          </p>
        </div>

        {/* Completion Indicator Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--font-size-xs)",
            fontWeight: 600,
            color: isAllComplete ? "#047857" : "#b45309",
            backgroundColor: isAllComplete ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
            padding: "0.4rem 0.85rem",
            borderRadius: "var(--radius-lg)",
            border: `1px solid ${isAllComplete ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)"}`,
          }}
        >
          <DynamicIcon
            name={isAllComplete ? "CheckCircle2" : "AlertCircle"}
            size={16}
          />
          <span>
            {isAllComplete
              ? "جميع مستندات الشركة مكتملة"
              : remainingCount === 1
              ? "متبقي مستند واحد لإكمال مستندات الشركة."
              : `متبقي ${remainingCount} مستندات لإكمال مستندات الشركة.`}
          </span>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMessage && (
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: feedbackMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${feedbackMessage.type === "success" ? "#a7f3d0" : "#fecaca"}`,
            color: feedbackMessage.type === "success" ? "#065f46" : "#991b1b",
            fontSize: "var(--font-size-xs)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DynamicIcon
              name={feedbackMessage.type === "success" ? "CheckCircle2" : "AlertCircle"}
              size={16}
            />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              padding: "0.2rem",
            }}
          >
            <DynamicIcon name="X" size={14} />
          </button>
        </div>
      )}

      {/* ─── 4 Documents Cards Grid ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {COMPANY_DOCUMENT_TYPES.map((type) => {
          const doc = documentsMap[type];
          const isUploaded = Boolean(doc);
          const isPendingStatus = doc?.status === "pending";
          const isApproved = doc?.status === "approved";
          const title = COMPANY_DOCUMENT_TYPE_LABELS[type];

          return (
            <div
              key={type}
              style={{
                backgroundColor: "var(--card-bg, #ffffff)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-xl)",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              {/* Card Top: Title, Icon, and Status */}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: isApproved
                          ? "#ecfdf5"
                          : isPendingStatus
                          ? "#fef3c7"
                          : "#f1f5f9",
                        color: isApproved
                          ? "#059669"
                          : isPendingStatus
                          ? "#d97706"
                          : "#64748b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <DynamicIcon
                        name={isApproved ? "ShieldCheck" : isPendingStatus ? "Clock" : "FilePlus"}
                        size={20}
                      />
                    </div>
                    <div>
                      <h3
                        style={{
                          fontSize: "var(--font-size-sm)",
                          fontWeight: 700,
                          color: "var(--foreground)",
                          margin: 0,
                        }}
                      >
                        {title}
                      </h3>
                      <p
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: "var(--muted-foreground)",
                          marginTop: "0.2rem",
                          margin: 0,
                        }}
                      >
                        {isUploaded
                          ? `تم الرفع: ${formatDateAr(doc!.uploaded_at)}`
                          : "مستند إلزامي للتخليص"}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.25rem 0.55rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: isApproved
                        ? "#ecfdf5"
                        : isPendingStatus
                        ? "#fef3c7"
                        : "#f1f5f9",
                      color: isApproved
                        ? "#065f46"
                        : isPendingStatus
                        ? "#92400e"
                        : "#475569",
                      border: `1px solid ${
                        isApproved
                          ? "#a7f3d0"
                          : isPendingStatus
                          ? "#fde68a"
                          : "#e2e8f0"
                      }`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: isApproved
                          ? "#10b981"
                          : isPendingStatus
                          ? "#f59e0b"
                          : "#94a3b8",
                      }}
                    />
                    {isUploaded
                      ? COMPANY_DOCUMENT_STATUS_LABELS[doc!.status]
                      : "لم يتم الرفع بعد"}
                  </span>
                </div>

                {/* File info if uploaded */}
                {isUploaded && (
                  <div
                    style={{
                      backgroundColor: "var(--muted-bg, #f8fafc)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--muted-foreground)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      overflow: "hidden",
                    }}
                  >
                    <DynamicIcon name="FileText" size={14} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        direction: "ltr",
                        textAlign: "right",
                      }}
                    >
                      {doc!.file_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: "0.875rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                {!isUploaded ? (
                  /* Case 1: Not Uploaded -> [رفع المستند] */
                  <button
                    onClick={() =>
                      setUploadModalState({
                        isOpen: true,
                        type,
                        existingDoc: null,
                      })
                    }
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <DynamicIcon name="UploadCloud" size={15} />
                    رفع المستند
                  </button>
                ) : isApproved ? (
                  /* Case 2: Approved -> [عرض المستند] only (Locked) */
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      gap: "0.5rem",
                    }}
                  >
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        flex: 1,
                        fontSize: "var(--font-size-xs)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <DynamicIcon name="Eye" size={14} />
                      عرض المستند
                    </button>
                    <span
                      title="المستند معتمد ولا يمكن تعديله أو حذفه"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "11px",
                        color: "#059669",
                        fontWeight: 600,
                        backgroundColor: "#ecfdf5",
                        padding: "0.3rem 0.6rem",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <DynamicIcon name="Lock" size={12} />
                      معتمد ومقفل
                    </span>
                  </div>
                ) : (
                  /* Case 3: Pending -> [عرض المستند] [استبدال] [حذف] */
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      width: "100%",
                    }}
                  >
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        flex: 1,
                        fontSize: "var(--font-size-xs)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <DynamicIcon name="Eye" size={13} />
                      عرض المستند
                    </button>

                    <button
                      onClick={() =>
                        setUploadModalState({
                          isOpen: true,
                          type,
                          existingDoc: doc,
                        })
                      }
                      className="btn btn-secondary btn-sm"
                      style={{
                        fontSize: "var(--font-size-xs)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <DynamicIcon name="RefreshCw" size={13} />
                      استبدال
                    </button>

                    <button
                      onClick={() => setConfirmDeleteDoc(doc)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "#dc2626",
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "0.35rem 0.6rem",
                      }}
                      title="حذف المستند"
                    >
                      <DynamicIcon name="Trash2" size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}

      {/* 1. Preview Modal */}
      <CompanyDocumentPreviewModal
        document={previewDoc}
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
      />

      {/* 2. Upload / Replace Modal */}
      {uploadModalState && (
        <CompanyDocumentUploadModal
          isOpen={uploadModalState.isOpen}
          documentType={uploadModalState.type}
          existingDocument={uploadModalState.existingDoc}
          onClose={() => setUploadModalState(null)}
          onSuccess={() => {
            handleRefresh();
          }}
        />
      )}

      {/* 3. Confirm Delete Dialog */}
      {confirmDeleteDoc && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingDocId) setConfirmDeleteDoc(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            style={{
              maxWidth: "420px",
              width: "90%",
              padding: "1.5rem",
              borderRadius: "var(--radius-xl)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "#fef2f2",
                color: "#dc2626",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1rem",
              }}
            >
              <DynamicIcon name="AlertTriangle" size={24} />
            </div>

            <h3
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: 700,
                color: "var(--foreground)",
                marginBottom: "0.5rem",
              }}
            >
              تأكيد حذف المستند
            </h3>

            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--muted-foreground)",
                lineHeight: 1.6,
                marginBottom: "1.5rem",
              }}
            >
              هل أنت متأكد من حذف{" "}
              <strong>{COMPANY_DOCUMENT_TYPE_LABELS[confirmDeleteDoc.document_type]}</strong>؟
              سيتم حذف الملف من النظام بشكل نهائي.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                disabled={Boolean(deletingDocId)}
                className="btn btn-secondary"
                style={{ fontSize: "var(--font-size-xs)", flex: 1 }}
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={Boolean(deletingDocId)}
                className="btn btn-primary"
                style={{
                  backgroundColor: "#dc2626",
                  borderColor: "#dc2626",
                  color: "#ffffff",
                  fontSize: "var(--font-size-xs)",
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.35rem",
                }}
              >
                {deletingDocId ? (
                  <>
                    <DynamicIcon name="RefreshCw" size={14} className="animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Trash2" size={14} />
                    تأكيد الحذف
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
