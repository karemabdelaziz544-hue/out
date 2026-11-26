"use client";

/**
 * Create Shipment Form Component
 *
 * Allows a customer to create a new clearance request or update an existing draft.
 * Supports:
 *  - Save as Draft ('draft')
 *  - Submit Clearance Request ('awaiting_pricing')
 *  - Uploading Preliminary Invoice using existing Shipment Documents system
 *  - Guard against customers with no linked company
 */

import React, { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { createOrSaveShipmentAction } from "@/lib/shipments/actions";
import type { Company, Shipment, DocumentItem } from "@/types";

interface CreateShipmentFormProps {
  company: Company | null;
  initialDraft?: Shipment | null;
  existingDocuments?: DocumentItem[];
}

export function CreateShipmentForm({
  company,
  initialDraft,
  existingDocuments = [],
}: CreateShipmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields State
  const [goodsCategory, setGoodsCategory] = useState<"agricultural" | "industrial" | "">(
    initialDraft?.goods_category === "agricultural" || initialDraft?.goods_category === "industrial"
      ? initialDraft.goods_category
      : "",
  );
  const [supplierName, setSupplierName] = useState(
    initialDraft?.supplier_name || "",
  );
  const [countryOfOrigin, setCountryOfOrigin] = useState(
    initialDraft?.country_of_origin || "",
  );
  const [portOfArrival, setPortOfArrival] = useState(
    initialDraft?.port_of_arrival || "",
  );
  const [goodsDescription, setGoodsDescription] = useState(
    initialDraft?.goods_description || "",
  );
  const [packagesCount, setPackagesCount] = useState<string>(
    initialDraft?.packages_count ? String(initialDraft.packages_count) : "",
  );
  const [packageType, setPackageType] = useState(
    initialDraft?.package_type || "",
  );
  const [grossWeight, setGrossWeight] = useState<string>(
    initialDraft?.gross_weight ? String(initialDraft.gross_weight) : "",
  );
  const [notes, setNotes] = useState(initialDraft?.notes || "");

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Status feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if an invoice is already attached in this draft
  const existingInvoice = existingDocuments.find(
    (d) =>
      d.document_type === "فاتورة مبدئية" ||
      d.document_type === "preliminary_invoice" ||
      d.title.includes("فاتورة"),
  );

  // If customer has NO company, display the blocking requirement banner
  if (!company) {
    return (
      <div
        className="card"
        style={{
          padding: "2.5rem 1.5rem",
          textAlign: "center",
          maxWidth: "680px",
          margin: "2rem auto",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "var(--color-yellow-light)",
            color: "var(--color-yellow-dark)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <DynamicIcon name="Building2" size={28} />
        </div>
        <h2
          style={{
            fontSize: "var(--font-size-xl)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-black)",
            marginBottom: "0.75rem",
          }}
        >
          بيانات الشركة غير مكتملة
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-base)",
            color: "var(--color-gray-600)",
            lineHeight: 1.6,
            marginBottom: "1.75rem",
          }}
        >
          يرجى استكمال بيانات الشركة أولًا قبل إنشاء طلب تخليص شحنة.
        </p>
        <Link
          href="/company"
          className="btn btn--primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1.75rem",
            fontSize: "var(--font-size-base)",
            textDecoration: "none",
          }}
        >
          <DynamicIcon name="Building2" size={18} />
          <span>استكمال بيانات الشركة</span>
        </Link>
      </div>
    );
  }

  const validateAndSetFile = (file: File) => {
    setFileError(null);
    const MAX_SIZE = 20 * 1024 * 1024;
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (file.size > MAX_SIZE) {
      setFileError("حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت).");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      setFileError(
        "نوع الملف غير مدعوم. يرجى اختيار ملف PDF أو صورة (JPG, PNG, WebP).",
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    validateAndSetFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleAction = (actionType: "draft" | "submit") => {
    setErrorMessage(null);
    setFileError(null);
    setSuccessMessage(null);

    // Submission client validation
    if (actionType === "submit") {
      if (!goodsCategory) {
        setErrorMessage("يرجى اختيار نوع الشحنة (زراعية أو صناعية).");
        return;
      }
      if (!goodsDescription.trim()) {
        setErrorMessage("يرجى إدخال وصف مختصر للبضاعة.");
        return;
      }
      if (!supplierName.trim()) {
        setErrorMessage("يرجى إدخال اسم المورد.");
        return;
      }
      if (!countryOfOrigin.trim()) {
        setErrorMessage("يرجى إدخال بلد المنشأ.");
        return;
      }
      if (!portOfArrival.trim()) {
        setErrorMessage("يرجى إدخال ميناء الوصول.");
        return;
      }
      if (!selectedFile && !existingInvoice) {
        setErrorMessage("يرجى رفع الفاتورة المبدئية لإتمام إرسال طلب التخليص.");
        return;
      }
    }

    const formData = new FormData();
    if (initialDraft?.id) {
      formData.append("shipment_id", initialDraft.id);
    }
    formData.append("action_type", actionType);
    formData.append("goods_category", goodsCategory);
    formData.append("supplier_name", supplierName);
    formData.append("country_of_origin", countryOfOrigin);
    formData.append("port_of_arrival", portOfArrival);
    formData.append("goods_description", goodsDescription);
    if (packagesCount) formData.append("packages_count", packagesCount);
    if (packageType) formData.append("package_type", packageType);
    if (grossWeight) formData.append("gross_weight", grossWeight);
    if (notes) formData.append("notes", notes);

    if (selectedFile) {
      formData.append("preliminary_invoice", selectedFile);
    }

    startTransition(async () => {
      const res = await createOrSaveShipmentAction(formData);
      if (res.success) {
        setSuccessMessage(res.message || "تمت العملية بنجاح.");
        setTimeout(() => {
          if (res.shipmentId) {
            router.push(`/my-shipments/${res.shipmentId}`);
          } else {
            router.push("/my-shipments");
          }
        }, 1200);
      } else {
        setErrorMessage(res.error || "تعذر إتمام العملية.");
      }
    });
  };

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header Banner */}
      <div
        className="card"
        style={{
          padding: "1.75rem",
          marginBottom: "1.5rem",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "0.5rem" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-yellow-light)",
              color: "var(--color-yellow-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="PackagePlus" size={24} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "var(--font-size-2xl)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-black)",
                margin: 0,
              }}
            >
              إنشاء طلب تخليص شحنة
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                margin: "0.25rem 0 0 0",
              }}
            >
              أدخل البيانات الأولية للشحنة وارفع الفاتورة المبدئية حتى نتمكن من مراجعة الطلب وتقديم عرض السعر.
            </p>
          </div>
        </div>

        {/* Linked Company Indicator */}
        <div
          style={{
            marginTop: "1rem",
            padding: "0.625rem 0.875rem",
            backgroundColor: "var(--color-gray-50)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "var(--color-gray-500)" }}>الشركة التابعة:</span>
            <strong style={{ color: "var(--color-black)" }}>{company.name}</strong>
          </div>
          <span style={{ color: "var(--color-gray-500)" }}>
            رقم السجل: {company.commercial_registration_number || "—"}
          </span>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div
          className="customers-error-banner"
          style={{ marginBottom: "1.25rem" }}
          role="alert"
        >
          <DynamicIcon name="AlertCircle" size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            marginBottom: "1.25rem",
            padding: "0.875rem 1rem",
            backgroundColor: "var(--color-yellow-light)",
            border: "1px solid rgba(245, 197, 0, 0.4)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-black)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: "var(--font-weight-medium)",
          }}
          role="status"
        >
          <DynamicIcon name="CheckCircle" size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Progress Step Guide */}
      <div
        className="card"
        style={{
          padding: "1rem 1.5rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "var(--color-black)",
              color: "var(--color-white)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-bold)",
            }}
          >
            1
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
              بيانات الشحنة
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-gray-500)" }}>
              المورد والمنشأ والميناء
            </div>
          </div>
        </div>

        <div style={{ width: "24px", height: "1px", backgroundColor: "var(--color-border)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: (selectedFile || existingInvoice) ? "var(--color-black)" : "var(--color-gray-200)",
              color: (selectedFile || existingInvoice) ? "var(--color-white)" : "var(--color-gray-600)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-bold)",
            }}
          >
            2
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
              الفاتورة المبدئية
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-gray-500)" }}>
              {(selectedFile || existingInvoice) ? "تم إرفاق الملف ✓" : "مطلوبة للتسعير"}
            </div>
          </div>
        </div>

        <div style={{ width: "24px", height: "1px", backgroundColor: "var(--color-border)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "var(--color-yellow)",
              color: "var(--color-black)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-bold)",
            }}
          >
            3
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
              المراجعة والتسعير
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-gray-500)" }}>
              تقديم عرض السعر
            </div>
          </div>
        </div>
      </div>

      {/* Main Form Form Card */}
      <div
        className="card"
        style={{
          padding: "1.75rem",
          border: "1px solid var(--color-border)",
        }}
      >
        <form onSubmit={(e) => e.preventDefault()}>
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-black)",
              marginBottom: "1.25rem",
              borderBottom: "1px solid var(--color-border)",
              paddingBottom: "0.75rem",
            }}
          >
            البيانات الأولية للشحنة
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.25rem",
              marginBottom: "1.25rem",
            }}
          >
            {/* Goods Category (Agricultural / Industrial) */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.5rem",
                }}
              >
                نوع الشحنة <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setGoodsCategory("agricultural")}
                  disabled={isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.875rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: goodsCategory === "agricultural" ? "2px solid var(--color-black)" : "1px solid var(--color-border)",
                    backgroundColor: goodsCategory === "agricultural" ? "var(--color-yellow-light)" : "var(--color-surface)",
                    cursor: isPending ? "not-allowed" : "pointer",
                    textAlign: "right",
                    transition: "all 0.15s ease",
                  }}
                >
                  <DynamicIcon name="Sprout" size={20} />
                  <div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                      شحنة زراعية
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-gray-600)" }}>
                      محاصيل، حبوب، أغذية، منتجات زراعية
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setGoodsCategory("industrial")}
                  disabled={isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.875rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: goodsCategory === "industrial" ? "2px solid var(--color-black)" : "1px solid var(--color-border)",
                    backgroundColor: goodsCategory === "industrial" ? "var(--color-yellow-light)" : "var(--color-surface)",
                    cursor: isPending ? "not-allowed" : "pointer",
                    textAlign: "right",
                    transition: "all 0.15s ease",
                  }}
                >
                  <DynamicIcon name="Factory" size={20} />
                  <div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                      شحنة صناعية
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-gray-600)" }}>
                      آلات، مستلزمات إنتاج، قطع غيار، بضائع مصنعة
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Goods Description */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                htmlFor="goods_description"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                وصف مختصر للبضاعة <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <textarea
                id="goods_description"
                name="goods_description"
                rows={2}
                value={goodsDescription}
                onChange={(e) => setGoodsDescription(e.target.value)}
                placeholder="مثال: قطع غيار سيارات، ملابس قطنية، مواد غذائية..."
                className="customers-search-box__input"
                style={{ width: "100%", minHeight: "70px", resize: "vertical" }}
                disabled={isPending}
              />
            </div>

            {/* Supplier Name */}
            <div>
              <label
                htmlFor="supplier_name"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                اسم المورد <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <input
                type="text"
                id="supplier_name"
                name="supplier_name"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="مثال: Shanghai Trading Co."
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              />
            </div>

            {/* Country of Origin */}
            <div>
              <label
                htmlFor="country_of_origin"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                بلد المنشأ <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <input
                type="text"
                id="country_of_origin"
                name="country_of_origin"
                value={countryOfOrigin}
                onChange={(e) => setCountryOfOrigin(e.target.value)}
                placeholder="مثال: الصين، تركيا، ألمانيا..."
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              />
            </div>

            {/* Port of Arrival */}
            <div>
              <label
                htmlFor="port_of_arrival"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                ميناء الوصول <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <input
                type="text"
                id="port_of_arrival"
                name="port_of_arrival"
                value={portOfArrival}
                onChange={(e) => setPortOfArrival(e.target.value)}
                placeholder="مثال: ميناء الإسكندرية، ميناء العين السخنة..."
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              />
            </div>

            {/* Packages Count */}
            <div>
              <label
                htmlFor="packages_count"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                عدد الطرود
              </label>
              <input
                type="number"
                min="0"
                id="packages_count"
                name="packages_count"
                value={packagesCount}
                onChange={(e) => setPackagesCount(e.target.value)}
                placeholder="مثال: 50"
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              />
            </div>

            {/* Package Type */}
            <div>
              <label
                htmlFor="package_type"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                نوع الطرود
              </label>
              <input
                type="text"
                id="package_type"
                name="package_type"
                value={packageType}
                onChange={(e) => setPackageType(e.target.value)}
                placeholder="مثال: كرتونة، حاوية 20 قدم، طبلية..."
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              />
            </div>

            {/* Gross Weight */}
            <div>
              <label
                htmlFor="gross_weight"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                الوزن الإجمالي (كجم)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                id="gross_weight"
                name="gross_weight"
                value={grossWeight}
                onChange={(e) => setGrossWeight(e.target.value)}
                placeholder="مثال: 1250.5"
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: "1.75rem" }}>
            <label
              htmlFor="notes"
              style={{
                display: "block",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)",
                marginBottom: "0.375rem",
              }}
            >
              ملاحظات إضافية
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تعليمات أو ملاحظات خاصة بالشحنة..."
              className="customers-search-box__input"
              style={{ width: "100%", minHeight: "60px", resize: "vertical" }}
              disabled={isPending}
            />
          </div>

          {/* Preliminary Invoice Upload Section */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              marginBottom: "2rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5rem" }}>
              <DynamicIcon name="FileText" size={20} />
              <h3
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-semibold)",
                  margin: 0,
                }}
              >
                الفاتورة المبدئية (Preliminary Invoice) <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </h3>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-600)",
                marginBottom: "1rem",
              }}
            >
              ارفع الفاتورة المبدئية الصادرة من المورد لمراجعة الطلب وتقديم التسعير المناسب. (الصيغ المسموحة: PDF، JPG، PNG، WebP بحجم أقصى 20 ميجابايت).
            </p>

            {existingInvoice && !selectedFile && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <DynamicIcon name="CheckCircle" size={16} />
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                    تم رفع: {existingInvoice.file_name || existingInvoice.title}
                  </span>
                </div>
                {existingInvoice.file_url && (
                  <a
                    href={existingInvoice.file_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-black)",
                      textDecoration: "underline",
                    }}
                  >
                    معاينة الملف
                  </a>
                )}
              </div>
            )}

            <div>
              <input
                ref={fileInputRef}
                type="file"
                id="preliminary_invoice"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={isPending}
                style={{ display: "none" }}
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isPending && fileInputRef.current?.click()}
                style={{
                  border: isDragging
                    ? "2px dashed var(--color-black)"
                    : selectedFile
                    ? "2px solid #10b981"
                    : "2px dashed var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.75rem 1.25rem",
                  textAlign: "center",
                  backgroundColor: isDragging
                    ? "var(--color-yellow-light)"
                    : selectedFile
                    ? "#f0fdf4"
                    : "var(--color-surface)",
                  cursor: isPending ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: selectedFile ? "#dcfce7" : "var(--color-gray-100)",
                    color: selectedFile ? "#16a34a" : "var(--color-gray-600)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 0.75rem",
                  }}
                >
                  <DynamicIcon name={selectedFile ? "FileCheck" : "UploadCloud"} size={24} />
                </div>

                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "#166534" }}>
                      تم تحديد الملف: {selectedFile.name}
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", marginTop: "0.25rem" }}>
                      الحجم: {(selectedFile.size / 1024 / 1024).toFixed(2)} ميجابايت • انقر أو اسحب لتغيير الملف
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                      اسحب وأفلت ملف الفاتورة المبدئية هنا، أو انقر للاختيار
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                      يدعم PDF و JPG و PNG و WebP (الحد الأقصى 20 ميجابايت)
                    </div>
                  </div>
                )}
              </div>

              {fileError && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    fontSize: "var(--font-size-xs)",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <DynamicIcon name="AlertCircle" size={14} />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Form Actions: Save Draft vs Submit */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
              borderTop: "1px solid var(--color-border)",
              paddingTop: "1.25rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {/* Submit Clearance Request */}
              <button
                type="button"
                onClick={() => handleAction("submit")}
                disabled={isPending}
                className="btn btn--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.75rem",
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-semibold)",
                }}
              >
                {isPending ? (
                  <>
                    <DynamicIcon name="Loader2" size={18} />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Send" size={18} />
                    <span>إرسال طلب التخليص</span>
                  </>
                )}
              </button>

              {/* Save Draft */}
              <button
                type="button"
                onClick={() => handleAction("draft")}
                disabled={isPending}
                className="btn btn--secondary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.25rem",
                  fontSize: "var(--font-size-base)",
                }}
              >
                <DynamicIcon name="Save" size={18} />
                <span>حفظ كمسودة</span>
              </button>
            </div>

            <Link
              href="/my-shipments"
              className="btn btn--ghost"
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                textDecoration: "none",
              }}
            >
              إلغاء والعودة
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
