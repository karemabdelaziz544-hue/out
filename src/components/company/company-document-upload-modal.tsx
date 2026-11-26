"use client";

/**
 * Company Document Upload / Replace Modal
 *
 * Handles file selection, client-side validation, drag-and-drop,
 * and calls the independent company document actions.
 */

import { useState, useRef } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import {
  uploadCompanyDocumentAction,
  replaceCompanyDocumentAction,
} from "@/lib/company-documents/actions";
import type { CompanyDocument, CompanyDocumentType } from "@/types";
import { COMPANY_DOCUMENT_TYPE_LABELS } from "@/types";

interface CompanyDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: CompanyDocumentType;
  existingDocument?: CompanyDocument | null;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";

export function CompanyDocumentUploadModal({
  isOpen,
  onClose,
  documentType,
  existingDocument,
  onSuccess,
}: CompanyDocumentUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isReplace = Boolean(existingDocument);
  const docTitle = COMPANY_DOCUMENT_TYPE_LABELS[documentType] || documentType;

  const handleFileValidation = (file: File): boolean => {
    setErrorMessage(null);

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage("حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت).");
      return false;
    }

    const lower = file.name.toLowerCase();
    const hasValidExt = [".pdf", ".jpg", ".jpeg", ".png", ".webp"].some((ext) =>
      lower.endsWith(ext),
    );

    if (!hasValidExt) {
      setErrorMessage("صيغة الملف غير مدعومة. الصيغ المقبولة: PDF, JPEG, PNG, WEBP.");
      return false;
    }

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && handleFileValidation(file)) {
      setSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && handleFileValidation(file)) {
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("يرجى اختيار ملف أولاً.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      let res;
      if (isReplace && existingDocument) {
        formData.append("document_id", existingDocument.id);
        res = await replaceCompanyDocumentAction(formData);
      } else {
        formData.append("document_type", documentType);
        res = await uploadCompanyDocumentAction(formData);
      }

      if (res.success) {
        setSuccessMessage(res.message || "تم حفظ المستند بنجاح وهو الآن قيد المراجعة.");
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      } else {
        setErrorMessage(res.error || "حدث خطأ أثناء رفع المستند.");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setIsSubmitting(false);
    }
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
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card"
        style={{
          maxWidth: "520px",
          width: "92%",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: "1.125rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#fef3c7",
                color: "#b45309",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DynamicIcon name={isReplace ? "RefreshCw" : "UploadCloud"} size={20} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--foreground)",
                }}
              >
                {isReplace ? `استبدال ${docTitle}` : `رفع ${docTitle}`}
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--muted-foreground)",
                  marginTop: "0.15rem",
                  margin: 0,
                }}
              >
                {isReplace
                  ? "سيتم استبدال الملف الحالي وإعادة المستند لحالة قيد المراجعة."
                  : "يرجى رفع نسخة واضحة ومحدثة للمستند."}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "transparent",
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              padding: "0.35rem",
              borderRadius: "var(--radius-md)",
              color: "var(--muted-foreground)",
            }}
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: "1.25rem" }}>
          {/* Status Message Alerts */}
          {errorMessage && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "var(--font-size-xs)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <DynamicIcon name="AlertCircle" size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                fontSize: "var(--font-size-xs)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <DynamicIcon name="CheckCircle2" size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${
                isDragging ? "var(--primary)" : selectedFile ? "#10b981" : "var(--border)"
              }`,
              borderRadius: "var(--radius-lg)",
              padding: "2rem 1.5rem",
              textAlign: "center",
              cursor: "pointer",
              backgroundColor: isDragging
                ? "rgba(234, 179, 8, 0.05)"
                : selectedFile
                ? "rgba(16, 185, 129, 0.04)"
                : "var(--muted-bg, #fbfbfb)",
              transition: "all 0.2s ease",
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept={ACCEPTED_EXTENSIONS}
              style={{ display: "none" }}
            />

            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: selectedFile ? "#d1fae5" : "#fef3c7",
                color: selectedFile ? "#059669" : "#d97706",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "0.75rem",
              }}
            >
              <DynamicIcon
                name={selectedFile ? "FileCheck" : "UploadCloud"}
                size={24}
              />
            </div>

            {selectedFile ? (
              <div>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--font-size-sm)",
                    color: "var(--foreground)",
                    marginBottom: "0.25rem",
                    wordBreak: "break-all",
                  }}
                >
                  {selectedFile.name}
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--muted-foreground)",
                    margin: 0,
                  }}
                >
                  {formatFileSize(selectedFile.size)} • اضغط لاختيار ملف آخر
                </p>
              </div>
            ) : (
              <div>
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: "var(--font-size-sm)",
                    color: "var(--foreground)",
                    marginBottom: "0.25rem",
                  }}
                >
                  اسحب الملف هنا أو انقر للاختيار
                </p>
                <p
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--muted-foreground)",
                    margin: 0,
                  }}
                >
                  الحد الأقصى 20 ميجابايت (PDF, PNG, JPG, WEBP)
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              marginTop: "1.5rem",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-secondary"
              style={{ fontSize: "var(--font-size-sm)" }}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={!selectedFile || isSubmitting}
              className="btn btn-primary"
              style={{
                fontSize: "var(--font-size-sm)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {isSubmitting ? (
                <>
                  <DynamicIcon name="RefreshCw" size={16} className="animate-spin" />
                  جاري الرفع...
                </>
              ) : (
                <>
                  <DynamicIcon name={isReplace ? "RefreshCw" : "Upload"} size={16} />
                  {isReplace ? "تأكيد الاستبدال" : "رفع المستند"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
