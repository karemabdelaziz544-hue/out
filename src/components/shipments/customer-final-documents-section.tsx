"use client";

/**
 * Customer Final Shipment Documents Section (Step 8)
 *
 * Dedicated checklist and management panel for the 4 core final shipment documents:
 *  1. Commercial Invoice — الفاتورة التجارية
 *  2. Packing List — قائمة التعبئة
 *  3. Bill of Lading — بوليصة الشحن
 *  4. Certificate of Origin — شهادة المنشأ
 *
 * Features:
 *  - 7-step clearance progress timeline
 *  - Clear completion status indicators (X / 4 uploaded, Y / 4 approved)
 *  - Missing documents checklist
 *  - Secure upload and replacement modal
 *  - Revision request display with Admin notes
 *  - Secure document preview (PDF and images)
 *  - Locked state once approved (strictly read-only)
 */

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { customerUploadShipmentDocumentAction } from "@/lib/shipments/document-actions";
import {
  FINAL_SHIPMENT_DOCUMENT_TYPES,
  FINAL_DOCUMENT_TYPE_LABELS,
  matchFinalDocumentType,
  type FinalShipmentDocumentType,
  type DocumentItem,
  type Shipment,
} from "@/types";

interface CustomerFinalDocumentsSectionProps {
  shipment: Shipment;
  documents: DocumentItem[];
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const DOCUMENT_DESCRIPTIONS: Record<FinalShipmentDocumentType, string> = {
  commercial_invoice: "الفاتورة التجارية النهائية المعتمدة من المورد متضمنة القيمة والبنود.",
  packing_list: "بيان العبوات والأوزان وتفاصيل الطرود ومحتوياتها.",
  bill_of_lading: "بوليصة الشحن البحرية أو الجوية الرسمية الصادرة من الخط الملاحي.",
  certificate_of_origin: "شهادة إثبات بلد المنشأ للبضائع موثقة من الغرفة التجارية.",
};

export function CustomerFinalDocumentsSection({
  shipment,
  documents,
}: CustomerFinalDocumentsSectionProps) {
  const router = useRouter();

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  // Upload / Replace Modal State
  const [activeUploadType, setActiveUploadType] =
    useState<FinalShipmentDocumentType | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Map existing documents by normalized type
  const docMap = new Map<FinalShipmentDocumentType, DocumentItem>();
  for (const doc of documents) {
    const matched = matchFinalDocumentType(doc.document_type);
    if (matched) {
      docMap.set(matched, doc);
    }
  }

  // Calculate metrics
  let approvedCount = 0;
  let pendingCount = 0;
  let revisionCount = 0;

  for (const type of FINAL_SHIPMENT_DOCUMENT_TYPES) {
    const doc = docMap.get(type);
    if (doc) {
      if (doc.status === "approved") approvedCount++;
      else if (doc.status === "revision_required") revisionCount++;
      else pendingCount++;
    }
  }

  const uploadedCount = docMap.size;
  const isAllUploaded = uploadedCount >= 4;
  const isAllApproved = approvedCount >= 4;
  const isReadyForExternal = shipment.status === "ready_for_external_stage";

  // Determine stage eligibility: Show when ACID is completed or waiting for documents
  const isEligibleStage =
    shipment.status === "awaiting_shipment_documents" ||
    shipment.status === "documents_completed" ||
    shipment.status === "ready_for_external_stage" ||
    shipment.status === "acid_issued" ||
    uploadedCount > 0;

  if (!isEligibleStage) {
    return null;
  }

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleValidateFile = (file: File): boolean => {
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
      setErrorMessage(
        "صيغة الملف غير مدعومة. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP).",
      );
      return false;
    }

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && handleValidateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && handleValidateFile(file)) {
      setSelectedFile(file);
    }
  };

  const openUploadModal = (type: FinalShipmentDocumentType) => {
    setActiveUploadType(type);
    setSelectedFile(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const closeUploadModal = () => {
    setActiveUploadType(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !activeUploadType) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("document_type", activeUploadType);
    formData.append("file", selectedFile);

    try {
      const res = await customerUploadShipmentDocumentAction(formData);
      if (!res.success) {
        setErrorMessage(res.error || "تعذر رفع المستند.");
      } else {
        setSuccessMessage(res.message || "تم رفع المستند بنجاح.");
        setTimeout(() => {
          closeUploadModal();
          router.refresh();
        }, 1200);
      }
    } catch {
      setErrorMessage("حدث خطأ غير متوقع أثناء معالجة الملف.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.75rem",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-md)",
              backgroundColor: isAllApproved
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(245, 158, 11, 0.12)",
              color: isAllApproved ? "#047857" : "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon
              name={isAllApproved ? "CheckCircle" : "FileText"}
              size={24}
            />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                مستندات الشحنة النهائية
              </h2>
              <span
                style={{
                  padding: "0.2rem 0.625rem",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  backgroundColor: isAllApproved
                    ? "rgba(16, 185, 129, 0.15)"
                    : isAllUploaded
                    ? "rgba(99, 102, 241, 0.12)"
                    : "rgba(245, 158, 11, 0.12)",
                  color: isAllApproved
                    ? "#065f46"
                    : isAllUploaded
                    ? "#4338ca"
                    : "#b45309",
                  border: isAllApproved
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : isAllUploaded
                    ? "1px solid rgba(99, 102, 241, 0.3)"
                    : "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                {isAllApproved
                  ? "مكتملة ومعتمدة بالكامل"
                  : isAllUploaded
                  ? "قيد مراجعة الإدارة"
                  : "مطلوب استكمال المستندات"}
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
                margin: "0.25rem 0 0 0",
              }}
            >
              المستندات الجمركية النهائية الأربعة المطلوبة لإجراءات التخليص
            </p>
          </div>
        </div>

        {/* Completion Counter Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: isAllApproved
              ? "rgba(16, 185, 129, 0.1)"
              : "var(--color-gray-50)",
            border: "1px solid var(--color-border)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <DynamicIcon
            name={isAllApproved ? "CheckCircle" : "Clock"}
            size={18}
            className={isAllApproved ? "text-emerald-600" : "text-amber-600"}
          />
          <span>
            <strong>{approvedCount}</strong> من <strong>4</strong> معتمدة •{" "}
            <strong>{uploadedCount}</strong> مرفوعة
            {pendingCount > 0 && <span> ({pendingCount} قيد المراجعة)</span>}
          </span>
        </div>
      </div>

      {/* 7-Step Progress Timeline (Section 16) */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "var(--color-gray-50)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-gray-500)",
            display: "block",
            marginBottom: "0.875rem",
          }}
        >
          مراحل معالجة الشحنة
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Step 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              طلب التخليص
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              التسعير
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 3 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              موافقة العميل
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 4 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              اعتماد الفاتورة المبدئية
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 5 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              إصدار ACID
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 6: Final Documents */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.25rem 0.5rem",
              backgroundColor: isAllApproved
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(245, 158, 11, 0.12)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {isAllApproved ? (
              <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            ) : (
              <span style={{ color: "#b45309", fontWeight: "bold" }}>●</span>
            )}
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                color: isAllApproved ? "#065f46" : "#b45309",
              }}
            >
              {isAllApproved ? "اكتمال مستندات الشحنة" : "مستندات الشحنة"}
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 7: Next Step */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: isReadyForExternal ? "0.25rem 0.5rem" : "0",
              backgroundColor: isReadyForExternal
                ? "rgba(16, 185, 129, 0.15)"
                : "transparent",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {isReadyForExternal ? (
              <span style={{ color: "#10b981", fontWeight: "bold" }}>●</span>
            ) : (
              <span style={{ color: "var(--color-gray-400)" }}>○</span>
            )}
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: isReadyForExternal
                  ? "var(--font-weight-bold)"
                  : "var(--font-weight-normal)",
                color: isReadyForExternal ? "#065f46" : "var(--color-gray-400)",
              }}
            >
              {isReadyForExternal
                ? "جاهزة للمرحلة الخارجية"
                : "منظومة نافذة (Nafeza)"}
            </span>
          </div>
        </div>
      </div>

      {/* Ready for External Stage Banner (Section 10) */}
      {isReadyForExternal && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <DynamicIcon name="CheckCircle" size={20} />
          <div>
            <h4
              style={{
                margin: 0,
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-bold)",
                color: "#065f46",
              }}
            >
              تم استكمال المستندات وتجهيز الشحنة للمرحلة التالية
            </h4>
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "var(--font-size-xs)",
                color: "#047857",
              }}
            >
              تم اعتماد جميع مستندات الشحنة بنجاح، والشحنة الآن مجهزة للانتقال إلى المرحلة الجمركية التالية.
            </p>
          </div>
        </div>
      )}

      {/* Missing / Required Documents Banner (Section 15 & 18) */}
      {!isAllApproved && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius-md)",
            backgroundColor:
              revisionCount > 0
                ? "rgba(239, 68, 68, 0.05)"
                : "rgba(245, 158, 11, 0.05)",
            border:
              revisionCount > 0
                ? "1px solid rgba(239, 68, 68, 0.25)"
                : "1px solid rgba(245, 158, 11, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DynamicIcon
              name={revisionCount > 0 ? "AlertTriangle" : "Info"}
              size={18}
              className={revisionCount > 0 ? "text-red-600" : "text-amber-600"}
            />
            <strong
              style={{
                fontSize: "var(--font-size-sm)",
                color: revisionCount > 0 ? "#b91c1c" : "#92400e",
              }}
            >
              {revisionCount > 0
                ? "تنبيه: يتطلب أحد المستندات تعديلاً وفق ملاحظات الإدارة"
                : isAllUploaded
                ? "تم رفع جميع المستندات المطلوبة (4 من 4) وهي قيد مراجعة واعتماد فريق العمل"
                : `المستندات المطلوبة: تم رفع ${uploadedCount} من 4 مستندات`}
            </strong>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              fontSize: "var(--font-size-xs)",
              marginTop: "0.25rem",
            }}
          >
            {FINAL_SHIPMENT_DOCUMENT_TYPES.map((type) => {
              const doc = docMap.get(type);
              const label = FINAL_DOCUMENT_TYPE_LABELS[type];
              if (!doc) {
                return (
                  <span
                    key={type}
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "#b91c1c",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <span>❌ {label} (ناقص)</span>
                  </span>
                );
              }
              if (doc.status === "approved") {
                return (
                  <span
                    key={type}
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      color: "#065f46",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <span>✅ {label} (معتمد)</span>
                  </span>
                );
              }
              if (doc.status === "revision_required") {
                return (
                  <span
                    key={type}
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(239, 68, 68, 0.15)",
                      color: "#b91c1c",
                      fontWeight: "bold",
                    }}
                  >
                    ⚠️ {label} (مطلوب تعديل)
                  </span>
                );
              }
              return (
                <span
                  key={type}
                  style={{
                    padding: "0.2rem 0.5rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    color: "#4338ca",
                  }}
                >
                  ⏳ {label} (قيد المراجعة)
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 4-Document Cards Grid / Checklist (Section 5) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {FINAL_SHIPMENT_DOCUMENT_TYPES.map((type) => {
          const label = FINAL_DOCUMENT_TYPE_LABELS[type];
          const desc = DOCUMENT_DESCRIPTIONS[type];
          const doc = docMap.get(type);

          const isDocApproved = doc?.status === "approved";
          const isDocRevisionRequired = doc?.status === "revision_required";
          const isDocPending = doc?.status === "pending";
          const isMissing = !doc;

          return (
            <div
              key={type}
              style={{
                padding: "1.25rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: isDocApproved
                  ? "rgba(16, 185, 129, 0.03)"
                  : isDocRevisionRequired
                  ? "rgba(239, 68, 68, 0.03)"
                  : "#ffffff",
                border: isDocApproved
                  ? "1px solid rgba(16, 185, 129, 0.35)"
                  : isDocRevisionRequired
                  ? "1px solid rgba(239, 68, 68, 0.35)"
                  : "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                {/* Card Title & Status Badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "var(--font-size-base)",
                      fontWeight: "var(--font-weight-bold)",
                      color: "var(--color-black)",
                      margin: 0,
                    }}
                  >
                    {label}
                  </h3>

                  {isMissing && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "var(--color-gray-100)",
                        color: "var(--color-gray-600)",
                        border: "1px solid var(--color-gray-300)",
                      }}
                    >
                      مطلوب
                    </span>
                  )}

                  {isDocPending && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                        color: "#4338ca",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                      }}
                    >
                      قيد المراجعة
                    </span>
                  )}

                  {isDocApproved && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "rgba(16, 185, 129, 0.15)",
                        color: "#065f46",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      معتمد ✅
                    </span>
                  )}

                  {isDocRevisionRequired && (
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: "var(--font-weight-medium)",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "#b91c1c",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                      }}
                    >
                      مطلوب تعديل ⚠️
                    </span>
                  )}
                </div>

                <p
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-gray-500)",
                    margin: "0 0 0.75rem 0",
                    lineHeight: 1.4,
                  }}
                >
                  {desc}
                </p>

                {/* File Details if uploaded */}
                {doc && (
                  <div
                    style={{
                      padding: "0.625rem 0.75rem",
                      backgroundColor: "var(--color-gray-50)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-gray-200)",
                      fontSize: "var(--font-size-xs)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        overflow: "hidden",
                      }}
                    >
                      <DynamicIcon name="File" size={14} className="text-gray-500 flex-shrink-0" />
                      <span
                        style={{
                          fontWeight: "var(--font-weight-medium)",
                          color: "var(--color-black)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {doc.file_name}
                      </span>
                    </div>

                    <div style={{ color: "var(--color-gray-500)", fontSize: "11px" }}>
                      <span>{formatFileSize(doc.file_size)}</span> •{" "}
                      <span>{formatDateAr(doc.created_at)}</span>
                    </div>
                  </div>
                )}

                {/* Admin Note if Revision Required (Section 9 & 12) */}
                {isDocRevisionRequired && doc?.review_note && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.625rem 0.75rem",
                      backgroundColor: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--font-size-xs)",
                      color: "#b91c1c",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        fontWeight: "bold",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <DynamicIcon name="AlertTriangle" size={14} />
                      <span>ملاحظة فريق OUT:</span>
                    </div>
                    <p style={{ margin: 0, lineHeight: 1.4 }}>{doc.review_note}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.5rem",
                  paddingTop: "0.75rem",
                  borderTop: "1px solid var(--color-gray-200)",
                }}
              >
                {/* Preview Button */}
                {doc && (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="btn btn--outline"
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <DynamicIcon name="Eye" size={14} />
                    <span>معاينة</span>
                  </button>
                )}

                {/* Upload Button if missing */}
                {isMissing && (
                  <button
                    type="button"
                    onClick={() => openUploadModal(type)}
                    className="btn btn--primary"
                    style={{
                      padding: "0.375rem 0.875rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                    }}
                  >
                    <DynamicIcon name="Upload" size={14} />
                    <span>رفع المستند</span>
                  </button>
                )}

                {/* Replace Button if not approved */}
                {doc && !isDocApproved && (
                  <button
                    type="button"
                    onClick={() => openUploadModal(type)}
                    className={isDocRevisionRequired ? "btn btn--primary" : "btn btn--outline"}
                    style={{
                      padding: "0.375rem 0.875rem",
                      fontSize: "var(--font-size-xs)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      ...(isDocRevisionRequired
                        ? { backgroundColor: "#b91c1c", borderColor: "#b91c1c", color: "#ffffff" }
                        : {}),
                    }}
                  >
                    <DynamicIcon name="RefreshCw" size={14} />
                    <span>{isDocRevisionRequired ? "استبدال المستند المطلوب" : "استبدال"}</span>
                  </button>
                )}

                {/* Locked indicator if approved */}
                {isDocApproved && (
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "#065f46",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <DynamicIcon name="Lock" size={12} />
                    <span>معتمد ومحمي</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload / Replace Modal */}
      {activeUploadType && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "520px",
              width: "100%",
              padding: "1.75rem",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--color-border)",
                paddingBottom: "0.875rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DynamicIcon name="Upload" size={20} className="text-primary" />
                <h3
                  style={{
                    fontSize: "var(--font-size-base)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "var(--color-black)",
                  }}
                >
                  {docMap.get(activeUploadType) ? "استبدال" : "رفع"}{" "}
                  {FINAL_DOCUMENT_TYPE_LABELS[activeUploadType]}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeUploadModal}
                disabled={isSubmitting}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-gray-500)",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging
                    ? "2px dashed var(--color-primary)"
                    : selectedFile
                    ? "2px solid #10b981"
                    : "2px dashed var(--color-gray-300)",
                  borderRadius: "var(--radius-md)",
                  padding: "2rem 1.5rem",
                  textAlign: "center",
                  cursor: "pointer",
                  backgroundColor: isDragging
                    ? "rgba(245, 197, 0, 0.05)"
                    : selectedFile
                    ? "rgba(16, 185, 129, 0.04)"
                    : "var(--color-gray-50)",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />

                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: selectedFile ? "#10b981" : "var(--color-gray-200)",
                    color: selectedFile ? "#ffffff" : "var(--color-gray-600)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 0.75rem",
                  }}
                >
                  <DynamicIcon name={selectedFile ? "Check" : "UploadCloud"} size={24} />
                </div>

                {selectedFile ? (
                  <div>
                    <strong style={{ fontSize: "var(--font-size-sm)", color: "var(--color-black)" }}>
                      {selectedFile.name}
                    </strong>
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-gray-500)",
                        marginTop: "0.25rem",
                      }}
                    >
                      {formatFileSize(selectedFile.size)} • انقر لاختيار ملف آخر
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong style={{ fontSize: "var(--font-size-sm)", color: "var(--color-black)" }}>
                      اسحب الملف هنا أو انقر للتصفح
                    </strong>
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-gray-500)",
                        marginTop: "0.375rem",
                      }}
                    >
                      الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP) بحجم أقصى 20 ميجابايت
                    </span>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    color: "#b91c1c",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    color: "#047857",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  {successMessage}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={isSubmitting}
                  className="btn btn--outline"
                  style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="btn btn--primary"
                  style={{
                    padding: "0.5rem 1.25rem",
                    fontSize: "var(--font-size-sm)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <DynamicIcon name="Loader" size={16} />
                      <span>جاري الرفع...</span>
                    </>
                  ) : (
                    <>
                      <DynamicIcon name="Upload" size={16} />
                      <span>تأكيد الرفع</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
