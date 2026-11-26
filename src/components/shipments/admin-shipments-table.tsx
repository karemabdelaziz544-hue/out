"use client";

/**
 * Admin Shipments Table Component
 *
 * Provides central view of all shipments / clearance requests for staff and admins.
 * Features search, status filters, company and customer information, and quick links to details.
 */

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { ShipmentStatusBadge } from "./shipment-status-badge";
import type { AdminShipmentItem } from "@/types";

interface AdminShipmentsTableProps {
  shipments: AdminShipmentItem[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  currentQuery?: string;
  currentStatus?: string;
}

export function AdminShipmentsTable({
  shipments,
  totalCount,
  currentPage,
  totalPages,
  currentQuery = "",
  currentStatus = "all",
}: AdminShipmentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState(currentQuery);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchTerm.trim();
      const currentParam = searchParams.get("q") || "";

      if (trimmed !== currentParam) {
        const params = new URLSearchParams(searchParams.toString());
        if (trimmed) {
          params.set("q", trimmed);
        } else {
          params.delete("q");
        }
        params.delete("page");

        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`);
        });
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchTerm, pathname, router, searchParams]);

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header & Controls Toolbar */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Search Input */}
        <div style={{ position: "relative", minWidth: "280px", flex: "1 1 300px" }}>
          <div
            style={{
              position: "absolute",
              right: "0.875rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-gray-400)",
              pointerEvents: "none",
            }}
          >
            <DynamicIcon name="Search" size={18} />
          </div>
          <input
            type="text"
            placeholder="بحث بالرقم المرجعي، البضاعة، المورد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="customers-search-box__input"
            style={{
              width: "100%",
              paddingRight: "2.5rem",
              paddingLeft: "0.875rem",
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
            الحالة:
          </span>
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="customers-search-box__input"
            style={{
              fontSize: "var(--font-size-sm)",
              padding: "0.5rem 1rem",
              minWidth: "150px",
            }}
          >
            <option value="all">الكل ({totalCount})</option>
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

      {/* Table Card */}
      {shipments.length === 0 ? (
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
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", margin: "0.375rem 0 0" }}>
            جرّب تغيير عبارة البحث أو فلتر الحالة لرؤية المزيد من النتائج.
          </p>
        </div>
      ) : (
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
                    الشركة
                  </th>
                  <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                    العميل
                  </th>
                  <th style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                    وصف البضاعة
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
                {shipments.map((shipment) => (
                  <tr
                    key={shipment.id}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
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
                    <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                      <strong style={{ color: "var(--color-black)" }}>
                        {shipment.company_name}
                      </strong>
                    </td>
                    <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                          {shipment.customer_name || "—"}
                        </span>
                        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }} dir="ltr">
                          {shipment.customer_email || "—"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <span
                        style={{
                          fontSize: "var(--font-size-sm)",
                          color: "var(--color-gray-800)",
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {shipment.goods_description || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
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
                            التقدير: {shipment.pricing.estimated_min_price.toLocaleString("ar-EG")} – {shipment.pricing.estimated_max_price.toLocaleString("ar-EG")} ج.م
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
                    <td style={{ padding: "0.875rem 1rem", fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", whiteSpace: "nowrap" }}>
                      {formatDateAr(shipment.created_at)}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", textAlign: "center", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/shipments/${shipment.id}`}
                        className="btn btn--outline"
                        style={{
                          padding: "0.375rem 0.75rem",
                          fontSize: "var(--font-size-xs)",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                        }}
                      >
                        <DynamicIcon name="Eye" size={14} />
                        <span>عرض التفاصيل</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                borderTop: "1px solid var(--color-border)",
                backgroundColor: "var(--color-gray-50)",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <span style={{ color: "var(--color-gray-500)" }}>
                صفحة {currentPage} من {totalPages}
              </span>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="btn btn--outline"
                  style={{ padding: "0.25rem 0.5rem", fontSize: "var(--font-size-xs)" }}
                >
                  السابق
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="btn btn--outline"
                  style={{ padding: "0.25rem 0.5rem", fontSize: "var(--font-size-xs)" }}
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
