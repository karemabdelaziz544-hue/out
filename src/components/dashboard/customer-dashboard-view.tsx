"use client";

import React from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import { ShipmentStatusBadge } from "@/components/shipments/shipment-status-badge";
import { formatDateAr } from "@/lib/utils";
import type { Shipment, Company } from "@/types";

interface CustomerDashboardViewProps {
  displayName: string;
  company: Company | null;
  shipments: Shipment[];
}

export function CustomerDashboardView({
  displayName,
  company,
  shipments,
}: CustomerDashboardViewProps) {
  // Calculations based on real database records
  const totalShipments = shipments.length;
  const draftCount = shipments.filter((s) => s.status === "draft").length;
  const readyCount = shipments.filter((s) => s.status === "ready_for_external_stage").length;
  const inProgressCount = shipments.filter(
    (s) => s.status !== "draft" && s.status !== "ready_for_external_stage",
  ).length;

  // Identify shipments requiring immediate customer attention
  const attentionShipments = shipments.filter((s) =>
    ["price_proposed", "invoice_revision_required", "awaiting_shipment_documents"].includes(s.status),
  );

  // Recent shipments sorted by update date
  const recentShipments = [...shipments]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const getAttentionMessage = (status: string) => {
    switch (status) {
      case "price_proposed":
        return {
          title: "عرض سعر جديد متاح لمراجعتك",
          desc: "قدمت الإدارة عرض سعر لهذه الشحنة. يرجى مراجعته واعتماده أو طلب التفاوض.",
          icon: "Banknote",
          badge: "مطلوب موافقة السعر",
          actionText: "مراجعة السعر",
        };
      case "invoice_revision_required":
        return {
          title: "مطلوب تعديل الفاتورة المبدئية",
          desc: "طلبت الإدارة تعديلات على الفاتورة المبدئية. يرجى استبدالها لمواصلة الإجراءات.",
          icon: "AlertTriangle",
          badge: "مطلوب تعديل الفاتورة",
          actionText: "استبدال الفاتورة",
        };
      case "awaiting_shipment_documents":
        return {
          title: "مطلوب رفع المستندات النهائية للشحنة",
          desc: "صدر كود ACID بنجاح. يرجى رفع الفاتورة التجارية، قائمة التعبئة، بوليصة الشحن، وشهادة المنشأ.",
          icon: "FileUp",
          badge: "مطلوب مستندات الشحنة",
          actionText: "رفع المستندات",
        };
      default:
        return {
          title: "إجراء مطلوب",
          desc: "يرجى متابعة تفاصيل الشحنة لاستكمال الإجراءات.",
          icon: "AlertCircle",
          badge: "إجراء مطلوب",
          actionText: "عرض الشحنة",
        };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ─── 1. Welcome & Primary Action Banner ───────────────────────────────── */}
      <section className="dashboard-welcome-banner">
        <div className="dashboard-welcome-banner__content">
          <div className="dashboard-welcome-banner__badge">
            {company?.name ? `شركة ${company.name}` : "بوابة العميل — منصة OUT"}
          </div>
          <h1 className="dashboard-welcome-banner__title">
            مرحبًا بك، {displayName}
          </h1>
          <p className="dashboard-welcome-banner__desc">
            تابع دورة تخليص شحناتك خطوة بخطوة، واطلع على عروض الأسعار، والمستندات، وكود ACID لحظة بلحظة.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link
            href="/shipments/new"
            className="btn btn--primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontWeight: "var(--font-weight-bold)",
              textDecoration: "none",
            }}
          >
            <DynamicIcon name="PlusCircle" size={18} />
            <span>طلب تخليص شحنة جديد</span>
          </Link>
        </div>
      </section>

      {/* ─── 2. Company Incomplete Warning (if no company data) ──────────────── */}
      {!company && (
        <div
          className="card"
          style={{
            padding: "1.25rem",
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ color: "#d97706" }}>
              <DynamicIcon name="AlertTriangle" size={24} />
            </div>
            <div>
              <strong style={{ display: "block", color: "#92400e", fontSize: "var(--font-size-base)" }}>
                بيانات شركتك غير مكتملة حتى الآن
              </strong>
              <span style={{ color: "#b45309", fontSize: "var(--font-size-sm)" }}>
                يرجى تسجيل بيانات شركتك ومستندات التأسيس للبدء في إرسال طلبات التخليص الجمركي بسلاسة.
              </span>
            </div>
          </div>
          <Link href="/company" className="btn btn--secondary btn--sm">
            إكمال بيانات الشركة ←
          </Link>
        </div>
      )}

      {/* ─── 3. Action-Required Attention Cards ───────────────────────────────── */}
      {attentionShipments.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "#ef4444",
                display: "inline-block",
              }}
            />
            <h2 style={{ fontSize: "var(--font-size-md)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
              شحنات تتطلب اهتمامك وإجراءك ({attentionShipments.length})
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
            {attentionShipments.map((shipment) => {
              const meta = getAttentionMessage(shipment.status);
              return (
                <div
                  key={shipment.id}
                  className="card"
                  style={{
                    padding: "1.25rem",
                    border: "1px solid rgba(245, 197, 0, 0.6)",
                    backgroundColor: "rgba(245, 197, 0, 0.03)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-family-mono)",
                          fontWeight: "var(--font-weight-bold)",
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-black)",
                        }}
                      >
                        {shipment.reference_number}
                      </span>
                      <span
                        style={{
                          backgroundColor: "var(--color-yellow-light)",
                          color: "var(--color-black)",
                          fontSize: "var(--font-size-xs)",
                          fontWeight: "var(--font-weight-bold)",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        {meta.badge}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-bold)", margin: "0 0 0.25rem 0" }}>
                      {meta.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)", lineHeight: "1.5" }}>
                      {meta.desc}
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Link
                      href={`/my-shipments/${shipment.id}`}
                      className="btn btn--primary btn--sm"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        textDecoration: "none",
                      }}
                    >
                      <span>{meta.actionText}</span>
                      <DynamicIcon name="ArrowLeft" size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── 4. Real Operational Summary KPIs ─────────────────────────────────── */}
      <section className="dashboard-grid">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">إجمالي الشحنات</span>
          <span className="dashboard-stat-card__val">{totalShipments}</span>
          <span className="dashboard-stat-card__sub">كافة طلبات التخليص المسجلة</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">الشحنات قيد التنفيذ</span>
          <span className="dashboard-stat-card__val" style={{ color: "var(--color-yellow-dark)" }}>
            {inProgressCount}
          </span>
          <span className="dashboard-stat-card__sub">في مراحل التسعير وACID والمستندات</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">جاهزة للمرحلة الخارجية</span>
          <span className="dashboard-stat-card__val" style={{ color: "#059669" }}>
            {readyCount}
          </span>
          <span className="dashboard-stat-card__sub">استوفت كافة المستندات والتراخيص</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">المسودات المحفوظة</span>
          <span className="dashboard-stat-card__val">
            {draftCount}
          </span>
          <span className="dashboard-stat-card__sub">شحنات لم تُرسل للاعتماد بعد</span>
        </div>
      </section>

      {/* ─── 5. Recent Shipments / Onboarding Empty State ─────────────────────── */}
      <section className="card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
              آخر الشحنات ومستجداتها
            </h2>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>
              متابعة مباشرة لأحدث الشحنات المسجلة وحالتها الحالية
            </p>
          </div>

          {shipments.length > 0 && (
            <Link
              href="/my-shipments"
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-black)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <span>عرض كل الشحنات</span>
              <DynamicIcon name="ArrowLeft" size={14} />
            </Link>
          )}
        </div>

        {shipments.length === 0 ? (
          /* Empty Onboarding State */
          <div
            style={{
              padding: "3rem 1.5rem",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--color-yellow-light)",
                color: "var(--color-black)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DynamicIcon name="Package" size={32} />
            </div>
            <div>
              <h3 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", margin: "0 0 0.5rem 0" }}>
                لا توجد شحنات مسجلة حتى الآن
              </h3>
              <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)", maxWidth: "440px" }}>
                ابدأ رحلة التخليص الجمركي الآن بكل سهولة. أنشئ طلب تخليص شحنة، وأرفق الفاتورة المبدئية، وسيقوم فريق العمل بتقديم عرض السعر ومتابعة إجراءات ACID معك.
              </p>
            </div>
            <Link
              href="/shipments/new"
              className="btn btn--primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.5rem",
                textDecoration: "none",
                marginTop: "0.5rem",
              }}
            >
              <DynamicIcon name="PlusCircle" size={18} />
              <span>إنشاء أول طلب تخليص شحنة</span>
            </Link>
          </div>
        ) : (
          /* Real Shipments Table */
          <div style={{ overflowX: "auto" }}>
            <table className="customers-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>رقم الشحنة</th>
                  <th>المورد وبلد المنشأ</th>
                  <th>ميناء الوصول</th>
                  <th>الحالة الحالية</th>
                  <th>آخر تحديث</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/my-shipments/${s.id}`}
                        style={{
                          fontFamily: "var(--font-family-mono)",
                          fontWeight: "var(--font-weight-bold)",
                          color: "var(--color-black)",
                          textDecoration: "underline",
                        }}
                      >
                        {s.reference_number}
                      </Link>
                    </td>
                    <td>
                      <div>
                        <strong>{s.supplier_name || "—"}</strong>
                        {s.country_of_origin && (
                          <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                            {s.country_of_origin}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{s.port_of_arrival || "—"}</td>
                    <td>
                      <ShipmentStatusBadge status={s.status} />
                    </td>
                    <td style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      {formatDateAr(s.updated_at)}
                    </td>
                    <td>
                      <Link
                        href={`/my-shipments/${s.id}`}
                        className="customer-action-btn"
                        style={{ fontSize: "var(--font-size-xs)", padding: "0.3rem 0.65rem" }}
                      >
                        التفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
