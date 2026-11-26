"use client";

/**
 * Admin Unified Stage Modal Component
 *
 * Implements the focused popup for any stage in the 7-stage OUT customs journey:
 * 1. Stage title, number, status, and concise purpose.
 * 2. Stage Timing (start time, target completion, actual completion, overdue status, waiting reason).
 * 3. System-defined checklist (required vs optional items, completed vs pending).
 * 4. Prerequisite enforcement for upcoming stages (preview only, no allowed actions).
 * 5. Read-only summary for past/completed stages with recorded results.
 * 6. Live permitted actions for the current stage only (auto-progresses on success).
 * 7. Physical specs accessible in Stage 01, and stage-specific audit history.
 */

import React, { useState, useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type {
  UnifiedJourneyStage,
  GoodsCategory,
  ShipmentCustomsJourney,
  CustomsDutiesSettlementData,
  ClearanceReleaseStageData,
  CargoXManualVerificationData,
  CargoXExemptionReason,
  CustomsSettlementStatus,
} from "@/types/journey";
import {
  GOODS_CATEGORIES,
  GOODS_CATEGORY_LABELS,
  GOODS_CATEGORY_DESCRIPTIONS,
  APPLICABLE_PROCEDURE_DEFINITIONS,
  CARGOX_EXEMPTION_REASON_LABELS,
  computeCustomsOutstandingBalance,
} from "@/types/journey";
import { getDefaultProceduresForCategory } from "@/lib/shipments/journey-builder";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  ShipmentInvoiceReview,
  ShipmentAcid,
} from "@/types";
import { matchFinalDocumentType, FINAL_SHIPMENT_DOCUMENT_TYPES } from "@/types";

// Server Actions
import {
  updateShipmentClassificationAction,
  updateCustomsStageAction,
  reopenCustomsStageAction,
} from "@/lib/shipments/journey-actions";
import {
  submitPriceEstimateAction,
  adminSetFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import {
  adminApproveInvoiceAction,
  adminRequestInvoiceRevisionAction,
} from "@/lib/shipments/invoice-review-actions";
import { adminIssueAcidAction } from "@/lib/shipments/acid-actions";
import {
  adminApproveShipmentDocumentAction,
  adminRequestShipmentDocumentRevisionAction,
} from "@/lib/shipments/document-actions";
import { markShipmentReadyForExternalStageAction } from "@/lib/shipments/readiness-actions";

interface UnifiedStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: Shipment;
  stage: UnifiedJourneyStage;
  pricing?: ShipmentPricing | null;
  pricingHistory?: ShipmentPricingHistoryItem[];
  invoiceReviews?: ShipmentInvoiceReview[];
  acid?: ShipmentAcid | null;
  documents?: DocumentItem[];
  journey?: ShipmentCustomsJourney | null;
  onPreviewDocument?: (doc: DocumentItem) => void;
}

