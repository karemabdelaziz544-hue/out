"use client";

/**
 * Company Document Preview Modal
 *
 * Dedicated preview modal for Company Documents.
 * Supports PDF iframe, image rendering, status badge, and metadata.
 * Completely independent from shipment documents.
 */

import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { CompanyDocument } from "@/types";
import { COMPANY_DOCUMENT_TYPE_LABELS, COMPANY_DOCUMENT_STATUS_LABELS } from "@/types";

interface CompanyDocumentPreviewModalProps {
  document: CompanyDocument | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CompanyDocumentPreviewModal({
  document,
  isOpen,
  onClose,
}: CompanyDocumentPreviewModalProps) {
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

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-preview-modal-title"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "840px",
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
            padding: "1rem 1.25rem",
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
              <h2
                id="company-preview-modal-title"
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--foreground)",
                }}
              >
                {docLabel}
              </h2>
              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--muted-foreground)",
                  marginTop: "0.2rem",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <span>{document.file_name}</span>
                <span>•</span>
                <span>{formatFileSize(document.file_size)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.25rem 0.65rem",
                borderRadius: "var(--radius-full)",
                fontSize: "var(--font-size-xs)",
                fontWeight: 600,
                backgroundColor: isApproved ? "#ecfdf5" : "#fef3c7",
                color: isApproved ? "#065f46" : "#92400e",
                border: `1px solid ${isApproved ? "#a7f3d0" : "#fde68a"}`,
              }}
            >
              <DynamicIcon name={isApproved ? "CheckCircle2" : "Clock"} size={13} />
              {statusLabel}
            </span>

            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.4rem",
                borderRadius: "var(--radius-md)",
                color: "var(--muted-foreground)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="إغلاق"
            >
              <DynamicIcon name="X" size={20} />
            </button>
          </div>
        </div>

        {/* Content Preview */}
        <div
          style={{
            flex: 1,
            minHeight: "360px",
            maxHeight: "60vh",
            backgroundColor: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
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
                    maxHeight: "56vh",
                    objectFit: "contain",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                />
              ) : (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <DynamicIcon name="File" size={48} style={{ color: "var(--muted-foreground)", marginBottom: "1rem" }} />
                  <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{document.file_name}</p>
                  <a
                    href={document.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}
                  >
                    <DynamicIcon name="Download" size={16} />
                    تحميل المستند
                  </a>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted-foreground)" }}>
              <DynamicIcon name="AlertCircle" size={40} style={{ marginBottom: "0.5rem" }} />
              <p>رابط المعاينة غير متاح حالياً.</p>
            </div>
          )}
        </div>

        {/* Footer info & actions */}
        <div
          style={{
            padding: "0.875rem 1.25rem",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--background)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "var(--font-size-xs)",
            color: "var(--muted-foreground)",
          }}
        >
          <div>
            <span>تم الرفع: </span>
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
              {formatDateAr(document.uploaded_at)}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {document.file_url && (
              <a
                href={document.file_url}
                target="_blank"
                rel="noreferrer"
                download={document.file_name}
                className="btn btn-secondary btn-sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "var(--font-size-xs)",
                  padding: "0.35rem 0.75rem",
                }}
              >
                <DynamicIcon name="Download" size={14} />
                تحميل الملف
              </a>
            )}
            <button
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: "var(--font-size-xs)",
                padding: "0.35rem 0.75rem",
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
