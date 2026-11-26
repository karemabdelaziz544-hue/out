"use client";

/**
 * Customer Document Upload Modal
 *
 * Accessible modal allowing customers to upload documents to Supabase Storage.
 * Validates file constraints and binds ownership server-side.
 */

import { useState, useRef, useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { uploadCustomerDocumentAction } from "@/lib/documents/actions";
import { DEFAULT_DOCUMENT_TYPES } from "@/types";

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export function DocumentUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<string>(DEFAULT_DOCUMENT_TYPES[0]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isPending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate size
    if (selected.size > MAX_FILE_SIZE) {
      setErrorMsg("حجم الملف يتجاوز الحد المسموح به (20 ميجابايت).");
      setFile(null);
      return;
    }

    // Validate extension
    const ext = "." + selected.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrorMsg("نوع الملف غير مدعوم. يرجى اختيار ملف PDF أو صورة (JPG, PNG, WebP).");
      setFile(null);
      return;
    }

    setFile(selected);
    if (!title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;

    if (dropped.size > MAX_FILE_SIZE) {
      setErrorMsg("حجم الملف يتجاوز الحد المسموح به (20 ميجابايت).");
      return;
    }

    const ext = "." + dropped.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrorMsg("نوع الملف غير مدعوم. يرجى اختيار ملف PDF أو صورة.");
      return;
    }

    setFile(dropped);
    if (!title) {
      setTitle(dropped.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg("يرجى اختيار ملف لرفعه.");
      return;
    }

    setErrorMsg(null);
    setUploadProgress(20);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim() || file.name);
    formData.append("document_type", documentType);

    startTransition(async () => {
      setUploadProgress(60);
      const res = await uploadCustomerDocumentAction(formData);
      setUploadProgress(100);

      if (res.success) {
        onSuccess?.(res.message || "تم رفع المستند بنجاح.");
        handleClose();
      } else {
        setErrorMsg(res.error || "تعذر رفع المستند.");
        setUploadProgress(0);
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setFile(null);
    setTitle("");
    setDocumentType(DEFAULT_DOCUMENT_TYPES[0]);
    setErrorMsg(null);
    setUploadProgress(0);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="modal-card" style={{ maxWidth: "540px" }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-icon-badge">
            <DynamicIcon name="FileText" size={20} />
          </div>
          <div>
            <h2 id="upload-modal-title" className="modal-title">
              رفع مستند جديد
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
              ارفع مستنداتك الجمركية والشحنات بصيغة PDF أو صورة
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* File Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--color-border-strong)",
                borderRadius: "var(--radius-lg)",
                padding: "1.75rem 1rem",
                textAlign: "center",
                cursor: isPending ? "not-allowed" : "pointer",
                backgroundColor: file ? "var(--color-yellow-light)" : "var(--color-gray-50)",
                transition: "all var(--transition-fast)",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                disabled={isPending}
                style={{ display: "none" }}
              />

              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  backgroundColor: file ? "var(--color-yellow)" : "var(--color-surface)",
                  color: "var(--color-black)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 0.75rem auto",
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                <DynamicIcon name={file ? "Check" : "File"} size={22} />
              </div>

              {file ? (
                <div>
                  <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "var(--font-size-sm)" }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                    {formatFileSize(file.size)} • {file.type || "ملف"}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "var(--font-size-sm)" }}>
                    اضغط لاختيار ملف أو اسحبه إلى هنا
                  </div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "4px" }}>
                    PDF، JPG، PNG بحد أقصى 20 ميجابايت
                  </div>
                </div>
              )}
            </div>

            {/* Title Field */}
            <div className="input-group">
              <label className="input-group__label">عنوان المستند (اختياري)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="أدخل عنواناً واضحاً للمستند"
                className="input-group__input"
                disabled={isPending}
              />
            </div>

            {/* Document Type Field */}
            <div className="input-group">
              <label className="input-group__label">نوع المستند</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="input-group__input"
                disabled={isPending}
                style={{ cursor: "pointer" }}
              >
                {DEFAULT_DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress Bar */}
            {isPending && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", marginBottom: "4px" }}>
                  <span>جاري رفع المستند...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div
                  style={{
                    height: "6px",
                    backgroundColor: "var(--color-gray-200)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${uploadProgress}%`,
                      backgroundColor: "var(--color-yellow)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
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
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="customer-action-btn"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!file || isPending}
              className="customer-action-btn customer-action-btn--toggle-activate"
              style={{
                fontWeight: 600,
                paddingInline: "1.5rem",
                opacity: !file || isPending ? 0.6 : 1,
              }}
            >
              {isPending ? "جاري الرفع..." : "تأكيد الرفع"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
