"use client";

/**
 * Customer Pricing Card Component
 *
 * Handles customer interaction with price proposals:
 *  - Initial estimate view ('price_proposed'): Approve or Request Negotiation
 *  - Negotiation state view ('negotiation'): Waiting for contact & final price
 *  - Final agreed price view ('price_agreed'): Approve final price
 *  - Approved state view ('awaiting_invoice_review'): Status confirmation
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import {
  customerApproveEstimateAction,
  customerRequestNegotiationAction,
  customerApproveFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import type { Shipment, ShipmentPricing } from "@/types";

interface CustomerPricingCardProps {
  shipment: Shipment;
  pricing: ShipmentPricing | null;
}

export function CustomerPricingCard({
  shipment,
  pricing,
}: CustomerPricingCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!pricing && shipment.status !== "awaiting_pricing") {
    return null;
  }

  const formatPrice = (val?: number | null, curr = "جنيه") => {
    if (val === undefined || val === null) return "—";
    return `${val.toLocaleString("ar-EG")} ${curr === "EGP" ? "جنيه" : curr}`;
  };

  const handleApproveEstimate = () => {
    if (!pricing) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("expected_pricing_updated_at", pricing.updated_at);

    startTransition(async () => {
      const res = await customerApproveEstimateAction(formData);
      if (res.success) {
        setSuccessMessage(res.message || "تم اعتماد السعر بنجاح.");
        router.refresh();
      } else {
        setErrorMessage(res.error || "تعذر اعتماد السعر.");
      }
    });
  };

  const handleRequestNegotiation = () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);

    startTransition(async () => {
      const res = await customerRequestNegotiationAction(formData);
      if (res.success) {
        setSuccessMessage(res.message || "تم إرسال طلب التفاوض بنجاح.");
        router.refresh();
      } else {
        setErrorMessage(res.error || "تعذر إرسال طلب التفاوض.");
      }
    });
  };

  const handleApproveFinalPrice = () => {
    if (!pricing || pricing.final_price === null) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("expected_final_price", String(pricing.final_price));

    startTransition(async () => {
      const res = await customerApproveFinalPriceAction(formData);
      if (res.success) {
        setSuccessMessage(res.message || "تم اعتماد السعر النهائي بنجاح.");
        router.refresh();
      } else {
        setErrorMessage(res.error || "تعذر اعتماد السعر النهائي.");
      }
    });
  };

  // State 1: Awaiting Admin Pricing
  if (shipment.status === "awaiting_pricing" || !pricing) {
    return (
      <div
        className="card"
        style={{
          padding: "1.5rem",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-yellow-light)",
              color: "var(--color-yellow-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="Clock" size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-semibold)", margin: 0 }}>
              طلب التسعير قيد المراجعة
            </h3>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", margin: "0.25rem 0 0" }}>
              يقوم فريق العمل بمراجعة تفاصيل الشحنة والفاتورة المبدئية لتقديم التقدير المناسب لسعر خدمة التخليص.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          gap: "0.75rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "0.75rem",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-yellow-light)",
            color: "var(--color-yellow-dark)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DynamicIcon name="Coins" size={22} />
        </div>
        <div>
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              margin: 0,
              color: "var(--color-black)",
            }}
          >
            {shipment.status === "price_agreed"
              ? "السعر النهائي المتفق عليه"
              : ["awaiting_invoice_review", "invoice_revision_required", "invoice_approved"].includes(shipment.status)
              ? "سعر خدمة التخليص المعتمد"
              : "عرض السعر المبدئي لخدمة التخليص"}
          </h2>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
            تقدير تكلفة خدمة التخليص الجمركي المقدمة من OUT
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
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#047857",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          <DynamicIcon name="CheckCircle" size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* State A: price_proposed (Initial Estimate) */}
      {shipment.status === "price_proposed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "var(--color-gray-50)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
              التقدير المبدئي لخدمة التخليص
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginTop: "0.375rem" }}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>من</span>
              <strong style={{ fontSize: "var(--font-size-2xl)", color: "var(--color-black)" }}>
                {formatPrice(pricing.estimated_min_price, pricing.currency)}
              </strong>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>إلى</span>
              <strong style={{ fontSize: "var(--font-size-2xl)", color: "var(--color-black)" }}>
                {formatPrice(pricing.estimated_max_price, pricing.currency)}
              </strong>
            </div>

            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                backgroundColor: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-600)",
                lineHeight: 1.6,
              }}
            >
              <p style={{ margin: "0 0 0.375rem" }}>
                💡 <strong>ملاحظة هامة:</strong> هذا تقدير مبدئي لسعر خدمة التخليص وقد يتغير حسب تفاصيل وإجراءات الشحنة الفعلية.
              </p>
              <p style={{ margin: 0 }}>
                السعر المقدم يمثل أتعاب وخدمة التخليص من OUT، ولا يشمل بالضرورة الضرائب الحكومية، الرسوم الجمركية، أو رسوم الموانئ.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleApproveEstimate}
              disabled={isPending}
              className="btn btn--primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.5rem",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              {isPending ? (
                <>
                  <DynamicIcon name="Loader2" size={16} />
                  <span>جاري الاعتماد...</span>
                </>
              ) : (
                <>
                  <DynamicIcon name="Check" size={16} />
                  <span>موافق على التسعير</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleRequestNegotiation}
              disabled={isPending}
              className="btn btn--outline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "var(--font-size-sm)",
              }}
            >
              <DynamicIcon name="MessageSquare" size={16} />
              <span>أريد التفاوض</span>
            </button>
          </div>
        </div>
      )}

      {/* State B: negotiation (Negotiation requested) */}
      {shipment.status === "negotiation" && (
        <div
          style={{
            padding: "1.25rem",
            backgroundColor: "rgba(234, 88, 12, 0.05)",
            border: "1px solid rgba(234, 88, 12, 0.2)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <div style={{ color: "#ea580c", marginTop: "2px" }}>
            <DynamicIcon name="Clock" size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", margin: 0, color: "#c2410c" }}>
              طلب التفاوض قيد المراجعة والتواصل
            </h3>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)", margin: "0.375rem 0 0", lineHeight: 1.6 }}>
              تم تسجيل رغبتك في التفاوض على السعر. سيقوم فريق العمل بالتواصل معك للاتفاق على السعر النهائي المناسب، وتحديده في النظام لموافقتك.
            </p>
          </div>
        </div>
      )}

      {/* State C: price_agreed (Final Proposed Price) */}
      {shipment.status === "price_agreed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "var(--color-yellow-light)",
              border: "1px solid rgba(245, 197, 0, 0.4)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)", display: "block" }}>
              السعر النهائي المتفق عليه لخدمة التخليص
            </span>
            <div style={{ marginTop: "0.375rem" }}>
              <strong style={{ fontSize: "var(--font-size-3xl)", color: "var(--color-black)" }}>
                {formatPrice(pricing.final_price, pricing.currency)}
              </strong>
            </div>

            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)", margin: "0.75rem 0 0", lineHeight: 1.6 }}>
              تم تحديد السعر النهائي بعد التواصل معك. يرجى مراجعة السعر والموافقة عليه للمتابعة والبدء في مراجعة الفاتورة المبدئية.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleApproveFinalPrice}
              disabled={isPending}
              className="btn btn--primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.5rem",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              {isPending ? (
                <>
                  <DynamicIcon name="Loader2" size={16} />
                  <span>جاري الاعتماد...</span>
                </>
              ) : (
                <>
                  <DynamicIcon name="Check" size={16} />
                  <span>موافق على التسعير</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* State D: pricing approved (awaiting_invoice_review, invoice_revision_required, invoice_approved) */}
      {["awaiting_invoice_review", "invoice_revision_required", "invoice_approved"].includes(shipment.status) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              padding: "1.5rem",
              backgroundColor: "rgba(16, 185, 129, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {/* Approval Confirmation Header */}
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
                    تمت الموافقة على التسعير ✅
                  </h3>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                    تم تسجيل موافقتك على التسعير بنجاح
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
                معتمد
              </span>
            </div>

            {/* Approved Pricing Details Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  السعر المتفق عليه:
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

              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", display: "block" }}>
                  حالة الشحنة الحالية:
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-gray-900)",
                    marginTop: "0.375rem",
                    display: "block",
                  }}
                >
                  بانتظار مراجعة الفاتورة
                </span>
              </div>
            </div>

            {/* Next Step Box */}
            <div
              style={{
                padding: "0.875rem 1rem",
                backgroundColor: "var(--color-surface)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <div style={{ color: "var(--color-yellow-dark)", flexShrink: 0 }}>
                <DynamicIcon name="Clock" size={18} />
              </div>
              <div>
                <strong style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)", display: "block" }}>
                  الخطوة التالية:
                </strong>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-700)" }}>
                  جاري مراجعة الفاتورة المبدئية من فريق OUT.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
