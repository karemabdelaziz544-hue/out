"use client";

/**
 * Admin Document Modal Component
 *
 * Dedicated document preview and approval modal for ADMINS.
 * Displays customer relationship details, link to customer profile,
 * and document approval actions.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { approveDocumentAction } from "@/lib/documents/actions";
import type { DocumentItem } from "@/types";

interface AdminDocumentModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export function AdminDocumentModal({
  document,
  isOpen,
  onClose,
  onSuccess,
}: AdminDocumentModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !document) return null;

  const isApproved = document.status === "approved";

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

  const handleApprove = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await approveDocumentAction(document.id);
      if (res.success) {
        onSuccess?.(res.message || "تم اعتماد المستند بنجاح.");
        router.refresh();
      } else {
        setErrorMsg(res.error || "تعذر اعتماد المستند.");
      }
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-doc-title"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "840px",
          width: "95%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              className="modal-icon-badge"
              style={{
                backgroundColor: isApproved
                  ? "var(--color-yellow-light)"
                  : "var(--color-gray-100)",
                color: isApproved ? "var(--color-yellow-dark)" : "var(--color-gray-700)",
              }}
            >
              <DynamicIcon name={isApproved ? "Check" : "FileText"} size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h2 id="admin-doc-title" className="modal-title">
                  {document.title}
                </h2>
                <span
                  className="status-badge"
                  style={{
                    backgroundColor: isApproved
                      ? "var(--color-yellow-light)"
                      : "var(--color-gray-100)",
                    color: isApproved ? "#78350f" : "var(--color-gray-700)",
                    border: `1px solid ${isApproved ? "#fde68a" : "var(--color-gray-300)"}`,
                  }}
                >
                  <span
                    className="status-badge__dot"
                    style={{
                      backgroundColor: isApproved ? "#d97706" : "var(--color-gray-400)",
                    }}
                  />
                  {isApproved ? "معتمد ✓" : "قيد المراجعة"}
                </span>
              </div>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {document.document_type || "مستند عام"} • {formatDateAr(document.created_at)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="customers-search-box__clear"
            title="إغلاق"
            aria-label="إغلاق المعاينة"
            style={{ position: "static" }}
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{
            overflowY: "auto",
            flex: 1,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {errorMsg && (
            <div
              style={{
                padding: "0.625rem 0.875rem",
                backgroundColor: "#fef2f2",
                border: "1px solid #fee2e2",
                borderRadius: "var(--radius-md)",
                color: "#991b1b",
                fontSize: "var(--font-size-xs)",
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Admin Customer Context Card */}
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
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                    العميل المرتبط
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "var(--font-size-sm)" }}>
                    {document.customer_name || "بدون اسم"}
                  </div>
                </div>

                {document.customer_email && (
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                      البريد الإلكتروني
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", direction: "ltr", textAlign: "right" }}>
                      {document.customer_email}
                    </div>
                  </div>
                )}

                {document.customer_phone && (
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                      رقم الموبايل
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", direction: "ltr", textAlign: "right" }}>
                      {document.customer_phone}
                    </div>
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

          {/* Approval Details Banner if Approved */}
          {isApproved && (
            <div
              style={{
                padding: "0.75rem 1rem",
                backgroundColor: "var(--color-yellow-light)",
                border: "1px solid #fde68a",
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "var(--font-size-xs)",
                color: "#78350f",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DynamicIcon name="Check" size={16} />
                <span>
                  <strong>معتمد رسميًا</strong>
                  {document.approver_name && ` بواسطة: ${document.approver_name}`}
                  {document.approved_at && ` في: ${formatDateAr(document.approved_at)}`}
                </span>
              </div>
            </div>
          )}

          {/* Preview Area */}
          <div
            style={{
              backgroundColor: "var(--color-gray-100)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              minHeight: "360px",
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
                  style={{ width: "100%", height: "460px", border: "none" }}
                />
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={document.file_url}
                  alt={document.title}
                  style={{ maxWidth: "100%", maxHeight: "460px", objectFit: "contain" }}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {!isApproved ? (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isPending}
                className="customer-action-btn customer-action-btn--toggle-activate"
                style={{ fontWeight: 600, paddingInline: "1.25rem" }}
              >
                <DynamicIcon name="Check" size={16} />
                <span>{isPending ? "جاري الاعتماد..." : "اعتماد المستند"}</span>
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                <DynamicIcon name="Shield" size={14} />
                <span>مستند معتمد</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
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
