"use client";

import React from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import { ShipmentStatusBadge } from "@/components/shipments/shipment-status-badge";
import { formatDateAr } from "@/lib/utils";
import type { AdminShipmentItem } from "@/types";

interface AdminDashboardViewProps {
  displayName: string;
  roleLabel: string;
  stats: {
    totalShipments: number;
    awaitingPricing: number;
    awaitingInvoiceReview: number;
    acidProcessing: number;
    awaitingDocuments: number;
    readyForExternal: number;
    totalCustomers: number;
  };
  recentShipments: AdminShipmentItem[];
}

export function AdminDashboardView({
  displayName,
  roleLabel,
  stats,
  recentShipments,
}: AdminDashboardViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ─── 1. Header Banner ─────────────────────────────────────────────────── */}
      <section className="dashboard-welcome-banner">
        <div className="dashboard-welcome-banner__content">
          <div className="dashboard-welcome-banner__badge">
            لوحة العمليات الإدارية المركزية
          </div>
          <h1 className="dashboard-welcome-banner__title">
            مرحبًا بك، {displayName}
          </h1>
          <p className="dashboard-welcome-banner__desc">
            مركز المراقبة والتحكم لطلبات التخليص الجمركي، التسعير، مراجعة الفواتير، وإصدار أكواد ACID.
          </p>
        </div>

        <div className="dashboard-welcome-banner__role-card">
          <span className="dashboard-welcome-banner__role-label">نوع الصلاحية</span>
          <span className="dashboard-welcome-banner__role-val">{roleLabel}</span>
        </div>
      </section>

      {/* ─── 2. Operational Attention Shortcuts ─────────────────────────────────── */}
      {(stats.awaitingPricing > 0 || stats.awaitingInvoiceReview > 0 || stats.acidProcessing > 0) && (
        <div
          className="card"
          style={{
            padding: "1rem 1.25rem",
            backgroundColor: "rgba(245, 197, 0, 0.05)",
            border: "1px solid rgba(245, 197, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ color: "var(--color-yellow-dark)" }}>
              <DynamicIcon name="AlertCircle" size={24} />
            </div>
            <div>
              <strong style={{ display: "block", color: "var(--color-black)", fontSize: "var(--font-size-base)" }}>
                عمليات بانتظار إجراء الإدارة
              </strong>
              <span style={{ color: "var(--color-gray-600)", fontSize: "var(--font-size-sm)" }}>
                يوجد {stats.awaitingPricing} شحنة بانتظار التسعير، و{stats.awaitingInvoiceReview} فاتورة بانتظار المراجعة، و{stats.acidProcessing} في معالجة ACID.
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {stats.awaitingPricing > 0 && (
              <Link href="/shipments?status=awaiting_pricing" className="btn btn--secondary btn--sm">
                التسعير ({stats.awaitingPricing})
              </Link>
            )}
            {stats.awaitingInvoiceReview > 0 && (
              <Link href="/shipments?status=awaiting_invoice_review" className="btn btn--secondary btn--sm">
                مراجعة الفواتير ({stats.awaitingInvoiceReview})
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ─── 3. Dynamic Operational KPIs ───────────────────────────────────────── */}
      <section className="dashboard-grid">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">إجمالي الشحنات</span>
          <span className="dashboard-stat-card__val">{stats.totalShipments}</span>
          <span className="dashboard-stat-card__sub">كافة طلبات التخليص المسجلة</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">بانتظار التسعير</span>
          <span className="dashboard-stat-card__val" style={{ color: "var(--color-yellow-dark)" }}>
            {stats.awaitingPricing}
          </span>
          <span className="dashboard-stat-card__sub">شحنات جديدة تتطلب عروض أسعار</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">مراجعة الفواتير</span>
          <span className="dashboard-stat-card__val" style={{ color: "#d97706" }}>
            {stats.awaitingInvoiceReview}
          </span>
          <span className="dashboard-stat-card__sub">فواتير مبدئية بانتظار الفحص</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">معالجة ACID</span>
          <span className="dashboard-stat-card__val" style={{ color: "#4f46e5" }}>
            {stats.acidProcessing}
          </span>
          <span className="dashboard-stat-card__sub">قيد استخراج وإصدار كود ACID</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">بانتظار مستندات الشحنة</span>
          <span className="dashboard-stat-card__val" style={{ color: "#b45309" }}>
            {stats.awaitingDocuments}
          </span>
          <span className="dashboard-stat-card__sub">بعد إصدار ACID</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">جاهزة للمرحلة الخارجية</span>
          <span className="dashboard-stat-card__val" style={{ color: "#059669" }}>
            {stats.readyForExternal}
          </span>
          <span className="dashboard-stat-card__sub">استوفت كافة الشروط الـ 10</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-card__label">العملاء والشركات</span>
          <span className="dashboard-stat-card__val">{stats.totalCustomers}</span>
          <span className="dashboard-stat-card__sub">حسابات العملاء المسجلة</span>
        </div>
      </section>

      {/* ─── 4. Recent Admin Activity / Shipments Table ────────────────────────── */}
      <section className="card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
              أحدث طلبات الشحنات بالمنظومة
            </h2>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>
              آخر الشحنات الواردة لغرفة العمليات المركزية
            </p>
          </div>

          <Link
            href="/shipments"
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
        </div>

        {recentShipments.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>
            لا توجد شحنات مسجلة في النظام حتى الآن.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="customers-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>رقم الشحنة</th>
                  <th>العميل والشركة</th>
                  <th>ميناء الوصول</th>
                  <th>الحالة</th>
                  <th>تاريخ الإجراء</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/shipments/${s.id}`}
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
                        <strong>{s.company_name || "—"}</strong>
                        <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                          {s.customer_name || s.customer_email || ""}
                        </span>
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
                        href={`/shipments/${s.id}`}
                        className="customer-action-btn"
                        style={{ fontSize: "var(--font-size-xs)", padding: "0.3rem 0.65rem" }}
                      >
                        معاينة وإدارة
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
