"use client";

/**
 * Customer Shipments List Component
 *
 * Displays all shipments and clearance requests for the authenticated customer's company.
 * Shows status badges, reference number, goods description, supplier, country of origin,
 * and direct links to view or complete drafts.
 */

import React, { useState } from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { ShipmentStatusBadge } from "./shipment-status-badge";
import type { Shipment } from "@/types";

interface MyShipmentsListProps {
  shipments: Shipment[];
  hasCompany: boolean;
}

type TabFilter = "all" | "action_required" | "in_progress" | "completed";

export function MyShipmentsList({
  shipments,
  hasCompany,
}: MyShipmentsListProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const actionRequiredStatuses = [
    "price_proposed",
    "invoice_revision_required",
    "awaiting_shipment_documents",
  ];

  const inProgressStatuses = [
    "submitted",
    "awaiting_pricing",
    "negotiation",
    "price_agreed",
    "awaiting_invoice_review",
    "invoice_approved",
    "acid_processing",
    "acid_issued",
    "documents_completed",
    "ready_for_external_stage",
    "customs_in_progress",
  ];

  const completedStatuses = [
    "customs_cleared",
    "delivered",
  ];

  const actionCount = shipments.filter((s) => actionRequiredStatuses.includes(s.status)).length;
  const inProgressCount = shipments.filter((s) => inProgressStatuses.includes(s.status)).length;
  const completedCount = shipments.filter((s) => completedStatuses.includes(s.status)).length;

  const filteredShipments = shipments.filter((s) => {
    // Tab filter
    if (activeTab === "action_required" && !actionRequiredStatuses.includes(s.status)) {
      return false;
    }
    if (activeTab === "in_progress" && !inProgressStatuses.includes(s.status)) {
      return false;
    }
    if (activeTab === "completed" && !completedStatuses.includes(s.status)) {
      return false;
    }

    // Specific status dropdown filter
    if (statusFilter !== "all" && s.status !== statusFilter) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchRef = s.reference_number?.toLowerCase().includes(q);
      const matchDesc = s.goods_description?.toLowerCase().includes(q);
      const matchSupplier = s.supplier_name?.toLowerCase().includes(q);
      return Boolean(matchRef || matchDesc || matchSupplier);
    }
    return true;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Page Header Toolbar */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
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
            <DynamicIcon name="Package" size={24} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "var(--font-size-2xl)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              شحناتي
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                margin: "0.25rem 0 0 0",
              }}
            >
              متابعة طلبات التخليص الجمركي والشحنات الخاصة بشركتك
            </p>
          </div>
        </div>

        <div>
          <Link
            href="/shipments/new"
            className="btn btn--primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-semibold)",
              textDecoration: "none",
            }}
          >
            <DynamicIcon name="PlusCircle" size={18} />
            <span>إنشاء طلب تخليص شحنة</span>
          </Link>
        </div>
      </div>

      {/* Warning Banner if Customer has no Company */}
      {!hasCompany && (
        <div
          style={{
            padding: "1rem 1.25rem",
            backgroundColor: "var(--color-yellow-light)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(245, 197, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <DynamicIcon name="AlertCircle" size={20} />
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-black)" }}>
              يرجى استكمال بيانات الشركة أولًا حتى تتمكن من إنشاء طلب تخليص شحنة.
            </span>
          </div>
          <Link
            href="/company"
            className="btn btn--primary"
            style={{
              fontSize: "var(--font-size-xs)",
              padding: "0.375rem 0.875rem",
              textDecoration: "none",
            }}
          >
            استكمال بيانات الشركة
          </Link>
        </div>
      )}

      {/* Quick Filter Tabs & Search Bar */}
      {shipments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Quick Filter Tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              overflowX: "auto",
              paddingBottom: "0.25rem",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab("all");
                setStatusFilter("all");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "var(--font-size-sm)",
                fontWeight: activeTab === "all" ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                backgroundColor: activeTab === "all" ? "var(--color-black)" : "var(--color-surface)",
                color: activeTab === "all" ? "var(--color-white)" : "var(--color-gray-700)",
                border: "1px solid",
                borderColor: activeTab === "all" ? "var(--color-black)" : "var(--color-border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <span>كل الشحنات</span>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  padding: "0.1rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: activeTab === "all" ? "var(--color-yellow)" : "var(--color-gray-100)",
                  color: "var(--color-black)",
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                {shipments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("action_required");
                setStatusFilter("all");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "var(--font-size-sm)",
                fontWeight: activeTab === "action_required" ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                backgroundColor: activeTab === "action_required" ? "#fef3c7" : "var(--color-surface)",
                color: activeTab === "action_required" ? "#92400e" : "var(--color-gray-700)",
                border: "1px solid",
                borderColor: activeTab === "action_required" ? "#f59e0b" : "var(--color-border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <DynamicIcon name="AlertCircle" size={16} />
              <span>تتطلب إجراء منك</span>
              {actionCount > 0 && (
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "#f59e0b",
                    color: "var(--color-white)",
                    fontWeight: "var(--font-weight-bold)",
                  }}
                >
                  {actionCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("in_progress");
                setStatusFilter("all");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "var(--font-size-sm)",
                fontWeight: activeTab === "in_progress" ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                backgroundColor: activeTab === "in_progress" ? "var(--color-black)" : "var(--color-surface)",
                color: activeTab === "in_progress" ? "var(--color-white)" : "var(--color-gray-700)",
                border: "1px solid",
                borderColor: activeTab === "in_progress" ? "var(--color-black)" : "var(--color-border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <DynamicIcon name="Clock" size={16} />
              <span>قيد المعالجة</span>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  padding: "0.1rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: activeTab === "in_progress" ? "var(--color-yellow)" : "var(--color-gray-100)",
                  color: "var(--color-black)",
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                {inProgressCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("completed");
                setStatusFilter("all");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "var(--font-size-sm)",
                fontWeight: activeTab === "completed" ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                backgroundColor: activeTab === "completed" ? "#ecfdf5" : "var(--color-surface)",
                color: activeTab === "completed" ? "#065f46" : "var(--color-gray-700)",
                border: "1px solid",
                borderColor: activeTab === "completed" ? "#10b981" : "var(--color-border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <DynamicIcon name="CheckCircle" size={16} />
              <span>مكتملة وجاهزة</span>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  padding: "0.1rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: activeTab === "completed" ? "#10b981" : "var(--color-gray-100)",
                  color: activeTab === "completed" ? "#ffffff" : "var(--color-black)",
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                {completedCount}
              </span>
            </button>
          </div>

          {/* Search & Status Filter Bar */}
          <div
            className="card"
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <div style={{ flex: "1 1 260px", maxWidth: "420px" }}>
              <div className="customers-search-box">
                <DynamicIcon
                  name="Search"
                  size={16}
                  className="customers-search-box__icon"
                />
                <input
                  type="text"
                  placeholder="ابحث برقم الشحنة، المورد، أو وصف البضاعة..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="customers-search-box__input"
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label
                htmlFor="customer-shipment-status-filter"
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-600)",
                  whiteSpace: "nowrap",
                }}
              >
                تصفية تفصيلية:
              </label>
              <select
                id="customer-shipment-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="customers-search-box__input"
                style={{
                  fontSize: "var(--font-size-sm)",
                  padding: "0.5rem 1rem",
                  minWidth: "180px",
                }}
              >
                <option value="all">كل الحالات</option>
                <option value="awaiting_pricing">بانتظار التسعير</option>
                <option value="price_proposed">تم تقديم عرض السعر</option>
                <option value="negotiation">قيد التفاوض</option>
                <option value="price_agreed">السعر النهائي محدد</option>
                <option value="awaiting_invoice_review">بانتظار مراجعة الفاتورة</option>
                <option value="invoice_revision_required">مطلوب تعديل الفاتورة</option>
                <option value="invoice_approved">تم اعتماد الفاتورة</option>
                <option value="acid_processing">جاري معالجة ACID</option>
                <option value="acid_issued">تم إصدار ACID</option>
                <option value="awaiting_shipment_documents">بانتظار مستندات الشحنة</option>
                <option value="documents_completed">مستندات الشحنة مكتملة</option>
                <option value="ready_for_external_stage">جاهزة للمرحلة الخارجية</option>
                <option value="customs_in_progress">جاري التخليص الجمركي</option>
                <option value="customs_cleared">تم الإفراج الجمركي</option>
                <option value="delivered">تم التسليم</option>
                <option value="submitted">تم الإرسال</option>
                <option value="draft">مسودة</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Shipments Display */}
      {shipments.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "3.5rem 1.5rem",
            textAlign: "center",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}
          >
            <DynamicIcon name="Package" size={28} />
          </div>
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-black)",
              marginBottom: "0.5rem",
            }}
          >
            لا توجد شحنات مسجلة حاليًا
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-gray-600)",
              marginBottom: "1.5rem",
            }}
          >
            ابدأ الآن بإنشاء أول طلب تخليص شحنة لشركتك لتقديم عرض السعر ومتابعة إجراءات التخليص.
          </p>
          <Link
            href="/shipments/new"
            className="btn btn--primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
            }}
          >
            <DynamicIcon name="PlusCircle" size={18} />
            <span>إنشاء طلب تخليص شحنة</span>
          </Link>
        </div>
      ) : filteredShipments.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "3rem 1.5rem",
            textAlign: "center",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}
          >
            <DynamicIcon name="Package" size={24} />
          </div>
          <h2 style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-semibold)", margin: 0 }}>
            لا توجد شحنات مطابقة
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", margin: "0.375rem 0 1rem" }}>
            جرّب تغيير عبارة البحث أو تبويب التصفية لرؤية شحنات أخرى.
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveTab("all");
              setStatusFilter("all");
              setSearchQuery("");
            }}
            className="btn btn--outline"
            style={{ fontSize: "var(--font-size-xs)", padding: "0.375rem 0.875rem" }}
          >
            إعادة تعيين الفلاتر
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table View (visible on medium screens and up) */}
          <div
            className="card"
            style={{
              overflow: "hidden",
              border: "1px solid var(--color-border)",
              padding: 0,
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                className="customers-table"
                style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--color-gray-50)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      الرقم المرجعي
                    </th>
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      وصف البضاعة
                    </th>
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      المورد
                    </th>
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      بلد المنشأ
                    </th>
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      الحالة والتسعير
                    </th>
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                      تاريخ الإنشاء
                    </th>
                    <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", textAlign: "center" }}>
                      الإجراءات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((shipment) => (
                    <tr
                      key={shipment.id}
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>
                        <span
                          dir="ltr"
                          style={{
                            fontFamily: "var(--font-family-mono)",
                            fontWeight: "var(--font-weight-semibold)",
                            color: "var(--color-black)",
                          }}
                        >
                          {shipment.reference_number}
                        </span>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span
                          style={{
                            fontWeight: "var(--font-weight-medium)",
                            color: "var(--color-black)",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {shipment.goods_description || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "1rem", color: "var(--color-gray-700)", whiteSpace: "nowrap" }}>
                        {shipment.supplier_name || "—"}
                      </td>
                      <td style={{ padding: "1rem", color: "var(--color-gray-700)", whiteSpace: "nowrap" }}>
                        {shipment.country_of_origin || "—"}
                      </td>
                      <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3125rem", alignItems: "flex-start" }}>
                          <ShipmentStatusBadge status={shipment.status} />
                          {["awaiting_invoice_review", "invoice_revision_required", "invoice_approved"].includes(shipment.status) && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "#047857",
                                fontWeight: "var(--font-weight-semibold)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <span>السعر:</span>
                              <strong>
                                {shipment.pricing?.final_price !== null && shipment.pricing?.final_price !== undefined
                                  ? `${shipment.pricing.final_price.toLocaleString("ar-EG")} ج.م`
                                  : shipment.pricing?.estimated_min_price === shipment.pricing?.estimated_max_price && shipment.pricing?.estimated_min_price !== undefined
                                  ? `${shipment.pricing.estimated_min_price.toLocaleString("ar-EG")} ج.م`
                                  : shipment.pricing
                                  ? `${shipment.pricing.estimated_min_price.toLocaleString("ar-EG")} – ${shipment.pricing.estimated_max_price.toLocaleString("ar-EG")} ج.م`
                                  : "معتمد"}
                              </strong>
                            </span>
                          )}
                          {shipment.status === "price_proposed" && shipment.pricing && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "#1d4ed8",
                                fontWeight: "var(--font-weight-medium)",
                              }}
                            >
                              العرض: {shipment.pricing.estimated_min_price.toLocaleString("ar-EG")} – {shipment.pricing.estimated_max_price.toLocaleString("ar-EG")} ج.م
                            </span>
                          )}
                          {shipment.status === "price_agreed" && shipment.pricing?.final_price !== null && shipment.pricing?.final_price !== undefined && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--color-black)",
                                fontWeight: "var(--font-weight-semibold)",
                              }}
                            >
                              النهائي: {shipment.pricing.final_price.toLocaleString("ar-EG")} ج.م
                            </span>
                          )}
                          {shipment.acid?.acid_number && (
                            <span
                              dir="ltr"
                              style={{
                                fontSize: "11px",
                                fontFamily: "var(--font-family-mono)",
                                color: "#065f46",
                                backgroundColor: "rgba(16, 185, 129, 0.12)",
                                padding: "0.15rem 0.4rem",
                                borderRadius: "4px",
                                fontWeight: "600",
                              }}
                            >
                              ACID: {shipment.acid.acid_number}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", color: "var(--color-gray-500)", fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>
                        {formatDateAr(shipment.created_at)}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "center", whiteSpace: "nowrap" }}>
                        {shipment.status === "draft" ? (
                          <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                            <Link
                              href={`/shipments/new?draftId=${shipment.id}`}
                              className="btn btn--outline"
                              style={{
                                fontSize: "var(--font-size-xs)",
                                padding: "0.375rem 0.75rem",
                                textDecoration: "none",
                              }}
                            >
                              إكمال المسودة
                            </Link>
                            <Link
                              href={`/my-shipments/${shipment.id}`}
                              className="btn btn--ghost"
                              style={{
                                fontSize: "var(--font-size-xs)",
                                padding: "0.375rem 0.75rem",
                                textDecoration: "none",
                              }}
                            >
                              عرض
                            </Link>
                          </div>
                        ) : (
                          <Link
                            href={`/my-shipments/${shipment.id}`}
                            className="btn btn--outline"
                            style={{
                              fontSize: "var(--font-size-xs)",
                              padding: "0.375rem 0.75rem",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.375rem",
                            }}
                          >
                            <DynamicIcon name="Eye" size={14} />
                            <span>عرض الشحنة</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
