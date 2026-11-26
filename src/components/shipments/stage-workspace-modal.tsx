"use client";

import React, { useState, useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import {
  CustomsJourneyStage,
  GoodsCategory,
  CUSTOMS_STAGE_DEFINITIONS,
  CUSTOMS_STAGE_STATUS_CONFIG,
  GOODS_CATEGORIES,
  GOODS_CATEGORY_LABELS,
  APPLICABLE_PROCEDURE_DEFINITIONS,
  getWorkflowTemplateForCategory,
} from "@/types/journey";
import type { Shipment, DocumentItem, ShipmentPricing, ShipmentAcid } from "@/types";
import {
  updateCustomsStageAction,
  updateShipmentClassificationAction,
  updateStageChecklistItemAction,
  reopenCustomsStageAction,
} from "@/lib/shipments/journey-actions";

interface StageWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: Shipment;
  stage: CustomsJourneyStage;
  journeyStages: CustomsJourneyStage[];
  documents: DocumentItem[];
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  onPreviewDocument?: (doc: DocumentItem) => void;
}

export function StageWorkspaceModal({
  isOpen,
  onClose,
  shipment,
  stage,
  documents,
  pricing = null,
  acid = null,
  onPreviewDocument,
}: StageWorkspaceModalProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form states for stage action
  const [outcome, setOutcome] = useState(stage.outcome || "");
  const [referenceNumber, setReferenceNumber] = useState(stage.reference_number || "");
  const [notes, setNotes] = useState(stage.notes || "");
  const [rejectionReason, setRejectionReason] = useState(stage.rejection_or_delay_reason || "");
  const [showReopenPrompt, setShowReopenPrompt] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  // Classification form states (Stage 1)
  const currentCategory: GoodsCategory = shipment.goods_category || "other";
  const [selectedCategory, setSelectedCategory] = useState<GoodsCategory>(currentCategory);
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>(
    Array.isArray(shipment.applicable_procedures) && shipment.applicable_procedures.length > 0
      ? shipment.applicable_procedures
      : [selectedCategory === "agricultural" ? "plant_quarantine" : selectedCategory === "food" ? "food_safety_authority" : selectedCategory === "industrial" ? "industrial_standards_inspection" : "general_customs_procedure"]
  );

  // Stage 9 Financial States
  const stageData = (stage.stage_data || {}) as Record<string, unknown>;
  const [dutiesAmount, setDutiesAmount] = useState<string>(
    typeof stageData.duties_amount === "number" ? stageData.duties_amount.toString() : ""
  );
  const [customsClaimNumber, setCustomsClaimNumber] = useState<string>(
    typeof stageData.customs_claim_number === "string" ? stageData.customs_claim_number : ""
  );
  const [settlementStatus, setSettlementStatus] = useState<string>(
    typeof stageData.settlement_status === "string" ? stageData.settlement_status : "pending_payment"
  );

  // Stage 7 Declaration 46 state
  const [declarationNumber, setDeclarationNumber] = useState<string>(
    typeof stageData.customs_declaration_number === "string" ? stageData.customs_declaration_number : referenceNumber
  );
  const [ref46Advisory, setRef46Advisory] = useState<string>(
    typeof stageData.declaration_46_advisory === "string" ? stageData.declaration_46_advisory : ""
  );

  if (!isOpen) return null;

  const stageDef = CUSTOMS_STAGE_DEFINITIONS[stage.stage_key];
  const statusCfg = CUSTOMS_STAGE_STATUS_CONFIG[stage.status];
  const template = getWorkflowTemplateForCategory(selectedCategory);

  // Checklist completion calculation
  const totalChecklistCount = stage.checklist.length;
  const completedChecklistCount = stage.checklist.filter((i) => i.status === "completed").length;
  const incompleteRequiredCount = stage.checklist.filter((i) => i.isRequired && i.status !== "completed").length;

  const handleToggleChecklist = (itemId: string, currentItemStatus: string) => {
    const nextStatus = currentItemStatus === "completed" ? "pending" : "completed";
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", stage.stage_key);
      fd.append("item_id", itemId);
      fd.append("status", nextStatus);

      const res = await updateStageChecklistItemAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل تحديث بند التدقيق." });
      } else {
        setFeedback({ type: "success", message: res.message || "تم تحديث بند التدقيق بنجاح." });
      }
    });
  };

  const handleSaveProgress = (targetStatus: string = stage.status) => {
    startTransition(async () => {
      setFeedback(null);

      // Special handling for Stage 1 classification save
      if (stage.stage_key === "stage_1_intake") {
        const cfd = new FormData();
        cfd.append("shipment_id", shipment.id);
        cfd.append("goods_category", selectedCategory);
        cfd.append("classification_notes", notes);
        for (const proc of selectedProcedures) {
          cfd.append("applicable_procedures", proc);
        }

        const cRes = await updateShipmentClassificationAction(cfd);
        if (!cRes.success) {
          setFeedback({ type: "error", message: cRes.error || "فشل حفظ تصنيف الشحنة." });
          return;
        }
        setFeedback({ type: "success", message: "تم حفظ وتحديث تصنيف الشحنة بنجاح وتفعيل المرحلة التالية." });
        setTimeout(() => onClose(), 1200);
        return;
      }

      // Standard Stage Update
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", stage.stage_key);
      fd.append("status", targetStatus);
      fd.append("outcome", outcome);
      fd.append("reference_number", referenceNumber);
      fd.append("notes", notes);
      if (rejectionReason) {
        fd.append("rejection_or_delay_reason", rejectionReason);
      }

      // Append custom stage data
      if (stage.stage_key === "stage_9_fees_payments") {
        if (dutiesAmount) fd.append("stage_data_duties_amount", dutiesAmount);
        if (customsClaimNumber) fd.append("stage_data_customs_claim_number", customsClaimNumber);
        if (settlementStatus) fd.append("stage_data_settlement_status", settlementStatus);
      } else if (stage.stage_key === "stage_7_data_entry") {
        if (declarationNumber) fd.append("stage_data_customs_declaration_number", declarationNumber);
        if (ref46Advisory) fd.append("stage_data_declaration_46_advisory", ref46Advisory);
      }

      const res = await updateCustomsStageAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل حفظ بيانات المرحلة." });
      } else {
        setFeedback({ type: "success", message: res.message || "تم حفظ بيانات المرحلة بنجاح." });
        if (targetStatus === "completed") {
          setTimeout(() => onClose(), 1200);
        }
      }
    });
  };

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      setFeedback({ type: "error", message: "يرجى كتابة سبب إعادة فتح المرحلة أولاً." });
      return;
    }

    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", stage.stage_key);
      fd.append("reopen_reason", reopenReason.trim());

      const res = await reopenCustomsStageAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل إعادة فتح المرحلة." });
      } else {
        setFeedback({ type: "success", message: res.message || "تمت إعادة فتح المرحلة للتصحيح." });
        setShowReopenPrompt(false);
      }
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "2px solid var(--color-black)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: "800px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            backgroundColor: "var(--color-black)",
            color: "var(--color-white)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "var(--color-yellow)",
                color: "var(--color-black)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: "var(--font-size-sm)",
              }}
            >
              {stageDef.order}
            </span>
            <div>
              <h2 style={{ fontSize: "var(--font-size-base)", fontWeight: "bold", margin: 0 }}>
                {stageDef.title}
              </h2>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-400)" }}>
                {stageDef.shortDescription} • {template.name}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontSize: "11px",
                padding: "0.25rem 0.6rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: statusCfg.bg,
                color: statusCfg.color,
                border: `1px solid ${statusCfg.borderColor}`,
                fontWeight: "bold",
              }}
            >
              {statusCfg.label}
            </span>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-gray-300)",
                cursor: "pointer",
                padding: "0.25rem",
                display: "flex",
                alignItems: "center",
              }}
              title="إغلاق"
            >
              <DynamicIcon name="X" size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: "1.5rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Feedback Banner */}
          {feedback && (
            <div
              style={{
                padding: "0.875rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: feedback.type === "success" ? "#ecfdf5" : "#fef2f2",
                color: feedback.type === "success" ? "#065f46" : "#991b1b",
                border: `1px solid ${feedback.type === "success" ? "#a7f3d0" : "#fecaca"}`,
                fontSize: "var(--font-size-sm)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <DynamicIcon name={feedback.type === "success" ? "CheckCircle" : "AlertTriangle"} size={18} />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Timing & SLA Summary Strip */}
          <div
            style={{
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              fontSize: "var(--font-size-xs)",
            }}
          >
            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>تاريخ التفعيل / البدء</span>
              <strong style={{ color: "var(--color-black)" }}>
                {stage.activated_at ? formatDateAr(stage.activated_at) : "قيد الانتظار"}
              </strong>
            </div>

            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>الوقت المستهدف (SLA)</span>
              <strong style={{ color: "var(--color-black)" }}>
                {stageDef.targetDurationHours} ساعة عمل
              </strong>
            </div>

            <div>
              <span style={{ color: "var(--color-gray-500)", display: "block" }}>حالة التوقيت والإنجاز</span>
              <strong
                style={{
                  color: stage.is_overdue
                    ? "#dc2626"
                    : stage.status === "completed"
                      ? "#059669"
                      : "var(--color-black)",
                }}
              >
                {stage.time_status_label || statusCfg.summaryText}
              </strong>
            </div>

            {stage.completed_at && (
              <div>
                <span style={{ color: "var(--color-gray-500)", display: "block" }}>تاريخ الاكتمال والتوثيق</span>
                <strong style={{ color: "#059669" }}>
                  {formatDateAr(stage.completed_at)}
                </strong>
              </div>
            )}
          </div>

          {/* Waiting Reason Banner (if waiting for customer / external) */}
          {stage.waiting_reason && stage.status !== "completed" && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-yellow-light)",
                border: "1px solid var(--color-yellow)",
                color: "var(--color-black)",
                fontSize: "var(--font-size-xs)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <DynamicIcon name="Clock" size={16} style={{ color: "#b45309", flexShrink: 0 }} />
              <div>
                <strong>سبب الانتظار الحالي: </strong>
                <span>{stage.waiting_reason}</span>
              </div>
            </div>
          )}

          {/* Checklist Items Section */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DynamicIcon name="CheckSquare" size={18} style={{ color: "var(--color-black)" }} />
                <h3 style={{ fontSize: "var(--font-size-sm)", fontWeight: "bold", margin: 0 }}>
                  قائمة التحقق وبنود التدقيق الإلزامية ({completedChecklistCount}/{totalChecklistCount})
                </h3>
              </div>

              {incompleteRequiredCount > 0 ? (
                <span style={{ fontSize: "11px", color: "#b45309", fontWeight: "bold" }}>
                  متبقي {incompleteRequiredCount} بند إلزامي للاكتمال
                </span>
              ) : (
                <span style={{ fontSize: "11px", color: "#059669", fontWeight: "bold" }}>
                  كافة البنود الإلزامية مستوفاة ✓
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stage.checklist.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.625rem 0.875rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: item.status === "completed" ? "var(--color-gray-50)" : "var(--color-surface)",
                    border: `1px solid ${item.status === "completed" ? "var(--color-border)" : "var(--color-yellow)"}`,
                    gap: "0.75rem",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.625rem",
                      cursor: "pointer",
                      fontSize: "var(--font-size-xs)",
                      color: item.status === "completed" ? "var(--color-gray-600)" : "var(--color-black)",
                      textDecoration: item.status === "completed" ? "line-through" : "none",
                      flex: 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.status === "completed"}
                      onChange={() => handleToggleChecklist(item.id, item.status)}
                      disabled={isPending || stage.status === "completed"}
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                        accentColor: "var(--color-black)",
                      }}
                    />
                    <span>{item.label}</span>
                    {item.isRequired && (
                      <span style={{ color: "#dc2626", fontWeight: "bold" }}>*</span>
                    )}
                  </label>

                  <span
                    style={{
                      fontSize: "10px",
                      padding: "0.15rem 0.4rem",
                      borderRadius: "var(--radius-xs)",
                      backgroundColor: item.status === "completed" ? "#ecfdf5" : "var(--color-gray-100)",
                      color: item.status === "completed" ? "#047857" : "var(--color-gray-600)",
                      fontWeight: "bold",
                    }}
                  >
                    {item.status === "completed" ? "مكتمل" : "معلق"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stage-Specific Form Workspaces */}

          {/* STAGE 1: Intake & Classification */}
          {stage.stage_key === "stage_1_intake" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                gap: "0.875rem",
              }}
            >
              <h4 style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", margin: 0 }}>
                تحديد تصنيف البضاعة ومسار التخليص المعتمد
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
                {GOODS_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedProcedures(
                        cat === "agricultural"
                          ? ["plant_quarantine", "general_customs_procedure"]
                          : cat === "food"
                            ? ["food_safety_authority", "general_customs_procedure"]
                            : cat === "industrial"
                              ? ["industrial_standards_inspection", "general_customs_procedure"]
                              : ["general_customs_procedure"]
                      );
                    }}
                    style={{
                      padding: "0.625rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: selectedCategory === cat ? "2px solid var(--color-black)" : "1px solid var(--color-border)",
                      backgroundColor: selectedCategory === cat ? "var(--color-yellow-light)" : "var(--color-surface)",
                      fontWeight: selectedCategory === cat ? "bold" : "normal",
                      fontSize: "var(--font-size-xs)",
                      cursor: "pointer",
                      textAlign: "right",
                    }}
                  >
                    {GOODS_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--color-gray-600)", display: "block", marginBottom: "0.25rem" }}>
                  الجهات العارضة والمسارات الإجرائية المطبقة
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {APPLICABLE_PROCEDURE_DEFINITIONS.map((proc) => {
                    const isChecked = selectedProcedures.includes(proc.id);
                    return (
                      <label
                        key={proc.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "var(--font-size-xs)",
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
                              setSelectedProcedures(selectedProcedures.filter((p) => p !== proc.id));
                            }
                          }}
                          style={{ accentColor: "var(--color-black)" }}
                        />
                        <span>{proc.name} ({proc.authorityName})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STAGE 2: Pricing Summary */}
          {stage.stage_key === "stage_2_pricing" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <div>
                <span style={{ color: "var(--color-gray-500)", display: "block" }}>حالة عرض السعر</span>
                <strong style={{ color: "var(--color-black)" }}>
                  {pricing?.status === "customer_approved"
                    ? "معتمد نهائياً من العميل"
                    : pricing?.status === "proposed" || pricing?.status === "final_proposed"
                      ? "تم تقديم العرض — بانتظار قرار العميل"
                      : pricing?.status === "negotiation_requested"
                        ? "قيد التفاوض"
                        : "قيد الإعداد"}
                </strong>
              </div>

              <div>
                <span style={{ color: "var(--color-gray-500)", display: "block" }}>السعر النهائي (أتعاب OUT)</span>
                <strong style={{ color: "var(--color-black)", fontSize: "var(--font-size-sm)" }}>
                  {pricing?.final_price ? `${pricing.final_price.toLocaleString("ar-EG")} ج.م` : "لم يعتمد بعد"}
                </strong>
              </div>
            </div>
          )}

          {/* STAGE 3: ACID & Final Documents Context */}
          {stage.stage_key === "stage_3_nafeza_acid" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                  رقم ACID المسجل على نافذة:
                </span>
                <strong dir="ltr" style={{ fontFamily: "var(--font-family-mono)", color: "#065f46" }}>
                  {acid?.acid_number || referenceNumber || "غير مسجل"}
                </strong>
              </div>

              <div style={{ fontSize: "var(--font-size-xs)" }}>
                <span style={{ color: "var(--color-gray-600)", display: "block", marginBottom: "0.25rem" }}>
                  حالة المستندات النهائية الأربعة:
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => onPreviewDocument?.(doc)}
                      style={{
                        padding: "0.35rem 0.5rem",
                        borderRadius: "var(--radius-xs)",
                        backgroundColor: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: onPreviewDocument ? "pointer" : "default",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.title || doc.document_type}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "bold",
                          color: doc.status === "approved" ? "#059669" : "#d97706",
                        }}
                      >
                        {doc.status === "approved" ? "معتمد" : "معلق"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STAGE 7: Declaration 46 Advisory Field */}
          {stage.stage_key === "stage_7_data_entry" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                  رقم البيان الجمركي الرسمي *
                </label>
                <input
                  type="text"
                  value={declarationNumber}
                  onChange={(e) => {
                    setDeclarationNumber(e.target.value);
                    setReferenceNumber(e.target.value);
                  }}
                  placeholder="مثال: DEC-2026-99120"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                  رقم 46 (مرجع استرشادي غير إلزامي)
                </label>
                <input
                  type="text"
                  value={ref46Advisory}
                  onChange={(e) => setRef46Advisory(e.target.value)}
                  placeholder="مرجع إضافي اختياري حسب مصلحة الجمارك"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                  }}
                />
                <span style={{ fontSize: "11px", color: "var(--color-gray-500)", display: "block", marginTop: "0.25rem" }}>
                  المعنى الدقيق والتوقيت الإلزامي لـ «رقم 46» استرشادي ولا يعطل استكمال الإدراج.
                </span>
              </div>
            </div>
          )}

          {/* STAGE 9: Customs Duties Settlement Fields */}
          {stage.stage_key === "stage_9_fees_payments" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                  رقم مطالبة الرسوم الجمركية
                </label>
                <input
                  type="text"
                  value={customsClaimNumber}
                  onChange={(e) => setCustomsClaimNumber(e.target.value)}
                  placeholder="رقم المطالبة الرسمية"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                  قيمة الرسوم الجمركية الرسمية (ج.م)
                </label>
                <input
                  type="number"
                  value={dutiesAmount}
                  onChange={(e) => setDutiesAmount(e.target.value)}
                  placeholder="المبلغ المسدد للمصلحة"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                  }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                  حالة تسوية الرسوم مع العميل
                </label>
                <select
                  value={settlementStatus}
                  onChange={(e) => setSettlementStatus(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                  }}
                >
                  <option value="pending_payment">بانتظار السداد</option>
                  <option value="paid_by_out_awaiting_customer">مسددة من OUT — بانتظار تحصيل العميل</option>
                  <option value="settled">تمت التسوية والتحصيل بالكامل</option>
                </select>
              </div>
            </div>
          )}

          {/* Common Outcome, Reference Number, Notes Fields */}
          {stage.stage_key !== "stage_1_intake" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                    الرقم المرجعي / رقم المستند الرسمي
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={stage.stage_key === "stage_10_clearance_release" ? "رقم إذن الإفراج (إلزامي)" : "رقم الإشعار / المرجع"}
                    disabled={stage.status === "completed"}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-sm)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                    نتيجة المرحلة المعتمدة
                  </label>
                  <input
                    type="text"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="مثال: تم اعتماد الفحص دون ملاحظات"
                    disabled={stage.status === "completed"}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-sm)",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem" }}>
                  الملاحظات التشغيلية والتوثيق
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="سجل أية تفاصيل أو اشتراطات فنية خاصة بالمرحلة..."
                  rows={2}
                  disabled={stage.status === "completed"}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                    resize: "vertical",
                  }}
                />
              </div>

              {(stage.is_overdue || stage.status === "blocked" || stage.status === "needs_correction" || rejectionReason) && (
                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", display: "block", marginBottom: "0.25rem", color: "#c2410c" }}>
                    سبب التعطيل أو التحفظ الجمركي
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="سجل سبب التحفظ أو التأخير إن وجد..."
                    disabled={stage.status === "completed"}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #fdba74",
                      fontSize: "var(--font-size-sm)",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Reopen Section for Completed Stages */}
          {stage.status === "completed" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#fff7ed",
                border: "1px solid #ffedd5",
              }}
            >
              {!showReopenPrompt ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: "var(--font-size-xs)", color: "#c2410c", display: "block" }}>
                      المرحلة مكتملة وموثقة
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--color-gray-600)" }}>
                      هل طرأت ملاحظات جمركية أو تصحيحات تتطلب إعادة فتحها؟
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReopenPrompt(true)}
                    className="btn btn--outline"
                    style={{
                      fontSize: "var(--font-size-xs)",
                      padding: "0.35rem 0.75rem",
                      borderColor: "#fdba74",
                      color: "#c2410c",
                    }}
                  >
                    إعادة فتح للتصحيح
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "bold", color: "#c2410c" }}>
                    سبب إعادة فتح المرحلة للتصحيح (إلزامي):
                  </label>
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="وضح سبب إعادة الفتح وما المطلوب تعديله..."
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #f97316",
                      fontSize: "var(--font-size-xs)",
                    }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setShowReopenPrompt(false)}
                      className="btn btn--outline"
                      style={{ fontSize: "11px", padding: "0.25rem 0.5rem" }}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={isPending}
                      className="btn btn--primary"
                      style={{
                        fontSize: "11px",
                        padding: "0.25rem 0.75rem",
                        backgroundColor: "#c2410c",
                        color: "white",
                      }}
                    >
                      تأكيد إعادة الفتح
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div
          style={{
            padding: "1rem 1.5rem",
            backgroundColor: "var(--color-gray-50)",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn--outline"
            style={{ fontSize: "var(--font-size-xs)" }}
          >
            إغلاق
          </button>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {stage.status !== "completed" && (
              <>
                <button
                  type="button"
                  onClick={() => handleSaveProgress(stage.status === "pending" ? "in_progress" : stage.status)}
                  disabled={isPending}
                  className="btn btn--outline"
                  style={{ fontSize: "var(--font-size-xs)" }}
                >
                  حفظ التقدم
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveProgress("completed")}
                  disabled={isPending || (incompleteRequiredCount > 0 && stage.stage_key !== "stage_1_intake")}
                  className="btn btn--primary"
                  style={{
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "bold",
                    backgroundColor: "var(--color-yellow)",
                    color: "var(--color-black)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                  title={
                    incompleteRequiredCount > 0
                      ? `يرجى استيفاء كافة بنود التدقيق الإلزامية أولاً (${incompleteRequiredCount} معلق)`
                      : "اعتماد اكتمال المرحلة وتفعيل المرحلة التالية تلقائياً"
                  }
                >
                  <DynamicIcon name="CheckCircle" size={16} />
                  <span>اعتماد واكتمال المرحلة وتفعيل التالية تلقائياً</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
