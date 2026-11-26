"use client";

/**
 * Shipment Workflow Stepper Component
 *
 * Displays a 6-stage visual workflow progression of a shipment from creation
 * to external stage readiness, with clear distinction of:
 * - Completed stages (green check)
 * - Current active stage (black/yellow highlight)
 * - Action required stage (warning amber/red)
 * - Future locked/pending stages (muted)
 */

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";
import type { Shipment } from "@/types";

interface ShipmentWorkflowStepperProps {
  shipment: Shipment;
  isAdmin?: boolean;
  onStepClick?: (stepNumber: number) => void;
  highlightStep?: number | null;
}

export function getActiveWorkflowStepNumber(status: string): number {
  if (status === "draft") return 1;
  if (["submitted", "awaiting_pricing", "price_proposed", "negotiation", "price_agreed"].includes(status)) return 2;
  if (["awaiting_invoice_review", "invoice_revision_required"].includes(status)) return 3;
  if (["invoice_approved", "acid_processing"].includes(status)) return 4;
  if (["acid_issued", "awaiting_shipment_documents"].includes(status)) return 5;
  if (["documents_completed", "ready_for_external_stage", "customs_clearance", "customs_cleared"].includes(status)) return 6;
  return 1;
}

type StepState = "completed" | "active" | "action_required" | "pending";

interface StepInfo {
  number: number;
  label: string;
  state: StepState;
  stateText: string;
  icon: string;
}

