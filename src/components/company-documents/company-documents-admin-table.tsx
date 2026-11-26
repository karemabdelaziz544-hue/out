"use client";

/**
 * Admin Company Documents Table Component
 *
 * Renders the tabular view of all company documents for the Admin.
 * Supports inline approval, modal preview, customer/company metadata, and pagination.
 */

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { approveCompanyDocumentAction } from "@/lib/company-documents/actions";
import { AdminCompanyDocumentModal } from "./admin-company-document-modal";
import type { AdminCompanyDocumentItem } from "@/types";
import { COMPANY_DOCUMENT_TYPE_LABELS, COMPANY_DOCUMENT_STATUS_LABELS } from "@/types";

interface CompanyDocumentsAdminTableProps {
  documents: AdminCompanyDocumentItem[];
  totalCount: number;
  isFiltered: boolean;
  currentPage: number;
  totalPages: number;
}

export function CompanyDocumentsAdminTable({
  documents,
  totalCount,
  isFiltered,
  currentPage,
  totalPages,
}: CompanyDocumentsAdminTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [previewDoc, setPreviewDoc] = useState<AdminCompanyDocumentItem | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleInlineApprove = async (docId: string) => {
    setApprovingId(docId);
    setToastMessage(null);

    try {
      const res = await approveCompanyDocumentAction(docId);
      if (res.success) {
        showToast(res.message || "تم اعتماد المستند بنجاح.");
        handleRefresh();
      } else {
        showToast(res.error || "تعذر اعتماد المستند.", "error");
      }
    } catch {
      showToast("حدث خطأ غير متوقع أثناء الاعتماد.", "error");
    } finally {
      setApprovingId(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  // 1. Empty State: No company documents at all
  if (totalCount === 0 && !isFiltered) {
    return (
      <div className="customers-table-card">
        <div className="customers-state-box">
          <div className="customers-state-box__icon">
            <DynamicIcon name="FileCheck2" size={28} />
          </div>
          <h3 className="customers-state-box__title">لا توجد مستندات شركات حتى الآن</h3>
          <p className="customers-state-box__desc">
            ستظهر هنا مستندات الشركات (السجل التجاري، البطاقات الضريبية والاستيرادية، والقيمة المضافة) فور رفعها من قبل العملاء.
          </p>
        </div>
      </div>
    );
  }

  // 2. Empty State: Filter produced no matches
  if (documents.length === 0 && isFiltered) {
    return (
      <div className="customers-table-card">
        <div className="customers-state-box">
          <div className="customers-state-box__icon">
            <DynamicIcon name="SearchX" size={28} />
          </div>
          <h3 className="customers-state-box__title">لا توجد نتائج مطابقة</h3>
          <p className="customers-state-box__desc">
            لم نتمكن من العثور على أي مستندات تطابق معايير البحث المحددة.
          </p>
          <button
            type="button"
            onClick={() => router.replace(pathname)}
            className="customer-action-btn"
            style={{ marginTop: "0.5rem" }}
          >
            إعادة تعيين الفلاتر
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "2rem",
            left: "2rem",
            zIndex: 9999,
            backgroundColor: toastMessage.type === "success" ? "#065f46" : "#991b1b",
            color: "#ffffff",
            padding: "0.75rem 1.25rem",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--font-size-sm)",
            fontWeight: 600,
          }}
        >
          <DynamicIcon
            name={toastMessage.type === "success" ? "CheckCircle2" : "AlertCircle"}
            size={18}
          />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Table Card */}
      <div className="customers-table-card">
        <div className="customers-table-wrapper">
          <table className="customers-table" aria-label="جدول مستندات الشركات">
            <thead>
              <tr>
                <th scope="col">المستند</th>
                <th scope="col">الشركة</th>
                <th scope="col">العميل</th>
                <th scope="col">تاريخ الرفع</th>
                <th scope="col">الحالة</th>
                <th scope="col" style={{ textAlign: "center" }}>
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const docLabel =
                  COMPANY_DOCUMENT_TYPE_LABELS[doc.document_type] ||
                  doc.document_type;
                const statusLabel =
                  COMPANY_DOCUMENT_STATUS_LABELS[doc.status] || doc.status;
                const isApproved = doc.status === "approved";
                const isCurrentApproving = approvingId === doc.id;

                return (
                  <tr key={doc.id} className="customers-table__row">
                    {/* 1. Document & File Name */}
                    <td>
                      <div className="customer-cell-primary">
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: isApproved ? "#ecfdf5" : "#fef3c7",
                            color: isApproved ? "#059669" : "#d97706",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <DynamicIcon
                            name={isApproved ? "ShieldCheck" : "FileText"}
                            size={18}
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <span
                            className="customer-name"
                            style={{
                              display: "block",
                              fontWeight: 700,
                              color: "var(--foreground)",
                            }}
                          >
                            {docLabel}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted-foreground)",
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "220px",
                              direction: "ltr",
                              textAlign: "right",
                            }}
                          >
                            {doc.file_name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Company Name */}
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "var(--font-size-xs)",
                          color: "var(--foreground)",
                        }}
                      >
                        {doc.company_name || "—"}
                      </span>
                    </td>

                    {/* 3. Customer Info */}
                    <td>
                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "var(--font-size-xs)",
                            fontWeight: 600,
                            color: "var(--foreground)",
                          }}
                        >
                          {doc.customer_name || "—"}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--muted-foreground)",
                            display: "block",
                          }}
                        >
                          {doc.customer_email || "—"}
                        </span>
                      </div>
                    </td>

                    {/* 4. Upload Date */}
                    <td>
                      <span
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        {formatDateAr(doc.uploaded_at)}
                      </span>
                    </td>

                    {/* 5. Status Badge */}
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: isApproved ? "#ecfdf5" : "#fef3c7",
                          color: isApproved ? "#065f46" : "#92400e",
                          border: `1px solid ${
                            isApproved ? "#a7f3d0" : "#fde68a"
                          }`,
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: isApproved ? "#10b981" : "#f59e0b",
                          }}
                        />
                        {statusLabel}
                      </span>
                    </td>

                    {/* 6. Actions */}
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.4rem",
                        }}
                      >
                        {/* Preview button */}
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: "var(--font-size-xs)",
                            padding: "0.3rem 0.65rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                          title="معاينة المستند"
                        >
                          <DynamicIcon name="Eye" size={14} />
                          <span>معاينة</span>
                        </button>

                        {/* Approve button (if pending) */}
                        {!isApproved && (
                          <button
                            type="button"
                            onClick={() => handleInlineApprove(doc.id)}
                            disabled={isCurrentApproving}
                            className="btn btn-primary btn-sm"
                            style={{
                              backgroundColor: "#059669",
                              borderColor: "#059669",
                              fontSize: "var(--font-size-xs)",
                              padding: "0.3rem 0.65rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                            }}
                            title="اعتماد المستند"
                          >
                            {isCurrentApproving ? (
                              <DynamicIcon
                                name="RefreshCw"
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <DynamicIcon name="CheckCircle2" size={14} />
                            )}
                            <span>اعتماد</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination Footer ────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "var(--font-size-xs)",
              color: "var(--muted-foreground)",
            }}
          >
            <div>
              <span>الصفحة {currentPage} من {totalPages}</span>
              <span style={{ margin: "0 0.5rem" }}>•</span>
              <span>إجمالي النتائج: {totalCount}</span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "var(--font-size-xs)" }}
              >
                السابق
              </button>

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "var(--font-size-xs)" }}
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Admin Preview & Approval Modal ─────────────────────────────────── */}
      <AdminCompanyDocumentModal
        document={previewDoc}
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        onApproved={() => {
          showToast("تم اعتماد المستند بنجاح.");
          handleRefresh();
        }}
      />
    </>
  );
}
