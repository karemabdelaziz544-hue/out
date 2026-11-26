"use client";

/**
 * Customer Company Card Component
 *
 * Displays the customer's linked company information within the Admin /customers/[id] page.
 * Follows the exact OUT design tokens and responsive layout.
 */

import { DynamicIcon } from "@/components/ui/icon";
import type { Company } from "@/types";

interface CustomerCompanyCardProps {
  company: Company | null;
}

export function CustomerCompanyCard({ company }: CustomerCompanyCardProps) {
  if (!company) {
    return (
      <div className="customer-details-card" style={{ marginTop: "1.5rem" }}>
        <div className="customer-details-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DynamicIcon name="Building2" size={20} />
            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
              }}
            >
              بيانات الشركة
            </h2>
          </div>
        </div>

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
          <DynamicIcon name="Building" size={32} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
          <p style={{ fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            لم يتم تسجيل بيانات الشركة بعد
          </p>
          <p style={{ fontSize: "var(--font-size-xs)" }}>
            لم يقم هذا العميل بإدخال بيانات شركته الأساسية على المنصة حتى الآن.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-details-card" style={{ marginTop: "1.5rem" }}>
      {/* Header */}
      <div className="customer-details-header">
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
            <DynamicIcon name="Building2" size={20} />
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
                color: "var(--color-text-muted)",
                margin: "0.2rem 0 0",
              }}
            >
              البيانات المسجلة للشركة والخاصة بإجراءات التخليص الجمركي والشحنات.
            </p>
          </div>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.25rem 0.65rem",
            borderRadius: "var(--radius-full)",
            fontSize: "var(--font-size-xs)",
            fontWeight: 600,
            backgroundColor: "#ecfdf5",
            color: "#065f46",
            border: "1px solid #a7f3d0",
          }}
        >
          <DynamicIcon name="CheckCircle2" size={13} />
          شركة مسجلة
        </span>
      </div>

      {/* Grid of Company Attributes */}
      <div className="customer-details-grid">
        {/* 1. Company Name */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">اسم الشركة</span>
          <span className="customer-details-field__val">{company.name}</span>
        </div>

        {/* 2. Commercial Registration Number */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">رقم السجل التجاري</span>
          <span
            className="customer-details-field__val"
            dir="ltr"
            style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
          >
            {company.commercial_registration_number || "—"}
          </span>
        </div>

        {/* 3. Tax Card Number */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">رقم البطاقة الضريبية</span>
          <span
            className="customer-details-field__val"
            dir="ltr"
            style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
          >
            {company.tax_card_number || "—"}
          </span>
        </div>

        {/* 4. Import Card Number */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">رقم البطاقة الاستيرادية</span>
          <span
            className="customer-details-field__val"
            dir="ltr"
            style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
          >
            {company.import_card_number || "—"}
          </span>
        </div>

        {/* 5. VAT Number */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">رقم القيمة المضافة</span>
          <span
            className="customer-details-field__val"
            dir="ltr"
            style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
          >
            {company.vat_number || "—"}
          </span>
        </div>

        {/* 6. Company Phone */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">هاتف الشركة</span>
          <span
            className="customer-details-field__val"
            dir="ltr"
            style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
          >
            {company.phone || "—"}
          </span>
        </div>

        {/* 7. Company Email */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">البريد الإلكتروني للشركة</span>
          <span
            className="customer-details-field__val"
            dir="ltr"
            style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
          >
            {company.email || "—"}
          </span>
        </div>

        {/* 8. Address */}
        <div className="customer-details-field">
          <span className="customer-details-field__label">العنوان</span>
          <span className="customer-details-field__val">
            {company.address || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
