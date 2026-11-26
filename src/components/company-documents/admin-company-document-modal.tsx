"use client";

/**
 * Admin Company Document Modal
 *
 * Dedicated modal for Admin preview and approval of company documents.
 * Shows file preview, company name, customer contact info, status, and approval controls.
 */

import { useState } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { approveCompanyDocumentAction } from "@/lib/company-documents/actions";
import type { AdminCompanyDocumentItem } from "@/types";
import { COMPANY_DOCUMENT_TYPE_LABELS, COMPANY_DOCUMENT_STATUS_LABELS } from "@/types";

interface AdminCompanyDocumentModalProps {
  document: AdminCompanyDocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onApproved: () => void;
}

export function AdminCompanyDocumentModal({
  document,
  isOpen,
  onClose,
  onApproved,
}: AdminCompanyDocumentModalProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !document) return null;

  const isPdf =
    document.mime_type?.includes("pdf") ||
    document.file_name?.toLowerCase().endsWith(".pdf") ||
    document.file_url?.toLowerCase().includes(".pdf");

  const isImage =
    document.mime_type?.startsWith("image/") ||
    Boolean(document.file_name?.match(/\.(jpeg|jpg|png|webp)$/i));

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} بايت`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  };

  const docLabel = COMPANY_DOCUMENT_TYPE_LABELS[document.document_type] || document.document_type;
  const statusLabel = COMPANY_DOCUMENT_STATUS_LABELS[document.status] || document.status;
  const isApproved = document.status === "approved";

  const handleApprove = async () => {
    setIsApproving(true);
    setErrorMessage(null);

    try {
      const res = await approveCompanyDocumentAction(document.id);
      if (res.success) {
        onApproved();
        onClose();
      } else {
        setErrorMessage(res.error || "تعذر اعتماد المستند.");
      }
    } catch {
      setErrorMessage("حدث خطأ غير متوقع أثناء الاعتماد.");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isApproving) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "960px",
          width: "95%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "var(--radius-md)",
                backgroundColor: isApproved ? "#ecfdf5" : "#fef3c7",
                color: isApproved ? "#059669" : "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DynamicIcon name={isApproved ? "ShieldCheck" : "FileText"} size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h2
                  style={{
                    fontSize: "var(--font-size-base)",
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--foreground)",
                  }}
                >
                  {docLabel}
                </h2>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "0.2rem 0.55rem",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: isApproved ? "#ecfdf5" : "#fef3c7",
                    color: isApproved ? "#065f46" : "#92400e",
                    border: `1px solid ${isApproved ? "#a7f3d0" : "#fde68a"}`,
                  }}
                >
                  {statusLabel}
                </span>
              </div>
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--muted-foreground)",
                  marginTop: "0.2rem",
                  margin: 0,
                }}
              >
                الشركة: <strong style={{ color: "var(--foreground)" }}>{document.company_name}</strong> • العميل: {document.customer_name} ({document.customer_email})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isApproving}
            style={{
              background: "transparent",
              border: "none",
              cursor: isApproving ? "not-allowed" : "pointer",
              padding: "0.4rem",
              borderRadius: "var(--radius-md)",
              color: "var(--muted-foreground)",
            }}
          >
            <DynamicIcon name="X" size={20} />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div
            style={{
              padding: "0.75rem 1.25rem",
              backgroundColor: "#fef2f2",
              borderBottom: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "var(--font-size-xs)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <DynamicIcon name="AlertCircle" size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Preview & Details Sidebar Grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            minHeight: "420px",
            maxHeight: "65vh",
            overflow: "hidden",
          }}
        >
          {/* File View Area */}
          <div
            style={{
              backgroundColor: "#f8fafc",
              borderLeft: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "auto",
              padding: "0.5rem",
            }}
          >
            {document.file_url ? (
              <>
                {isPdf ? (
                  <iframe
                    src={`${document.file_url}#toolbar=0`}
                    title={docLabel}
                    style={{
                      width: "100%",
                      height: "100%",
                      minHeight: "440px",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                    }}
                  />
                ) : isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={document.file_url}
                    alt={docLabel}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "58vh",
                      objectFit: "contain",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                    }}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <DynamicIcon name="File" size={48} style={{ color: "var(--muted-foreground)", marginBottom: "0.75rem" }} />
                    <p style={{ fontWeight: 600 }}>{document.file_name}</p>
                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{ marginTop: "0.5rem" }}
                    >
                      تحميل الملف
                    </a>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
                <p>رابط المعاينة غير متاح حالياً.</p>
              </div>
            )}
          </div>

          {/* Details Sidebar */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "var(--background)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>اسم الشركة</span>
                <p style={{ margin: "0.2rem 0 0", fontWeight: 700, fontSize: "var(--font-size-sm)", color: "var(--foreground)" }}>
                  {document.company_name}
                </p>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>العميل المرتبط</span>
                <p style={{ margin: "0.2rem 0 0", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--foreground)" }}>
                  {document.customer_name}
                </p>
                <p style={{ margin: "0.1rem 0 0", fontSize: "11px", color: "var(--muted-foreground)" }}>
                  {document.customer_email}
                </p>
                {document.customer_phone && (
                  <p style={{ margin: "0.1rem 0 0", fontSize: "11px", color: "var(--muted-foreground)", direction: "ltr", textAlign: "right" }}>
                    {document.customer_phone}
                  </p>
                )}
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>نوع المستند</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--foreground)" }}>
                  {docLabel}
                </p>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>اسم الملف وحجمه</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--foreground)", wordBreak: "break-all" }}>
                  {document.file_name}
                </p>
                <p style={{ margin: "0.1rem 0 0", fontSize: "11px", color: "var(--muted-foreground)" }}>
                  {formatFileSize(document.file_size)}
                </p>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>تاريخ الرفع</span>
                <p style={{ margin: "0.2rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--foreground)" }}>
                  {formatDateAr(document.uploaded_at)}
                </p>
              </div>

              {isApproved && document.approved_at && (
                <div>
                  <span style={{ fontSize: "11px", color: "#059669", fontWeight: 600 }}>تاريخ الاعتماد</span>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "var(--font-size-xs)", color: "#065f46", fontWeight: 600 }}>
                    {formatDateAr(document.approved_at)}
                  </p>
                </div>
              )}
            </div>

            {/* Approval Action */}
            <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              {isApproved ? (
                <div
                  style={{
                    backgroundColor: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    borderRadius: "var(--radius-md)",
                    padding: "0.75rem",
                    textAlign: "center",
                    color: "#065f46",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.35rem",
                  }}
                >
                  <DynamicIcon name="ShieldCheck" size={16} />
                  <span>المستند معتمد بالفعل</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="btn btn-primary"
                  style={{
                    width: "100%",
                    fontSize: "var(--font-size-xs)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    backgroundColor: "#059669",
                    borderColor: "#059669",
                  }}
                >
                  {isApproving ? (
                    <>
                      <DynamicIcon name="RefreshCw" size={15} className="animate-spin" />
                      جاري الاعتماد...
                    </>
                  ) : (
                    <>
                      <DynamicIcon name="CheckCircle2" size={15} />
                      اعتماد المستند الآن
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "0.875rem 1.5rem",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {document.file_url ? (
            <a
              href={document.file_url}
              target="_blank"
              rel="noreferrer"
              download={document.file_name}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "var(--font-size-xs)" }}
            >
              <DynamicIcon name="Download" size={14} />
              تحميل الملف
            </a>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            disabled={isApproving}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: "var(--font-size-xs)" }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
