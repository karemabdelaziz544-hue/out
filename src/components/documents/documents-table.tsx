"use client";

/**
 * Documents Table Component
 *
 * Renders the documents data table, empty states, and preview actions.
 */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { AdminDocumentModal } from "./admin-document-modal";
import type { DocumentItem } from "@/types";

interface DocumentsTableProps {
  documents: DocumentItem[];
  totalCount: number;
  isFiltered: boolean;
}

export function DocumentsTable({
  documents,
  totalCount,
  isFiltered,
}: DocumentsTableProps) {
  const router = useRouter();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleClear = () => {
    router.replace("/documents");
  };

  // 1. Empty State: No documents at all in system
  if (totalCount === 0 && !isFiltered) {
    return (
      <div className="customers-table-card">
        <div className="customers-state-box">
          <div className="customers-state-box__icon">
            <DynamicIcon name="FileText" size={28} />
          </div>
          <h3 className="customers-state-box__title">لا توجد مستندات حتى الآن</h3>
          <p className="customers-state-box__desc">
            ستظهر المستندات هنا فور إضافتها للنظام.
          </p>
        </div>
      </div>
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
          <table className="customers-table" aria-label="جدول المستندات">
            <thead>
              <tr>
                <th scope="col" style={{ width: "24%" }}>
                  المستند
                </th>
                <th scope="col" style={{ width: "20%" }}>
                  العميل
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  الشحنة
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  النوع
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  تاريخ الرفع
                </th>
                <th scope="col" style={{ width: "10%" }}>
                  الحالة
                </th>
                <th scope="col" style={{ width: "10%", textAlign: "center" }}>
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const customerName = doc.customer_name || doc.customer_email || "غير محدد";
                const dateStr = formatDateAr(doc.created_at);
                const isApproved = doc.status === "approved";

                return (
                  <tr key={doc.id}>
                    {/* 1. Document title & icon */}
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
                        </div>
                      </div>
                    </td>

                    {/* 2. Customer */}
                    <td>
                      {doc.customer_id ? (
                        <Link
                          href={`/customers/${doc.customer_id}`}
                          className="customer-cell-name"
                          style={{ fontSize: "var(--font-size-xs)" }}
                        >
                          {customerName}
                        </Link>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                          —
                        </span>
                      )}
                    </td>

                    {/* 3. Shipment */}
                    <td>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                        {doc.shipment_number || "—"}
                      </span>
                    </td>

                    {/* 4. Document Type */}
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

                    {/* 5. Upload Date */}
                    <td>
                      <span className="customer-cell-date">{dateStr}</span>
                    </td>

                    {/* 6. Status */}
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

                    {/* 7. Actions */}
                    <td>
                      <div
                        className="customer-actions"
                        style={{ justifyContent: "center" }}
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="customer-action-btn"
                          title="معاينة المستند والاعتماد"
                          aria-label={`معاينة مستند ${doc.title}`}
                        >
                          <DynamicIcon name="Eye" size={14} />
                          <span>معاينة</span>
                        </button>

                        {doc.customer_id && (
                          <Link
                            href={`/customers/${doc.customer_id}`}
                            className="customer-action-btn"
                            title="الانتقال إلى صفحة العميل"
                            aria-label={`الانتقال إلى عميل ${customerName}`}
                          >
                            <DynamicIcon name="User" size={14} />
                          </Link>
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
    </>
  );
}
