import { DynamicIcon } from "@/components/ui/icon";
import type { Company } from "@/types";

interface CompanyStatusBannerProps {
  company: Company | null;
}

export function CompanyStatusBanner({ company }: CompanyStatusBannerProps) {
  if (!company) {
    return (
      <div
        style={{
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "#fffbeb",
          border: "1px solid #fde68a",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.875rem",
        }}
        role="status"
      >
        <div
          style={{
            color: "#b45309",
            backgroundColor: "#fef3c7",
            padding: "0.375rem",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DynamicIcon name="AlertCircle" size={20} />
        </div>
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "var(--font-size-sm)",
              color: "#92400e",
              marginBottom: "0.25rem",
            }}
          >
            لم يتم إعداد بيانات الشركة بعد
          </div>
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "#b45309",
              lineHeight: 1.5,
            }}
          >
            يرجى تسجيل بيانات شركتك الأساسية حتى تتمكن من إنشاء طلب تخليص شحنة وإدارة المعاملات الجمركية.
          </div>
        </div>
      </div>
    );
  }

  // Essential clearance fields
  const coreFields = [
    { label: "اسم الشركة", value: company.name },
    { label: "رقم السجل التجاري", value: company.commercial_registration_number },
    { label: "رقم البطاقة الضريبية", value: company.tax_card_number },
    { label: "رقم البطاقة الاستيرادية", value: company.import_card_number },
    { label: "رقم القيمة المضافة", value: company.vat_number },
  ];

  const missingFields = coreFields.filter((f) => !f.value || !f.value.trim());
  const isComplete = missingFields.length === 0;

  if (isComplete) {
    return (
      <div
        style={{
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-yellow-light)",
          border: "1px solid #fde68a",
          display: "flex",
          alignItems: "center",
          gap: "0.875rem",
        }}
        role="status"
      >
        <div
          style={{
            color: "var(--color-yellow-dark)",
            backgroundColor: "#ffffff",
            padding: "0.375rem",
            borderRadius: "var(--radius-full)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <DynamicIcon name="Check" size={18} />
        </div>
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "var(--font-size-sm)",
              color: "#78350f",
            }}
          >
            بيانات الشركة مكتملة ✓
          </div>
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "#92400e",
              marginTop: "0.125rem",
            }}
          >
            كافة البيانات الأساسية مسجلة وجاهزة لإجراءات الشحنات والتخليص الجمركي.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "#fffbeb",
        border: "1px solid #fde68a",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.875rem",
      }}
      role="status"
    >
      <div
        style={{
          color: "#b45309",
          backgroundColor: "#fef3c7",
          padding: "0.375rem",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <DynamicIcon name="Clock" size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: "var(--font-size-sm)",
              color: "#92400e",
            }}
          >
            بيانات الشركة غير مكتملة ({coreFields.length - missingFields.length} من {coreFields.length})
          </div>
        </div>
        <div
          style={{
            fontSize: "var(--font-size-xs)",
            color: "#b45309",
            marginTop: "0.25rem",
            lineHeight: 1.5,
          }}
        >
          أكمل بيانات الشركة حتى تتمكن من إنشاء طلب تخليص شحنة.
          {missingFields.length > 0 && (
            <span style={{ fontWeight: 600 }}>
              {" "}
              (الحقول الناقصة: {missingFields.map((f) => f.label).join("، ")})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
