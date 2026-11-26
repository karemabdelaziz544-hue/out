"use client";

/**
 * Customer ACID Section (Step 7)
 *
 * Dedicated section in the customer shipment details view:
 *  - Displays visual 5-step clearance progress timeline
 *  - Shows current ACID stage (pending, processing, issued, failed)
 *  - Prominently showcases the verified ACID number when issued with quick copy
 *  - Strictly read-only for customer with zero mutation capabilities
 */

import React, { useState } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { Shipment, ShipmentAcid } from "@/types";
import { ACID_STATUS_LABELS } from "@/types";

interface CustomerAcidSectionProps {
  shipment: Shipment;
  acid?: ShipmentAcid | null;
}

export function CustomerAcidSection({
  shipment,
  acid = null,
}: CustomerAcidSectionProps) {
  const [copied, setCopied] = useState(false);

  // If shipment has acid record attached on shipment object, use it as fallback
  const acidRecord = acid || shipment.acid || null;

  // Determine stage eligibility:
  // Render if shipment is in invoice_approved, acid_processing, acid_issued, or has an acid record
  const isEligible =
    shipment.status === "invoice_approved" ||
    shipment.status === "acid_processing" ||
    shipment.status === "acid_issued" ||
    Boolean(acidRecord);

  if (!isEligible) {
    return null;
  }

  const currentStatus =
    acidRecord?.status ||
    (shipment.status === "acid_issued"
      ? "issued"
      : shipment.status === "acid_processing"
      ? "processing"
      : "pending");

  const isIssued = currentStatus === "issued";
  const isProcessing = currentStatus === "processing";
  const isPending = currentStatus === "pending";
  const isFailed = currentStatus === "failed";

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.75rem",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "var(--radius-md)",
              backgroundColor: isIssued
                ? "rgba(16, 185, 129, 0.12)"
                : isProcessing
                ? "rgba(99, 102, 241, 0.12)"
                : isFailed
                ? "rgba(239, 68, 68, 0.1)"
                : "rgba(245, 158, 11, 0.12)",
              color: isIssued
                ? "#047857"
                : isProcessing
                ? "#4338ca"
                : isFailed
                ? "#b91c1c"
                : "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon
              name={
                isIssued
                  ? "CheckCircle"
                  : isProcessing
                  ? "Loader"
                  : isFailed
                  ? "AlertTriangle"
                  : "Clock"
              }
              size={22}
            />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                الرقم الجمركي المبدئي (ACID)
              </h2>
              <span
                style={{
                  padding: "0.2rem 0.625rem",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-medium)",
                  backgroundColor: isIssued
                    ? "rgba(16, 185, 129, 0.15)"
                    : isProcessing
                    ? "rgba(99, 102, 241, 0.12)"
                    : isFailed
                    ? "rgba(239, 68, 68, 0.1)"
                    : "rgba(245, 158, 11, 0.12)",
                  color: isIssued
                    ? "#065f46"
                    : isProcessing
                    ? "#4338ca"
                    : isFailed
                    ? "#b91c1c"
                    : "#b45309",
                  border: isIssued
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : isProcessing
                    ? "1px solid rgba(99, 102, 241, 0.3)"
                    : isFailed
                    ? "1px solid rgba(239, 68, 68, 0.3)"
                    : "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                {ACID_STATUS_LABELS[currentStatus] || currentStatus}
              </span>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
                margin: "0.25rem 0 0 0",
              }}
            >
              متابعة استخراج وإصدار رقم ACID المعتمد لشحنتك
            </p>
          </div>
        </div>
      </div>

      {/* Visual Workflow Steps (Section 19) */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "var(--color-gray-50)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-gray-500)",
            display: "block",
            marginBottom: "0.875rem",
          }}
        >
          مراحل معالجة طلبك
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Step 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              تم إنشاء الطلب
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              تم التسعير
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 3 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              تمت الموافقة على التسعير
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 4 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)" }}>
              تم اعتماد الفاتورة المبدئية
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 5: ACID */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.25rem 0.5rem",
              backgroundColor: isIssued ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.12)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {isIssued ? (
              <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
            ) : (
              <span style={{ color: "#4338ca", fontWeight: "bold" }}>●</span>
            )}
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-bold)",
                color: isIssued ? "#065f46" : "#4338ca",
              }}
            >
              {isIssued ? "تم إصدار ACID" : "معالجة ACID"}
            </span>
          </div>

          <span style={{ color: "var(--color-gray-300)" }}>←</span>

          {/* Step 6 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span style={{ color: "var(--color-gray-400)" }}>○</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-400)" }}>
              المرحلة التالية
            </span>
          </div>
        </div>
      </div>

      {/* Status Details */}
      {isPending && (
        <div
          style={{
            padding: "1.25rem 1.5rem",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <div style={{ color: "#b45309", marginTop: "0.125rem" }}>
            <DynamicIcon name="Clock" size={20} />
          </div>
          <div>
            <strong
              style={{
                display: "block",
                color: "#92400e",
                fontSize: "var(--font-size-sm)",
                marginBottom: "0.25rem",
              }}
            >
              بانتظار المعالجة
            </strong>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-700)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              تم اعتماد الفاتورة المبدئية بنجاح، وسيتم قريباً بدء إجراءات استخراج وتجهيز رقم الـ ACID الخاص بشحنتك بواسطة فريق العمل.
            </p>
          </div>
        </div>
      )}

      {isProcessing && (
        <div
          style={{
            padding: "1.25rem 1.5rem",
            backgroundColor: "rgba(99, 102, 241, 0.05)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <div style={{ color: "#4338ca", marginTop: "0.125rem" }}>
            <DynamicIcon name="Loader" size={20} />
          </div>
          <div>
            <strong
              style={{
                display: "block",
                color: "#3730a3",
                fontSize: "var(--font-size-sm)",
                marginBottom: "0.25rem",
              }}
            >
              جاري معالجة ACID
            </strong>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-700)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              يقوم فريق العمل حالياً بإجراءات استخراج وتجهيز رقم الـ ACID لشحنتك. سيظهر الرقم هنا فور صدوره واعتماده.
            </p>
          </div>
        </div>
      )}

      {isIssued && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
              }}
            >
              ✓
            </div>
            <div>
              <strong
                style={{
                  display: "block",
                  color: "#065f46",
                  fontSize: "var(--font-size-base)",
                }}
              >
                تم إصدار ACID بنجاح ✅
              </strong>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                الرقم مسجل ومعتمد رسميًا لهذه الشحنة
              </span>
            </div>
          </div>

          {/* Large Monospace Box with Copy Button */}
          <div
            style={{
              padding: "1.25rem 1.5rem",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                رقم ACID:
              </span>
              <span
                dir="ltr"
                style={{
                  fontSize: "var(--font-size-2xl)",
                  fontFamily: "var(--font-family-mono)",
                  fontWeight: "var(--font-weight-bold)",
                  letterSpacing: "0.08em",
                  color: "var(--color-black)",
                }}
              >
                {acidRecord?.acid_number}
              </span>
            </div>

            {acidRecord?.acid_number && (
              <button
                type="button"
                onClick={() => handleCopy(acidRecord.acid_number!)}
                className="btn btn--outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <DynamicIcon name={copied ? "Check" : "Copy"} size={16} />
                <span>{copied ? "تم النسخ!" : "نسخ الرقم"}</span>
              </button>
            )}
          </div>

          {acidRecord?.issued_at && (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
              <span>تاريخ الإصدار: </span>
              <strong>{formatDateAr(acidRecord.issued_at)}</strong>
            </div>
          )}
        </div>
      )}

      {isFailed && (
        <div
          style={{
            padding: "1.25rem 1.5rem",
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <div style={{ color: "#b91c1c", marginTop: "0.125rem" }}>
            <DynamicIcon name="AlertTriangle" size={20} />
          </div>
          <div>
            <strong
              style={{
                display: "block",
                color: "#991b1b",
                fontSize: "var(--font-size-sm)",
                marginBottom: "0.25rem",
              }}
            >
              حدثت مشكلة في معالجة ACID
            </strong>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-700)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              يواجه فريق العمل مسألة إجرائية في استخراج رقم ACID، وجاري المتابعة والمعالجة من قبل الإدارة لاستكمال الإجراءات بأقرب وقت.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