export function UnifiedStageModal({
  isOpen,
  onClose,
  shipment,
  stage,
  pricing = null,
  pricingHistory = [],
  invoiceReviews = [],
  acid = null,
  documents = [],
  journey = null,
  onPreviewDocument,
}: UnifiedStageModalProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // ── Stage 01 States: Classification ──
  const [selectedCategory, setSelectedCategory] = useState<GoodsCategory>(
    shipment.goods_category || "other",
  );
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>(
    Array.isArray(shipment.applicable_procedures) && shipment.applicable_procedures.length > 0
      ? shipment.applicable_procedures
      : getDefaultProceduresForCategory(selectedCategory),
  );
  const [classificationNotes, setClassificationNotes] = useState(shipment.classification_notes || "");

  // ── Stage 02 States: Pricing ──
  const [minPrice, setMinPrice] = useState(pricing?.estimated_min_price?.toString() || "");
  const [maxPrice, setMaxPrice] = useState(pricing?.estimated_max_price?.toString() || "");
  const [finalPrice, setFinalPrice] = useState(pricing?.final_price?.toString() || "");

  // ── Stage 03 States: Invoice Review ──
  const [invoiceRevisionReason, setInvoiceRevisionReason] = useState("");
  const [showInvoiceRevisionForm, setShowInvoiceRevisionForm] = useState(false);

  // ── Stage 04 States: ACID ──
  const [acidNumber, setAcidNumber] = useState(acid?.acid_number || "");
  const [acidNotes, setAcidNotes] = useState(acid?.notes || "");

  // ── Stage 05 States: Documents Review ──
  const [docRevisionTargetId, setDocRevisionTargetId] = useState<string | null>(null);
  const [docRevisionReason, setDocRevisionReason] = useState("");

  const stage7Rec = journey?.stages?.find((s) => s.stage_key === "stage_7_data_entry");
  const stage9Rec = journey?.stages?.find((s) => s.stage_key === "stage_9_fees_payments");
  const stage10Rec = journey?.stages?.find((s) => s.stage_key === "stage_10_clearance_release");

  const stage7Cargox = (stage7Rec?.stage_data?.cargox as CargoXManualVerificationData | undefined) || null;
  const stage9Settlement = (stage9Rec?.stage_data as CustomsDutiesSettlementData | undefined) || {};
  const stage10Data = (stage10Rec?.stage_data as ClearanceReleaseStageData | undefined) || {};

  // ── Stage 06 States: Customs Procedures & CargoX ──
  const [ref46Advisory, setRef46Advisory] = useState(
    stage7Rec?.reference_number || (stage7Rec?.stage_data?.ref_46 as string) || "",
  );
  const [customsDeclarationNumber, setCustomsDeclarationNumber] = useState(
    (stage7Rec?.stage_data?.customs_declaration_number as string) || "",
  );
  const [procedureOutcome, setProcedureOutcome] = useState("");
  const [cargoxApplicable, setCargoxApplicable] = useState(stage7Cargox?.is_applicable !== false);
  const [cargoxExemptionReason, setCargoxExemptionReason] = useState<CargoXExemptionReason>(
    stage7Cargox?.exemption_reason || "air_freight_exemption",
  );
  const [cargoxSupplierUpload, setCargoxSupplierUpload] = useState(
    stage7Cargox?.supplier_upload_verified || false,
  );
  const [cargoxAcidMatched, setCargoxAcidMatched] = useState(stage7Cargox?.acid_matched || false);
  const [cargoxDataConsistency, setCargoxDataConsistency] = useState(
    stage7Cargox?.data_consistency_verified || false,
  );
  const [cargoxEnvelopeNumber, setCargoxEnvelopeNumber] = useState(
    stage7Cargox?.cargox_envelope_number || "",
  );

  // ── Stage 07 States: Clearance & Duties & Decoupled Events ──
  const [customsClaimNumber, setCustomsClaimNumber] = useState(
    stage9Settlement.customs_claim_number || stage9Rec?.reference_number || "",
  );
  const [dutiesAmount, setDutiesAmount] = useState(
    stage9Settlement.assessed_customs_amount?.toString() ||
      stage9Settlement.duties_amount?.toString() ||
      "",
  );
  const [amountPaidByOut, setAmountPaidByOut] = useState(
    stage9Settlement.amount_paid_by_out?.toString() || "",
  );
  const [amountCollectedFromCustomer, setAmountCollectedFromCustomer] = useState(
    stage9Settlement.amount_collected_from_customer?.toString() ||
      stage9Settlement.collected_from_customer?.toString() ||
      "",
  );
  const [settlementStatus, setSettlementStatus] = useState<string>(
    stage9Settlement.settlement_status || "paid_by_out_awaiting_customer",
  );
  const [customerDirectPaymentRef, setCustomerDirectPaymentRef] = useState(
    stage9Settlement.customer_direct_payment_reference ||
      (stage9Settlement.settlement_status === "customer_paid_direct" ? stage9Rec?.reference_number || "" : ""),
  );
  const [additionalDisbursementAuthorized, setAdditionalDisbursementAuthorized] = useState(
    stage9Settlement.additional_disbursement_authorized || false,
  );
  const [additionalDisbursementReason, setAdditionalDisbursementReason] = useState(
    stage9Settlement.additional_disbursement_reason || "",
  );

  // Decoupled Event States
  const [releasePermitNumber, setReleasePermitNumber] = useState(
    stage10Data.release_permit_number || stage10Rec?.reference_number || "",
  );
  const [transporterName, setTransporterName] = useState(stage10Data.transporter_name || "");
  const [gatePassNumber, setGatePassNumber] = useState(stage10Data.port_exit_gate_pass || "");
  const [recipientName, setRecipientName] = useState(stage10Data.recipient_name || "");
  const [deliveryNotes, setDeliveryNotes] = useState(stage10Data.delivery_notes || "");

  // ── Reopen Completed Stage State ──
  const [showReopenPrompt, setShowReopenPrompt] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  if (!isOpen) return null;

  const isCurrent = stage.isCurrent;
  const isCompleted = stage.isCompleted;
  const isUpcoming = stage.isUpcoming;

  // Find commercial/proforma invoice for stage 03
  const commercialInvoiceDoc = documents.find((d) =>
    ["commercial_invoice", "proforma_invoice", "invoice", "فاتورة مبدئية", "الفاتورة التجارية"].includes(d.document_type || ""),
  );

  // Group final core documents for stage 05
  const finalDocs = FINAL_SHIPMENT_DOCUMENT_TYPES.map((typeKey) => {
    const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === typeKey);
    return {
      typeKey,
      title:
        typeKey === "commercial_invoice"
          ? "الفاتورة التجارية النهائية"
          : typeKey === "packing_list"
          ? "بيان العبوة (Packing List)"
          : typeKey === "bill_of_lading"
          ? "بوليصة الشحن (Bill of Lading)"
          : "شهادة المنشأ (Certificate of Origin)",
      doc,
    };
  });

  const approvedDocsCount = finalDocs.filter((f) => f.doc?.status === "approved").length;

  // Filter audit history specific to this stage if available
  const stageKeyMap: Record<string, string[]> = {
    "01_intake": ["stage_1_intake"],
    "02_pricing": ["stage_2_pricing"],
    "03_invoice_review": ["stage_2_pricing", "invoice_review"],
    "04_acid": ["stage_3_nafeza_acid", "acid"],
    "05_documents": ["stage_5_scouting", "documents"],
    "06_customs_procedures": ["stage_4_type_procedures", "stage_6_inspection", "stage_7_data_entry"],
    "07_clearance_release": ["stage_9_fees_payments", "stage_10_clearance_release"],
  };

  const relevantStageKeys = stageKeyMap[stage.key] || [];
  const stageHistoryEntries = (journey?.history || []).filter((h) =>
    relevantStageKeys.some((k) => h.stage_key.includes(k) || h.action.includes(k)),
  );

  // ── Action Handlers ──

  // Stage 01: Save Classification
  const handleSaveClassification = () => {
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("goods_category", selectedCategory);
      selectedProcedures.forEach((p) => fd.append("applicable_procedures", p));
      fd.append("classification_notes", classificationNotes);

      const res = await updateShipmentClassificationAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل حفظ تصنيف الشحنة." });
      } else {
        setFeedback({ type: "success", message: "تم اعتماد تصنيف الشحنة وتفعيل مرحلة التسعير تلقائياً." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  // Stage 02: Save Pricing
  const handleSavePricing = (isFinal = false) => {
    startTransition(async () => {
      setFeedback(null);
      if (isFinal) {
        if (!finalPrice || isNaN(Number(finalPrice))) {
          setFeedback({ type: "error", message: "يرجى إدخال مبلغ السعر النهائي صحيحاً." });
          return;
        }
        const fd = new FormData();
        fd.set("shipment_id", shipment.id);
        fd.set("final_price", finalPrice);
        const res = await adminSetFinalPriceAction(fd);
        if (!res.success) {
          setFeedback({ type: "error", message: res.error || "فشل تسجيل السعر النهائي." });
        } else {
          setFeedback({ type: "success", message: "تم تحديد السعر النهائي وتقديمه للعميل بنجاح." });
          setTimeout(() => onClose(), 1000);
        }
      } else {
        if (!minPrice || !maxPrice) {
          setFeedback({ type: "error", message: "يرجى إدخال الحد الأدنى والأقصى لنطاق التسعير التقديري." });
          return;
        }
        const fd = new FormData();
        fd.set("shipment_id", shipment.id);
        fd.set("estimated_min_price", minPrice);
        fd.set("estimated_max_price", maxPrice);
        const res = await submitPriceEstimateAction(fd);
        if (!res.success) {
          setFeedback({ type: "error", message: res.error || "فشل تسجيل التسعير التقديري." });
        } else {
          setFeedback({ type: "success", message: "تم حفظ نطاق السعر التقديري بنجاح." });
          setTimeout(() => onClose(), 1000);
        }
      }
    });
  };

  // Stage 03: Approve Invoice
  const handleApproveInvoice = () => {
    if (!commercialInvoiceDoc) {
      setFeedback({ type: "error", message: "لا توجد فاتورة مبدئية مرفوعة للاعتماد." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.set("shipment_id", shipment.id);
      fd.set("document_id", commercialInvoiceDoc.id);
      const res = await adminApproveInvoiceAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل اعتماد الفاتورة المبدئية." });
      } else {
        setFeedback({ type: "success", message: "تم اعتماد الفاتورة المبدئية وتفعيل مرحلة استخراج ACID تلقائياً." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  // Stage 03: Request Invoice Revision
  const handleRequestInvoiceRevision = () => {
    if (!commercialInvoiceDoc) return;
    if (!invoiceRevisionReason.trim()) {
      setFeedback({ type: "error", message: "يرجى كتابة سبب طلب التعديل بوضوح للعميل." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.set("shipment_id", shipment.id);
      fd.set("document_id", commercialInvoiceDoc.id);
      fd.set("note", invoiceRevisionReason);
      const res = await adminRequestInvoiceRevisionAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل تسجيل طلب تعديل الفاتورة." });
      } else {
        setFeedback({ type: "success", message: "تم إرسال طلب التعديل إلى العميل بنجاح." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  // Stage 04: Issue ACID
  const handleSaveAcid = () => {
    if (!acidNumber.trim()) {
      setFeedback({ type: "error", message: "يرجى إدخال رقم ACID المعتمد من منصة نافذة (19 رقماً)." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.set("shipment_id", shipment.id);
      fd.set("acid_number", acidNumber.trim());
      if (acidNotes) fd.set("notes", acidNotes);
      const res = await adminIssueAcidAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل تسجيل رقم ACID." });
      } else {
        setFeedback({ type: "success", message: "تم توثيق رقم ACID وتفعيل مرحلة استلام المستندات النهائية بنجاح." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  // Stage 05: Approve Document
  const handleApproveDocument = (docId: string) => {
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.set("shipment_id", shipment.id);
      fd.set("document_id", docId);
      const res = await adminApproveShipmentDocumentAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل اعتماد المستند." });
      } else {
        setFeedback({ type: "success", message: "تم اعتماد المستند بنجاح." });
      }
    });
  };

  // Stage 05: Request Document Revision
  const handleRequestDocRevision = (docId: string) => {
    if (!docRevisionReason.trim()) {
      setFeedback({ type: "error", message: "يرجى توضيح سبب طلب تعديل المستند." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.set("shipment_id", shipment.id);
      fd.set("document_id", docId);
      fd.set("note", docRevisionReason);
      const res = await adminRequestShipmentDocumentRevisionAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل تسجيل ملاحظات التعديل." });
      } else {
        setFeedback({ type: "success", message: "تم إرسال طلب تعديل المستند بنجاح." });
        setDocRevisionTargetId(null);
        setDocRevisionReason("");
      }
    });
  };

  // Stage 05: Confirm Readiness for Customs Procedures
  const handleConfirmDocsReadiness = () => {
    startTransition(async () => {
      setFeedback(null);
      const res = await markShipmentReadyForExternalStageAction(shipment.id);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل تأكيد جاهزية المستندات." });
      } else {
        setFeedback({ type: "success", message: "اكتملت المستندات وبدأت إجراءات التخليص الجمركي بنجاح." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  // Stage 06: Complete Clearance Procedures & CargoX
  const handleCompleteProcedures = () => {
    startTransition(async () => {
      setFeedback(null);

      // Verify CargoX if applicable
      if (cargoxApplicable && (!cargoxSupplierUpload || !cargoxAcidMatched || !cargoxDataConsistency)) {
        setFeedback({
          type: "error",
          message: "يرجى استيفاء كافة بنود التحقق من CargoX (رفع المورد، مطابقة ACID، وتطابق البيانات)، أو تحديد غير منطبق مع اختيار سبب الإعفاء.",
        });
        return;
      }

      const cargoxData: CargoXManualVerificationData = {
        is_applicable: cargoxApplicable,
        exemption_reason: !cargoxApplicable ? (cargoxExemptionReason as CargoXExemptionReason) : null,
        supplier_upload_verified: cargoxApplicable ? cargoxSupplierUpload : false,
        acid_matched: cargoxApplicable ? cargoxAcidMatched : false,
        data_consistency_verified: cargoxApplicable ? cargoxDataConsistency : false,
        cargox_envelope_number: cargoxEnvelopeNumber || null,
        verified_at: new Date().toISOString(),
      };

      // 1. Update Stage 7 Data Entry with CargoX and Declaration 46
      const fd7 = new FormData();
      fd7.append("shipment_id", shipment.id);
      fd7.append("stage_key", "stage_7_data_entry");
      fd7.append("status", "completed");
      if (ref46Advisory) fd7.append("reference_number", ref46Advisory);
      fd7.append("outcome", "تم إدراج ومطابقة البيانات الجمركية وبنود التعريفة ومطابقة CargoX");
      fd7.append("cargox_data", JSON.stringify(cargoxData));

      const res7 = await updateCustomsStageAction(fd7, {
        cargox: cargoxData,
        customs_declaration_number: customsDeclarationNumber,
        ref_46: ref46Advisory,
      });

      if (!res7.success) {
        setFeedback({ type: "error", message: res7.error || "فشل حفظ بيانات الإدراج الجمركي ومطابقة CargoX." });
        return;
      }

      // 2. Update Stage 6 Inspection
      const fd6 = new FormData();
      fd6.append("shipment_id", shipment.id);
      fd6.append("stage_key", "stage_6_inspection");
      fd6.append("status", "completed");
      fd6.append("outcome", procedureOutcome || "تمت المعاينة ومطابقة المواصفات واعتماد الفحص");

      const res6 = await updateCustomsStageAction(fd6);
      if (!res6.success) {
        setFeedback({ type: "error", message: res6.error || "فشل حفظ اكتمال الفحص الجمركي." });
      } else {
        setFeedback({ type: "success", message: "تم اعتماد اكتمال الفحص والمعاينة وتفعيل مرحلة تسوية الرسوم تلقائياً." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  // Stage 07: Settle Duties & Save Financial Record (Stage 9)
  const handleSaveFinancialSettlement = () => {
    if (settlementStatus === "customer_paid_direct" && !customerDirectPaymentRef.trim()) {
      setFeedback({
        type: "error",
        message: "يرجى إدخال رقم إيصال أو مرجع سداد العميل المباشر لمصلحة الجمارك.",
      });
      return;
    }

    startTransition(async () => {
      setFeedback(null);
      const fd9 = new FormData();
      fd9.append("shipment_id", shipment.id);
      fd9.append("stage_key", "stage_9_fees_payments");

      const isCompleted =
        settlementStatus === "settled" ||
        (settlementStatus === "customer_paid_direct" && !!customerDirectPaymentRef.trim());
      fd9.append("status", isCompleted ? "completed" : "in_progress");

      if (customsClaimNumber) fd9.append("customs_claim_number", customsClaimNumber);
      if (dutiesAmount) fd9.append("assessed_customs_amount", dutiesAmount);
      if (amountPaidByOut) fd9.append("amount_paid_by_out", amountPaidByOut);
      if (amountCollectedFromCustomer) fd9.append("amount_collected_from_customer", amountCollectedFromCustomer);
      fd9.append("settlement_status", settlementStatus);

      if (customerDirectPaymentRef.trim()) {
        fd9.append("customer_direct_payment_reference", customerDirectPaymentRef.trim());
        fd9.append("reference_number", customerDirectPaymentRef.trim());
      } else if (customsClaimNumber) {
        fd9.append("reference_number", customsClaimNumber);
      }

      if (additionalDisbursementAuthorized) {
        fd9.append("additional_disbursement_authorized", "true");
        if (additionalDisbursementReason) {
          fd9.append("additional_disbursement_reason", additionalDisbursementReason);
        }
      }

      fd9.append("notes", `تم تحديث بيانات المطالبة الجمركية والرسوم (${settlementStatus})`);

      const res = await updateCustomsStageAction(fd9);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل حفظ بيانات التسوية المالية." });
      } else {
        setFeedback({ type: "success", message: "تم حفظ بيانات تسوية الرسوم الجمركية بنجاح." });
      }
    });
  };

  // Event 1: Record Customs Release Permit (Stage 10)
  const handleRecordReleasePermit = () => {
    if (!releasePermitNumber.trim()) {
      setFeedback({ type: "error", message: "يرجى إدخال رقم إذن الإفراج النهائي الرسمي." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", "stage_10_clearance_release");
      fd.append("status", "in_progress");
      fd.append("reference_number", releasePermitNumber.trim());
      fd.append("outcome", "تم صدور إذن الإفراج الجمركي الرسمي بنجاح");
      fd.append("release_permit_number", releasePermitNumber.trim());
      fd.append("customs_released_at", new Date().toISOString());

      const res = await updateCustomsStageAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل توثيق إذن الإفراج." });
      } else {
        setFeedback({ type: "success", message: "تم توثيق إذن الإفراج الجمركي وتحديث حالة الشحنة إلى مفرج عنها." });
      }
    });
  };

  // Event 2: Record Port Exit (Stage 10)
  const handleRecordPortExit = () => {
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", "stage_10_clearance_release");
      fd.append("status", "in_progress");
      fd.append("port_exit_at", new Date().toISOString());
      if (transporterName) fd.append("transporter_name", transporterName);
      if (gatePassNumber) fd.append("port_exit_gate_pass", gatePassNumber);

      const res = await updateCustomsStageAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل توثيق خروج الشحنة من الميناء." });
      } else {
        setFeedback({ type: "success", message: "تم توثيق خروج الشحنة من الميناء بنجاح." });
      }
    });
  };

  // Event 3: Record Customer Delivery (Stage 10 - Final completion)
  const handleRecordCustomerDelivery = () => {
    startTransition(async () => {
      setFeedback(null);
      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", "stage_10_clearance_release");
      fd.append("status", "completed");
      fd.append("reference_number", releasePermitNumber.trim() || "تم الإفراج والتسليم");
      fd.append("outcome", "تم تسليم الشحنة للعميل بنجاح واكتمال الرحلة");
      fd.append("delivered_at", new Date().toISOString());
      if (recipientName) fd.append("recipient_name", recipientName);
      if (deliveryNotes) fd.append("delivery_notes", deliveryNotes);

      const res = await updateCustomsStageAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل توثيق تسليم الشحنة للعميل." });
      } else {
        setFeedback({ type: "success", message: "تم توثيق تسليم الشحنة للعميل وختم الرحلة بنجاح!" });
        setTimeout(() => onClose(), 1200);
      }
    });
  };


  // Reopen Completed Stage
  const handleReopen = () => {
    if (!reopenReason.trim()) {
      setFeedback({ type: "error", message: "يرجى توضيح سبب إعادة فتح المرحلة للمراجعة والتصحيح." });
      return;
    }
    startTransition(async () => {
      setFeedback(null);
      const operationalStageKey =
        stage.key === "01_intake"
          ? "stage_1_intake"
          : stage.key === "02_pricing"
          ? "stage_2_pricing"
          : stage.key === "03_invoice_review"
          ? "stage_2_pricing"
          : stage.key === "04_acid"
          ? "stage_3_nafeza_acid"
          : stage.key === "05_documents"
          ? "stage_5_scouting"
          : stage.key === "06_customs_procedures"
          ? "stage_6_inspection"
          : "stage_10_clearance_release";

      const fd = new FormData();
      fd.append("shipment_id", shipment.id);
      fd.append("stage_key", operationalStageKey);
      fd.append("reopen_reason", reopenReason);

      const res = await reopenCustomsStageAction(fd);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "فشل إعادة فتح المرحلة." });
      } else {
        setFeedback({ type: "success", message: "تمت إعادة فتح المرحلة للمراجعة والتصحيح بنجاح." });
        setTimeout(() => onClose(), 1000);
      }
    });
  };

  return (
    <div
      className="unified-stage-modal-backdrop"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="unified-stage-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-950 text-white">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#F5C500] text-neutral-950 font-mono text-sm font-black flex items-center justify-center shadow-inner">
              {stage.number}
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-white">{stage.title}</h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isCurrent
                      ? "bg-[#F5C500] text-neutral-950"
                      : isCompleted
                      ? "bg-emerald-600 text-white"
                      : "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  {stage.statusLabel}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">{stage.shortDescription}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            title="إغلاق"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl text-xs sm:text-sm flex items-center gap-2.5 ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              <DynamicIcon
                name={feedback.type === "success" ? "CheckCircle" : "AlertTriangle"}
                className="w-4 h-4 shrink-0"
              />
              <span className="font-medium">{feedback.message}</span>
            </div>
          )}

          {/* ── Stage Timing Bar (Section 5) ── */}
          {(stage.activatedAt || stage.targetCompletionAt || stage.timeStatusLabel || stage.waitingReason) && (
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-neutral-400 block text-[11px] mb-0.5">تاريخ البدء</span>
                <span className="font-semibold text-neutral-800">
                  {stage.activatedAt ? formatDateAr(stage.activatedAt) : "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] mb-0.5">الوقت المستهدف</span>
                <span className="font-semibold text-neutral-800">
                  {stage.targetCompletionAt
                    ? formatDateAr(stage.targetCompletionAt)
                    : stage.targetDurationHours
                    ? `${stage.targetDurationHours} ساعة`
                    : "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] mb-0.5">تاريخ الإنجاز</span>
                <span className="font-semibold text-neutral-800">
                  {stage.completedAt ? formatDateAr(stage.completedAt) : isCompleted ? "مكتمل" : "قيد الإجراء"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px] mb-0.5">مؤشر الوقت</span>
                <span
                  className={`font-bold inline-block px-2 py-0.5 rounded text-[11px] ${
                    stage.isOverdue
                      ? "bg-rose-100 text-rose-800"
                      : isCompleted
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-neutral-200 text-neutral-800"
                  }`}
                >
                  {stage.timeStatusLabel || (isCompleted ? "منجز وموثق" : "ضمن المدة")}
                </span>
              </div>
              {stage.waitingReason && (
                <div className="col-span-2 sm:col-span-4 pt-1 border-t border-neutral-200/60 text-neutral-600 text-[11px]">
                  <strong className="text-neutral-800">سبب الانتظار:</strong> {stage.waitingReason}
                </div>
              )}
            </div>
          )}

          {/* ── System-Defined Checklist (Section 3) ── */}
          {stage.checklist && stage.checklist.length > 0 && (
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/80 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center justify-between">
                <span>خطوات التدقيق الإلزامية للمرحلة</span>
                <span className="font-mono text-[11px]">
                  {stage.checklist.filter((c) => c.isCompleted).length} / {stage.checklist.length}
                </span>
              </h4>
              <div className="space-y-1.5">
                {stage.checklist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white border border-neutral-100"
                  >
                    <div className="flex items-center gap-2">
                      <DynamicIcon
                        name={item.isCompleted ? "CheckCircle" : "Clock"}
                        className={`w-3.5 h-3.5 ${item.isCompleted ? "text-emerald-600" : "text-neutral-400"}`}
                      />
                      <span className={item.isCompleted ? "text-neutral-800 font-medium" : "text-neutral-500"}>
                        {item.label}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        item.isCompleted
                          ? "bg-emerald-100 text-emerald-800"
                          : item.isRequired
                          ? "bg-amber-100 text-amber-800"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {item.isCompleted ? "مكتمل" : item.isRequired ? "إلزامي" : "اختياري"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Upcoming Stage: Prerequisite Warning (Section 2.C, 2.D) ── */}
          {isUpcoming && (
            <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-neutral-900">
                <DynamicIcon name="Lock" className="w-4 h-4 text-neutral-500" />
                المرحلة لم تبدأ بعد — بانتظار استيفاء الشروط المسبقة
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                {stage.prerequisiteText || "تتطلب هذه المرحلة استكمال واعتماد المرحلة السابقة أولاً."}
              </p>
              <p className="text-[11px] text-neutral-400 pt-1">
                لا تتوفر إجراءات إدارية هنا حالياً. بمجرد اكتمال المرحلة السابقة، ستفتح هذه المرحلة تلقائياً.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 01: Intake & Classification
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "01_intake" && (
            <div className="space-y-4">
              {/* Shipment Technical Specifications Overview */}
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-2">
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  بيانات ومواصفات الشحنة المسجلة
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[11px]">بلد المنشأ</span>
                    <span className="font-semibold text-neutral-800">{shipment.country_of_origin || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">ميناء الوصول</span>
                    <span className="font-semibold text-neutral-800">{shipment.port_of_arrival || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">عدد الطرود</span>
                    <span className="font-semibold text-neutral-800">{shipment.packages_count || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">الوزن الإجمالي</span>
                    <span className="font-semibold text-neutral-800">
                      {shipment.gross_weight ? `${shipment.gross_weight} كجم` : "—"}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <span className="text-neutral-400 block text-[11px]">وصف البضاعة</span>
                    <span className="font-semibold text-neutral-800">{shipment.goods_description || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Classification Form (Disabled if Completed) */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-neutral-900 block">
                  تصنيف نوع البضاعة المعتمد:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GOODS_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                        selectedCategory === cat
                          ? "bg-[#FFF9E6] border-[#F5C500] shadow-sm"
                          : "bg-white border-neutral-200 hover:border-neutral-300"
                      } ${!isCurrent ? "pointer-events-none opacity-80" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="goods_category"
                          value={cat}
                          checked={selectedCategory === cat}
                          onChange={() => {
                            setSelectedCategory(cat);
                            setSelectedProcedures(getDefaultProceduresForCategory(cat));
                          }}
                          disabled={!isCurrent}
                          className="accent-[#F5C500]"
                        />
                        <span className="font-bold text-xs text-neutral-900">
                          {GOODS_CATEGORY_LABELS[cat]}
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-500 mr-5">
                        {GOODS_CATEGORY_DESCRIPTIONS[cat]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Procedure Branches */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-900 block">
                  المسارات الإجرائية الجمركية المقررة:
                </label>
                <div className="space-y-1.5">
                  {APPLICABLE_PROCEDURE_DEFINITIONS.map((proc) => {
                    const isChecked = selectedProcedures.includes(proc.id);
                    return (
                      <label
                        key={proc.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer ${
                          isChecked ? "bg-neutral-50 border-neutral-300" : "bg-white border-neutral-100"
                        } ${!isCurrent ? "pointer-events-none opacity-80" : ""}`}
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
                          disabled={!isCurrent}
                          className="mt-0.5 accent-[#F5C500]"
                        />
                        <div>
                          <span className="font-bold text-neutral-900 block">{proc.name}</span>
                          <span className="text-[11px] text-neutral-500">{proc.purpose}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">
                  ملاحظات التصنيف الإجرائي:
                </label>
                <textarea
                  value={classificationNotes}
                  onChange={(e) => setClassificationNotes(e.target.value)}
                  disabled={!isCurrent}
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] disabled:bg-neutral-50"
                  placeholder="أي اشتراطات أو توجيهات خاصة بهذه الشحنة..."
                />
              </div>

              {/* Action Button for Current Stage */}
              {isCurrent && (
                <button
                  type="button"
                  onClick={handleSaveClassification}
                  disabled={isPending}
                  className="w-full py-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                >
                  <DynamicIcon name="Check" className="w-4 h-4" />
                  {isPending ? "جاري الحفظ..." : "اعتماد تصنيف الشحنة وتفعيل مرحلة التسعير"}
                </button>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 02: Pricing & Customer Approval
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "02_pricing" && (
            <div className="space-y-4">
              {/* Completed Summary */}
              {isCompleted ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600" />
                    تم اعتماد التسعير وموافقة العميل بنجاح
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 flex items-center justify-between">
                    <span>السعر النهائي المعتمد:</span>
                    <strong className="text-base font-black text-neutral-900">
                      {pricing?.final_price ? `${pricing.final_price.toLocaleString("ar-EG")} ج.م` : "—"}
                    </strong>
                  </div>
                  {pricing?.customer_approved_at && (
                    <span className="text-[11px] text-emerald-700 block">
                      تاريخ موافقة العميل: {formatDateAr(pricing.customer_approved_at)}
                    </span>
                  )}
                </div>
              ) : isCurrent ? (
                <div className="space-y-4">
                  {/* Status Banner */}
                  {pricing?.status === "proposed" ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
                      <DynamicIcon name="Clock" className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>تم إرسال عرض السعر للعميل — بانتظار موافقة العميل للانتقال للمرحلة التالية.</span>
                    </div>
                  ) : pricing?.status === "negotiation_requested" ? (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1">
                      <div className="flex items-center gap-2 font-bold">
                        <DynamicIcon name="MessageSquare" className="w-4 h-4 text-rose-600" />
                        طلب العميل التفاوض على السعر:
                      </div>
                      <p className="text-[11px] bg-white p-2 rounded border border-rose-100">
                        {pricingHistory[0]?.notes || "طلب العميل مراجعة عرض السعر."}
                      </p>
                    </div>
                  ) : null}

                  {/* Pricing Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-neutral-700 block mb-1">
                        الحد الأدنى للتقدير (ج.م):
                      </label>
                      <input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                        placeholder="مثال: 5000"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-700 block mb-1">
                        الحد الأقصى للتقدير (ج.م):
                      </label>
                      <input
                        type="number"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                        placeholder="مثال: 8000"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-neutral-100">
                    <label className="text-xs font-bold text-neutral-900 block mb-1">
                      أو تحديد السعر النهائي مباشرة (ج.م):
                    </label>
                    <input
                      type="number"
                      value={finalPrice}
                      onChange={(e) => setFinalPrice(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                      placeholder="مثال: 6500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSavePricing(false)}
                      disabled={isPending || !minPrice || !maxPrice}
                      className="py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {isPending ? "جاري الحفظ..." : "حفظ النطاق التقديري"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePricing(true)}
                      disabled={isPending || !finalPrice}
                      className="py-2.5 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {isPending ? "جاري الحفظ..." : "اعتماد وتقديم السعر النهائي"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 03: Preliminary Invoice Review
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "03_invoice_review" && (
            <div className="space-y-4">
              {commercialInvoiceDoc ? (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <DynamicIcon name="FileText" className="w-5 h-5 text-neutral-500" />
                    <div>
                      <h5 className="font-bold text-xs text-neutral-900">{commercialInvoiceDoc.file_name}</h5>
                      <span className="text-[11px] text-neutral-500">
                        الحالة: {commercialInvoiceDoc.status === "approved" ? "معتمدة ✓" : "قيد المراجعة"}
                      </span>
                    </div>
                  </div>
                  {onPreviewDocument && (
                    <button
                      type="button"
                      onClick={() => onPreviewDocument(commercialInvoiceDoc)}
                      className="text-xs font-bold text-neutral-900 hover:underline flex items-center gap-1"
                    >
                      <DynamicIcon name="Eye" className="w-3.5 h-3.5" />
                      معاينة الفاتورة
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  لم يتم رفع فاتورة مبدئية بعد للشحنة.
                </div>
              )}

              {invoiceReviews && invoiceReviews.length > 0 && invoiceReviews[0].note && (
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600">
                  <strong className="text-neutral-800">آخر ملاحظات مراجعة مسجلة:</strong> {invoiceReviews[0].note}
                </div>
              )}

              {/* Completed State */}
              {isCompleted ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                  <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600" />
                  <span>تم اعتماد الفاتورة المبدئية بنجاح ومطابقتها للمتطلبات الجمركية.</span>
                </div>
              ) : isCurrent ? (
                <div className="space-y-3 pt-2">
                  {!showInvoiceRevisionForm ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={handleApproveInvoice}
                        disabled={isPending || !commercialInvoiceDoc}
                        className="py-3 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <DynamicIcon name="Check" className="w-4 h-4" />
                        {isPending ? "جاري الاعتماد..." : "اعتماد الفاتورة وتفعيل استخراج ACID"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowInvoiceRevisionForm(true)}
                        disabled={isPending || !commercialInvoiceDoc}
                        className="py-3 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <DynamicIcon name="AlertTriangle" className="w-4 h-4 text-rose-600" />
                        طلب تعديل من العميل
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 space-y-3">
                      <label className="text-xs font-bold text-rose-900 block">
                        ملاحظات التعديل المطلوبة بالفاتورة:
                      </label>
                      <textarea
                        value={invoiceRevisionReason}
                        onChange={(e) => setInvoiceRevisionReason(e.target.value)}
                        rows={2}
                        className="w-full text-xs p-2.5 rounded-xl border border-rose-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-400"
                        placeholder="وضح للعميل البنود التي تحتاج لتعديل..."
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRequestInvoiceRevision}
                          disabled={isPending || !invoiceRevisionReason.trim()}
                          className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors disabled:opacity-50"
                        >
                          {isPending ? "جاري الإرسال..." : "إرسال طلب التعديل"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowInvoiceRevisionForm(false)}
                          className="py-2 px-4 rounded-lg bg-white border border-neutral-200 text-neutral-700 font-bold text-xs"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 04: Nafeza ACID Issuance
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "04_acid" && (
            <div className="space-y-4">
              {isCompleted || (acid?.acid_number && acid.status === "issued") ? (
                <div className="p-5 rounded-2xl bg-neutral-900 text-white space-y-3 border border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5C500] uppercase tracking-wider">
                      رقم ACID المعتمد من منصة نافذة
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      معتمد وصادر
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-black text-center py-2 bg-neutral-800 rounded-xl text-[#F5C500] tracking-wider">
                    {acid?.acid_number || "—"}
                  </div>
                  {acid?.issued_at && (
                    <span className="text-[11px] text-neutral-400 block text-center">
                      تاريخ الإصدار: {formatDateAr(acid.issued_at)}
                    </span>
                  )}
                </div>
              ) : isCurrent ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-neutral-900 block mb-1">
                      رقم ACID الرسمي (19 رقماً):
                    </label>
                    <input
                      type="text"
                      value={acidNumber}
                      onChange={(e) => setAcidNumber(e.target.value)}
                      dir="ltr"
                      maxLength={19}
                      className="w-full text-base font-mono font-bold p-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] text-center"
                      placeholder="مثال: 1234567890123456789"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-neutral-700 block mb-1">
                      ملاحظات القيد الجمركي المبدئي:
                    </label>
                    <input
                      type="text"
                      value={acidNotes}
                      onChange={(e) => setAcidNotes(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                      placeholder="أي ملاحظات حول تاريخ الانتهاء أو الربط..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAcid}
                    disabled={isPending || !acidNumber.trim()}
                    className="w-full py-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                  >
                    <DynamicIcon name="Check" className="w-4 h-4" />
                    {isPending ? "جاري التوثيق..." : "توثيق واعتماد رقم ACID وتفعيل مرحلة المستندات"}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 05: Shipment Final Documents Review
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "05_documents" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-600 border-b border-neutral-100 pb-2">
                <span>المستندات الأربعة النهائية المطلوبة:</span>
                <span className="font-mono font-bold text-neutral-900">{approvedDocsCount} / 4 معتمدة</span>
              </div>

              <div className="space-y-2.5">
                {finalDocs.map(({ typeKey, title, doc }) => {
                  const isDocApproved = doc?.status === "approved";
                  const isRevisionReq = doc?.status === "revision_required";

                  return (
                    <div
                      key={typeKey}
                      className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name={isDocApproved ? "CheckCircle" : "FileText"}
                            className={`w-4 h-4 ${isDocApproved ? "text-emerald-600" : "text-neutral-500"}`}
                          />
                          <span className="font-bold text-xs text-neutral-900">{title}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isDocApproved
                              ? "bg-emerald-100 text-emerald-800"
                              : isRevisionReq
                              ? "bg-rose-100 text-rose-800"
                              : doc
                              ? "bg-blue-100 text-blue-800"
                              : "bg-neutral-200 text-neutral-700"
                          }`}
                        >
                          {isDocApproved
                            ? "معتمد"
                            : isRevisionReq
                            ? "مطلوب تعديل"
                            : doc
                            ? "قيد التدقيق"
                            : "غير مرفوع"}
                        </span>
                      </div>

                      {doc && (
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="text-neutral-500 truncate max-w-[200px] font-mono">{doc.file_name}</span>
                          {onPreviewDocument && (
                            <button
                              type="button"
                              onClick={() => onPreviewDocument(doc)}
                              className="font-bold text-neutral-900 hover:underline flex items-center gap-1"
                            >
                              <DynamicIcon name="Eye" className="w-3 h-3" />
                              معاينة
                            </button>
                          )}
                        </div>
                      )}

                      {/* Controls for current stage */}
                      {isCurrent && doc && !isDocApproved && (
                        <div className="pt-2 border-t border-neutral-200/60 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproveDocument(doc.id)}
                            disabled={isPending}
                            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors disabled:opacity-50"
                          >
                            اعتماد المستند
                          </button>
                          <button
                            type="button"
                            onClick={() => setDocRevisionTargetId(doc.id)}
                            disabled={isPending}
                            className="py-1.5 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[11px] transition-colors"
                          >
                            طلب تعديل
                          </button>
                        </div>
                      )}

                      {/* Revision Input inline */}
                      {docRevisionTargetId === doc?.id && (
                        <div className="pt-2 space-y-2">
                          <input
                            type="text"
                            value={docRevisionReason}
                            onChange={(e) => setDocRevisionReason(e.target.value)}
                            placeholder="سبب طلب التعديل..."
                            className="w-full text-xs p-2 rounded-lg border border-rose-200 focus:outline-none focus:ring-1 focus:ring-rose-400"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRequestDocRevision(doc.id)}
                              disabled={isPending || !docRevisionReason.trim()}
                              className="py-1 px-3 rounded bg-rose-600 text-white font-bold text-xs"
                            >
                              تأكيد الطلب
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocRevisionTargetId(null)}
                              className="py-1 px-3 rounded bg-neutral-200 text-neutral-700 font-bold text-xs"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Readiness Confirmation Button */}
              {isCurrent && approvedDocsCount >= 4 && (
                <button
                  type="button"
                  onClick={handleConfirmDocsReadiness}
                  disabled={isPending}
                  className="w-full py-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                >
                  <DynamicIcon name="Check" className="w-4 h-4" />
                  {isPending ? "جاري التأكيد..." : "تأكيد جاهزية المستندات وبدء إجراءات التخليص الجمركي"}
                </button>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 06: Customs Clearance by Shipment Type
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "06_customs_procedures" && (
            <div className="space-y-4">
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-1">
                <span className="text-neutral-500 block">المسار الجمركي المعتمد:</span>
                <span className="font-bold text-neutral-900 text-sm">
                  {shipment.goods_category ? GOODS_CATEGORY_LABELS[shipment.goods_category] : "بضائع عامة"}
                </span>
              </div>

              {/* STAGE 06 CONTENT */}
              {isCompleted ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold">
                      <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600" />
                      تمت المعاينة والفحص الجمركي بنجاح
                    </div>
                    <p className="text-[11px] text-emerald-800">{stage.metaInfo || "تم اعتماد الفحص ومطابقة المواصفات."}</p>
                    {customsDeclarationNumber && (
                      <div className="text-[11px] text-emerald-950 font-mono">
                        رقم البيان الجمركي: <strong>{customsDeclarationNumber}</strong>
                      </div>
                    )}
                    {ref46Advisory && (
                      <div className="text-[11px] text-neutral-600 font-mono">
                        رقم 46 (استرشادي): {ref46Advisory}
                      </div>
                    )}
                  </div>

                  {/* CargoX Verification Summary */}
                  <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                        <DynamicIcon name="ShieldCheck" className="w-4 h-4 text-neutral-600" />
                        حالة التحقق من منصة CargoX
                      </span>
                      {stage7Cargox?.is_applicable === false ? (
                        <span className="text-[10px] bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded-full font-bold">
                          غير منطبق (معفى)
                        </span>
                      ) : stage7Cargox?.data_consistency_verified ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                          تم التحقق والمطابقة بنجاح
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                          قيد التحقق اليدوي
                        </span>
                      )}
                    </div>

                    {stage7Cargox?.is_applicable === false ? (
                      <p className="text-[11px] text-neutral-600">
                        سبب الإعفاء الموثق: {CARGOX_EXEMPTION_REASON_LABELS[stage7Cargox.exemption_reason || "air_freight_exemption"]}
                      </p>
                    ) : (
                      <div className="text-[11px] text-neutral-600 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <DynamicIcon name="Check" className="w-3.5 h-3.5 text-emerald-600" />
                          <span>رفع مستندات المورد: {stage7Cargox?.supplier_upload_verified ? "تم التحقق" : "لم يتم"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DynamicIcon name="Check" className="w-3.5 h-3.5 text-emerald-600" />
                          <span>مطابقة رقم ACID: {stage7Cargox?.acid_matched ? "متطابق" : "لم يتم"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DynamicIcon name="Check" className="w-3.5 h-3.5 text-emerald-600" />
                          <span>مطابقة بيانات الشحنة: {stage7Cargox?.data_consistency_verified ? "متطابقة بالكامل" : "لم يتم"}</span>
                        </div>
                        {stage7Cargox?.cargox_envelope_number && (
                          <div className="font-mono text-neutral-700 pt-1">
                            رقم المظروف: {stage7Cargox.cargox_envelope_number}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : isCurrent ? (
                <div className="space-y-4">
                  {/* CargoX Manual Verification Card */}
                  <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                        <DynamicIcon name="ShieldCheck" className="w-4 h-4 text-[#F5C500]" />
                        التحقق اليدوي من نظام CargoX (منصة نافذة)
                      </span>
                      <span className="text-[10px] text-neutral-500 font-medium">متابعة يدوية تشغيلية</span>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-neutral-700 block mb-1.5">
                        هل نظام CargoX منطبق على هذه الشحنة؟
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCargoxApplicable(true)}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                            cargoxApplicable
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                          }`}
                        >
                          منطبق (شحنات بحرية)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCargoxApplicable(false)}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                            !cargoxApplicable
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                          }`}
                        >
                          غير منطبق / معفى
                        </button>
                      </div>
                    </div>

                    {cargoxApplicable ? (
                      <div className="space-y-2.5 pt-2 border-t border-neutral-200">
                        <span className="text-[11px] font-bold text-neutral-800 block">
                          بنود التحقق اليدوي الإلزامية قبل اعتماد المرحلة:
                        </span>
                        
                        <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-neutral-200 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={cargoxSupplierUpload}
                            onChange={(e) => setCargoxSupplierUpload(e.target.checked)}
                            className="rounded border-neutral-300 text-neutral-900 focus:ring-[#F5C500]"
                          />
                          <span className="text-neutral-800 font-medium">1. تم رفع مستندات المورد على منصة CargoX</span>
                        </label>

                        <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-neutral-200 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={cargoxAcidMatched}
                            onChange={(e) => setCargoxAcidMatched(e.target.checked)}
                            className="rounded border-neutral-300 text-neutral-900 focus:ring-[#F5C500]"
                          />
                          <span className="text-neutral-800 font-medium">2. تم مطابقة رقم ACID وبيانات الشحنة مع مظروف CargoX</span>
                        </label>

                        <label className="flex items-center gap-2 p-2 rounded-lg bg-white border border-neutral-200 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={cargoxDataConsistency}
                            onChange={(e) => setCargoxDataConsistency(e.target.checked)}
                            className="rounded border-neutral-300 text-neutral-900 focus:ring-[#F5C500]"
                          />
                          <span className="text-neutral-800 font-medium">3. تم التحقق من تطابق كافة البيانات والقيم المرفوعة</span>
                        </label>

                        <div>
                          <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                            رقم المظروف / المعاملة على CargoX (اختياري / استرشادي):
                          </label>
                          <input
                            type="text"
                            value={cargoxEnvelopeNumber}
                            onChange={(e) => setCargoxEnvelopeNumber(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white font-mono"
                            placeholder="مثال: ENV-2026-XXXXX"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-neutral-200">
                        <label className="text-[11px] font-bold text-neutral-800 block mb-1">
                          سبب الإعفاء الموثق للتدقيق (إلزامي):
                        </label>
                        <select
                          value={cargoxExemptionReason}
                          onChange={(e) => setCargoxExemptionReason(e.target.value as CargoXExemptionReason)}
                          className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white"
                        >
                          {Object.entries(CARGOX_EXEMPTION_REASON_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-neutral-400 mt-1 block">
                          سيتم تسجيل هذا السبب في سجل التدقيق لتوثيق مسار عدم انطباق CargoX.
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-900 block mb-1">
                      رقم البيان الجمركي (إن وجد):
                    </label>
                    <input
                      type="text"
                      value={customsDeclarationNumber}
                      onChange={(e) => setCustomsDeclarationNumber(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                      placeholder="رقم القيد أو البيان الجمركي..."
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-700 block mb-1">
                      رقم 46 (اختياري — غير إلزامي):
                    </label>
                    <input
                      type="text"
                      value={ref46Advisory}
                      onChange={(e) => setRef46Advisory(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                      placeholder="رقم 46 الاسترشادي إن وجد..."
                    />
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      هذا الحقل استرشادي غير إلزامي ولا يعطل سير المسار الجمركي.
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-700 block mb-1">
                      نتيجة وملاحظات الفحص والمعاينة:
                    </label>
                    <textarea
                      value={procedureOutcome}
                      onChange={(e) => setProcedureOutcome(e.target.value)}
                      rows={2}
                      className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                      placeholder="تمت المعاينة ومطابقة المواصفات واعتماد الفحص..."
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCompleteProcedures}
                    disabled={isPending}
                    className="w-full py-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                  >
                    <DynamicIcon name="Check" className="w-4 h-4" />
                    {isPending ? "جاري الاعتماد..." : "اعتماد اكتمال الفحص وتفعيل مرحلة الإفراج والرسوم"}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 07: Clearance Completion & Customs Release
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "07_clearance_release" && (
            <div className="space-y-4">
              {/* Section 1: Customs Duties Settlement (Stage 9) */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <DynamicIcon name="Receipt" className="w-4 h-4 text-[#F5C500]" />
                    تسوية الرسوم الجمركية والضرائب (المرحلة 9)
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    settlementStatus === "settled" || settlementStatus === "customer_paid_direct"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}>
                    {settlementStatus === "settled"
                      ? "تمت التسوية بالكامل"
                      : settlementStatus === "customer_paid_direct"
                      ? "مسددة من العميل مباشرة"
                      : "قيد التسوية"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                      رقم مطالبة الرسوم الجمركية:
                    </label>
                    <input
                      type="text"
                      value={customsClaimNumber}
                      onChange={(e) => setCustomsClaimNumber(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white font-mono"
                      placeholder="رقم المطالبة الرسمية..."
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                      إجمالي الرسوم التقديرية (ج.م):
                    </label>
                    <input
                      type="number"
                      value={dutiesAmount}
                      onChange={(e) => setDutiesAmount(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white font-mono"
                      placeholder="المبلغ المقدر..."
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                      الرسوم المدفوعة فعلياً من OUT (ج.م):
                    </label>
                    <input
                      type="number"
                      value={amountPaidByOut}
                      onChange={(e) => setAmountPaidByOut(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white font-mono"
                      placeholder="المبلغ المدفوع من OUT..."
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                      الرسوم المحصلة من العميل (ج.م):
                    </label>
                    <input
                      type="number"
                      value={amountCollectedFromCustomer}
                      onChange={(e) => setAmountCollectedFromCustomer(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white font-mono"
                      placeholder="المبلغ المحصل..."
                    />
                  </div>

                  {/* Customer Direct Payment Receipt Block */}
                  {settlementStatus === "customer_paid_direct" && (
                    <div className="col-span-1 sm:col-span-2 p-3 bg-amber-50/80 rounded-xl border border-amber-200 space-y-1.5">
                      <label className="text-[11px] font-bold text-amber-900 block">
                        رقم إيصال / مرجع سداد العميل المباشر للجمارك (إلزامي للتحقق والاعتماد)*:
                      </label>
                      <input
                        type="text"
                        value={customerDirectPaymentRef}
                        onChange={(e) => setCustomerDirectPaymentRef(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-amber-300 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white font-mono"
                        placeholder="مثال: رقم إشعار السداد الجمركي / إيصال البنك..."
                        required
                      />
                      <p className="text-[10px] text-amber-700">
                        * يشترط إدخال وتوثيق رقم إيصال سداد العميل المعتمد قبل حفظ واعتماد اكتمال مرحلة الرسوم وتفعيل مرحلة الإفراج الجمركي.
                      </p>
                    </div>
                  )}

                  {/* Additional Disbursement Authorization Block */}
                  {parseFloat(amountPaidByOut) > parseFloat(dutiesAmount) && parseFloat(dutiesAmount) > 0 && (
                    <div className="col-span-1 sm:col-span-2 p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="chk_additional_disbursement"
                          checked={additionalDisbursementAuthorized}
                          onChange={(e) => setAdditionalDisbursementAuthorized(e.target.checked)}
                          className="rounded border-neutral-300 text-[#F5C500] focus:ring-[#F5C500]"
                        />
                        <label htmlFor="chk_additional_disbursement" className="text-xs font-bold text-neutral-800 cursor-pointer">
                          اعتماد تحميل الفارق الإضافي ({(parseFloat(amountPaidByOut) - parseFloat(dutiesAmount)).toLocaleString("ar-EG")} ج.م) كدين على العميل بمستند معتمد
                        </label>
                      </div>
                      {additionalDisbursementAuthorized ? (
                        <div>
                          <label className="text-[11px] text-neutral-600 block mb-1">
                            سبب ومستند المصروف الإضافي المعتمد (أرضيات / غرامات تأخير / حراسة موانئ)*:
                          </label>
                          <input
                            type="text"
                            value={additionalDisbursementReason}
                            onChange={(e) => setAdditionalDisbursementReason(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white"
                            placeholder="توثيق سبب الزيادة ورقم الإيصال أو أمر التعديل..."
                          />
                        </div>
                      ) : (
                        <p className="text-[10px] text-neutral-500">
                          ملاحظة: وفق القواعد المالية المعتمدة، لا يُحمّل العميل بأي فروقات إضافية تدفعها OUT دون تفويض ومستند معتمد؛ وتُعامل الزيادة كتحمّل داخلي لا يظهر كمديونية على العميل.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Live Balance Summary */}
                {(() => {
                  const balance = computeCustomsOutstandingBalance({
                    amount_paid_by_out: parseFloat(amountPaidByOut) || null,
                    assessed_customs_amount: parseFloat(dutiesAmount) || null,
                    amount_collected_from_customer: parseFloat(amountCollectedFromCustomer) || null,
                    settlement_status: settlementStatus as CustomsSettlementStatus,
                    additional_disbursement_authorized: additionalDisbursementAuthorized,
                  });
                  return (
                    <div className="p-2.5 rounded-lg bg-white border border-neutral-200 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        {balance < 0 ? "رصيد دائن للعميل (فائض تحصيل مستحق له):" : "الرصيد المتبقي على العميل لصالح OUT:"}
                      </span>
                      <span className={`font-mono font-bold ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                        {Math.abs(balance).toLocaleString("ar-EG")} ج.م {balance < 0 ? " (رصيد دائن)" : ""}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <div className="flex-1 w-full">
                    <select
                      value={settlementStatus}
                      onChange={(e) => setSettlementStatus(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500] bg-white"
                    >
                      <option value="paid_by_out_awaiting_customer">سددت من OUT وبانتظار تحصيلها من العميل</option>
                      <option value="settled">تمت التسوية والسداد بالكامل</option>
                      <option value="customer_paid_direct">سددها العميل مباشرة لمصلحة الجمارك</option>
                      <option value="pending_payment">قيد السداد</option>
                      <option value="partial_paid">مسدد جزئياً</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveFinancialSettlement}
                    disabled={isPending}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-neutral-900 text-white font-bold text-xs hover:bg-neutral-800 transition-colors disabled:opacity-50 shrink-0"
                  >
                    حفظ التسوية المالية
                  </button>
                </div>
              </div>

              {/* Section 2: Decoupled Milestones (Stage 10) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <DynamicIcon name="Truck" className="w-4 h-4 text-[#F5C500]" />
                    محطات الإفراج الجمركي والتسليم المستقلة (المرحلة 10)
                  </span>
                </div>

                {/* Milestone 1: Customs Release Permit */}
                <div className="p-3.5 rounded-xl border border-neutral-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                      <DynamicIcon name="FileCheck" className="w-3.5 h-3.5 text-neutral-600" />
                      1. إذن الإفراج الجمركي النهائي
                    </span>
                    {stage10Data.customs_released_at ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        مفرج عنها ({formatDateAr(stage10Data.customs_released_at)})
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        بانتظار الإفراج
                      </span>
                    )}
                  </div>

                  {stage10Data.customs_released_at ? (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-900 font-mono">
                      رقم إذن الإفراج: <strong>{stage10Data.release_permit_number || releasePermitNumber}</strong>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <input
                        type="text"
                        value={releasePermitNumber}
                        onChange={(e) => setReleasePermitNumber(e.target.value)}
                        className="w-full text-xs font-mono p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                        placeholder="أدخل رقم إذن الإفراج النهائي الرسمي..."
                      />
                      <button
                        type="button"
                        onClick={handleRecordReleasePermit}
                        disabled={isPending || !releasePermitNumber.trim()}
                        className="w-full py-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-[#F5C500] font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                        {isPending ? "جاري التوثيق..." : "توثيق إذن الإفراج (تحديث الحالة إلى مفرج عنها)"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Milestone 2: Port Exit */}
                <div className="p-3.5 rounded-xl border border-neutral-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                      <DynamicIcon name="Truck" className="w-3.5 h-3.5 text-neutral-600" />
                      2. خروج الشحنة من الميناء الجمركي
                    </span>
                    {stage10Data.port_exit_at ? (
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                        خرجت من الميناء ({formatDateAr(stage10Data.port_exit_at)})
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-bold">
                        بانتظار خروج الشحنة
                      </span>
                    )}
                  </div>

                  {stage10Data.port_exit_at ? (
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-900 space-y-1">
                      <div>الناقل: <strong>{stage10Data.transporter_name || "—"}</strong></div>
                      {stage10Data.port_exit_gate_pass && (
                        <div>تصريح البوابة: <strong className="font-mono">{stage10Data.port_exit_gate_pass}</strong></div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={transporterName}
                          onChange={(e) => setTransporterName(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                          placeholder="اسم الناقل / السائق..."
                        />
                        <input
                          type="text"
                          value={gatePassNumber}
                          onChange={(e) => setGatePassNumber(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                          placeholder="رقم تصريح البوابة..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRecordPortExit}
                        disabled={isPending || !stage10Data.customs_released_at}
                        className="w-full py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <DynamicIcon name="ArrowRight" className="w-3.5 h-3.5" />
                        {isPending ? "جاري التوثيق..." : "توثيق خروج الشحنة من الميناء"}
                      </button>
                      {!stage10Data.customs_released_at && (
                        <p className="text-[10px] text-amber-700">يتطلب توثيق إذن الإفراج أولاً قبل تسجيل الخروج من الميناء.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Milestone 3: Customer Delivery */}
                <div className="p-3.5 rounded-xl border border-neutral-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                      <DynamicIcon name="CheckCheck" className="w-3.5 h-3.5 text-neutral-600" />
                      3. تسليم الشحنة للعميل / المستودع (المحطة الختامية)
                    </span>
                    {stage10Data.delivered_at ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        تم التسليم للعميل ({formatDateAr(stage10Data.delivered_at)})
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-bold">
                        بانتظار التسليم
                      </span>
                    )}
                  </div>

                  {stage10Data.delivered_at ? (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-900 space-y-1">
                      <div>المستلم: <strong>{stage10Data.recipient_name || "—"}</strong></div>
                      {stage10Data.delivery_notes && (
                        <div className="text-[11px] text-emerald-800">{stage10Data.delivery_notes}</div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                          placeholder="اسم المستلم أو ممثل العميل..."
                        />
                        <input
                          type="text"
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#F5C500]"
                          placeholder="ملاحظات التسليم والتفريغ..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRecordCustomerDelivery}
                        disabled={isPending || !stage10Data.customs_released_at}
                        className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        <DynamicIcon name="CheckCheck" className="w-3.5 h-3.5" />
                        {isPending ? "جاري التوثيق..." : "توثيق تسليم الشحنة للعميل واكتمال الرحلة"}
                      </button>
                      {!stage10Data.customs_released_at && (
                        <p className="text-[10px] text-amber-700">يتطلب توثيق إذن الإفراج أولاً قبل تسجيل تسليم الشحنة للعميل.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Stage Audit History ── */}
          {stageHistoryEntries.length > 0 && (
            <div className="pt-3 border-t border-neutral-100 space-y-2">
              <span className="text-[11px] font-bold text-neutral-400 block uppercase tracking-wider">
                سجل العمليات الخاص بهذه المرحلة:
              </span>
              <div className="space-y-1.5 text-xs">
                {stageHistoryEntries.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-100 flex items-start justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-neutral-800 block">{h.action}</span>
                      {h.notes && <span className="text-neutral-500 text-[11px] block">{h.notes}</span>}
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      {formatDateAr(h.performed_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Reopen Completed Stage (Guarded) ── */}
          {isCompleted && (
            <div className="pt-3 border-t border-neutral-100">
              {!showReopenPrompt ? (
                <button
                  type="button"
                  onClick={() => setShowReopenPrompt(true)}
                  className="text-xs text-neutral-400 hover:text-neutral-700 underline font-medium"
                >
                  إعادة فتح المرحلة للمراجعة والتصحيح (للمسؤولين)
                </button>
              ) : (
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 text-xs">
                  <label className="font-bold text-neutral-800 block">سبب إعادة فتح المرحلة:</label>
                  <input
                    type="text"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="وضح سبب إعادة فتح المرحلة والتصحيح المطلوب..."
                    className="w-full p-2 text-xs rounded-lg border border-neutral-200"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={isPending || !reopenReason.trim()}
                      className="py-1 px-3 rounded bg-neutral-900 text-white font-bold text-xs"
                    >
                      تأكيد إعادة الفتح
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReopenPrompt(false)}
                      className="py-1 px-3 rounded bg-white border border-neutral-200 text-neutral-700 text-xs"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between">
          <span className="text-xs text-neutral-400 font-mono">
            {stage.number} / 07 — OUT Clearance Journey
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