export function ShipmentWorkflowStepper({
  shipment,
  isAdmin = false,
  onStepClick,
  highlightStep,
}: ShipmentWorkflowStepperProps) {
  const s = shipment.status as string;

  // 1. Request step
  const step1State: StepState = s === "draft" ? "active" : "completed";
  const step1Text = s === "draft" ? "مسودة" : "تم الإرسال";

  // 2. Pricing step
  let step2State: StepState = "pending";
  let step2Text = "قيد الانتظار";
  if (["price_agreed", "awaiting_invoice_review", "invoice_revision_required", "invoice_approved", "acid_processing", "acid_issued", "awaiting_shipment_documents", "documents_completed", "ready_for_external_stage"].includes(s)) {
    step2State = "completed";
    step2Text = "تم الاتفاق";
  } else if (s === "price_proposed") {
    step2State = isAdmin ? "active" : "action_required";
    step2Text = isAdmin ? "بانتظار العميل" : "مطلوب موافقتك";
  } else if (s === "negotiation") {
    step2State = isAdmin ? "action_required" : "active";
    step2Text = "قيد التفاوض";
  } else if (s === "awaiting_pricing" || s === "submitted") {
    step2State = isAdmin ? "action_required" : "active";
    step2Text = "بانتظار التسعير";
  }

  // 3. Preliminary invoice step
  let step3State: StepState = "pending";
  let step3Text = "قيد الانتظار";
  if (["invoice_approved", "acid_processing", "acid_issued", "awaiting_shipment_documents", "documents_completed", "ready_for_external_stage"].includes(s)) {
    step3State = "completed";
    step3Text = "تم الاعتماد";
  } else if (s === "invoice_revision_required") {
    step3State = isAdmin ? "active" : "action_required";
    step3Text = isAdmin ? "بانتظار تعديل العميل" : "مطلوب تعديل";
  } else if (s === "awaiting_invoice_review") {
    step3State = isAdmin ? "action_required" : "active";
    step3Text = "قيد المراجعة";
  }

  // 4. ACID step
  let step4State: StepState = "pending";
  let step4Text = "قيد الانتظار";
  if (["acid_issued", "awaiting_shipment_documents", "documents_completed", "ready_for_external_stage"].includes(s)) {
    step4State = "completed";
    step4Text = "تم الإصدار";
  } else if (s === "acid_processing") {
    step4State = isAdmin ? "action_required" : "active";
    step4Text = "جاري المعالجة";
  }

  // 5. Final shipment documents step
  let step5State: StepState = "pending";
  let step5Text = "قيد الانتظار";
  if (["documents_completed", "ready_for_external_stage"].includes(s)) {
    step5State = "completed";
    step5Text = "مكتملة ومعتمدة";
  } else if (s === "awaiting_shipment_documents") {
    step5State = isAdmin ? "active" : "action_required";
    step5Text = isAdmin ? "بانتظار المستندات" : "مطلوب رفع المستندات";
  }

  // 6. External readiness / customs clearance step
  let step6State: StepState = "pending";
  let step6Text = "قيد التجهيز";
  if (s === "customs_cleared") {
    step6State = "completed";
    step6Text = "تم الإفراج الجمركي";
  } else if (s === "customs_clearance") {
    step6State = "active";
    step6Text = "التخليص الجمركي";
  } else if (s === "ready_for_external_stage") {
    step6State = "completed";
    step6Text = "جاهزة للتخليص";
  }

  const steps: StepInfo[] = [
    { number: 1, label: "طلب الشحنة", state: step1State, stateText: step1Text, icon: "PackagePlus" },
    { number: 2, label: "التسعير والتفاوض", state: step2State, stateText: step2Text, icon: "DollarSign" },
    { number: 3, label: "الفاتورة المبدئية", state: step3State, stateText: step3Text, icon: "FileText" },
    { number: 4, label: "إصدار ACID", state: step4State, stateText: step4Text, icon: "QrCode" },
    { number: 5, label: "المستندات النهائية", state: step5State, stateText: step5Text, icon: "Files" },
    { number: 6, label: "الجاهزية الخارجية", state: step6State, stateText: step6Text, icon: "CheckCircle2" },
  ];

  const getStateColors = (state: StepState) => {
    switch (state) {
      case "completed":
        return {
          bg: "#ecfdf5",
          border: "#10b981",
          badgeBg: "#10b981",
          badgeColor: "#ffffff",
          text: "#065f46",
          iconColor: "#059669",
        };
      case "action_required":
        return {
          bg: "#fef3c7",
          border: "#f59e0b",
          badgeBg: "#f59e0b",
          badgeColor: "#ffffff",
          text: "#92400e",
          iconColor: "#d97706",
        };
      case "active":
        return {
          bg: "var(--color-yellow-light)",
          border: "var(--color-black)",
          badgeBg: "var(--color-black)",
          badgeColor: "var(--color-yellow)",
          text: "var(--color-black)",
          iconColor: "var(--color-black)",
        };
      case "pending":
      default:
        return {
          bg: "var(--color-gray-50)",
          border: "var(--color-border)",
          badgeBg: "var(--color-gray-200)",
          badgeColor: "var(--color-gray-500)",
          text: "var(--color-gray-500)",
          iconColor: "var(--color-gray-400)",
        };
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.25rem 1.5rem",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <DynamicIcon name="Layers" size={18} />
          <h2
            style={{
              fontSize: "var(--font-size-base)",
              fontWeight: "var(--font-weight-semibold)",
              margin: 0,
              color: "var(--color-black)",
            }}
          >
            مسار إجراءات الشحنة
          </h2>
        </div>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
          6 مراحل تشغيلية متتابعة
        </span>
      </div>

      {/* Steps Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {steps.map((st) => {
          const colors = getStateColors(st.state);
          const isHighlighted = highlightStep === st.number;
          const isClickable = Boolean(onStepClick);

          const content = (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    backgroundColor: colors.badgeBg,
                    color: colors.badgeColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                  }}
                >
                  {st.state === "completed" ? "✓" : st.number}
                </div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <DynamicIcon name={st.icon as any} size={16} style={{ color: colors.iconColor }} />
              </div>

              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-black)",
                  marginTop: "0.15rem",
                  textAlign: "right",
                }}
              >
                {st.label}
              </div>

              <div
                style={{
                  fontSize: "11px",
                  color: colors.text,
                  fontWeight: "var(--font-weight-medium)",
                  textAlign: "right",
                }}
              >
                {st.stateText}
              </div>
            </>
          );

          const stepStyle: React.CSSProperties = {
            padding: "0.875rem 0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: colors.bg,
            border: isHighlighted
              ? "2px solid var(--color-black)"
              : `1px solid ${colors.border}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "0.375rem",
            position: "relative",
            transition: "all 0.2s ease",
            boxShadow: isHighlighted ? "0 0 0 2px var(--color-yellow)" : "none",
            cursor: isClickable ? "pointer" : "default",
            font: "inherit",
            textAlign: "right",
            width: "100%",
          };

          if (isClickable) {
            return (
              <button
                key={st.number}
                type="button"
                onClick={() => onStepClick?.(st.number)}
                style={{
                  ...stepStyle,
                  background: colors.bg,
                }}
                title={`الانتقال إلى المرحلة ${st.number}: ${st.label}`}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={st.number} style={stepStyle}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
