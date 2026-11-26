"use client";

/**
 * Document Preview Modal Component
 *
 * Secure preview modal supporting PDFs, images, and file metadata.
 * Displays customer relationship details with link to customer profile.
 */

import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { DocumentItem } from "@/types";

interface DocumentPreviewModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentPreviewModal({
  document,
  isOpen,
  onClose,
}: DocumentPreviewModalProps) {
  if (!isOpen || !document) return null;

  const isPdf =
    document.file_type?.includes("pdf") ||
    document.file_url?.toLowerCase().endsWith(".pdf");

  const isImage =
    document.file_type?.startsWith("image/") ||
    Boolean(document.file_url?.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i));

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div
        className="modal-card"
        style={{ maxWidth: "800px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="modal-header" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="modal-icon-badge">
              <DynamicIcon name="FileText" size={20} />
            </div>
            <div>
              <h2 id="preview-modal-title" className="modal-title">
                {document.title}
              </h2>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                {document.document_type || "مستند عام"} • {formatDateAr(document.created_at)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="customers-search-box__clear"
            title="إغلاق"
            aria-label="إغلاق المعاينة"
            style={{ position: "static" }}
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ overflowY: "auto", flex: 1, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Customer Relationship Info */}
          {document.customer_id && (
            <div
              style={{
                padding: "0.875rem 1rem",
                backgroundColor: "var(--color-gray-50)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                  العميل المرتبط بالمستند
                </div>
                <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "var(--font-size-sm)" }}>
                  {document.customer_name || document.customer_email || "عميل غير مسمى"}
                </div>
                {document.customer_email && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", direction: "ltr", textAlign: "right" }}>
                    {document.customer_email}
                  </div>
                )}
              </div>

              <Link
                href={`/customers/${document.customer_id}`}
                className="customer-action-btn"
                style={{ padding: "0.375rem 0.875rem", fontSize: "var(--font-size-xs)" }}
              >
                <span>عرض العميل</span>
                <DynamicIcon name="ArrowLeft" size={14} />
              </Link>
            </div>
          )}

          {/* Preview Viewport */}
          <div
            style={{
              backgroundColor: "var(--color-gray-100)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              minHeight: "340px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {document.file_url ? (
              isPdf ? (
                <iframe
                  src={document.file_url}
                  title={document.title}
                  style={{ width: "100%", height: "450px", border: "none" }}
                />
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={document.file_url}
                  alt={document.title}
                  style={{ maxWidth: "100%", maxHeight: "450px", objectFit: "contain" }}
                />
              ) : (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <DynamicIcon name="File" size={48} />
                  <p style={{ marginTop: "1rem", fontWeight: 600 }}>{document.title}</p>
                  <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                    حجم الملف: {formatFileSize(document.file_size)}
                  </p>
                </div>
              )
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
                <DynamicIcon name="FileText" size={40} />
                <p style={{ marginTop: "0.75rem", fontSize: "var(--font-size-sm)" }}>
                  معاينة الملف غير متاحة حالياً
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: "space-between" }}>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
            حجم الملف: {formatFileSize(document.file_size)}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              className="customer-action-btn"
            >
              إغلاق
            </button>
            {document.file_url && (
              <a
                href={document.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="customer-action-btn customer-action-btn--toggle-activate"
                style={{ fontWeight: 600 }}
              >
                <DynamicIcon name="Download" size={14} />
                <span>تنزيل المستند</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
