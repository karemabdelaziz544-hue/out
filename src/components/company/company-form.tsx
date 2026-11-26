"use client";

/**
 * Company Form Component
 *
 * Handles viewing, editing, and saving company attributes.
 * Shows loading state, validation feedback, and success notifications.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { saveCustomerCompanyAction } from "@/lib/company/actions";
import type { Company } from "@/types";

interface CompanyFormProps {
  initialCompany: Company | null;
}

export function CompanyForm({ initialCompany }: CompanyFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state for all fields
  const [name, setName] = useState(initialCompany?.name || "");
  const [commercialRegNumber, setCommercialRegNumber] = useState(
    initialCompany?.commercial_registration_number || "",
  );
  const [taxCardNumber, setTaxCardNumber] = useState(
    initialCompany?.tax_card_number || "",
  );
  const [importCardNumber, setImportCardNumber] = useState(
    initialCompany?.import_card_number || "",
  );
  const [vatNumber, setVatNumber] = useState(initialCompany?.vat_number || "");
  const [phone, setPhone] = useState(initialCompany?.phone || "");
  const [email, setEmail] = useState(initialCompany?.email || "");
  const [address, setAddress] = useState(initialCompany?.address || "");

  // Notification / Feedback states
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side quick validation
    if (!name.trim()) {
      setErrorMessage("اسم الشركة مطلوب ولا يمكن تركه فارغاً.");
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("البريد الإلكتروني للشركة غير صحيح.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("commercial_registration_number", commercialRegNumber);
    formData.append("tax_card_number", taxCardNumber);
    formData.append("import_card_number", importCardNumber);
    formData.append("vat_number", vatNumber);
    formData.append("phone", phone);
    formData.append("email", email);
    formData.append("address", address);

    startTransition(async () => {
      const res = await saveCustomerCompanyAction(formData);
      if (res.success) {
        showToast(res.message || "تم حفظ بيانات الشركة بنجاح.");
        if (res.company) {
          setName(res.company.name || "");
          setCommercialRegNumber(res.company.commercial_registration_number || "");
          setTaxCardNumber(res.company.tax_card_number || "");
          setImportCardNumber(res.company.import_card_number || "");
          setVatNumber(res.company.vat_number || "");
          setPhone(res.company.phone || "");
          setEmail(res.company.email || "");
          setAddress(res.company.address || "");
        }
        router.refresh();
      } else {
        setErrorMessage(res.error || "تعذر حفظ بيانات الشركة.");
      }
    });
  };

  return (
    <>
      <div
        className="card"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-xs)",
          overflow: "hidden",
        }}
      >
        {/* Card Header */}
        <div
          style={{
            padding: "var(--space-5) var(--space-6)",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-gray-100)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-primary)",
              }}
            >
              <DynamicIcon name="Building2" size={18} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                بيانات الشركة
              </h2>
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-text-secondary)",
                  margin: 0,
                  marginTop: "2px",
                }}
              >
                المعلومات التجارية والضريبية الرسمية لشركتك
              </p>
            </div>
          </div>
        </div>

        {/* Card Content & Form */}
        <form onSubmit={handleSubmit} style={{ padding: "var(--space-6)" }}>
          {/* Error Alert */}
          {errorMessage && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#fef2f2",
                border: "1px solid #fee2e2",
                color: "#991b1b",
                fontSize: "var(--font-size-xs)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1.5rem",
              }}
              role="alert"
            >
              <DynamicIcon name="AlertCircle" size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {/* 1. Company Name */}
            <div className="input-group">
              <label htmlFor="company-name" className="input-group__label">
                اسم الشركة <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                id="company-name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: شركة النيل للتجارة والاستيراد"
                className="input-group__input"
                disabled={isPending}
                required
              />
            </div>

            {/* 2. Commercial Registration Number */}
            <div className="input-group">
              <label htmlFor="company-crn" className="input-group__label">
                رقم السجل التجاري
              </label>
              <input
                id="company-crn"
                name="commercial_registration_number"
                type="text"
                value={commercialRegNumber}
                onChange={(e) => setCommercialRegNumber(e.target.value)}
                placeholder="مثال: 123456"
                className="input-group__input"
                disabled={isPending}
              />
            </div>

            {/* 3. Tax Card Number */}
            <div className="input-group">
              <label htmlFor="company-tax" className="input-group__label">
                رقم البطاقة الضريبية
              </label>
              <input
                id="company-tax"
                name="tax_card_number"
                type="text"
                value={taxCardNumber}
                onChange={(e) => setTaxCardNumber(e.target.value)}
                placeholder="مثال: 987-654-321"
                className="input-group__input"
                disabled={isPending}
              />
            </div>

            {/* 4. Import Card Number */}
            <div className="input-group">
              <label htmlFor="company-imp" className="input-group__label">
                رقم البطاقة الاستيرادية
              </label>
              <input
                id="company-imp"
                name="import_card_number"
                type="text"
                value={importCardNumber}
                onChange={(e) => setImportCardNumber(e.target.value)}
                placeholder="مثال: 54321"
                className="input-group__input"
                disabled={isPending}
              />
            </div>

            {/* 5. VAT Number */}
            <div className="input-group">
              <label htmlFor="company-vat" className="input-group__label">
                رقم القيمة المضافة
              </label>
              <input
                id="company-vat"
                name="vat_number"
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="مثال: 100200300"
                className="input-group__input"
                disabled={isPending}
              />
            </div>

            {/* 6. Phone Number */}
            <div className="input-group">
              <label htmlFor="company-phone" className="input-group__label">
                رقم الهاتف
              </label>
              <input
                id="company-phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثال: +20 10 1234 5678"
                className="input-group__input"
                disabled={isPending}
                style={{ direction: "ltr", textAlign: "right" }}
              />
            </div>

            {/* 7. Email Address */}
            <div className="input-group">
              <label htmlFor="company-email" className="input-group__label">
                البريد الإلكتروني للشركة
              </label>
              <input
                id="company-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="مثال: info@company.com"
                className="input-group__input"
                disabled={isPending}
                style={{ direction: "ltr", textAlign: "right" }}
              />
            </div>

            {/* 8. Address — spans 2 columns on wide screens */}
            <div
              className="input-group"
              style={{
                gridColumn: "1 / -1",
              }}
            >
              <label htmlFor="company-address" className="input-group__label">
                عنوان الشركة
              </label>
              <textarea
                id="company-address"
                name="address"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="العنوان التفصيلي، المحافظة، والرمز البريدي"
                className="input-group__input"
                disabled={isPending}
                style={{
                  resize: "vertical",
                  minHeight: "80px",
                  lineHeight: 1.5,
                }}
              />
            </div>
          </div>

          {/* Form Actions Footer */}
          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}
          >
            <button
              type="submit"
              disabled={isPending}
              className="customer-action-btn customer-action-btn--toggle-activate"
              style={{
                padding: "0.625rem 1.75rem",
                fontWeight: 600,
                fontSize: "var(--font-size-sm)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <DynamicIcon name={isPending ? "Clock" : "Check"} size={16} />
              <span>{isPending ? "جاري الحفظ..." : "حفظ التعديلات"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Success Toast */}
      {toastMessage && (
        <div className="feedback-toast feedback-toast--success" role="status">
          <DynamicIcon name="Check" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
