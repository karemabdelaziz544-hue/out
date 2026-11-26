"use client";

/**
 * Customer Document Modal Component
 *
 * Dedicated document preview and management modal for CUSTOMERS.
 * Strictly hides all admin-only data (customer name, customer links, email, etc.).
 * Displays status ('قيد المراجعة' vs 'معتمد') and enforces locked state when approved.
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import {
  editCustomerDocumentAction,
  replaceCustomerDocumentFileAction,
  deleteCustomerDocumentAction,
} from "@/lib/documents/actions";
import { DEFAULT_DOCUMENT_TYPES } from "@/types";
import type { DocumentItem } from "@/types";

interface CustomerDocumentModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export function CustomerDocumentModal({
  document,
  isOpen,
  onClose,
  onSuccess,
}: CustomerDocumentModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"view" | "edit" | "replace" | "delete">("view");

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");

  // Replace state
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // Common transition
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

  const handleOpenEdit = () => {
    setEditTitle(document.title);
    setEditType(document.document_type || DEFAULT_DOCUMENT_TYPES[0]);
    setErrorMsg(null);
    setActiveTab("edit");
  };

  const handleOpenReplace = () => {
    setReplaceFile(null);
    setErrorMsg(null);
    setActiveTab("replace");
  };

  const handleOpenDelete = () => {
    setErrorMsg(null);
    setActiveTab("delete");
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await editCustomerDocumentAction(document.id, editTitle, editType);
      if (res.success) {
        onSuccess?.(res.message || "تم تحديث بيانات المستند بنجاح.");
        setActiveTab("view");
        router.refresh();
      } else {
        setErrorMsg(res.error || "تعذر تحديث المستند.");
      }
    });
  };

  const handleSaveReplace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceFile) return;

    setErrorMsg(null);
    const formData = new FormData();
    formData.append("file", replaceFile);

    startTransition(async () => {
      const res = await replaceCustomerDocumentFileAction(document.id, formData);
      if (res.success) {
        onSuccess?.(res.message || "تم استبدال الملف بنجاح.");
        setActiveTab("view");
        router.refresh();
      } else {
        setErrorMsg(res.error || "تعذر استبدال الملف.");
      }
    });
  };

  const handleConfirmDelete = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteCustomerDocumentAction(document.id);
      if (res.success) {
        onSuccess?.(res.message || "تم حذف المستند بنجاح.");
        onClose();
        router.refresh();
      } else {
        setErrorMsg(res.error || "تعذر حذف المستند.");
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
      aria-labelledby="customer-doc-title"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "760px",
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
                <h2 id="customer-doc-title" className="modal-title">
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

        {/* Locked Notification when Approved */}
        {isApproved && (
          <div
            style={{
              padding: "0.625rem 1.25rem",
              backgroundColor: "var(--color-yellow-light)",
              borderBottom: "1px solid #fde68a",
              color: "#78350f",
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <DynamicIcon name="Check" size={16} />
            <span>هذا المستند تم اعتماده رسميًا من الإدارة، ولا يمكن تعديله أو استبداله أو حذفه.</span>
          </div>
        )}

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

          {/* TAB 1: VIEW MODE */}
          {activeTab === "view" && (
            <>
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
                      معاينة الملف غير متاحة
                    </p>
                  </div>
                )}
              </div>

              {/* Document Meta Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  backgroundColor: "var(--color-gray-50)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-xs)",
                }}
              >
                <div>
                  <span style={{ color: "var(--color-text-muted)" }}>نوع المستند:</span>{" "}
                  <strong>{document.document_type || "عام"}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)" }}>حجم الملف:</span>{" "}
                  <strong>{formatFileSize(document.file_size)}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)" }}>حالة الاعتماد:</span>{" "}
                  <strong>{isApproved ? "معتمد" : "قيد المراجعة"}</strong>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: EDIT METADATA MODE */}
          {activeTab === "edit" && (
            <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>تعديل بيانات المستند</h3>

              <div className="input-group">
                <label className="input-group__label">عنوان المستند</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="input-group__input"
                  required
                  disabled={isPending}
                />
              </div>

              <div className="input-group">
                <label className="input-group__label">نوع المستند</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="input-group__input"
                  disabled={isPending}
                >
                  {DEFAULT_DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("view")}
                  disabled={isPending}
                  className="customer-action-btn"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending || !editTitle.trim()}
                  className="customer-action-btn customer-action-btn--toggle-activate"
                  style={{ fontWeight: 600 }}
                >
                  {isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: REPLACE FILE MODE */}
          {activeTab === "replace" && (
            <form onSubmit={handleSaveReplace} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>استبدال ملف المستند</h3>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                سيتم استبدال الملف الحالي بنسخة جديدة مع الحفاظ على نفس معرّف وبيانات المستند.
              </p>

              <div
                style={{
                  border: "2px dashed var(--color-border-strong)",
                  borderRadius: "var(--radius-lg)",
                  padding: "1.5rem",
                  textAlign: "center",
                  backgroundColor: replaceFile ? "var(--color-yellow-light)" : "var(--color-gray-50)",
                  cursor: "pointer",
                }}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
              >
                <input
                  ref={fileInputRef}
                  id="replace-file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  disabled={isPending}
                  style={{ display: "none" }}
                />

                <DynamicIcon name={replaceFile ? "Check" : "FileText"} size={28} />
                <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", marginTop: "0.5rem" }}>
                  {replaceFile ? replaceFile.name : "اضغط لاختيار الملف الجديد"}
                </div>
                {replaceFile && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                    {formatFileSize(replaceFile.size)}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("view")}
                  disabled={isPending}
                  className="customer-action-btn"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending || !replaceFile}
                  className="customer-action-btn customer-action-btn--toggle-activate"
                  style={{ fontWeight: 600 }}
                >
                  {isPending ? "جاري الاستبدال..." : "تأكيد استبدال الملف"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: DELETE CONFIRMATION MODE */}
          {activeTab === "delete" && (
            <div style={{ padding: "1rem", textAlign: "center" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "#fee2e2",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem auto",
                }}
              >
                <DynamicIcon name="AlertTriangle" size={24} />
              </div>

              <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: 700, marginBottom: "0.5rem" }}>
                تأكيد حذف المستند؟
              </h3>
              <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", maxWidth: "420px", margin: "0 auto" }}>
                سيتم حذف المستند <strong>{document.title}</strong> والملف المرتبط به نهائيًا. لا يمكن التراجع عن هذا الإجراء.
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("view")}
                  disabled={isPending}
                  className="customer-action-btn"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isPending}
                  className="customer-action-btn customer-action-btn--toggle-danger"
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    borderColor: "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  {isPending ? "جاري الحذف..." : "تأكيد الحذف النهائي"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === "view" && (
          <div className="modal-footer" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {/* Actions available ONLY when NOT approved */}
              {!isApproved ? (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    className="customer-action-btn"
                    title="تعديل بيانات المستند"
                  >
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenReplace}
                    className="customer-action-btn"
                    title="استبدال ملف المستند"
                  >
                    <span>استبدال الملف</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenDelete}
                    className="customer-action-btn customer-action-btn--toggle-danger"
                    title="حذف المستند"
                  >
                    <span>حذف</span>
                  </button>
                </>
              ) : (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <DynamicIcon name="Shield" size={14} />
                  <span>المستند معتمد ولا يمكن تعديله أو حذفه</span>
                </div>
              )}
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
                  <span>تنزيل الملف</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
