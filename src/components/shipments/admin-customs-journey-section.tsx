"use client";

/**
 * Admin Customs Clearance Journey Component (رحلة التخليص الجمركي)
 *
 * Primary operational workspace for customs clearance at OUT:
 * - 10-stage operational workflow with progressive disclosure
 * - Shipment-type branching (Agricultural, Industrial, Food, Other)
 * - Operational role visibility (Admin, Scout, Inspector, Data Entry, Valuer)
 * - Egyptian customs procedures (Nafeza, Quarantine, NFSA, GOEIC)
 * - Special handling for "رقم 46" (awaiting operational confirmation)
 * - Strictly NO CargoX
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import {
  GoodsCategory,
  CustomsStageKey,
  CustomsStageStatus,
  ShipmentCustomsJourney,
  CustomsJourneyStage,
  GOODS_CATEGORY_LABELS,
  GOODS_CATEGORIES,
  APPLICABLE_PROCEDURE_DEFINITIONS,
  OPERATIONAL_ROLES_INFO,
  CUSTOMS_STAGE_STATUS_CONFIG,
  CUSTOMS_STAGE_DEFINITIONS,
  getWorkflowTemplateForCategory,
  CUSTOMS_WORKFLOW_TEMPLATES,
} from "@/types/journey";
import {
  updateShipmentClassificationAction,
  updateCustomsStageAction,
} from "@/lib/shipments/journey-actions";
import type { Shipment, DocumentItem, ShipmentPricing } from "@/types";

interface AdminCustomsJourneySectionProps {
  shipment: Shipment;
  journey: ShipmentCustomsJourney | null;
  documents: DocumentItem[];
  pricing?: ShipmentPricing | null;
  onSelectWorkflowTab?: (stepNumber: number) => void;
}

export function AdminCustomsJourneySection({
  shipment,
  journey,
  documents,
  pricing = null,
  onSelectWorkflowTab,
}: AdminCustomsJourneySectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active expanded stage in the workspace
  const [activeStageKey, setActiveStageKey] = useState<CustomsStageKey>(
    journey?.activeStageKey || "stage_1_intake",
  );

  // Modals & Panels
  const [showClassificationModal, setShowClassificationModal] = useState(false);
  const [editingStage, setEditingStage] = useState<CustomsJourneyStage | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Classification Edit State
  const [selectedCategory, setSelectedCategory] = useState<GoodsCategory>(
    journey?.goods_category || shipment.goods_category || "other",
  );
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>(
    journey?.applicable_procedures || shipment.applicable_procedures || ["general_customs_procedure"],
  );
  const [classificationNotes, setClassificationNotes] = useState<string>(
    journey?.classification_notes || shipment.classification_notes || "",
  );

  // Stage Update Form State
  const [formStatus, setFormStatus] = useState<CustomsStageStatus>("in_progress");
  const [formOutcome, setFormOutcome] = useState<string>("");
  const [formRefNumber, setFormRefNumber] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formDelayReason, setFormDelayReason] = useState<string>("");
  const [formIsApplicable, setFormIsApplicable] = useState<boolean>(true);
  const [formStageData, setFormStageData] = useState<Record<string, unknown>>({});

  // Stage 9 Financial Settlement Fields in edit modal
  const [formDutiesAmount, setFormDutiesAmount] = useState<string>("");
  const [formDutiesPaidByOut, setFormDutiesPaidByOut] = useState<boolean>(false);
  const [formOutPaymentRef, setFormOutPaymentRef] = useState<string>("");
  const [formOutPaymentDate, setFormOutPaymentDate] = useState<string>("");
  const [formCollectedFromCustomer, setFormCollectedFromCustomer] = useState<string>("");
  const [formCustomerCollectionRef, setFormCustomerCollectionRef] = useState<string>("");
  const [formCustomerCollectionDate, setFormCustomerCollectionDate] = useState<string>("");
  const [formCustomsClaimNumber, setFormCustomsClaimNumber] = useState<string>("");
  const [formSettlementStatus, setFormSettlementStatus] = useState<string>("pending_payment");
  const [formCustomerDirectPaymentRef, setFormCustomerDirectPaymentRef] = useState<string>("");

  // Stage 7 Declaration 46
  const [formDeclaration46, setFormDeclaration46] = useState<string>("");

  if (!journey) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <DynamicIcon name="Loader" size={24} style={{ color: "var(--color-yellow-dark)" }} />
        <p style={{ marginTop: "0.75rem", fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>
          جاري تحميل وتجهيز رحلة التخليص الجمركي...
        </p>
      </div>
    );
  }

  const stages = journey.stages;
  const currentStage = stages.find((s) => s.stage_key === activeStageKey) || stages[0];
  const currentStageDef = CUSTOMS_STAGE_DEFINITIONS[currentStage.stage_key];

  // Procedure list info for the current category
  const activeProcedures = APPLICABLE_PROCEDURE_DEFINITIONS.filter((p) =>
    journey.applicable_procedures.includes(p.id),
  );

  // Handle Classification Submit
  const handleSaveClassification = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("goods_category", selectedCategory);
    formData.append("classification_notes", classificationNotes);
    for (const proc of selectedProcedures) {
      formData.append("applicable_procedures", proc);
    }

    startTransition(async () => {
      const res = await updateShipmentClassificationAction(formData);
      if (res.success) {
        setFeedbackMessage({ type: "success", text: res.message || "تم حفظ التصنيف بنجاح." });
        setShowClassificationModal(false);
        router.refresh();
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "فشل تحديث التصنيف." });
      }
    });
  };

  // Open Stage Edit Modal
  const openEditStageModal = (stage: CustomsJourneyStage) => {
    setEditingStage(stage);
    setFormStatus(stage.status);
    setFormOutcome(stage.outcome || "");
    setFormRefNumber(stage.reference_number || "");
    setFormNotes(stage.notes || "");
    setFormDelayReason(stage.rejection_or_delay_reason || "");
    setFormIsApplicable(stage.is_applicable);
    setFormStageData(stage.stage_data || {});

    // Stage 9 settlement extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settlement = (stage.stage_data?.customs_duties_settlement || {}) as Record<string, any>;
    setFormCustomsClaimNumber(settlement.customs_claim_number || "");
    setFormDutiesAmount(
      settlement.duties_amount !== undefined && settlement.duties_amount !== null
        ? String(settlement.duties_amount)
        : "",
    );
    setFormDutiesPaidByOut(Boolean(settlement.duties_paid_by_out));
    setFormOutPaymentRef(settlement.out_payment_reference || "");
    setFormOutPaymentDate(settlement.out_payment_date || "");
    setFormCollectedFromCustomer(
      settlement.collected_from_customer !== undefined && settlement.collected_from_customer !== null
        ? String(settlement.collected_from_customer)
        : "",
    );
    setFormCustomerCollectionRef(settlement.customer_collection_reference || "");
    setFormCustomerCollectionDate(settlement.customer_collection_date || "");
    setFormSettlementStatus(settlement.settlement_status || "pending_payment");
    setFormCustomerDirectPaymentRef(settlement.customer_direct_payment_reference || stage.reference_number || "");

    // Stage 7 declaration 46 extraction
    setFormDeclaration46((stage.stage_data?.declaration_46_number as string) || "");
  };

  // Handle Stage Update Submit
  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage) return;
    setFeedbackMessage(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("stage_key", editingStage.stage_key);
    formData.append("status", formStatus);
    formData.append("outcome", formOutcome);
    formData.append("reference_number", formRefNumber);
    formData.append("notes", formNotes);
    formData.append("rejection_or_delay_reason", formDelayReason);
    formData.append("is_applicable", formIsApplicable ? "true" : "false");
    formData.append("stage_data", JSON.stringify(formStageData));

    // Append Stage 9 financial settlement data
    if (editingStage.stage_key === "stage_9_fees_payments") {
      formData.append("customs_claim_number", formCustomsClaimNumber);
      formData.append("duties_amount", formDutiesAmount);
      formData.append("duties_paid_by_out", formDutiesPaidByOut ? "true" : "false");
      formData.append("out_payment_reference", formOutPaymentRef);
      formData.append("out_payment_date", formOutPaymentDate);
      formData.append("collected_from_customer", formCollectedFromCustomer);
      formData.append("customer_collection_reference", formCustomerCollectionRef);
      formData.append("customer_collection_date", formCustomerCollectionDate);
      formData.append("settlement_status", formSettlementStatus);
      if (formCustomerDirectPaymentRef) {
        formData.append("customer_direct_payment_reference", formCustomerDirectPaymentRef);
      }
    }

    // Append Stage 7 declaration 46 data
    if (editingStage.stage_key === "stage_7_data_entry") {
      formData.append("declaration_46_number", formDeclaration46);
    }

    startTransition(async () => {
      const res = await updateCustomsStageAction(formData);
      if (res.success) {
        setFeedbackMessage({ type: "success", text: res.message || "تم تحديث المرحلة بنجاح." });
        setEditingStage(null);
        router.refresh();
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "فشل تحديث المرحلة." });
      }
    });
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        marginBottom: "2rem",
      }}
    >
      {/* ─── 1. Header Banner & Progress Indicator ─── */}
      <div
        style={{
          padding: "1.5rem",
          background: "linear-gradient(135deg, #18181b 0%, #27272a 100%)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-yellow)",
                color: "var(--color-black)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "var(--font-weight-bold)",
                fontSize: "1.5rem",
                boxShadow: "0 4px 12px rgba(234, 179, 8, 0.3)",
              }}
            >
              <DynamicIcon name="Navigation" size={26} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <h2 style={{ fontSize: "1.35rem", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
                  رحلة التخليص الجمركي
                </h2>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "var(--font-weight-bold)",
                    padding: "0.2rem 0.6rem",
                    borderRadius: "999px",
                    backgroundColor: journey.isFullyCleared ? "#10b981" : "rgba(255,255,255,0.15)",
                    color: "#ffffff",
                  }}
                >
                  {journey.isFullyCleared ? "تم الإفراج الجمركي الكامل" : "مسار تشغيلي مباشر"}
                </span>
              </div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.825rem", color: "#a1a1aa" }}>
                المسار التشغيلي المتكامل لمراحل وإجراءات التخليص حسب نوع البضاعة والجهات الرقابية
              </p>
            </div>
          </div>

          {/* Quick Metrics & Classification Trigger */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {(() => {
              const activeTemplate = getWorkflowTemplateForCategory(journey.goods_category);
              return (
                <button
                  type="button"
                  onClick={() => setShowClassificationModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.9rem",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    color: "#ffffff",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.8rem",
                    fontWeight: "var(--font-weight-medium)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  title={activeTemplate.description}
                >
                  <DynamicIcon name="Layers" size={15} style={{ color: "var(--color-yellow)" }} />
                  <span>
                    مسار الشحنة: <strong>{activeTemplate.badge}</strong>
                  </span>
                  <DynamicIcon name="Edit3" size={13} style={{ color: "#a1a1aa" }} />
                </button>
              );
            })()}

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 0.85rem",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "var(--radius-md)",
                fontSize: "0.8rem",
                color: "#e4e4e7",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span>المراحل المطبقة المكتملة:</span>
              <strong style={{ color: "var(--color-yellow)" }}>
                {journey.completedStagesCount} / {journey.applicableStagesCount}
              </strong>
            </div>
          </div>
        </div>

        {/* Journey Progress Bar */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.75rem",
              color: "#a1a1aa",
              marginBottom: "0.4rem",
            }}
          >
            <span>إجمالي الإنجاز في المسار الجمركي</span>
            <span style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-yellow)" }}>
              {journey.progressPercentage}%
            </span>
          </div>
          <div
            style={{
              height: "8px",
              width: "100%",
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              borderRadius: "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${journey.progressPercentage}%`,
                backgroundColor: "var(--color-yellow)",
                borderRadius: "999px",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── Feedback Alert (if any) ─── */}
      {feedbackMessage && (
        <div
          style={{
            padding: "0.75rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: feedbackMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
            borderBottom: `1px solid ${feedbackMessage.type === "success" ? "#a7f3d0" : "#fecaca"}`,
            color: feedbackMessage.type === "success" ? "#065f46" : "#991b1b",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DynamicIcon
              name={feedbackMessage.type === "success" ? "CheckCircle" : "AlertTriangle"}
              size={18}
            />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            <DynamicIcon name="X" size={16} />
          </button>
        </div>
      )}

      {/* ─── 2. Interactive Arabic RTL Stepper / Stage Strip ─── */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "#fafafa",
          borderBottom: "1px solid var(--color-border)",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: "0.6rem",
            minWidth: "max-content",
          }}
        >
          {stages.map((stage) => {
            const def = CUSTOMS_STAGE_DEFINITIONS[stage.stage_key];
            const statusCfg = CUSTOMS_STAGE_STATUS_CONFIG[stage.status];
            const isSelected = stage.stage_key === activeStageKey;
            const isCurrentActiveJourneyStage = stage.stage_key === journey.activeStageKey;

            return (
              <button
                key={stage.stage_key}
                type="button"
                onClick={() => setActiveStageKey(stage.stage_key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.35rem",
                  padding: "0.65rem 0.85rem",
                  minWidth: "160px",
                  maxWidth: "185px",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: isSelected ? "#ffffff" : "var(--color-surface)",
                  border: isSelected
                    ? "2px solid var(--color-black)"
                    : isCurrentActiveJourneyStage
                    ? "2px solid var(--color-yellow)"
                    : "1px solid var(--color-border)",
                  boxShadow: isSelected ? "var(--shadow-md)" : "none",
                  cursor: "pointer",
                  textAlign: "right",
                  position: "relative",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Stage Number & Status Badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "999px",
                      backgroundColor:
                        stage.status === "completed"
                          ? "#047857"
                          : isSelected
                          ? "var(--color-black)"
                          : "var(--color-gray-200)",
                      color:
                        stage.status === "completed" || isSelected
                          ? "#ffffff"
                          : "var(--color-gray-700)",
                      fontSize: "11px",
                      fontWeight: "var(--font-weight-bold)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {stage.status === "completed" ? "✓" : def.order}
                  </span>

                  <span
                    style={{
                      fontSize: "10px",
                      padding: "0.15rem 0.4rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: statusCfg.bg,
                      color: statusCfg.color,
                      border: `1px solid ${statusCfg.borderColor}`,
                      fontWeight: "var(--font-weight-medium)",
                    }}
                  >
                    {statusCfg.label}
                  </span>
                </div>

                {/* Stage Title */}
                <strong
                  style={{
                    fontSize: "0.825rem",
                    color: isSelected ? "var(--color-black)" : "var(--color-gray-800)",
                    lineHeight: 1.3,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {def.title}
                </strong>

                {/* Expected Role Preview */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "10px",
                    color: "var(--color-gray-500)",
                    marginTop: "auto",
                  }}
                >
                  <DynamicIcon name="UserCheck" size={11} />
                  <span>{OPERATIONAL_ROLES_INFO[def.expectedRole].badgeLabel}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 3. Active Workspace for Current Selected Stage ─── */}
      <div style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Stage Header & Overview */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            paddingBottom: "1.25rem",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: "var(--font-weight-bold)",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-yellow-light)",
                  color: "var(--color-yellow-dark)",
                }}
              >
                المرحلة رقم {currentStageDef.order} من 10
              </span>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
                {currentStageDef.title}
              </h3>
            </div>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.875rem", color: "var(--color-gray-600)" }}>
              {currentStageDef.purpose}
            </p>
          </div>

          {/* Action Trigger Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => openEditStageModal(currentStage)}
              disabled={isPending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 1rem",
                backgroundColor: "var(--color-black)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "0.85rem",
                fontWeight: "var(--font-weight-medium)",
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <DynamicIcon name="Edit3" size={15} />
              <span>تحديث حالة المرحلة والنتائج</span>
            </button>
          </div>
        </div>

        {/* Special Notice for رقم 46 if on Stage 7 */}
        {currentStageDef.specialNotice && (
          <div
            style={{
              padding: "0.9rem 1.15rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "#fffbeb",
              border: "1px solid #fef3c7",
              color: "#92400e",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.65rem",
            }}
          >
            <DynamicIcon name="Info" size={18} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>تنبيه تشغيلي (رقم 46):</strong> {currentStageDef.specialNotice}
            </div>
          </div>
        )}

        {/* Stage Operational Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {/* Card 1: Operational Status & Responsible Role */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "#fafafa",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-gray-700)" }}>
              <DynamicIcon name="Shield" size={17} />
              <strong style={{ fontSize: "0.9rem" }}>الحالة والمسؤولية التشغيلية</strong>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)" }}>الحالة الحالية:</span>
              <span
                style={{
                  fontSize: "0.85rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: CUSTOMS_STAGE_STATUS_CONFIG[currentStage.status].bg,
                  color: CUSTOMS_STAGE_STATUS_CONFIG[currentStage.status].color,
                  border: `1px solid ${CUSTOMS_STAGE_STATUS_CONFIG[currentStage.status].borderColor}`,
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                {CUSTOMS_STAGE_STATUS_CONFIG[currentStage.status].label}
              </span>
            </div>

            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", display: "block" }}>
                الدور التشغيلي المتوقع:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.2rem" }}>
                <strong style={{ fontSize: "0.875rem", color: "var(--color-black)" }}>
                  {OPERATIONAL_ROLES_INFO[currentStageDef.expectedRole].label}
                </strong>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                    backgroundColor: currentStageDef.isRoleConfirmed ? "#ecfdf5" : "#fef3c7",
                    color: currentStageDef.isRoleConfirmed ? "#047857" : "#b45309",
                    fontWeight: "var(--font-weight-medium)",
                  }}
                >
                  {currentStageDef.isRoleConfirmed ? "مسؤولية مؤكدة" : "قيد التأكيد التشغيلي"}
                </span>
              </div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
                {OPERATIONAL_ROLES_INFO[currentStageDef.expectedRole].description}
              </p>
            </div>

            {currentStage.completed_at && (
              <div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", display: "block" }}>
                  تاريخ ووقت الاكتمال:
                </span>
                <span style={{ fontSize: "0.825rem", fontWeight: "var(--font-weight-medium)", color: "#047857" }}>
                  {formatDateAr(currentStage.completed_at)}
                  {currentStage.completed_by_name ? ` (بواسطة ${currentStage.completed_by_name})` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Card 2: Completion Criteria & Required Documents */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "#fafafa",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-gray-700)" }}>
              <DynamicIcon name="CheckSquare" size={17} />
              <strong style={{ fontSize: "0.9rem" }}>معايير الاكتمال والمستندات</strong>
            </div>

            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", display: "block" }}>
                شرط اكتمال المرحلة:
              </span>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.825rem", color: "var(--color-black)", lineHeight: 1.4 }}>
                {currentStageDef.completionCriteria}
              </p>
            </div>

            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", display: "block" }}>
                المستندات المطلوبة للاستيفاء:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                {currentStageDef.requiredDocuments.map((docName, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: "11px",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-gray-700)",
                    }}
                  >
                    📄 {docName}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block", marginTop: "0.4rem" }}>
                (مرفوع حالياً: {documents.length} مستند في ملف الشحنة)
              </span>
            </div>
          </div>

          {/* Card 3: Recorded Outcome & References */}
          <div
            style={{
              padding: "1.25rem",
              backgroundColor: "#fafafa",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-gray-700)" }}>
              <DynamicIcon name="FileText" size={17} />
              <strong style={{ fontSize: "0.9rem" }}>النتيجة الموثقة والمراجع</strong>
            </div>

            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", display: "block" }}>
                النتيجة المسجلة:
              </span>
              <strong
                style={{
                  fontSize: "0.85rem",
                  color: currentStage.outcome ? "var(--color-black)" : "var(--color-gray-400)",
                  display: "block",
                  marginTop: "0.2rem",
                }}
              >
                {currentStage.outcome || "لم تُسجل نتيجة بعد"}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", display: "block" }}>
                الرقم المرجعي الرسمي:
              </span>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                  fontWeight: "var(--font-weight-bold)",
                  color: currentStage.reference_number ? "var(--color-black)" : "var(--color-gray-400)",
                }}
              >
                {currentStage.reference_number || "—"}
              </span>
            </div>

            {currentStage.rejection_or_delay_reason && (
              <div
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fee2e2",
                  color: "#991b1b",
                  fontSize: "0.775rem",
                }}
              >
                <strong>سبب التأخير / الملاحظات:</strong> {currentStage.rejection_or_delay_reason}
              </div>
            )}
          </div>
        </div>

        {/* ─── Stage-Specific Operational Details Panel ─── */}
        {currentStage.stage_key === "stage_4_type_procedures" && (
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-yellow-light)",
              border: "1px solid var(--color-yellow)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "0.95rem", color: "var(--color-black)" }}>
                🌿 إجراءات الجهات العارضة المطبقة على هذه الشحنة ({GOODS_CATEGORY_LABELS[journey.goods_category].split(" ")[0]})
              </strong>
              <button
                type="button"
                onClick={() => setShowClassificationModal(true)}
                style={{
                  fontSize: "0.8rem",
                  background: "none",
                  border: "none",
                  color: "var(--color-yellow-dark)",
                  cursor: "pointer",
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                تعديل المسارات ↗
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {activeProcedures.map((proc) => (
                <div
                  key={proc.id}
                  style={{
                    padding: "0.85rem",
                    backgroundColor: "#ffffff",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: "0.85rem", color: "var(--color-black)" }}>{proc.name}</strong>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "0.1rem 0.4rem",
                        borderRadius: "4px",
                        backgroundColor: proc.isConfirmedRule ? "#ecfdf5" : "#fef3c7",
                        color: proc.isConfirmedRule ? "#047857" : "#b45309",
                      }}
                    >
                      {proc.isConfirmedRule ? "إلزامية" : "استرشادية"}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", display: "block", marginTop: "0.25rem" }}>
                    الجهة: {proc.authorityName}
                  </span>
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.775rem", color: "var(--color-gray-600)" }}>
                    {proc.purpose}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage 5 Scouting Specific View */}
        {currentStage.stage_key === "stage_5_scouting" && (
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "#f8fafc",
              border: "1px solid var(--color-border)",
            }}
          >
            <strong style={{ fontSize: "0.95rem", color: "var(--color-black)", display: "block", marginBottom: "0.5rem" }}>
              🔍 تقرير الكشف الميداني الأولي (كشاف / Scout)
            </strong>
            <p style={{ fontSize: "0.825rem", color: "var(--color-gray-600)", margin: 0 }}>
              الكشف ليس إلزامياً لكافة الرسائل؛ يعتمد على تقرير وصول الحاوية ومطابقة الأختام الملاحية مع المنافستو في ساحة التداول الجمركي.
            </p>
          </div>
        )}

        {/* Stage 8 Valuation Separation View */}
        {currentStage.stage_key === "stage_8_valuation" && (
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "#f8fafc",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <DynamicIcon name="Layers" size={18} style={{ color: "var(--color-yellow-dark)" }} />
              <strong style={{ fontSize: "0.95rem", color: "var(--color-black)" }}>
                فصل التثمين الجمركي عن أتعاب خدمة OUT
              </strong>
            </div>
            <p style={{ fontSize: "0.825rem", color: "var(--color-gray-600)", margin: 0, lineHeight: 1.4 }}>
              القيمة المقدرة هنا تخص وعاء احتساب الرسوم والضرائب الجمركية الرسمية، وتظل مفصولة تماماً عن أتعاب التخليص الخاصة بشركة OUT وعن المدفوعات الحكومية المسددة.
            </p>
          </div>
        )}

        {/* Stage 9 Fees and Payments Verification View */}
        {currentStage.stage_key === "stage_9_fees_payments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                padding: "1.25rem",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <DynamicIcon name="CreditCard" size={18} style={{ color: "#1d4ed8" }} />
                <strong style={{ fontSize: "0.95rem", color: "#1e3a8a" }}>
                  قاعدة تسوية الرسوم والضرائب الجمركية (المسددة من OUT)
                </strong>
              </div>
              <p style={{ fontSize: "0.825rem", color: "#1e40af", margin: 0, lineHeight: 1.5 }}>
                وفق قواعد العمل المعتمدة: تقوم شركة OUT بسداد الرسوم والضرائب الجمركية المقررة رسمياً بالنيابة عن العميل ثم تحصّلها منه بموجب إشعارات ومطالبات سداد معتمدة.
                وهذه الرسوم <strong>منفصلة تماماً عن أتعاب خدمة OUT</strong> المتفق عليها في مرحلة التسعير.
              </p>
            </div>

            {/* Financial Settlement Breakdown Grid */}
            {(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const settlement = (currentStage.stage_data?.customs_duties_settlement || {}) as Record<string, any>;
              const dutiesAmount = settlement.duties_amount !== undefined && settlement.duties_amount !== null ? Number(settlement.duties_amount) : null;
              const collectedAmount = settlement.collected_from_customer !== undefined && settlement.collected_from_customer !== null ? Number(settlement.collected_from_customer) : null;
              const dutiesPaidByOut = Boolean(settlement.duties_paid_by_out);

              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "1rem",
                  }}
                >
                  {/* Card 1: OUT Service Fee */}
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#ffffff",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      borderRight: "4px solid var(--color-yellow)",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block" }}>
                      أتعاب خدمة OUT (المتفق عليها)
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "var(--color-black)", display: "block", marginTop: "0.25rem" }}>
                      {pricing?.final_price
                        ? `${pricing.final_price.toLocaleString("ar-EG")} جنيه`
                        : pricing?.estimated_min_price
                        ? `${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price?.toLocaleString("ar-EG")} جنيه (تقديري)`
                        : "لم تسجل بعد"}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block", marginTop: "0.25rem" }}>
                      مقابل خدمات التخليص والمتابعة
                    </span>
                  </div>

                  {/* Card 2: Customs Duties */}
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#ffffff",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      borderRight: `4px solid ${
                        settlement.settlement_status === "customer_paid_direct"
                          ? "#10b981"
                          : dutiesPaidByOut
                          ? "#10b981"
                          : "#f59e0b"
                      }`,
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block" }}>
                      الرسوم والضرائب الجمركية الرسمية
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "var(--color-black)", display: "block", marginTop: "0.25rem" }}>
                      {dutiesAmount !== null ? `${dutiesAmount.toLocaleString("ar-EG")} جنيه` : "بانتظار صدور المطالبة"}
                    </strong>
                    <span
                      style={{
                        fontSize: "11px",
                        color:
                          settlement.settlement_status === "customer_paid_direct"
                            ? "#047857"
                            : dutiesPaidByOut
                            ? "#047857"
                            : "#b45309",
                        fontWeight: "bold",
                        display: "block",
                        marginTop: "0.25rem",
                      }}
                    >
                      {settlement.settlement_status === "customer_paid_direct"
                        ? `✅ مسددة مباشرة من العميل للجمارك (${settlement.customer_direct_payment_reference || currentStage.reference_number || "إيصال معتمد"})`
                        : dutiesPaidByOut
                        ? `✅ تم السداد بواسطة OUT (${settlement.out_payment_reference || "مرجع معتمد"})`
                        : "لم تسدد من OUT بعد"}
                    </span>
                  </div>

                  {/* Card 3: Collected From Customer */}
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#ffffff",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      borderRight: "4px solid #3b82f6",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block" }}>
                      المحصل من العميل مقابل الرسوم
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "var(--color-black)", display: "block", marginTop: "0.25rem" }}>
                      {settlement.settlement_status === "customer_paid_direct"
                        ? "0 جنيه (سداد مباشر)"
                        : collectedAmount !== null
                        ? `${collectedAmount.toLocaleString("ar-EG")} جنيه`
                        : "لم يحصل بعد"}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block", marginTop: "0.25rem" }}>
                      {settlement.settlement_status === "customer_paid_direct"
                        ? `إيصال العميل: ${settlement.customer_direct_payment_reference || currentStage.reference_number || "—"}`
                        : `مرجع التحصيل: ${settlement.customer_collection_reference || "—"}`}
                    </span>
                  </div>

                  {/* Card 4: Settlement Status */}
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#ffffff",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      borderRight: "4px solid var(--color-black)",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block" }}>
                      حالة تسوية الرسوم الجمركية
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "0.35rem",
                        padding: "0.25rem 0.65rem",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        backgroundColor:
                          settlement.settlement_status === "settled" || settlement.settlement_status === "customer_paid_direct"
                            ? "#ecfdf5"
                            : settlement.settlement_status === "paid_by_out_awaiting_customer"
                            ? "#fef3c7"
                            : "#f3f4f6",
                        color:
                          settlement.settlement_status === "settled" || settlement.settlement_status === "customer_paid_direct"
                            ? "#047857"
                            : settlement.settlement_status === "paid_by_out_awaiting_customer"
                            ? "#b45309"
                            : "#475569",
                      }}
                    >
                      {settlement.settlement_status === "settled"
                        ? "تمت التسوية والتحصيل بالكامل ✅"
                        : settlement.settlement_status === "customer_paid_direct"
                        ? "سداد مباشر من العميل للجمارك ✅"
                        : settlement.settlement_status === "paid_by_out_awaiting_customer"
                        ? "مسددة من OUT — بانتظار تحصيل العميل"
                        : "بانتظار صدور المطالبة والسداد"}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Stage 10 Clearance & Release Finality */}
        {currentStage.stage_key === "stage_10_clearance_release" && (
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius-lg)",
              backgroundColor: journey.isFullyCleared ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${journey.isFullyCleared ? "#a7f3d0" : "var(--color-border)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <DynamicIcon name="CheckCircle" size={18} style={{ color: journey.isFullyCleared ? "#047857" : "var(--color-gray-600)" }} />
              <strong style={{ fontSize: "0.95rem", color: journey.isFullyCleared ? "#065f46" : "var(--color-black)" }}>
                {journey.isFullyCleared ? "تم إصدار إذن الإفراج الجمركي وخروج الشحنة" : "إجراء الإفراج الجمركي النهائي"}
              </strong>
            </div>
            <p style={{ fontSize: "0.825rem", color: "var(--color-gray-600)", margin: 0, lineHeight: 1.4 }}>
              لا تُعتبر الشحنة مفرجة تلقائياً بمجرد إتمام المراحل السابقة، بل يتطلب ذلك إدخال وتوثيق رقم إذن الإفراج الجمركي الفعلي وتاريخ الصدور وتأكيد عدم وجود موانع متبقية.
            </p>
          </div>
        )}

        {/* Stage Operational Navigation Actions (Connects to existing tabs if applicable) */}
        {currentStageDef.connectsToExistingWorkflow && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ fontSize: "0.825rem", color: "var(--color-gray-600)" }}>
              هذه المرحلة مرتبطة بوحدة العمل التشغيلية المفصلة أدناه في صفحة الشحنة.
            </div>
            {onSelectWorkflowTab && (
              <button
                type="button"
                onClick={() => {
                  if (currentStage.stage_key === "stage_2_pricing") onSelectWorkflowTab(2);
                  if (currentStage.stage_key === "stage_3_nafeza_acid") onSelectWorkflowTab(3);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8rem",
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-black)",
                  background: "var(--color-yellow)",
                  border: "none",
                  padding: "0.4rem 0.8rem",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                <span>الانتقال لوحدة العمل التفصيلية</span>
                <DynamicIcon name="ArrowLeft" size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── 4. Stage Audit History Log ─── */}
      {journey.history.length > 0 && (
        <div
          style={{
            padding: "1.25rem 1.75rem",
            backgroundColor: "#fafafa",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <DynamicIcon name="History" size={16} style={{ color: "var(--color-gray-600)" }} />
            <strong style={{ fontSize: "0.85rem", color: "var(--color-gray-800)" }}>
              سجل التدقيق والتغييرات في مسار التخليص ({journey.history.length})
            </strong>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "180px", overflowY: "auto" }}>
            {journey.history.slice(0, 5).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "0.775rem",
                  padding: "0.4rem 0.6rem",
                  backgroundColor: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: "var(--font-weight-bold)" }}>
                    {CUSTOMS_STAGE_DEFINITIONS[item.stage_key]?.title || item.stage_key}:
                  </span>
                  <span style={{ color: "var(--color-gray-600)" }}>{item.notes || item.outcome || item.action}</span>
                </div>
                <div style={{ color: "var(--color-gray-400)", whiteSpace: "nowrap" }}>
                  {formatDateAr(item.performed_at)} {item.performed_by_name ? `(${item.performed_by_name})` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Modal 1: Classification & Branching Edit ─── */}
      {showClassificationModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-xl)",
              border: "1px solid var(--color-border)",
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-yellow-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DynamicIcon name="Tag" size={20} style={{ color: "var(--color-yellow-dark)" }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "var(--font-weight-bold)" }}>
                    تصنيف البضاعة ومسارات التخليص
                  </h3>
                  <span style={{ fontSize: "0.775rem", color: "var(--color-gray-500)" }}>
                    تحديد المسارات الإجرائية والجهات الرقابية الواجبة
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClassificationModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-gray-400)" }}
              >
                <DynamicIcon name="X" size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveClassification} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Category Picker */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.5rem" }}>
                  نوع وتصنيف البضاعة الأساسي:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.6rem" }}>
                  {GOODS_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    const catTemplate = CUSTOMS_WORKFLOW_TEMPLATES[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setSelectedProcedures(catTemplate.defaultProcedures);
                        }}
                        style={{
                          padding: "0.85rem 1rem",
                          borderRadius: "var(--radius-md)",
                          border: isSelected ? "2px solid var(--color-black)" : "1px solid var(--color-border)",
                          backgroundColor: isSelected ? "var(--color-yellow-light)" : "var(--color-surface)",
                          cursor: "pointer",
                          textAlign: "right",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.3rem",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                          <strong style={{ fontSize: "0.9rem", color: "var(--color-black)" }}>
                            {catTemplate.name}
                          </strong>
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "0.15rem 0.5rem",
                              borderRadius: "4px",
                              backgroundColor: isSelected ? "var(--color-black)" : "#f3f4f6",
                              color: isSelected ? "var(--color-yellow)" : "#374151",
                              fontWeight: "bold",
                            }}
                          >
                            {catTemplate.badge}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
                          الجهة الرقابية المعتمدة: <strong>{catTemplate.regulatoryAuthority}</strong>
                        </span>
                        <span style={{ fontSize: "0.775rem", color: "var(--color-gray-600)", lineHeight: 1.35 }}>
                          {catTemplate.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Procedure Selection */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.5rem" }}>
                  المسارات والإجراءات الرقابية المطبقة:
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {APPLICABLE_PROCEDURE_DEFINITIONS.map((proc) => {
                    const isChecked = selectedProcedures.includes(proc.id);
                    return (
                      <label
                        key={proc.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.6rem",
                          padding: "0.6rem 0.75rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border)",
                          backgroundColor: isChecked ? "#fefce8" : "#ffffff",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProcedures([...selectedProcedures, proc.id]);
                            } else {
                              setSelectedProcedures(selectedProcedures.filter((id) => id !== proc.id));
                            }
                          }}
                          style={{ marginTop: "3px" }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <strong style={{ fontSize: "0.85rem", color: "var(--color-black)" }}>{proc.name}</strong>
                            <span style={{ fontSize: "10px", color: "var(--color-gray-500)" }}>{proc.authorityName}</span>
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-gray-600)", display: "block" }}>
                            {proc.purpose}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Classification Notes */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.35rem" }}>
                  ملاحظات أو قرارات الاعتماد:
                </label>
                <textarea
                  value={classificationNotes}
                  onChange={(e) => setClassificationNotes(e.target.value)}
                  rows={2}
                  placeholder="بيان أسباب اختيار أو تعديل المسار الرقابي..."
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    fontSize: "0.85rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setShowClassificationModal(false)}
                  style={{
                    padding: "0.55rem 1rem",
                    backgroundColor: "transparent",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "0.55rem 1.25rem",
                    backgroundColor: "var(--color-black)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    fontWeight: "var(--font-weight-bold)",
                    cursor: "pointer",
                  }}
                >
                  {isPending ? "جاري الحفظ..." : "حفظ واعتماد التصنيف"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Update Stage Status & Outcome ─── */}
      {editingStage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-xl)",
              border: "1px solid var(--color-border)",
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <div>
                <span style={{ fontSize: "11px", color: "var(--color-gray-500)" }}>
                  تحديث المرحلة {CUSTOMS_STAGE_DEFINITIONS[editingStage.stage_key].order}
                </span>
                <h3 style={{ margin: "0.15rem 0 0", fontSize: "1.15rem", fontWeight: "var(--font-weight-bold)" }}>
                  {CUSTOMS_STAGE_DEFINITIONS[editingStage.stage_key].title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-gray-400)" }}
              >
                <DynamicIcon name="X" size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveStage} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* Status Select */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.4rem" }}>
                  حالة المرحلة:
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as CustomsStageStatus)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    fontSize: "0.85rem",
                    fontFamily: "inherit",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="pending">بانتظار البدء (Pending)</option>
                  <option value="in_progress">قيد التنفيذ (In Progress)</option>
                  <option value="awaiting_external_response">بانتظار رد خارجي (Awaiting External Response)</option>
                  <option value="needs_correction">مطلوب تعديل / ملاحظات (Needs Correction)</option>
                  <option value="completed">مكتمل وموثق (Completed)</option>
                  <option value="blocked">متوقف / مانع تشغيلي (Blocked)</option>
                  <option value="not_applicable">غير منطبق (Not Applicable)</option>
                </select>
              </div>

              {/* Outcome Text */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.4rem" }}>
                  النتيجة التشغيلية المعتمدة:
                </label>
                <input
                  type="text"
                  value={formOutcome}
                  onChange={(e) => setFormOutcome(e.target.value)}
                  placeholder="مثال: تم صدور تقرير المعاينة بمطابقة كاملة للأصناف والأوزان"
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {/* Reference Number */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.4rem" }}>
                  الرقم المرجعي الرسمي (رقم محضر / إذن / إشعار):
                </label>
                <input
                  type="text"
                  value={formRefNumber}
                  onChange={(e) => setFormRefNumber(e.target.value)}
                  placeholder="مثال: NAF-2026-98124 أو رقم إذن الإفراج"
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    fontSize: "0.85rem",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              {/* Rejection / Delay Reason if needed */}
              {(formStatus === "needs_correction" || formStatus === "blocked") && (
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.4rem", color: "#b91c1c" }}>
                    سبب التوقف أو الملاحظات المطلوبة:
                  </label>
                  <textarea
                    value={formDelayReason}
                    onChange={(e) => setFormDelayReason(e.target.value)}
                    rows={2}
                    placeholder="بيان سبب التأخير أو الفروقات التي تتطلب التصحيح..."
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid #fca5a5",
                      fontSize: "0.85rem",
                      fontFamily: "inherit",
                      backgroundColor: "#fef2f2",
                    }}
                  />
                </div>
              )}

              {/* General Notes */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "var(--font-weight-bold)", marginBottom: "0.4rem" }}>
                  ملاحظات إضافية وتوثيق:
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="أية ملاحظات تشغيلية متعلقة باللجان أو المنظومة..."
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    fontSize: "0.85rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Applicable Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <input
                  type="checkbox"
                  id="is_applicable_check"
                  checked={formIsApplicable}
                  onChange={(e) => setFormIsApplicable(e.target.checked)}
                />
                <label htmlFor="is_applicable_check" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
                  هذه المرحلة منطبقة ومطلوبة لهذه الشحنة
                </label>
              </div>

              {/* Stage 7: Declaration 46 reference (Optional & Non-Blocking) */}
              {editingStage.stage_key === "stage_7_data_entry" && (
                <div
                  style={{
                    padding: "0.85rem",
                    backgroundColor: "#fffbeb",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid #fef3c7",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      fontWeight: "var(--font-weight-bold)",
                      color: "#92400e",
                      marginBottom: "0.3rem",
                    }}
                  >
                    رقم 46 الجمركي (استرشادي - غير إلزامي):
                  </label>
                  <input
                    type="text"
                    value={formDeclaration46}
                    onChange={(e) => setFormDeclaration46(e.target.value)}
                    placeholder="أدخل رقم 46 إن وجد"
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #fde68a",
                      fontSize: "0.85rem",
                      fontFamily: "monospace",
                    }}
                  />
                  <small style={{ color: "#b45309", display: "block", marginTop: "0.3rem", fontSize: "11px" }}>
                    حقل استرشادي للمتابعة؛ المعنى والتوقيت الإلزامي بانتظار تأكيد خبير الجمارك ولا يعطل استكمال الإدراج.
                  </small>
                </div>
              )}

              {/* Stage 9: Customs Duties & Financial Settlement Fields */}
              {editingStage.stage_key === "stage_9_fees_payments" && (
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "#f0fdf4",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid #bbf7d0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <DynamicIcon name="Coins" size={18} style={{ color: "#16a34a" }} />
                    <strong style={{ fontSize: "0.9rem", color: "#166534" }}>
                      تسوية الرسوم والضرائب الجمركية (المسددة من OUT)
                    </strong>
                  </div>
                  <small style={{ color: "#15803d", fontSize: "11px" }}>
                    تنبيه: الرسوم والضرائب الجمركية تسددها OUT لمصلحة الجمارك نيابة عن العميل ثم تحصّلها منه، وهي منفصلة تماماً عن أتعاب خدمة OUT المتفق عليها ({pricing?.final_price ? `${pricing.final_price.toLocaleString("ar-EG")} جنيه` : "قيد التسعير"}).
                  </small>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                        رقم مطالبة الرسوم الجمركية:
                      </label>
                      <input
                        type="text"
                        value={formCustomsClaimNumber}
                        onChange={(e) => setFormCustomsClaimNumber(e.target.value)}
                        placeholder="رقم المطالبة الرسمية"
                        style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                        مبلغ الرسوم الجمركية (جنيه):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={formDutiesAmount}
                        onChange={(e) => setFormDutiesAmount(e.target.value)}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      id="duties_paid_by_out_check"
                      checked={formDutiesPaidByOut}
                      onChange={(e) => setFormDutiesPaidByOut(e.target.checked)}
                    />
                    <label htmlFor="duties_paid_by_out_check" style={{ fontSize: "0.85rem", cursor: "pointer", fontWeight: "bold" }}>
                      تم سداد الرسوم للجمارك بواسطة شركة OUT
                    </label>
                  </div>

                  {formDutiesPaidByOut && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                          رقم إشعار/إيصال سداد OUT للجمارك:
                        </label>
                        <input
                          type="text"
                          value={formOutPaymentRef}
                          onChange={(e) => setFormOutPaymentRef(e.target.value)}
                          placeholder="رقم الإشعار البنكي"
                          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                          تاريخ سداد OUT للجمارك:
                        </label>
                        <input
                          type="date"
                          value={formOutPaymentDate}
                          onChange={(e) => setFormOutPaymentDate(e.target.value)}
                          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: "1px dashed #86efac", paddingTop: "0.75rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", color: "#166534", marginBottom: "0.4rem" }}>
                      تحصيل مبالغ الرسوم من العميل:
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                          المبلغ المحصل من العميل (جنيه):
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={formCollectedFromCustomer}
                          onChange={(e) => setFormCollectedFromCustomer(e.target.value)}
                          placeholder="0.00"
                          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                          مرجع أو إيصال تحصيل العميل:
                        </label>
                        <input
                          type="text"
                          value={formCustomerCollectionRef}
                          onChange={(e) => setFormCustomerCollectionRef(e.target.value)}
                          placeholder="رقم إيصال التحصيل أو التحويل"
                          style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                      حالة تسوية الرسوم الجمركية:
                    </label>
                    <select
                      value={formSettlementStatus}
                      onChange={(e) => setFormSettlementStatus(e.target.value)}
                      style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "0.8rem", backgroundColor: "#ffffff" }}
                    >
                      <option value="pending_payment">بانتظار صدور المطالبة أو السداد</option>
                      <option value="paid_by_out_awaiting_customer">مسددة من OUT — بانتظار تحصيلها من العميل</option>
                      <option value="settled">تمت التسوية والتحصيل بالكامل</option>
                      <option value="customer_paid_direct">سداد مباشر من العميل لمصلحة الجمارك</option>
                      <option value="partial_paid">سداد جزئي</option>
                    </select>
                  </div>

                  {formSettlementStatus === "customer_paid_direct" && (
                    <div style={{ marginTop: "0.75rem", padding: "0.75rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px" }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "bold", color: "#166534", marginBottom: "0.25rem" }}>
                        رقم إيصال أو مرجع سداد العميل المباشر للجمارك *:
                      </label>
                      <input
                        type="text"
                        value={formCustomerDirectPaymentRef}
                        onChange={(e) => setFormCustomerDirectPaymentRef(e.target.value)}
                        placeholder="رقم إيصال مصلحة الجمارك أو البنك..."
                        style={{ width: "100%", padding: "0.4rem", borderRadius: "4px", border: "1px solid #86efac", fontSize: "0.8rem", backgroundColor: "#ffffff" }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Stage 10: Clearance Release Notice */}
              {editingStage.stage_key === "stage_10_clearance_release" && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    backgroundColor: "#ecfdf5",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid #a7f3d0",
                    fontSize: "0.8rem",
                    color: "#065f46",
                  }}
                >
                  <strong>تأكيد تشغيلي:</strong> استصدار إذن الإفراج النهائي يمثل استيفاء إجراءات التخليص الجمركي وخروج الشحنة من الدائرة الجمركية، وهو إجراء مستقل عن التسليم النهائي للعميل.
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setEditingStage(null)}
                  style={{
                    padding: "0.55rem 1rem",
                    backgroundColor: "transparent",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "0.55rem 1.25rem",
                    backgroundColor: "var(--color-black)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    fontWeight: "var(--font-weight-bold)",
                    cursor: "pointer",
                  }}
                >
                  {isPending ? "جاري التحديث..." : "حفظ التغييرات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
