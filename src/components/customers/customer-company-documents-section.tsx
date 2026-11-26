"use client";

/**
 * Customer Company Documents Section Component
 *
 * Displays and manages the 4 official company documents within Admin /customers/[id].
 * Supports inline approval, document preview modal, and real-time status updates.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { approveCompanyDocumentAction } from "@/lib/company-documents/actions";
import { AdminCompanyDocumentModal } from "@/components/company-documents/admin-company-document-modal";
import type {
  CompanyDocument,
  CompanyDocumentType,
  AdminCompanyDocumentItem,
  Company,
  Customer,
} from "@/types";
import {
  COMPANY_DOCUMENT_TYPES,
  COMPANY_DOCUMENT_TYPE_LABELS,
  COMPANY_DOCUMENT_STATUS_LABELS,
} from "@/types";

interface CustomerCompanyDocumentsSectionProps {
  documentsMap: Record<CompanyDocumentType, CompanyDocument | null>;
  completedCount: number;
  totalCount: number;
  company: Company | null;
  customer: Customer;
}

export function CustomerCompanyDocumentsSection({
  documentsMap,
  completedCount,
  totalCount = 4,
  company,
  customer,
}: CustomerCompanyDocumentsSectionProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

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

  const handleApprove = async (docId: string) => {
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

  const openPreview = (doc: CompanyDocument) => {
    const adminDocItem: AdminCompanyDocumentItem = {
      ...doc,
      company_name: company?.name || "شركة غير محددة",
      customer_name: customer.full_name || "—",
      customer_email: customer.email,
      customer_phone: customer.phone || undefined,
    };
    setPreviewDoc(adminDocItem);
  };

  const remainingCount = totalCount - completedCount;
  const isAllComplete = remainingCount === 0;

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

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-yellow-light, #fef9c3)",
              color: "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="FileCheck2" size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
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
                  padding: "0.15rem 0.55rem",
                  borderRadius: "var(--radius-full)",
                  border: `1px solid ${isAllComplete ? "#a7f3d0" : "#fde68a"}`,
                }}
              >
                {`${completedCount} من ${totalCount} مكتملة`}
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-text-muted)",
                margin: "0.2rem 0 0",
              }}
            >
              المستندات الرسمية المرفوعة للشركة والمستخدمة في إجراءات التخليص.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="customer-action-btn customer-action-btn--secondary"
          title="تحديث المستندات"
          style={{ fontSize: "var(--font-size-xs)", padding: "0.35rem 0.75rem" }}
        >
          <DynamicIcon name="RefreshCw" size={14} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Empty State if No Company Configured */}
      {!company ? (
        <div
          style={{
            padding: "2rem 1rem",
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-sm)",
            backgroundColor: "var(--color-gray-50)",
            borderRadius: "var(--radius-lg)",
            border: "1px dashed var(--color-border)",
          }}
        >
          <DynamicIcon name="FileQuestion" size={32} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
          <p style={{ fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            لا يمكن عرض مستندات الشركة
          </p>
          <p style={{ fontSize: "var(--font-size-xs)" }}>
            يجب تسجيل بيانات الشركة أولاً لتتمكن من مراجعة واعتماد مستنداتها.
          </p>
        </div>
      ) : (
        /* 4 Document Cards Grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {COMPANY_DOCUMENT_TYPES.map((type) => {
            const doc = documentsMap[type];
            const isUploaded = Boolean(doc);
            const isPendingStatus = doc?.status === "pending";
            const isApproved = doc?.status === "approved";
            const title = COMPANY_DOCUMENT_TYPE_LABELS[type];
            const isCurrentApproving = Boolean(doc && approvingId === doc.id);

            return (
              <div
                key={type}
                style={{
                  backgroundColor: "var(--color-gray-50)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "1rem 1.125rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.875rem",
                  transition: "border-color 0.2s ease",
                }}
              >
                {/* Card Header & Status */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.625rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
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
                          name={isApproved ? "ShieldCheck" : isPendingStatus ? "Clock" : "File"}
                          size={18}
                        />
                      </div>
                      <div>
                        <h3
                          style={{
                            fontSize: "var(--font-size-sm)",
                            fontWeight: 700,
                            color: "var(--color-text-primary)",
                            margin: 0,
                          }}
                        >
                          {title}
                        </h3>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text-muted)",
                            margin: "0.15rem 0 0",
                          }}
                        >
                          {isUploaded
                            ? `تم الرفع: ${formatDateAr(doc!.uploaded_at)}`
                            : "لم يتم الرفع"}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.2rem 0.5rem",
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
                        backgroundColor: "var(--color-surface)",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        fontSize: "11px",
                        color: "var(--color-text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        overflow: "hidden",
                      }}
                    >
                      <DynamicIcon name="FileText" size={13} style={{ flexShrink: 0 }} />
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

                  {/* Approval timestamp if approved */}
                  {isApproved && doc?.approved_at && (
                    <p
                      style={{
                        fontSize: "10px",
                        color: "#059669",
                        fontWeight: 600,
                        margin: "0.4rem 0 0",
                      }}
                    >
                      ✓ تم الاعتماد: {formatDateAr(doc.approved_at)}
                    </p>
                  )}
                </div>

                {/* Card Actions */}
                <div
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {isUploaded ? (
                    <>
                      {/* Preview Button */}
                      <button
                        type="button"
                        onClick={() => openPreview(doc!)}
                        className="customer-action-btn customer-action-btn--secondary"
                        style={{
                          flex: 1,
                          fontSize: "var(--font-size-xs)",
                          padding: "0.35rem 0.6rem",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <DynamicIcon name="Eye" size={14} />
                        <span>عرض المستند</span>
                      </button>

                      {/* Approve Button (if pending) */}
                      {isPendingStatus && (
                        <button
                          type="button"
                          onClick={() => handleApprove(doc!.id)}
                          disabled={isCurrentApproving}
                          className="customer-action-btn"
                          style={{
                            flex: 1,
                            backgroundColor: "#059669",
                            borderColor: "#059669",
                            color: "#ffffff",
                            fontSize: "var(--font-size-xs)",
                            padding: "0.35rem 0.6rem",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.3rem",
                          }}
                        >
                          {isCurrentApproving ? (
                            <DynamicIcon
                              name="RefreshCw"
                              size={13}
                              className="animate-spin"
                            />
                          ) : (
                            <DynamicIcon name="CheckCircle2" size={13} />
                          )}
                          <span>اعتماد</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <span
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      بانتظار قيام العميل برفع المستند
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Preview & Approval Modal */}
      <AdminCompanyDocumentModal
        document={previewDoc}
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        onApproved={() => {
          showToast("تم اعتماد المستند بنجاح.");
          handleRefresh();
        }}
      />
    </div>
  );
}
