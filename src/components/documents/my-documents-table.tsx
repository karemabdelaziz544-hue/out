"use client";

/**
 * Customer Documents Table Component
 *
 * Dedicated table for customer's /my-documents view with preview and upload triggers.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { CustomerDocumentModal } from "./customer-document-modal";
import { DocumentUploadModal } from "./document-upload-modal";
import type { DocumentItem } from "@/types";

interface MyDocumentsTableProps {
  documents: DocumentItem[];
  totalCount: number;
  isFiltered: boolean;
}

export function MyDocumentsTable({
  documents,
  totalCount,
  isFiltered,
}: MyDocumentsTableProps) {
  const router = useRouter();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleClear = () => {
    router.replace("/my-documents");
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 1. Empty State: Customer has no documents at all
  if (totalCount === 0 && !isFiltered) {
    return (
      <>
        <div className="customers-table-card">
          <div className="customers-state-box">
            <div className="customers-state-box__icon">
              <DynamicIcon name="FileText" size={28} />
            </div>
            <h3 className="customers-state-box__title">لا توجد مستندات حتى الآن</h3>
            <p className="customers-state-box__desc">
              لم تقم برفع أي مستندات بعد. يمكنك رفع المستندات الجمركية وملفات الشحنات هنا في أي وقت.
            </p>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="customer-action-btn customer-action-btn--toggle-activate"
              style={{ marginTop: "0.5rem", padding: "0.5rem 1.5rem", fontWeight: 600 }}
            >
              <DynamicIcon name="FileText" size={16} />
              <span>رفع مستند</span>
            </button>
          </div>
        </div>

        <DocumentUploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onSuccess={(msg) => {
            showToast(msg);
            router.refresh();
          }}
        />

        {toastMessage && (
          <div className="feedback-toast feedback-toast--success" role="status">
            <DynamicIcon name="Check" size={18} />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  // 2. Empty State: No search results
  if (documents.length === 0 && isFiltered) {
    return (
      <div className="customers-table-card">
        <div className="customers-state-box">
          <div className="customers-state-box__icon">
            <DynamicIcon name="Search" size={28} />
          </div>
          <h3 className="customers-state-box__title">
            لم يتم العثور على مستندات مطابقة لبحثك
          </h3>
          <p className="customers-state-box__desc">
            تأكد من صحة كلمات البحث أو جرّب إلغاء الفلاتر المحددة.
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="customer-action-btn"
            style={{ marginTop: "0.5rem", padding: "0.5rem 1.25rem" }}
          >
            مسح البحث والفلاتر
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="customers-table-card">
        <div className="customers-table-wrapper">
          <table className="customers-table" aria-label="جدول مستنداتي">
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
                const dateStr = formatDateAr(doc.created_at);
                const isApproved = doc.status === "approved";

                return (
                  <tr key={doc.id}>
                    {/* 1. Title and file size */}
                    <td>
                      <div className="customer-cell-user">
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
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
                          <DynamicIcon name={isApproved ? "Check" : "FileText"} size={16} />
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

                    {/* 2. Document Type */}
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

                    {/* 3. Shipment */}
                    <td>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                        {doc.shipment_number || "—"}
                      </span>
                    </td>

                    {/* 4. Upload Date */}
                    <td>
                      <span className="customer-cell-date">{dateStr}</span>
                    </td>

                    {/* 5. Status Badge */}
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

                    {/* 6. Actions */}
                    <td>
                      <div
                        className="customer-actions"
                        style={{ justifyContent: "center" }}
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="customer-action-btn"
                          title={isApproved ? "معاينة المستند المعتمد" : "معاينة وإدارة المستند"}
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
      </div>

      {/* Customer Document Modal */}
      <CustomerDocumentModal
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
    </>
  );
}
