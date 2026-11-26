"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type {
  AuthoritativeJourneyStage,
  GoodsCategory,
  CustomsStageStatus,
  CustomsDutiesSettlementData,
} from "@/types/journey";
import {
  GOODS_CATEGORIES,
  GOODS_CATEGORY_LABELS,
  APPLICABLE_PROCEDURE_DEFINITIONS,
} from "@/types/journey";
import type {
  Shipment,
  Company,
  Customer,
  DocumentItem,
  ShipmentPricing,
  ShipmentAcid,
  ShipmentInvoiceReview,
  ShipmentCustomsJourney,
} from "@/types";
import { matchFinalDocumentType } from "@/types";
import {
  updateCustomsStageAction,
  updateShipmentClassificationAction,
} from "@/lib/shipments/journey-actions";
import {
  adminApproveInvoiceAction,
  adminRequestInvoiceRevisionAction,
} from "@/lib/shipments/invoice-review-actions";
import {
  adminStartAcidProcessingAction,
  adminIssueAcidAction,
} from "@/lib/shipments/acid-actions";
import {
  adminApproveShipmentDocumentAction,
  adminRequestShipmentDocumentRevisionAction,
} from "@/lib/shipments/document-actions";
import {
  submitPriceEstimateAction,
  adminSetFinalPriceAction,
} from "@/lib/shipments/pricing-actions";

interface AdminStageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: AuthoritativeJourneyStage;
  shipment: Shipment;
  company: Company | null;
  customer: Customer | null;
  documents: DocumentItem[];
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  invoiceReviews?: ShipmentInvoiceReview[];
  journey?: ShipmentCustomsJourney | null;
  onPreviewDocument?: (doc: DocumentItem) => void;
  onSelectTab?: (tab: "documents" | "pricing" | "specs" | "activity") => void;
}

export function AdminStageDetailModal(props: AdminStageDetailModalProps) {
  if (!props.isOpen) return null;
  const syncKey = `${props.stage.key}_${props.stage.dbStageRecord?.id || ""}_${props.stage.dbStageRecord?.updated_at || ""}_${props.shipment.id}_${props.shipment.updated_at || ""}_${props.pricing?.updated_at || ""}_${props.acid?.updated_at || ""}`;
  return <AdminStageDetailModalContent key={syncKey} {...props} />;
}

