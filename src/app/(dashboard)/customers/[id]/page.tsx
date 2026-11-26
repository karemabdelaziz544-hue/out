/**
 * Customer Details Page
 *
 * Route: /customers/[id]
 * Strictly requires admin role.
 */

import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getCustomerById } from "@/lib/customers/queries";
import { getCompanyById } from "@/lib/company/queries";
import { getCompanyDocumentsByCompanyId } from "@/lib/company-documents/queries";
import { getCustomerDocuments } from "@/lib/documents/queries";
import { Avatar } from "@/components/ui/avatar";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import {
  CustomerDetailsActions,
  CustomerCompanyCard,
  CustomerCompanyDocumentsSection,
} from "@/components/customers";
import { CustomerDocumentsSection } from "@/components/documents";

interface CustomerDetailsPageProps {
  params: Promise<{ id: string }>;
}

export const instant = false;

export async function generateMetadata({
  params,
}: CustomerDetailsPageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const customer = await getCustomerById(id);
  const name = customer?.full_name || customer?.email || "تفاصيل العميل";
  return {
    title: `${name} | العملاء | OUT`,
  };
}

export default async function CustomerDetailsPage({
  params,
}: CustomerDetailsPageProps) {
  await connection();

  // 1. Enforce admin role server-side
  await requireRole(["admin"]);

  // 2. Fetch customer
  const { id } = await params;
  const customer = await getCustomerById(id);

  // 3. Not Found State
  if (!customer) {
    return (
      <div className="customers-container">
        <div style={{ marginBottom: "1rem" }}>
          <Link
            href="/customers"
            className="customer-action-btn"
            style={{ display: "inline-flex", gap: "0.5rem" }}
          >
            <DynamicIcon name="ArrowRight" size={16} />
            <span>العودة إلى قائمة العملاء</span>
          </Link>
        </div>

        <div className="customers-table-card">
          <div className="customers-state-box">
            <div className="customers-state-box__icon">
              <DynamicIcon name="UserX" size={28} />
            </div>
            <h2 className="customers-state-box__title">العميل غير موجود</h2>
            <p className="customers-state-box__desc">
              لم يتم العثور على حساب عميل بهذا المعرّف، أو ربما تم حذفه.
            </p>
            <Link
              href="/customers"
              className="customer-action-btn"
              style={{ marginTop: "0.5rem", padding: "0.5rem 1.5rem" }}
            >
              العودة إلى العملاء
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Fetch company, company documents, and shipment documents in parallel
  const [company, companyDocsSummary, customerDocs] = await Promise.all([
    customer.company_id ? getCompanyById(customer.company_id) : Promise.resolve(null),
    customer.company_id
      ? getCompanyDocumentsByCompanyId(customer.company_id)
      : Promise.resolve({
          documents: {
            commercial_registration: null,
            tax_card: null,
            import_card: null,
            vat: null,
          },
          totalCount: 4,
          completedCount: 0,
          approvedCount: 0,
          remainingCount: 4,
          isAllUploaded: false,
          isAllApproved: false,
        }),
    getCustomerDocuments(id),
  ]);

  const displayName = customer.full_name || "بدون اسم";
  const phone = customer.phone || "—";
  const createdAtFormatted = formatDateAr(customer.created_at);
  const updatedAtFormatted = customer.updated_at
    ? formatDateAr(customer.updated_at)
    : "—";

  return (
    <div className="customers-container">
      {/* Back Button */}
      <div>
        <Link
          href="/customers"
          className="customer-action-btn"
          style={{ display: "inline-flex", gap: "0.5rem" }}
        >
          <DynamicIcon name="ArrowRight" size={16} />
          <span>العودة إلى قائمة العملاء</span>
        </Link>
      </div>

      {/* Main Details Card */}
      <div className="customer-details-card">
        {/* Header Profile Section */}
        <div className="customer-details-header">
          <div className="customer-details-profile">
            <Avatar name={displayName} src={customer.avatar_url} size="lg" />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    fontWeight: 700,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  بيانات العميل
                </span>
              </div>
              <h1
                style={{
                  fontSize: "var(--font-size-xl)",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: "0.25rem",
                }}
              >
                {displayName}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  className={`status-badge ${
                    customer.is_active
                      ? "status-badge--active"
                      : "status-badge--inactive"
                  }`}
                >
                  <span className="status-badge__dot" aria-hidden="true" />
                  {customer.is_active ? "حساب نشط" : "حساب غير نشط"}
                </span>

                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  (عميل مسجل)
                </span>
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          <CustomerDetailsActions customer={customer} />
        </div>

        {/* Data Attributes Grid */}
        <div className="customer-details-grid">
          {/* Full Name */}
          <div className="customer-details-field">
            <span className="customer-details-field__label">الاسم بالكامل</span>
            <span className="customer-details-field__val">{displayName}</span>
          </div>

          {/* Email */}
          <div className="customer-details-field">
            <span className="customer-details-field__label">البريد الإلكتروني</span>
            <span
              className="customer-details-field__val"
              dir="ltr"
              style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
            >
              {customer.email}
            </span>
          </div>

          {/* Phone */}
          <div className="customer-details-field">
            <span className="customer-details-field__label">رقم الموبايل</span>
            <span
              className="customer-details-field__val"
              dir="ltr"
              style={{ textAlign: "right", fontFamily: "var(--font-family-mono)" }}
            >
              {phone}
            </span>
          </div>

          {/* Account Status */}
          <div className="customer-details-field">
            <span className="customer-details-field__label">حالة الحساب</span>
            <span className="customer-details-field__val">
              {customer.is_active ? "نشط ومفعّل" : "معطّل (غير نشط)"}
            </span>
          </div>

          {/* Created At */}
          <div className="customer-details-field">
            <span className="customer-details-field__label">تاريخ إنشاء الحساب</span>
            <span className="customer-details-field__val">{createdAtFormatted}</span>
          </div>

          {/* Updated At */}
          <div className="customer-details-field">
            <span className="customer-details-field__label">آخر تحديث للملف</span>
            <span className="customer-details-field__val">{updatedAtFormatted}</span>
          </div>

          {/* User ID (UUID) */}
          <div
            className="customer-details-field"
            style={{ gridColumn: "1 / -1" }}
          >
            <span className="customer-details-field__label">
              معرّف الحساب (System UUID)
            </span>
            <span
              className="customer-details-field__val"
              dir="ltr"
              style={{
                fontFamily: "var(--font-family-mono)",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-text-secondary)",
              }}
            >
              {customer.id}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Company Information Card (بيانات الشركة) */}
      <CustomerCompanyCard company={company} />

      {/* 3. Company Documents Section (مستندات الشركة) */}
      <CustomerCompanyDocumentsSection
        documentsMap={companyDocsSummary.documents}
        completedCount={companyDocsSummary.completedCount}
        totalCount={companyDocsSummary.totalCount}
        company={company}
        customer={customer}
      />

      {/* 4. Shipment Documents Section (مستندات الشحنات) */}
      <CustomerDocumentsSection documents={customerDocs.documents} />
    </div>
  );
}
