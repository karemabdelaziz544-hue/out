"use client";

/**
 * Admin Pricing Section Component
 *
 * Dedicated back-office pricing panel inside Admin Shipment Details:
 *  - Submit initial price estimate range when awaiting_pricing
 *  - Display current estimate when price_proposed
 *  - Set final agreed price when negotiation is requested
 *  - Display final agreed price and customer approval status
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import {
  submitPriceEstimateAction,
  adminSetFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import type { Shipment, ShipmentPricing, Customer } from "@/types";

interface AdminPricingSectionProps {
  shipment: Shipment;
  pricing: ShipmentPricing | null;
  customer?: Customer | null;
}

export function AdminPricingSection({
  shipment,
  pricing,
  customer,
}: AdminPricingSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estimate inputs
  const [minPrice, setMinPrice] = useState<string>(
    pricing?.estimated_min_price ? String(pricing.estimated_min_price) : "",
  );
  const [maxPrice, setMaxPrice] = useState<string>(
    pricing?.estimated_max_price ? String(pricing.estimated_max_price) : "",
  );
  const [currency, setCurrency] = useState<string>(pricing?.currency || "EGP");

  // Final price input
  const [finalPrice, setFinalPrice] = useState<string>(
    pricing?.final_price ? String(pricing.final_price) : "",
  );

  const [isEditingEstimate, setIsEditingEstimate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const formatPrice = (val?: number | null, curr = "جنيه") => {
    if (val === undefined || val === null) return "—";
    return `${val.toLocaleString("ar-EG")} ${curr === "EGP" ? "جنيه" : curr}`;
  };

  const handleEstimateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);

    if (isNaN(min) || min < 0) {
      setErrorMessage("الحد الأدنى للتقدير يجب أن يكون رقماً صالحاً أكبر من أو يساوي صفر.");
      return;
    }
    if (isNaN(max) || max < 0) {
      setErrorMessage("الحد الأقصى للتقدير يجب أن يكون رقماً صالحاً أكبر من أو يساوي صفر.");
      return;
    }
    if (min > max) {
      setErrorMessage("الحد الأدنى للتقدير لا يمكن أن يتجاوز الحد الأقصى.");
      return;
    }

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("estimated_min_price", minPrice);
    formData.append("estimated_max_price", maxPrice);
    formData.append("currency", currency);

    startTransition(async () => {
      const res = await submitPriceEstimateAction(formData);
      if (res.success) {
        setSuccessMessage(res.message || "تم تقديم تقدير السعر بنجاح.");
        setIsEditingEstimate(false);
        router.refresh();
      } else {
        setErrorMessage(res.error || "تعذر تقديم تقدير السعر.");
      }
    });
  };

  const handleFinalPriceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const price = parseFloat(finalPrice);
    if (isNaN(price) || price <= 0) {
      setErrorMessage("يرجى إدخال سعر نهائي متفق عليه صالح أكبر من صفر.");
      return;
    }

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("final_price", finalPrice);

    startTransition(async () => {
      const res = await adminSetFinalPriceAction(formData);
      if (res.success) {
        setSuccessMessage(res.message || "تم حفظ السعر النهائي بنجاح.");
        router.refresh();
      } else {
        setErrorMessage(res.error || "تعذر حفظ السعر النهائي.");
      }
    });
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.75rem",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <DynamicIcon name="Coins" size={20} />
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              margin: 0,
              color: "var(--color-black)",
            }}
          >
            التسعير وإدارة التفاوض
          </h2>
        </div>

        {pricing && (
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              padding: "0.25rem 0.625rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-700)",
            }}
          >
            حالة التسعير: {pricing.status}
          </span>
        )}
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="customers-error-banner" style={{ marginBottom: "1rem" }}>
          <DynamicIcon name="AlertCircle" size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#047857",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <DynamicIcon name="CheckCircle" size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 1. Case: Initial Estimate Form (awaiting_pricing OR editing existing proposal) */}
      {(shipment.status === "awaiting_pricing" || isEditingEstimate) && (
        <form onSubmit={handleEstimateSubmit}>
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--color-yellow-light)",
              border: "1px solid rgba(245, 197, 0, 0.4)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.25rem",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-black)",
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: "0 0 0.25rem", fontWeight: "var(--font-weight-medium)" }}>
              📌 <strong>إرشادات التسعير:</strong>
            </p>
            <p style={{ margin: 0 }}>
              السعر المقدم هو تقدير مبدئي لخدمة التخليص، وقد يتغير حسب تفاصيل الشحنة والإجراءات الفعلية.
              هذا السعر يمثل أتعاب الخدمة ولا يتضمن الضرائب والرسوم الجمركية الحكومية.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <label
                htmlFor="estimated_min_price"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                الحد الأدنى للتقدير <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <input
                type="number"
                id="estimated_min_price"
                min="0"
                step="any"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="مثال: 5000"
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
                required
              />
            </div>

            <div>
              <label
                htmlFor="estimated_max_price"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                الحد الأقصى للتقدير <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
              </label>
              <input
                type="number"
                id="estimated_max_price"
                min="0"
                step="any"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="مثال: 7000"
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
                required
              />
            </div>

            <div>
              <label
                htmlFor="currency"
                style={{
                  display: "block",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  marginBottom: "0.375rem",
                }}
              >
                العملة
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="customers-search-box__input"
                style={{ width: "100%" }}
                disabled={isPending}
              >
                <option value="EGP">جنيه مصري (EGP)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="EUR">يورو (EUR)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="submit"
              disabled={isPending}
              className="btn btn--primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1.25rem",
                fontSize: "var(--font-size-sm)",
              }}
            >
              {isPending ? (
                <>
                  <DynamicIcon name="Loader2" size={16} />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <DynamicIcon name="Send" size={16} />
                  <span>تقديم تقدير السعر للعميل</span>
                </>
              )}
            </button>

            {isEditingEstimate && (
              <button
                type="button"
                onClick={() => setIsEditingEstimate(false)}
                className="btn btn--ghost"
                style={{ fontSize: "var(--font-size-xs)" }}
              >
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
      )}

      {/* 2. Case: Estimate is proposed & not in editing mode */}
      {shipment.status === "price_proposed" && !isEditingEstimate && pricing && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
                التقدير المبدئي المقدم للعميل
              </span>
              <strong style={{ fontSize: "var(--font-size-xl)", color: "var(--color-black)" }}>
                {formatPrice(pricing.estimated_min_price, pricing.currency)} – {formatPrice(pricing.estimated_max_price, pricing.currency)}
              </strong>
              <span style={{ fontSize: "var(--font-size-xs)", color: "#1d4ed8", display: "block", marginTop: "0.25rem" }}>
                ⏳ تم إرسال العرض للعميل وبانتظار قراره (موافقة أو طلب تفاوض)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsEditingEstimate(true)}
              className="btn btn--outline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                fontSize: "var(--font-size-xs)",
                padding: "0.375rem 0.75rem",
              }}
            >
              <DynamicIcon name="Edit" size={14} />
              <span>تعديل التقدير</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Case: Customer requested negotiation -> Admin sets final agreed price */}
      {shipment.status === "negotiation" && pricing && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              padding: "1rem 1.25rem",
              backgroundColor: "rgba(234, 88, 12, 0.08)",
              border: "1px solid rgba(234, 88, 12, 0.25)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#c2410c", marginBottom: "0.25rem" }}>
              <DynamicIcon name="AlertCircle" size={18} />
              <strong style={{ fontSize: "var(--font-size-sm)" }}>طلب تفاوض من العميل</strong>
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)", lineHeight: 1.6 }}>
              العميل يرغب في التفاوض على السعر التقديري (
              {formatPrice(pricing.estimated_min_price, pricing.currency)} – {formatPrice(pricing.estimated_max_price, pricing.currency)}).
              يرجى التواصل معه لتحديد السعر النهائي المتفق عليه، ثم تسجيله أدناه.
            </p>
          </div>

          <form onSubmit={handleFinalPriceSubmit}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px" }}>
                <label
                  htmlFor="final_price"
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-medium)",
                    marginBottom: "0.375rem",
                  }}
                >
                  السعر النهائي المتفق عليه ({pricing.currency}) <span style={{ color: "var(--color-yellow-dark)" }}>*</span>
                </label>
                <input
                  type="number"
                  id="final_price"
                  min="0"
                  step="any"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                  placeholder="مثال: 6000"
                  className="customers-search-box__input"
                  style={{ width: "100%" }}
                  disabled={isPending}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="btn btn--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1.25rem",
                  fontSize: "var(--font-size-sm)",
                  height: "40px",
                }}
              >
                {isPending ? (
                  <>
                    <DynamicIcon name="Loader2" size={16} />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Check" size={16} />
                    <span>تحديد السعر النهائي</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Case: Final price agreed -> Waiting for customer final approval */}
      {shipment.status === "price_agreed" && pricing && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--color-yellow-light)",
            border: "1px solid rgba(245, 197, 0, 0.4)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)", display: "block" }}>
              السعر النهائي المحدد
            </span>
            <strong style={{ fontSize: "var(--font-size-2xl)", color: "var(--color-black)" }}>
              {formatPrice(pricing.final_price, pricing.currency)}
            </strong>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)", display: "block", marginTop: "0.25rem" }}>
              ⏳ تم إرسال السعر النهائي للعميل وبانتظار اعتماده
            </span>
          </div>
        </div>
      )}

      {/* 5. Case: Approved by customer -> awaiting_invoice_review and later */}
      {(["awaiting_invoice_review", "invoice_revision_required", "invoice_approved"].includes(shipment.status) || pricing?.status === "customer_approved") && pricing && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              padding: "1.5rem",
              backgroundColor: "rgba(16, 185, 129, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {/* Header: موافقة العميل على التسعير / تمت الموافقة على التسعير من العميل ✅ */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "1.25rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid rgba(16, 185, 129, 0.15)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "#047857",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DynamicIcon name="CheckCircle" size={22} />
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: "var(--font-size-base)",
                      fontWeight: "var(--font-weight-bold)",
                      margin: 0,
                      color: "#047857",
                    }}
                  >
                    موافقة العميل على التسعير
                  </h3>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "#065f46", fontWeight: "var(--font-weight-medium)" }}>
                    تمت الموافقة على التسعير من العميل ✅
                  </span>
                </div>
              </div>

              <span
                style={{
                  padding: "0.3125rem 0.75rem",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-semibold)",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#047857",
                }}
              >
                تمت موافقة العميل
              </span>
            </div>

            {/* Key-Value Details Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {/* التسعير */}
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  التسعير:
                </span>
                <strong
                  style={{
                    fontSize: "var(--font-size-2xl)",
                    color: "var(--color-black)",
                    marginTop: "0.25rem",
                    display: "block",
                  }}
                >
                  {pricing.final_price !== null
                    ? formatPrice(pricing.final_price, pricing.currency)
                    : pricing.estimated_min_price === pricing.estimated_max_price
                    ? formatPrice(pricing.estimated_min_price, pricing.currency)
                    : `${formatPrice(pricing.estimated_min_price, pricing.currency)} – ${formatPrice(pricing.estimated_max_price, pricing.currency)}`}
                </strong>
              </div>

              {/* الحالة */}
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  الحالة:
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "#047857",
                    marginTop: "0.375rem",
                    display: "block",
                  }}
                >
                  تمت موافقة العميل
                </span>
              </div>

              {/* تمت الموافقة بواسطة */}
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  تمت الموافقة بواسطة:
                </span>
                <strong
                  style={{
                    fontSize: "var(--font-size-sm)",
                    color: "var(--color-black)",
                    marginTop: "0.375rem",
                    display: "block",
                  }}
                >
                  {pricing.customer_approved_by_name || customer?.full_name || "العميل"}
                </strong>
              </div>

              {/* تاريخ الموافقة */}
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  تاريخ الموافقة:
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-gray-900)",
                    marginTop: "0.375rem",
                    display: "block",
                  }}
                >
                  {pricing.customer_approved_at
                    ? `${new Date(pricing.customer_approved_at).toLocaleDateString("ar-EG", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })} — ${new Date(pricing.customer_approved_at).toLocaleTimeString("ar-EG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "—"}
                </span>
              </div>

              {/* حالة الشحنة */}
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  حالة الشحنة:
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-gray-800)",
                    marginTop: "0.375rem",
                    display: "block",
                  }}
                >
                  بانتظار مراجعة الفاتورة
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