function AdminStageDetailModalContent({
  isOpen,
  onClose,
  stage,
  shipment,
  company,
  customer,
  documents,
  pricing = null,
  acid = null,
  journey = null,
  onPreviewDocument,
  onSelectTab,
}: AdminStageDetailModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Stage 01: Classification state
  const [selectedCategory, setSelectedCategory] = useState<GoodsCategory>(
    shipment.goods_category || "other",
  );
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>(
    Array.isArray(shipment.applicable_procedures) && shipment.applicable_procedures.length > 0
      ? shipment.applicable_procedures
      : ["general_customs_procedure"],
  );
  const [classificationNotes, setClassificationNotes] = useState<string>(
    shipment.classification_notes || "",
  );

  // Stage 03: ACID state
  const [acidInputNumber, setAcidInputNumber] = useState(acid?.acid_number || "");
  const [invoiceRevisionNote, setInvoiceRevisionNote] = useState("");
  const [showInvoiceRevisionForm, setShowInvoiceRevisionForm] = useState(false);

  // Stage 04: Document revision prompt state
  const [revisionDocId, setRevisionDocId] = useState<string | null>(null);
  const [docRevisionReason, setDocRevisionReason] = useState("");

  // Generic Operational Stage Update Form State (Stages 05, 06, 07, 08, 09, 10)
  const dbRecord = stage.dbStageRecord;
  const [stageStatus, setStageStatus] = useState<CustomsStageStatus>(dbRecord?.status || "in_progress");
  const [stageOutcome, setStageOutcome] = useState(dbRecord?.outcome || "");
  const [stageRefNumber, setStageRefNumber] = useState(dbRecord?.reference_number || "");
  const [stageNotes, setStageNotes] = useState(dbRecord?.notes || "");
  const [stageDelayReason, setStageDelayReason] = useState(dbRecord?.rejection_or_delay_reason || "");

  // Stage 04: Type-Specific Procedures sub-process state
  const typeProcRecord = stage.typeProceduresSubProcess;
  const [typeProcStatus, setTypeProcStatus] = useState<CustomsStageStatus>(
    typeProcRecord?.status || "in_progress",
  );
  const [typeProcOutcome, setTypeProcOutcome] = useState(typeProcRecord?.outcome || "");
  const [typeProcRef, setTypeProcRef] = useState(typeProcRecord?.referenceNumber || "");
  const [typeProcNotes, setTypeProcNotes] = useState(typeProcRecord?.notes || "");
  const [typeProcDelayReason, setTypeProcDelayReason] = useState(typeProcRecord?.rejectionOrDelayReason || "");

  // Stage 07: Data & Number 46 state
  const s7Data = (dbRecord?.stage_data || {}) as Record<string, unknown>;
  const [declaration46Advisory, setDeclaration46Advisory] = useState<string>(
    typeof s7Data.declaration_46_advisory === "string" ? s7Data.declaration_46_advisory : "",
  );

  // Stage 08: Valuation state
  const [customsValueAmount, setCustomsValueAmount] = useState<string>(
    typeof s7Data.customs_value_egp === "number" ? s7Data.customs_value_egp.toString() : "",
  );
  const [tariffRatePercent, setTariffRatePercent] = useState<string>(
    typeof s7Data.tariff_rate_percent === "number" ? s7Data.tariff_rate_percent.toString() : "",
  );

  // Stage 09: Financial Settlement State
  const settlement = (dbRecord?.stage_data?.customs_duties_settlement || dbRecord?.stage_data) as
    | CustomsDutiesSettlementData
    | undefined;
  const [assessedAmount, setAssessedAmount] = useState<string>(
    settlement?.assessed_customs_amount ? settlement.assessed_customs_amount.toString() : "",
  );
  const [settlementMode, setSettlementMode] = useState<"paid_by_out" | "customer_paid_direct">(
    settlement?.settlement_status === "customer_paid_direct" ? "customer_paid_direct" : "paid_by_out",
  );
  const [directPaymentReceipt, setDirectPaymentReceipt] = useState<string>(
    settlement?.customer_direct_payment_reference || stageRefNumber || "",
  );
  const [paidByOutAmount, setPaidByOutAmount] = useState<string>(
    settlement?.amount_paid_by_out ? settlement.amount_paid_by_out.toString() : "",
  );
  const [outPaymentReference, setOutPaymentReference] = useState<string>(
    settlement?.out_payment_reference || "",
  );
  const [collectedFromCustomer, setCollectedFromCustomer] = useState<string>(
    settlement?.amount_collected_from_customer ? settlement.amount_collected_from_customer.toString() : "",
  );
  const [customerCollectionRef, setCustomerCollectionRef] = useState<string>(
    settlement?.customer_collection_reference || "",
  );

  // Stage 10: Clearance & Delivery State
  const [releasePermitNumber, setReleasePermitNumber] = useState<string>(
    dbRecord?.reference_number || (s7Data.release_permit_number as string) || "",
  );
  const [portExitEvent, setPortExitEvent] = useState<boolean>(!!s7Data.port_exit_at);
  const [deliveryEvent, setDeliveryEvent] = useState<boolean>(!!s7Data.delivered_at);

  // Stage 02: Pricing Form State
  const [minPrice, setMinPrice] = useState<string>(
    pricing?.estimated_min_price != null ? String(pricing.estimated_min_price) : "",
  );
  const [maxPrice, setMaxPrice] = useState<string>(
    pricing?.estimated_max_price != null ? String(pricing.estimated_max_price) : "",
  );
  const [pricingCurrency, setPricingCurrency] = useState<string>(pricing?.currency || "EGP");
  const [finalPriceInput, setFinalPriceInput] = useState<string>(
    pricing?.final_price != null ? String(pricing.final_price) : "",
  );
  const [isEditingEstimate, setIsEditingEstimate] = useState<boolean>(false);

  if (!isOpen) return null;

  const preliminaryInvoiceDoc = documents.find((d) =>
    ["commercial_invoice", "proforma_invoice", "invoice", "فاتورة مبدئية", "الفاتورة التجارية"].includes(
      d.document_type || "",
    ),
  );

  // Form submit handlers
  const handleSubmitEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (isNaN(min) || min < 0) {
      setFeedback({ type: "error", text: "الحد الأدنى للتقدير يجب أن يكون رقماً موجباً أو صفراً." });
      return;
    }
    if (isNaN(max) || max < 0) {
      setFeedback({ type: "error", text: "الحد الأقصى للتقدير يجب أن يكون رقماً موجباً أو صفراً." });
      return;
    }
    if (min > max) {
      setFeedback({ type: "error", text: "الحد الأدنى للتقدير لا يمكن أن يتجاوز الحد الأقصى." });
      return;
    }
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("estimated_min_price", minPrice);
    fd.append("estimated_max_price", maxPrice);
    fd.append("currency", pricingCurrency);

    startTransition(async () => {
      const res = await submitPriceEstimateAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم حفظ وتقديم تقدير السعر للعميل بنجاح." });
        setIsEditingEstimate(false);
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل تقديم تقدير السعر." });
      }
    });
  };

  const handleSetFinalPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const val = parseFloat(finalPriceInput);
    if (isNaN(val) || val <= 0) {
      setFeedback({ type: "error", text: "يرجى إدخال سعر نهائي صالح أكبر من صفر." });
      return;
    }
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("final_price", finalPriceInput);

    startTransition(async () => {
      const res = await adminSetFinalPriceAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم تسجيل السعر النهائي المتفق عليه بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل تسجيل السعر النهائي." });
      }
    });
  };

  const handleUpdateClassification = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("goods_category", selectedCategory);
    selectedProcedures.forEach((p) => fd.append("applicable_procedures", p));
    fd.append("classification_notes", classificationNotes);

    startTransition(async () => {
      const res = await updateShipmentClassificationAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم تحديث تصنيف الشحنة ومساراتها بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل تحديث تصنيف الشحنة." });
      }
    });
  };

  const handleApproveInvoice = async () => {
    if (!preliminaryInvoiceDoc) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_id", preliminaryInvoiceDoc.id);
    startTransition(async () => {
      const res = await adminApproveInvoiceAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم اعتماد الفاتورة المبدئية بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل اعتماد الفاتورة." });
      }
    });
  };

  const handleRequestInvoiceRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preliminaryInvoiceDoc || !invoiceRevisionNote.trim()) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_id", preliminaryInvoiceDoc.id);
    fd.append("note", invoiceRevisionNote.trim());
    fd.append("revision_reason", invoiceRevisionNote.trim());
    startTransition(async () => {
      const res = await adminRequestInvoiceRevisionAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم إرسال طلب تعديل الفاتورة المبدئية للعميل." });
        setShowInvoiceRevisionForm(false);
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل إرسال طلب التعديل." });
      }
    });
  };

  const handleIssueAcid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acidInputNumber.trim()) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("acid_number", acidInputNumber.trim());
    startTransition(async () => {
      const res = await adminIssueAcidAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم توثيق إصدار رقم ACID بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل توثيق رقم ACID." });
      }
    });
  };

  const handleStartAcidProcessing = async () => {
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    startTransition(async () => {
      const res = await adminStartAcidProcessingAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم تحديث حالة نافذة إلى قيد الإصدار." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل بدء إجراءات نافذة." });
      }
    });
  };

  const handleApproveDocument = async (docId: string) => {
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_id", docId);
    startTransition(async () => {
      const res = await adminApproveShipmentDocumentAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم اعتماد المستند بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل اعتماد المستند." });
      }
    });
  };

  const handleRequestDocRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionDocId || !docRevisionReason.trim()) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_id", revisionDocId);
    fd.append("note", docRevisionReason.trim());
    fd.append("revision_reason", docRevisionReason.trim());
    startTransition(async () => {
      const res = await adminRequestShipmentDocumentRevisionAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم إرسال طلب تعديل المستند للعميل." });
        setRevisionDocId(null);
        setDocRevisionReason("");
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل إرسال طلب التعديل." });
      }
    });
  };

  // Stage 04: Type-Specific Procedures Sub-Process Handler
  const handleUpdateTypeProcedures = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("stage_key", "stage_4_type_procedures");
    fd.append("status", typeProcStatus);
    fd.append("outcome", typeProcOutcome);
    fd.append("reference_number", typeProcRef);
    fd.append("notes", typeProcNotes);
    fd.append("rejection_or_delay_reason", typeProcDelayReason);

    const targetRecord = journey?.stages?.find((s) => s.stage_key === "stage_4_type_procedures");
    if (targetRecord?.updated_at) {
      fd.append("expected_updated_at", targetRecord.updated_at);
    }

    startTransition(async () => {
      const res = await updateCustomsStageAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم حفظ وتحديث إجراءات نوع البضاعة بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل تحديث إجراءات نوع البضاعة." });
      }
    });
  };

  // Generic DB Stage Update Handler (Stages 05, 06, 07, 08, 09, 10)
  const handleUpdateOperationalStage = async (targetDbKey: string, e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("stage_key", targetDbKey);
    fd.append("status", stageStatus);
    fd.append("outcome", stageOutcome);
    fd.append("reference_number", stageRefNumber);
    fd.append("notes", stageNotes);
    fd.append("rejection_or_delay_reason", stageDelayReason);

    // Concurrency Token: send the exact record's updated_at
    const targetStageRecord =
      journey?.stages?.find((s) => s.stage_key === targetDbKey) ||
      (stage.dbStageRecord?.stage_key === targetDbKey ? stage.dbStageRecord : null);
    if (targetStageRecord?.updated_at) {
      fd.append("expected_updated_at", targetStageRecord.updated_at);
    }

    // Extra stage data payloads
    const extraData: Record<string, unknown> = {};

    if (stage.key === "07_data_entry") {
      extraData.customs_declaration_number = stageRefNumber;
      extraData.declaration_46_advisory = declaration46Advisory;
      // Preserve historical cargox data backward-compatibly without requiring active verification
      if (s7Data.cargox) {
        extraData.cargox = s7Data.cargox;
      }
    } else if (stage.key === "08_valuation") {
      extraData.customs_value_egp = customsValueAmount ? Number(customsValueAmount) : null;
      extraData.tariff_rate_percent = tariffRatePercent ? Number(tariffRatePercent) : null;
    } else if (stage.key === "09_settlement") {
      fd.append("assessed_customs_amount", assessedAmount);
      if (settlementMode === "customer_paid_direct") {
        fd.append("settlement_status", "customer_paid_direct");
        fd.append("customer_direct_payment_reference", directPaymentReceipt);
        fd.append("reference_number", directPaymentReceipt);
      } else {
        fd.append("settlement_status", "paid_by_out");
        fd.append("amount_paid_by_out", paidByOutAmount || assessedAmount);
        fd.append("duties_paid_by_out", "true");
        fd.append("out_payment_reference", outPaymentReference);
        fd.append("amount_collected_from_customer", collectedFromCustomer);
        fd.append("customer_collection_reference", customerCollectionRef);
      }
    } else if (stage.key === "10_clearance_release") {
      extraData.release_permit_number = releasePermitNumber;
      fd.append("reference_number", releasePermitNumber);

      const targetData = (targetStageRecord?.stage_data || dbRecord?.stage_data || {}) as Record<string, unknown>;
      const existingPortExitAt = targetData.port_exit_at ? String(targetData.port_exit_at) : null;
      const existingDeliveredAt = targetData.delivered_at ? String(targetData.delivered_at) : null;

      // Port exit event
      if (portExitEvent) {
        extraData.port_exit_at = existingPortExitAt || new Date().toISOString();
      } else if (existingPortExitAt) {
        extraData.clear_port_exit = true;
        extraData.port_exit_at = null;
        fd.append("clear_port_exit", "true");
      }

      // Delivery event
      if (deliveryEvent) {
        extraData.delivered_at = existingDeliveredAt || new Date().toISOString();
      } else if (existingDeliveredAt) {
        extraData.clear_delivery = true;
        extraData.delivered_at = null;
        fd.append("clear_delivery", "true");
      }
    }

    fd.append("stage_data", JSON.stringify(extraData));

    startTransition(async () => {
      const res = await updateCustomsStageAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: "تم حفظ وتحديث حالة المرحلة بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل تحديث المرحلة." });
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/70 backdrop-blur-xs font-sans overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white border border-neutral-800 rounded-3xl w-full max-w-2xl my-auto shadow-2xl flex flex-col overflow-hidden max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="bg-neutral-950 text-white p-4 sm:p-6 flex items-center justify-between gap-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#F5C500] text-neutral-950 font-black text-sm flex items-center justify-center shrink-0 shadow-sm font-mono">
              {stage.number}
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                {stage.title}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-neutral-300">
                  {stage.assignedRoleLabel || "إدارة العمليات"}
                </span>
                <span className="text-neutral-600">•</span>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold ${
                    stage.isCompleted
                      ? "bg-emerald-950/90 text-emerald-300 border border-emerald-700/60"
                      : stage.isCurrent
                      ? "bg-[#F5C500] text-neutral-950"
                      : "bg-neutral-800 text-neutral-300 border border-neutral-700/60"
                  }`}
                >
                  {stage.statusLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5C500]"
            title="إغلاق"
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        {/* ── Feedback Message Banner ── */}
        {feedback && (
          <div
            className={`p-3 text-xs flex items-center gap-2 shrink-0 border-b ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            <DynamicIcon
              name={feedback.type === "success" ? "Check" : "AlertTriangle"}
              size={14}
            />
            <span>{feedback.text}</span>
          </div>
        )}

        {/* ── Modal Body (Stage Specific) ── */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-6 text-neutral-800 text-xs sm:text-sm">
          {/* Description & Requirements Banner */}
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 flex flex-col gap-1.5">
            <div className="font-bold text-neutral-900">وصف المرحلة ومستهدفاتها:</div>
            <div>{stage.shortDescription}</div>
            {stage.prerequisiteText && (
              <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200/80 mt-1">
                ⚠️ متطلب مسبق: {stage.prerequisiteText}
              </div>
            )}
          </div>

          {/* Checklist (Completed & Outstanding Items) */}
          {stage.checklist && stage.checklist.length > 0 && (
            <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black text-neutral-900 flex items-center gap-2">
                  <DynamicIcon name="CheckSquare" size={14} className="text-[#F5C500]" />
                  <span>قائمة بنود التحقق للمرحلة ({stage.checklist.filter((c) => c.isCompleted).length}/{stage.checklist.length})</span>
                </h4>
                <span className="text-[10px] font-bold text-neutral-500">
                  {stage.checklist.filter((c) => c.isCompleted).length === stage.checklist.length ? "مكتملة بالكامل ✓" : "قيد الاستيفاء"}
                </span>
              </div>
              <div className="space-y-2">
                {stage.checklist.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs transition-colors ${
                      item.isCompleted
                        ? "bg-emerald-50/60 border-emerald-200/80 text-emerald-900"
                        : "bg-neutral-50 border-neutral-200/70 text-neutral-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        item.isCompleted
                          ? "bg-emerald-600 text-white"
                          : "border border-neutral-300 bg-white"
                      }`}
                    >
                      {item.isCompleted && <DynamicIcon name="Check" size={11} />}
                    </div>
                    <div className="flex-1 leading-snug">
                      <span className={item.isCompleted ? "font-bold" : "font-normal"}>{item.label}</span>
                      {item.isRequired && !item.isCompleted && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mr-2 font-bold border border-amber-200/60">
                          إلزامي
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 01: استقبال طلب الشحنة & تصنيف البضاعة
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "01_intake" && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 text-xs">
                <div>
                  <span className="text-neutral-500">العميل:</span>{" "}
                  <span className="font-bold text-neutral-900">{customer?.full_name || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">الشركة:</span>{" "}
                  <span className="font-bold text-neutral-900">{company?.name || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">ميناء الوصول:</span>{" "}
                  <span className="font-bold text-neutral-900">{shipment.port_of_arrival || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">بلد المنشأ:</span>{" "}
                  <span className="font-bold text-neutral-900">{shipment.country_of_origin || "—"}</span>
                </div>
              </div>

              <form onSubmit={handleUpdateClassification} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                    تصنيف نوع البضاعة والمسار الرقابي:
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value as GoodsCategory)}
                    className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white focus:border-neutral-900 focus:outline-hidden"
                  >
                    {GOODS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {GOODS_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                    المسارات الرقابية المحددة:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {APPLICABLE_PROCEDURE_DEFINITIONS.map((proc) => {
                      const isChecked = selectedProcedures.includes(proc.id);
                      return (
                        <label
                          key={proc.id}
                          className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer ${
                            isChecked
                              ? "bg-yellow-50/60 border-yellow-400 font-medium"
                              : "bg-white border-neutral-200 text-neutral-600"
                          }`}
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
                            className="mt-0.5"
                          />
                          <div>
                            <div className="text-neutral-900 font-bold">{proc.name}</div>
                            <div className="text-[10px] text-neutral-500">{proc.authorityName}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                    ملاحظات التصنيف الإجرائي:
                  </label>
                  <textarea
                    value={classificationNotes}
                    onChange={(e) => setClassificationNotes(e.target.value)}
                    rows={2}
                    placeholder="ملاحظات توجيهية لفريق المعاينة والتوثيق..."
                    className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 focus:border-neutral-900 focus:outline-hidden"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
                >
                  {isPending ? "جاري الحفظ..." : "حفظ تصنيف الشحنة ومساراتها"}
                </button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 02: التسعير وموافقة العميل
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "02_pricing" && (
            <div className="flex flex-col gap-4">
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">حالة التسعير الحالية:</span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                      pricing?.status === "customer_approved"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : pricing?.status === "negotiation_requested" || shipment.status === "negotiation"
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : pricing?.final_price || shipment.status === "price_agreed"
                        ? "bg-blue-50 text-blue-800 border-blue-300"
                        : pricing?.estimated_min_price
                        ? "bg-yellow-50 text-yellow-800 border-yellow-300"
                        : "bg-neutral-100 text-neutral-600 border-neutral-300"
                    }`}
                  >
                    {pricing?.status === "customer_approved"
                      ? "تمت الموافقة على التسعير ✓"
                      : pricing?.status === "negotiation_requested" || shipment.status === "negotiation"
                      ? "طلب التفاوض على السعر"
                      : pricing?.final_price || shipment.status === "price_agreed"
                      ? "تم تحديد السعر النهائي"
                      : pricing?.estimated_min_price
                      ? "في انتظار موافقة العميل"
                      : "قيد إعداد عرض السعر"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-2 border-t border-neutral-200">
                  <div>
                    <span className="text-xs text-neutral-500">نطاق التقدير المبدئي:</span>
                    <div className="font-bold text-neutral-900 mt-0.5 text-sm font-mono">
                      {pricing?.estimated_min_price
                        ? `${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price?.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`
                        : "لم يتم التقدير بعد"}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500">السعر النهائي المتفق عليه:</span>
                    <div className="font-bold text-neutral-900 mt-0.5 text-sm font-mono">
                      {pricing?.final_price
                        ? `${pricing.final_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`
                        : "بانتظار الاتفاق"}
                    </div>
                  </div>
                </div>

                {pricing?.customer_approved_at && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>تم اعتماد السعر رسمياً من العميل بتاريخ: {formatDateAr(pricing.customer_approved_at)}</span>
                  </div>
                )}
              </div>

              {/* Action 1: Customer Negotiation Ongoing -> Admin Sets Final Price */}
              {(shipment.status === "negotiation" ||
                pricing?.status === "negotiation_requested" ||
                shipment.status === "price_agreed" ||
                pricing?.status === "final_proposed") &&
                pricing?.status !== "customer_approved" && (
                  <form onSubmit={handleSetFinalPrice} className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                    <div className="flex items-start gap-2">
                      <DynamicIcon name="PhoneCall" className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-900">
                          {shipment.status === "negotiation" || pricing?.status === "negotiation_requested"
                            ? "مطلوب تسجيل السعر النهائي بعد التفاوض"
                            : "تعديل السعر النهائي المتفق عليه"}
                        </h4>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          يتم التواصل والتفاوض مع العميل هاتفياً، ثم يُسجل السعر النهائي المتفق عليه هنا لإرساله لموافقته الرسمية.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        السعر النهائي المتفق عليه ({pricingCurrency}):
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={finalPriceInput}
                        onChange={(e) => setFinalPriceInput(e.target.value)}
                        placeholder="مثال: 5500"
                        className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white font-mono focus:border-neutral-900 focus:outline-hidden"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isPending || !finalPriceInput}
                      className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                      <span>{isPending ? "جاري الحفظ..." : "تسجيل السعر النهائي وإرساله للعميل"}</span>
                    </button>
                  </form>
                )}

              {/* Action 2: Initial Estimate Submission / Edit */}
              {(shipment.status === "awaiting_pricing" ||
                shipment.status === "price_proposed" ||
                isEditingEstimate ||
                (!pricing?.estimated_min_price && pricing?.status !== "customer_approved")) && (
                <form onSubmit={handleSubmitEstimate} className="p-4 bg-white border border-neutral-200 rounded-xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <DynamicIcon name="DollarSign" className="w-4 h-4 text-[#F5C500]" />
                      <span>{pricing?.estimated_min_price ? "تعديل تقدير السعر المبدئي" : "تقديم التقدير المالي المبدئي"}</span>
                    </h4>
                    {pricing?.estimated_min_price && (
                      <button
                        type="button"
                        onClick={() => setIsEditingEstimate(!isEditingEstimate)}
                        className="text-[11px] text-neutral-500 hover:text-neutral-900 underline"
                      >
                        {isEditingEstimate ? "إلغاء التعديل" : "تعديل التقدير"}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">الحد الأدنى للتقدير:</label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        required
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        placeholder="مثال: 3000"
                        className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 font-mono focus:border-neutral-900 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">الحد الأقصى للتقدير:</label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        required
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        placeholder="مثال: 5000"
                        className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 font-mono focus:border-neutral-900 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">العملة:</label>
                    <select
                      value={pricingCurrency}
                      onChange={(e) => setPricingCurrency(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white focus:border-neutral-900 focus:outline-hidden"
                    >
                      <option value="EGP">جنيه مصري (EGP)</option>
                      <option value="USD">دولار أمريكي (USD)</option>
                      <option value="EUR">يورو (EUR)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending || !minPrice || !maxPrice}
                    className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <DynamicIcon name="Send" className="w-3.5 h-3.5" />
                    <span>{isPending ? "جاري الإرسال..." : "حفظ وإرسال عرض السعر للعميل"}</span>
                  </button>
                </form>
              )}

              {onSelectTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectTab("pricing");
                  }}
                  className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl text-xs border border-neutral-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-neutral-950"
                >
                  <span>عرض التبويب الكامل لإدارة التسعير والمستندات</span>
                  <DynamicIcon name="ChevronLeft" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 03: مراجعة الفاتورة وإجراءات نافذة
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "03_invoice_nafeza" && (
            <div className="flex flex-col gap-5">
              {/* Part 1: Preliminary Invoice Review */}
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <DynamicIcon name="FileText" size={14} />
                    <span>مراجعة وتدقيق الفاتورة المبدئية للشحنة</span>
                  </h4>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                      preliminaryInvoiceDoc?.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : preliminaryInvoiceDoc?.status === "revision_required"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-neutral-100 text-neutral-600 border-neutral-300"
                    }`}
                  >
                    {preliminaryInvoiceDoc?.status === "approved"
                      ? "معتمدة ✓"
                      : preliminaryInvoiceDoc?.status === "revision_required"
                      ? "مطلوب تعديل"
                      : preliminaryInvoiceDoc
                      ? "بانتظار المراجعة"
                      : "لم تُرفع بعد"}
                  </span>
                </div>

                {preliminaryInvoiceDoc ? (
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                    <span className="text-xs text-neutral-600 truncate max-w-xs">
                      {preliminaryInvoiceDoc.file_name}
                    </span>
                    <div className="flex items-center gap-2">
                      {onPreviewDocument && (
                        <button
                          type="button"
                          onClick={() => onPreviewDocument(preliminaryInvoiceDoc)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-xl hover:bg-neutral-100 cursor-pointer text-neutral-800 transition-colors"
                        >
                          <DynamicIcon name="Eye" className="w-3 h-3 text-neutral-500" />
                          <span>معاينة</span>
                        </button>
                      )}
                      {preliminaryInvoiceDoc.status !== "approved" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={handleApproveInvoice}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
                        >
                          اعتماد الفاتورة
                        </button>
                      )}
                      {preliminaryInvoiceDoc.status !== "revision_required" && (
                        <button
                          type="button"
                          onClick={() => setShowInvoiceRevisionForm(!showInvoiceRevisionForm)}
                          className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs hover:bg-amber-100 font-bold cursor-pointer transition-colors"
                        >
                          طلب تعديل
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 py-1">
                    لم يقم العميل برفع الفاتورة المبدئية بعد.
                  </div>
                )}

                {showInvoiceRevisionForm && (
                  <form onSubmit={handleRequestInvoiceRevision} className="flex flex-col gap-2 pt-2 border-t">
                    <label className="text-xs font-bold text-neutral-800">سبب طلب التعديل:</label>
                    <textarea
                      value={invoiceRevisionNote}
                      onChange={(e) => setInvoiceRevisionNote(e.target.value)}
                      rows={2}
                      placeholder="اذكر البنود أو الأخطاء المطلوب تصحيحها في الفاتورة المبدئية..."
                      className="w-full text-xs p-2 rounded border border-neutral-300"
                    />
                    <button
                      type="submit"
                      disabled={isPending || !invoiceRevisionNote.trim()}
                      className="self-end px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 cursor-pointer shadow-xs transition-colors"
                    >
                      إرسال ملاحظات التعديل للعميل
                    </button>
                  </form>
                )}
              </div>

              {/* Part 2: Nafeza Procedures & ACID */}
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <DynamicIcon name="Shield" size={14} />
                    <span>تتبع إجراءات نافذة ورقم ACID</span>
                  </h4>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                      acid?.status === "issued"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : acid?.status === "processing"
                        ? "bg-yellow-50 text-yellow-800 border-yellow-300"
                        : "bg-neutral-100 text-neutral-600 border-neutral-300"
                    }`}
                  >
                    {acid?.status === "issued"
                      ? "تم الإصدار والتوثيق ✓"
                      : acid?.status === "processing"
                      ? "قيد الإصدار لدى نافذة"
                      : "بانتظار التقديم"}
                  </span>
                </div>

                <form onSubmit={handleIssueAcid} className="flex flex-col gap-3 pt-2 border-t border-neutral-200">
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      رقم ACID الصادر (19 رقماً):
                    </label>
                    <input
                      type="text"
                      value={acidInputNumber}
                      onChange={(e) => setAcidInputNumber(e.target.value)}
                      placeholder="مثال: 1234567890123456789"
                      className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 font-mono tracking-wider"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isPending || !acidInputNumber.trim()}
                      className="flex-1 py-2.5 bg-neutral-950 text-[#F5C500] font-bold rounded-xl text-xs hover:bg-neutral-900 border border-neutral-800 transition-colors cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-neutral-950"
                    >
                      توثيق واعتماد رقم ACID
                    </button>
                    {acid?.status !== "processing" && acid?.status !== "issued" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleStartAcidProcessing}
                        className="px-4 py-2.5 border border-neutral-300 rounded-xl text-xs font-bold hover:bg-neutral-100 cursor-pointer text-neutral-800 transition-colors"
                      >
                        بدء إجراءات نافذة
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 04: مراجعة مستندات الشحنة واستكمالها + إجراءات نوع البضاعة
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "04_documents" && (
            <div className="flex flex-col gap-6">
              {/* ── Section A: Final Shipment Documents (4 Required) ── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[11px] font-black flex items-center justify-center">أ</span>
                    <h3 className="text-xs sm:text-sm font-black text-neutral-950">
                      مستندات الشحن النهائية الأربعة الإلزامية:
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500 font-bold">
                    معتمد ({documents.filter((d) => ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"].includes(matchFinalDocumentType(d.document_type) || "") && d.status === "approved").length}/4)
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {[
                    { type: "commercial_invoice", label: "الفاتورة التجارية النهائية (Commercial Invoice)" },
                    { type: "packing_list", label: "بيان العبوة النهائي (Packing List)" },
                    { type: "bill_of_lading", label: "بوليصة الشحن (Bill of Lading)" },
                    { type: "certificate_of_origin", label: "شهادة المنشأ الرسمية (Certificate of Origin)" },
                  ].map((item) => {
                    const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === item.type);
                    const isApproved = doc?.status === "approved";
                    const isRevision = doc?.status === "revision_required";

                    return (
                      <div
                        key={item.type}
                        className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-neutral-900 truncate">{item.label}</div>
                          <div className="text-[11px] text-neutral-500 font-mono mt-0.5 truncate">
                            {doc ? doc.file_name : "لم يتم رفع المستند بعد من العميل"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-bold shrink-0 ${
                              isApproved
                                ? "bg-neutral-950 text-[#F5C500] border-neutral-800"
                                : isRevision
                                ? "bg-neutral-100 text-neutral-900 border-neutral-300"
                                : doc
                                ? "bg-yellow-50 text-yellow-900 border-yellow-300"
                                : "bg-neutral-100 text-neutral-400 border-neutral-200"
                            }`}
                          >
                            {isApproved
                              ? "معتمد ✓"
                              : isRevision
                              ? "مطلوب تعديل"
                              : doc
                              ? "بانتظار المراجعة"
                              : "مفقود"}
                          </span>

                          {doc && onPreviewDocument && (
                            <button
                              type="button"
                              onClick={() => onPreviewDocument(doc)}
                              className="px-2.5 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-100 cursor-pointer font-medium"
                            >
                              معاينة
                            </button>
                          )}

                          {doc && !isApproved && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleApproveDocument(doc.id)}
                              className="px-3 py-1 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-lg text-xs cursor-pointer shadow-xs border border-neutral-800"
                            >
                              اعتماد
                            </button>
                          )}

                          {doc && !isRevision && (
                            <button
                              type="button"
                              onClick={() => {
                                setRevisionDocId(doc.id);
                                setDocRevisionReason("");
                              }}
                              className="px-2.5 py-1 bg-neutral-100 border border-neutral-300 text-neutral-800 rounded-lg text-xs hover:bg-neutral-200 cursor-pointer font-medium"
                            >
                              طلب تعديل
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {revisionDocId && (
                  <form onSubmit={handleRequestDocRevision} className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-300 flex flex-col gap-2.5">
                    <label className="text-xs font-bold text-neutral-900">
                      سبب طلب تعديل المستند وإعادته للعميل:
                    </label>
                    <textarea
                      value={docRevisionReason}
                      onChange={(e) => setDocRevisionReason(e.target.value)}
                      rows={2}
                      placeholder="وضح الملاحظات والأخطاء المطلوب تصحيحها..."
                      className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white focus:outline-hidden focus:border-neutral-950"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRevisionDocId(null)}
                        className="px-3 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-100 cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={isPending || !docRevisionReason.trim()}
                        className="px-3 py-1 bg-neutral-950 text-[#F5C500] font-bold rounded-lg text-xs hover:bg-neutral-900 cursor-pointer border border-neutral-800"
                      >
                        إرسال طلب التعديل
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* ── Section B: Conditional Type-Specific Procedures ── */}
              <div className="flex flex-col gap-3 pt-3 border-t border-neutral-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#F5C500] text-neutral-950 text-[11px] font-black flex items-center justify-center">ب</span>
                    <h3 className="text-xs sm:text-sm font-black text-neutral-950">
                      إجراءات حسب نوع البضاعة وجهات العرض:
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      stage.typeProceduresSubProcess?.isApplicable
                        ? "bg-yellow-50 text-yellow-900 border-yellow-300"
                        : "bg-neutral-100 text-neutral-500 border-neutral-200"
                    }`}
                  >
                    {stage.typeProceduresSubProcess?.isApplicable
                      ? "خاضعة لجهات عرض تخصصية"
                      : "غير منطبق (بضائع عامة)"}
                  </span>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 leading-relaxed">
                  {stage.typeProceduresSubProcess?.isApplicable
                    ? "هذه الشحنة خاضعة للجهات الرقابية المختصة (سلامة الغذاء / الحجر الزراعي / الرقابة الصناعية). يرجى استيفاء وتوثيق نتائج الفحص والمطابقة أدناه."
                    : "الشحنة مصنفة بضائع عامة ولا تتطلب جهات عرض تخصصية إضافية، مع بقاء المستندات الأربعة إلزامية دائماً."}
                </div>

                {(stage.typeProceduresSubProcess?.isApplicable || (typeProcRecord && typeProcRecord.status !== "not_applicable")) && (
                  <form onSubmit={handleUpdateTypeProcedures} className="flex flex-col gap-3 p-3.5 bg-neutral-50/60 rounded-xl border border-neutral-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-800 mb-1">
                          حالة إجراءات جهة العرض:
                        </label>
                        <select
                          value={typeProcStatus}
                          onChange={(e) => setTypeProcStatus(e.target.value as CustomsStageStatus)}
                          className="w-full text-xs p-2 rounded-lg border border-neutral-300 bg-white"
                        >
                          <option value="in_progress">قيد التنفيذ / سحب العينات</option>
                          <option value="awaiting_external_response">بانتظار إفادات اللجان الرقابية</option>
                          <option value="completed">مكتمل ومعتمد رسمياً</option>
                          <option value="needs_correction">ملاحظات أو فروقات فحص</option>
                          <option value="blocked">متوقف / مانع تشغيلي</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-800 mb-1">
                          رقم المرجع / الإفادة الرسمية:
                        </label>
                        <input
                          type="text"
                          value={typeProcRef}
                          onChange={(e) => setTypeProcRef(e.target.value)}
                          placeholder="رقم مرجع المحضر أو الموافقة"
                          className="w-full text-xs p-2 rounded-lg border border-neutral-300 font-mono bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        نتيجة الفحص ومحضر المطابقة:
                      </label>
                      <input
                        type="text"
                        value={typeProcOutcome}
                        onChange={(e) => setTypeProcOutcome(e.target.value)}
                        placeholder="مثال: تمت مطابقة العينات وصدور موافقة سلامة الغذاء رقم 8812"
                        className="w-full text-xs p-2 rounded-lg border border-neutral-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        ملاحظات جهة العرض:
                      </label>
                      <textarea
                        value={typeProcNotes}
                        onChange={(e) => setTypeProcNotes(e.target.value)}
                        placeholder="ملاحظات لجان الفحص وسحب العينات..."
                        rows={2}
                        className="w-full text-xs p-2 rounded-lg border border-neutral-300 bg-white"
                      />
                    </div>

                    {(typeProcStatus === "blocked" || typeProcStatus === "needs_correction") && (
                      <div>
                        <label className="block text-xs font-bold text-rose-700 mb-1">
                          سبب التأخير أو التعليق:
                        </label>
                        <input
                          type="text"
                          value={typeProcDelayReason}
                          onChange={(e) => setTypeProcDelayReason(e.target.value)}
                          placeholder="اكتب سبب التعليق أو التأخير..."
                          className="w-full text-xs p-2 rounded-lg border border-rose-300 bg-rose-50/50"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isPending}
                      className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
                    >
                      حفظ وتحديث إجراءات نوع البضاعة
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 05: الكشف الميداني (Field Scouting - stage_5_scouting only)
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "05_scouting" && (
            <form
              onSubmit={(e) => handleUpdateOperationalStage("stage_5_scouting", e)}
              className="flex flex-col gap-4"
            >
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/90 text-xs flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-950">الكشف الميداني في ساحة الوصول:</span>
                  <span className="text-[11px] font-bold text-neutral-600 bg-neutral-200/70 px-2 py-0.5 rounded-md">
                    الدور المسؤول: كشاف (Scout)
                  </span>
                </div>
                <p className="text-neutral-500 text-[11px] leading-relaxed">
                  التحقق الميداني من وصول الحاوية في الساحة، مطابقة رقم الحاوية، فحص إذن التسليم، وتوثيق سلامة الأختام الجمركية.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  حالة الكشف الميداني:
                </label>
                <select
                  value={stageStatus}
                  onChange={(e) => setStageStatus(e.target.value as CustomsStageStatus)}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 bg-white"
                >
                  <option value="in_progress">قيد الكشف الميداني في الساحة</option>
                  <option value="completed">مكتمل والأختام سليمة تماماً</option>
                  <option value="needs_correction">ملاحظات على الأختام أو الحاوية</option>
                  <option value="blocked">متوقف / الحاوية لم تصل للساحة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  رقم إذن التسليم الملاحي / الكشف:
                </label>
                <input
                  type="text"
                  value={stageRefNumber}
                  onChange={(e) => setStageRefNumber(e.target.value)}
                  placeholder="رقم إذن التسليم الملاحي أو قيد الكشف"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  نتيجة الكشف الميداني وسلامة الأختام:
                </label>
                <input
                  type="text"
                  value={stageOutcome}
                  onChange={(e) => setStageOutcome(e.target.value)}
                  placeholder="مثال: الحاوية وصلت بالساحة والأختام الملاحية والجمركية سليمة 100%"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  ملاحظات الكشاف الميداني:
                </label>
                <textarea
                  value={stageNotes}
                  onChange={(e) => setStageNotes(e.target.value)}
                  placeholder="ملاحظات وصول الحاوية، موضعها بالساحة، والأختام..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300"
                />
              </div>

              {(stageStatus === "blocked" || stageStatus === "needs_correction") && (
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">
                    سبب التأخير أو التعليق:
                  </label>
                  <input
                    type="text"
                    value={stageDelayReason}
                    onChange={(e) => setStageDelayReason(e.target.value)}
                    placeholder="اكتب سبب التعليق أو التأخير..."
                    className="w-full text-xs p-2.5 rounded-xl border border-rose-300 bg-rose-50/50"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
              >
                حفظ وتحديث نتائج الكشف الميداني
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 06: المعاينة (Customs Inspection - stage_6_inspection only)
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "06_inspection" && (
            <form
              onSubmit={(e) => handleUpdateOperationalStage("stage_6_inspection", e)}
              className="flex flex-col gap-4"
            >
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/90 text-xs flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-950">المعاينة الجمركية الدقيقة:</span>
                  <span className="text-[11px] font-bold text-neutral-600 bg-neutral-200/70 px-2 py-0.5 rounded-md">
                    الدور المسؤول: معاين جمركي (Inspector)
                  </span>
                </div>
                <p className="text-neutral-500 text-[11px] leading-relaxed">
                  فتح الطرود، مطابقة الأصناف والأوزان والكميات مع الفواتير والبيانات، وتحرير وتوثيق محضر المعاينة الجمركية الرسمي.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  حالة المعاينة الجمركية:
                </label>
                <select
                  value={stageStatus}
                  onChange={(e) => setStageStatus(e.target.value as CustomsStageStatus)}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 bg-white"
                >
                  <option value="in_progress">قيد المعاينة وفتح الطرود</option>
                  <option value="completed">معاينة مكتملة ومطابقة رسمياً</option>
                  <option value="needs_correction">فروقات أوزان أو أصناف تستوجب تصحيح</option>
                  <option value="blocked">معاينة متوقفة / حظر أو ضبط</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  رقم محضر المعاينة الجمركية الرسمي:
                </label>
                <input
                  type="text"
                  value={stageRefNumber}
                  onChange={(e) => setStageRefNumber(e.target.value)}
                  placeholder="رقم المحضر الجمركي الرسمي"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  نتيجة المعاينة ومطابقة الطرود:
                </label>
                <input
                  type="text"
                  value={stageOutcome}
                  onChange={(e) => setStageOutcome(e.target.value)}
                  placeholder="مثال: مطابقة الأعداد والأوزان بنسبة 100% وصدور محضر المعاينة رقم 741"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  ملاحظات المعاين الجمركي:
                </label>
                <textarea
                  value={stageNotes}
                  onChange={(e) => setStageNotes(e.target.value)}
                  placeholder="ملاحظات فحص الطرود، الأصناف، والوزن القائم والصافي..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300"
                />
              </div>

              {(stageStatus === "blocked" || stageStatus === "needs_correction") && (
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">
                    سبب التأخير أو التعليق:
                  </label>
                  <input
                    type="text"
                    value={stageDelayReason}
                    onChange={(e) => setStageDelayReason(e.target.value)}
                    placeholder="اكتب سبب التعليق أو التأخير..."
                    className="w-full text-xs p-2.5 rounded-xl border border-rose-300 bg-rose-50/50"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
              >
                حفظ نتائج المعاينة الجمركية
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 07: إدراج البيانات
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "07_data_entry" && (
            <form
              onSubmit={(e) => handleUpdateOperationalStage("stage_7_data_entry", e)}
              className="flex flex-col gap-4"
            >
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  رقم مسودة / قيد البيان الجمركي:
                </label>
                <input
                  type="text"
                  value={stageRefNumber}
                  onChange={(e) => setStageRefNumber(e.target.value)}
                  placeholder="رقم البيان الجمركي الرسمي"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono"
                />
              </div>

              {/* Number 46 Box */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col gap-1.5">
                <label className="block text-xs font-bold text-neutral-800">
                  رقم 46 (استرشادي غير إلزامي مسبقاً):
                </label>
                <div className="text-[11px] text-neutral-500 mb-1">
                  رقم 46 يطلب فقط عند حلول مرحلته المقررة ولا يعطل إتمام إدراج البيانات.
                </div>
                <input
                  type="text"
                  value={declaration46Advisory}
                  onChange={(e) => setDeclaration46Advisory(e.target.value)}
                  placeholder="رقم 46 (استرشادي)"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  ملاحظات ومطابقة بنود التعريفة الجمركية (HS Codes):
                </label>
                <input
                  type="text"
                  value={stageOutcome}
                  onChange={(e) => setStageOutcome(e.target.value)}
                  placeholder="مثال: تم إدراج بنود التعريفة ومطابقة الفاتورة مع الشهادة بنجاح"
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  ملاحظات إدراج البيانات:
                </label>
                <textarea
                  value={stageNotes}
                  onChange={(e) => setStageNotes(e.target.value)}
                  placeholder="ملاحظات إضافية حول بنود الإدراج..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">حالة الإدراج:</label>
                <select
                  value={stageStatus}
                  onChange={(e) => setStageStatus(e.target.value as CustomsStageStatus)}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 bg-white"
                >
                  <option value="in_progress">قيد إدراج البنود وتفريغ الفاتورة</option>
                  <option value="completed">مكتمل وموثق رسمياً</option>
                  <option value="needs_correction">مطلوب تعديل بنود</option>
                  <option value="blocked">متوقف</option>
                </select>
              </div>

              {(stageStatus === "blocked" || stageStatus === "needs_correction") && (
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">
                    سبب التأخير أو التعليق:
                  </label>
                  <input
                    type="text"
                    value={stageDelayReason}
                    onChange={(e) => setStageDelayReason(e.target.value)}
                    placeholder="اكتب سبب التعليق أو التأخير..."
                    className="w-full text-xs p-2.5 rounded-xl border border-rose-300 bg-rose-50/50"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
              >
                حفظ وتحديث بيانات الإدراج الجمركي
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 08: التقييم الجمركي
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "08_valuation" && (
            <form
              onSubmit={(e) => handleUpdateOperationalStage("stage_8_valuation", e)}
              className="flex flex-col gap-3.5"
            >
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  القيمة المقبولة للأغراض الجمركية (ج.م):
                </label>
                <input
                  type="number"
                  value={customsValueAmount}
                  onChange={(e) => setCustomsValueAmount(e.target.value)}
                  placeholder="القيمة المقدرة رسمياً"
                  className="w-full text-xs p-2 rounded border border-neutral-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  نسبة الرسوم والضرائب المقررة (%):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tariffRatePercent}
                  onChange={(e) => setTariffRatePercent(e.target.value)}
                  placeholder="مثال: 14"
                  className="w-full text-xs p-2 rounded border border-neutral-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  رقم تقرير التقييم الجمركي المعتمد:
                </label>
                <input
                  type="text"
                  value={stageRefNumber}
                  onChange={(e) => setStageRefNumber(e.target.value)}
                  placeholder="رقم التقرير"
                  className="w-full text-xs p-2 rounded border border-neutral-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">حالة التقييم:</label>
                <select
                  value={stageStatus}
                  onChange={(e) => setStageStatus(e.target.value as CustomsStageStatus)}
                  className="w-full text-xs p-2 rounded border border-neutral-300 bg-white"
                >
                  <option value="in_progress">قيد دراسة القيمة والتعريفة</option>
                  <option value="completed">اعتماد التقييم الجمركي رسمياً</option>
                  <option value="needs_correction">ملاحظات على القيمة</option>
                  <option value="blocked">متوقف</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
              >
                اعتماد التقييم الجمركي
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 09: تسوية المستحقات (Package 4.1 Enforced)
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "09_settlement" && (
            <form
              onSubmit={(e) => handleUpdateOperationalStage("stage_9_fees_payments", e)}
              className="flex flex-col gap-4"
            >
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1">
                    إجمالي الرسوم الجمركية والضرائب المقررة (ج.م):
                  </label>
                  <input
                    type="number"
                    value={assessedAmount}
                    onChange={(e) => setAssessedAmount(e.target.value)}
                    placeholder="قيمة المطالبة الجمركية الرسمية"
                    className="w-full text-xs p-2 rounded border border-neutral-300"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                    مصدر سداد الرسوم الجمركية:
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={settlementMode === "customer_paid_direct"}
                        onChange={() => setSettlementMode("customer_paid_direct")}
                      />
                      <span>سداد مباشر من العميل لمصلحة الجمارك</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={settlementMode === "paid_by_out"}
                        onChange={() => setSettlementMode("paid_by_out")}
                      />
                      <span>سداد عبر شركة OUT بالنيابة</span>
                    </label>
                  </div>
                </div>

                {settlementMode === "customer_paid_direct" ? (
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      رقم إيصال السداد المباشر الرسمي (إلزامي):
                    </label>
                    <input
                      type="text"
                      value={directPaymentReceipt}
                      onChange={(e) => setDirectPaymentReceipt(e.target.value)}
                      placeholder="رقم الإيصال البنكي أو الجمركي"
                      className="w-full text-xs p-2 rounded border border-neutral-300 font-mono"
                      required
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-2 border-t border-neutral-200">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        مرجع سداد OUT للجمارك:
                      </label>
                      <input
                        type="text"
                        value={outPaymentReference}
                        onChange={(e) => setOutPaymentReference(e.target.value)}
                        placeholder="رقم التحويل البنكي"
                        className="w-full text-xs p-2 rounded border border-neutral-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        المبلغ المسدد من OUT (ج.م):
                      </label>
                      <input
                        type="number"
                        value={paidByOutAmount}
                        onChange={(e) => setPaidByOutAmount(e.target.value)}
                        placeholder="المبلغ الفعلي المسدد"
                        className="w-full text-xs p-2 rounded border border-neutral-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        المبلغ المحصل من العميل (ج.م):
                      </label>
                      <input
                        type="number"
                        value={collectedFromCustomer}
                        onChange={(e) => setCollectedFromCustomer(e.target.value)}
                        placeholder="يجب أن يغطي الرسوم بالكامل"
                        className="w-full text-xs p-2 rounded border border-neutral-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        مرجع تحصيل العميل:
                      </label>
                      <input
                        type="text"
                        value={customerCollectionRef}
                        onChange={(e) => setCustomerCollectionRef(e.target.value)}
                        placeholder="رقم إيصال التحصيل الداخلي"
                        className="w-full text-xs p-2 rounded border border-neutral-300 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  حالة التسوية:
                </label>
                <select
                  value={stageStatus}
                  onChange={(e) => setStageStatus(e.target.value as CustomsStageStatus)}
                  className="w-full text-xs p-2 rounded border border-neutral-300 bg-white"
                >
                  <option value="in_progress">قيد السداد ومطابقة الإشعارات</option>
                  <option value="completed">تسوية مكتملة وسداد مؤكد (صفر مديونية)</option>
                  <option value="awaiting_external_response">بانتظار تحصيل المستحقات من العميل</option>
                  <option value="needs_correction">ملاحظات على السداد</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
              >
                حفظ واعتماد تسوية المستحقات
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STAGE 10: الإفراج والخروج والتسليم
             ══════════════════════════════════════════════════════════════════ */}
          {stage.key === "10_clearance_release" && (
            <form
              onSubmit={(e) => handleUpdateOperationalStage("stage_10_clearance_release", e)}
              className="flex flex-col gap-4"
            >
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  رقم إذن الإفراج الجمركي النهائي (إلزامي للاكتمال):
                </label>
                <input
                  type="text"
                  value={releasePermitNumber}
                  onChange={(e) => setReleasePermitNumber(e.target.value)}
                  placeholder="رقم إذن الإفراج الصادر رسمياً"
                  className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 font-mono"
                  required
                />
              </div>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col gap-2.5 text-xs">
                <span className="font-bold text-neutral-900">تتبع الأحداث التشغيلية المنفصلة:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={portExitEvent}
                    onChange={(e) => setPortExitEvent(e.target.checked)}
                  />
                  <span>تم خروج الشحنة الفعلي من الدائرة الجمركية والميناء</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deliveryEvent}
                    onChange={(e) => setDeliveryEvent(e.target.checked)}
                  />
                  <span>تم تسليم الشحنة للعميل وتوثيق الاستلام</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  حالة المرحلة النهائية:
                </label>
                <select
                  value={stageStatus}
                  onChange={(e) => setStageStatus(e.target.value as CustomsStageStatus)}
                  className="w-full text-xs p-2 rounded border border-neutral-300 bg-white"
                >
                  <option value="in_progress">قيد استصدار إذن الإفراج</option>
                  <option value="completed">إفراج وتسليم نهائي مكتمل ✓</option>
                  <option value="needs_correction">ملاحظات إفراج</option>
                  <option value="blocked">حظر خروج</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending || !releasePermitNumber.trim()}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
              >
                توثيق الإفراج والتسليم النهائي
              </button>
            </form>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="bg-neutral-50 p-3.5 sm:p-4 border-t border-neutral-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-neutral-500">
            {stage.completedAt && (
              <span>اكتملت في: {formatDateAr(stage.completedAt)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold border border-neutral-300 rounded-xl hover:bg-neutral-100 text-neutral-700 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
