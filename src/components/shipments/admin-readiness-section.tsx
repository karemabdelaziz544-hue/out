"use client";

/**
 * Admin Shipment Readiness Section (Step 9 — Nafeza & CargoX Preparation)
 *
 * Dedicated back-office section verifying all 10 internal prerequisites:
 *  1. Company Data
 *  2. Shipment Data
 *  3. Pricing
 *  4. Customer Pricing Approval
 *  5. Preliminary Invoice
 *  6. ACID Record
 *  7. Commercial Invoice
 *  8. Packing List
 *  9. Bill of Lading
 * 10. Certificate of Origin
 *
 * Displays:
 *  - Overall Readiness status: 🟢 جاهزة للمرحلة الخارجية vs 🟡 غير جاهزة
 *  - Checklist with Name, Status, and short explanation
 *  - Action button: 'تجهيز للمرحلة الخارجية' (transitions status to ready_for_external_stage)
 *  - Audit trail timeline of stage transition events
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { evaluateShipmentReadiness } from "@/lib/shipments/readiness";
import { markShipmentReadyForExternalStageAction } from "@/lib/shipments/readiness-actions";
import type {
  Shipment,
  Company,
  ShipmentPricing,
  ShipmentAcid,
  DocumentItem,
  ShipmentStageHistoryItem,
} from "@/types";

interface AdminReadinessSectionProps {
  shipment: Shipment;
  company: Company | null;
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  documents: DocumentItem[];
  stageHistory?: ShipmentStageHistoryItem[];
}

export function AdminReadinessSection({
  shipment,
  company,
  pricing = null,
  acid = null,
  documents = [],
  stageHistory = [],
}: AdminReadinessSectionProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Section only appears when shipment has reached documents_completed or ready_for_external_stage
  const isEligibleStage =
    shipment.status === "documents_completed" ||
    shipment.status === "ready_for_external_stage";

  if (!isEligibleStage) {
    return null;
  }

  // Evaluate the 10 internal prerequisites
  const readiness = evaluateShipmentReadiness({
    shipment,
    company,
    pricing,
    acid,
    documents,
  });

  const isAlreadyMarkedReady = shipment.status === "ready_for_external_stage";

  // Action handler
  const handleMarkReady = async () => {
    if (isSubmitting || isAlreadyMarkedReady || !readiness.ready) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await markShipmentReadyForExternalStageAction(shipment.id);
      if (res.success) {
        setActionSuccess(res.message || "تم تجهيز الشحنة للمرحلة الخارجية بنجاح ✅");
        router.refresh();
      } else {
        setActionError(res.error || "فشل تجهيز الشحنة للمرحلة الخارجية.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkListEntries = Object.values(readiness.checks);

  return (
    <div
      className="card"
      style={{
        padding: "1.75rem",
        borderRadius: "var(--radius-lg)",
        border: isAlreadyMarkedReady
          ? "2px solid #10b981"
          : readiness.ready
          ? "2px solid #10b981"
          : "2px solid #f59e0b",
        backgroundColor: "var(--color-surface)",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-md)",
              backgroundColor: isAlreadyMarkedReady || readiness.ready
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(245, 158, 11, 0.12)",
              color: isAlreadyMarkedReady || readiness.ready ? "#059669" : "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="ShieldCheck" size={24} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-xl)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                جاهزية الشحنة للمرحلة الخارجية (نافذة — Nafeza)
              </h2>
              {isAlreadyMarkedReady ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.3rem 0.75rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "#065f46",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  🟢 تم التجهيز للمرحلة الخارجية
                </span>
              ) : readiness.ready ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.3rem 0.75rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "#065f46",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  🟢 جاهزة للمرحلة الخارجية
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.3rem 0.75rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    color: "#92400e",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  🟡 غير جاهزة ({readiness.summary.failed} متطلبات ناقصة)
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                margin: "0.375rem 0 0",
              }}
            >
              التحقق الآلي من استيفاء البيانات والبطاقات الاستيرادية وموافقة التسعير وACID والمستندات الأربعة المعتمدة.
            </p>
          </div>
        </div>

        {/* Progress Counter Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            padding: "0.5rem 1rem",
            backgroundColor: "var(--color-gray-50)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
            اكتمال المتطلبات:
          </span>
          <span
            style={{
              fontWeight: "var(--font-weight-bold)",
              fontSize: "var(--font-size-md)",
              color: readiness.ready ? "#059669" : "#d97706",
            }}
          >
            {readiness.summary.passed} / {readiness.summary.total}
          </span>
        </div>
      </div>

      {/* ─── Feedback Alerts ─────────────────────────────────────────────────── */}
      {actionSuccess && (
        <div
          style={{
            padding: "0.875rem 1.25rem",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#065f46",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          {actionSuccess}
        </div>
      )}

      {actionError && (
        <div
          style={{
            padding: "0.875rem 1.25rem",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#991b1b",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          {actionError}
        </div>
      )}

      {/* ─── Readiness Checklist Grid ─────────────────────────────────────────── */}
      <div>
        <h3
          style={{
            fontSize: "var(--font-size-md)",
            fontWeight: "var(--font-weight-bold)",
            margin: "0 0 1rem 0",
            color: "var(--color-black)",
          }}
        >
          قائمة التحقق من المتطلبات الداخلية (Readiness Checklist):
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "0.875rem",
          }}
        >
          {checkListEntries.map((check) => (
            <div
              key={check.key}
              style={{
                padding: "1rem 1.125rem",
                borderRadius: "var(--radius-md)",
                border: check.ready
                  ? "1px solid rgba(16, 185, 129, 0.3)"
                  : "1px solid rgba(245, 158, 11, 0.35)",
                backgroundColor: check.ready
                  ? "rgba(16, 185, 129, 0.03)"
                  : "rgba(245, 158, 11, 0.04)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "var(--radius-full)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: check.ready ? "#10b981" : "#f59e0b",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    {check.ready ? "✓" : "✗"}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-sm)",
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--color-black)",
                    }}
                  >
                    {check.name}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: check.ready
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(245, 158, 11, 0.15)",
                    color: check.ready ? "#065f46" : "#b45309",
                  }}
                >
                  {check.statusText}
                </span>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-xs)",
                  color: check.ready ? "var(--color-gray-600)" : "#b45309",
                  lineHeight: 1.5,
                }}
              >
                {check.explanation}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Action Button Section ───────────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          {isAlreadyMarkedReady ? (
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-sm)",
                color: "#059669",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              ✅ تم تأكيد جاهزية هذه الشحنة داخليًا للمرحلة الخارجية (نافذة — Nafeza).
            </p>
          ) : readiness.ready ? (
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-sm)",
                color: "#059669",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              🎉 جميع المتطلبات الـ 10 مكتملة ومعتمدة. يمكنك الآن تأكيد جاهزية الشحنة.
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
              }}
            >
              ⚠️ لا يمكن تجهيز الشحنة حتى يتم استيفاء واعتماد كافة المتطلبات الناقصة الموضحة أعلاه.
            </p>
          )}
        </div>

        <div>
          {isAlreadyMarkedReady ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.25rem",
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                color: "#065f46",
                borderRadius: "var(--radius-md)",
                fontWeight: "var(--font-weight-bold)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              <DynamicIcon name="CheckCircle" size={18} />
              مجهزة للمرحلة الخارجية
            </div>
          ) : (
            <button
              type="button"
              onClick={handleMarkReady}
              disabled={isSubmitting || !readiness.ready}
              style={{
                padding: "0.75rem 1.75rem",
                borderRadius: "var(--radius-md)",
                border: "none",
                fontWeight: "var(--font-weight-bold)",
                fontSize: "var(--font-size-sm)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                cursor: readiness.ready && !isSubmitting ? "pointer" : "not-allowed",
                backgroundColor: readiness.ready ? "var(--color-yellow)" : "var(--color-gray-200)",
                color: readiness.ready ? "var(--color-black)" : "var(--color-gray-400)",
                transition: "all 0.15s ease",
              }}
            >
              <DynamicIcon name="ExternalLink" size={18} />
              {isSubmitting ? "جاري التجهيز..." : "تجهيز للمرحلة الخارجية"}
            </button>
          )}
        </div>
      </div>

      {/* ─── Stage Transition Audit History Timeline (Section 9) ───────────────── */}
      {stageHistory.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: "1.25rem",
            marginTop: "0.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <DynamicIcon name="History" size={16} />
            <h4
              style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-gray-700)",
              }}
            >
              سجل تدقيق مراحل الشحنة (Stage Transition Audit Trail):
            </h4>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {stageHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.625rem 0.875rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-gray-50)",
                  border: "1px solid var(--color-border)",
                  fontSize: "var(--font-size-xs)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: "#10b981", fontWeight: "bold" }}>●</span>
                  <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                    {item.note || item.action}
                  </span>
                  {item.performed_by_name && (
                    <span style={{ color: "var(--color-gray-500)" }}>
                      بواسطة: {item.performed_by_name}
                    </span>
                  )}
                </div>

                <span style={{ color: "var(--color-gray-400)", direction: "ltr" }}>
                  {formatDateAr(item.performed_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
