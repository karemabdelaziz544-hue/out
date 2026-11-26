"use client";

/**
 * Customer Documents Section Component
 *
 * Displays a customer's documents within the /customers/[id] profile view.
 * Uses the exact same database records with preview and download capabilities.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { AdminDocumentModal } from "./admin-document-modal";
import type { DocumentItem } from "@/types";

interface CustomerDocumentsSectionProps {
  documents: DocumentItem[];
}

export function CustomerDocumentsSection({
  documents,
}: CustomerDocumentsSectionProps) {
  const router = useRouter();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-xl)",
        padding: "var(--space-6)",
        boxShadow: "var(--shadow-xs)",
        marginTop: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <DynamicIcon name="FileText" size={20} />
          <h2
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            المستندات ({documents.length})
          </h2>
        </div>
      </div>

      {documents.length === 0 ? (
        <div
          style={{
            padding: "2rem 1rem",
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <DynamicIcon name="FileText" size={32} />
          <p style={{ marginTop: "0.5rem" }}>
            لا توجد مستندات مرفوعة لهذا العميل حتى الآن.
          </p>
        </div>
      ) : (
        <div className="customers-table-wrapper">
          <table className="customers-table" aria-label="مستندات العميل">
            <thead>
              <tr>
                <th scope="col" style={{ width: "30%" }}>
                  المستند
                </th>
                <th scope="col" style={{ width: "16%" }}>
                  النوع
                </th>
                <th scope="col" style={{ width: "14%" }}>
                  الشحنة
                </th>
                <th scope="col" style={{ width: "14%" }}>
                  تاريخ الرفع
                </th>
                <th scope="col" style={{ width: "14%" }}>
                  الحالة
                </th>
                <th scope="col" style={{ width: "12%", textAlign: "center" }}>
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const isApproved = doc.status === "approved";

                return (
                  <tr key={doc.id}>
                    <td>
                      <div className="customer-cell-user">
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: isApproved
                              ? "var(--color-yellow-light)"
                              : "var(--color-gray-100)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: isApproved
                              ? "var(--color-yellow-dark)"
                              : "var(--color-text-secondary)",
                            flexShrink: 0,
                          }}
                        >
                          <DynamicIcon name={isApproved ? "Check" : "FileText"} size={14} />
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="customer-cell-name"
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              textAlign: "right",
                            }}
                          >
                            {doc.title}
                          </button>
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                            {formatFileSize(doc.file_size)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: "var(--color-gray-100)",
                          color: "var(--color-gray-800)",
                          border: "1px solid var(--color-gray-200)",
                        }}
                      >
                        {doc.document_type || "عام"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                        {doc.shipment_number || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="customer-cell-date">{formatDateAr(doc.created_at)}</span>
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: isApproved
                            ? "var(--color-yellow-light)"
                            : "var(--color-gray-100)",
                          color: isApproved ? "#78350f" : "var(--color-gray-800)",
                          border: `1px solid ${isApproved ? "#fde68a" : "var(--color-gray-200)"}`,
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
                    </td>
                    <td>
                      <div className="customer-actions" style={{ justifyContent: "center" }}>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="customer-action-btn"
                          title="معاينة المستند"
                          aria-label={`معاينة مستند ${doc.title}`}
                        >
                          <DynamicIcon name="Eye" size={14} />
                          <span>معاينة</span>
                        </button>
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="customer-action-btn"
                            title="تنزيل المستند"
                            aria-label={`تنزيل مستند ${doc.title}`}
                          >
                            <DynamicIcon name="Download" size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Document Modal */}
      <AdminDocumentModal
        document={previewDoc}
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        onSuccess={(msg) => {
          showToast(msg);
          setPreviewDoc(null);
          router.refresh();
        }}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="feedback-toast feedback-toast--success" role="status">
          <DynamicIcon name="Check" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
