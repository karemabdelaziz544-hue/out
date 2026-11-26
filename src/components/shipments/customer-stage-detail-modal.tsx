"use client";

import React, { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { AuthoritativeJourneyStage, CustomerJourneyStation } from "@/types/journey";
import type { DocumentItem, ShipmentPricing, ShipmentAcid, Shipment, FinalShipmentDocumentType } from "@/types";
import type {
  CustomerCustomsObligationItem,
  CustomerShipmentFinancialStatementItem,
  ShipmentFinancialSummary,
} from "@/types/financial";
import {
  FINAL_SHIPMENT_DOCUMENT_TYPES,
  FINAL_DOCUMENT_TYPE_LABELS,
  matchFinalDocumentType,
} from "@/types";
import {
  customerApproveEstimateAction,
  customerRequestNegotiationAction,
  customerApproveFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import { customerResubmitInvoiceAction } from "@/lib/shipments/invoice-review-actions";
import { customerUploadShipmentDocumentAction } from "@/lib/shipments/document-actions";

interface CustomerStageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment?: Shipment | null;
  station?: CustomerJourneyStation | null;
  stage?: AuthoritativeJourneyStage | null;
  documents: DocumentItem[];
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  financialSummary?: ShipmentFinancialSummary | null;
  financialStatement?: CustomerShipmentFinancialStatementItem[];
  customsObligations?: CustomerCustomsObligationItem[];
  onPreviewDocument?: (doc: DocumentItem) => void;
  onActionClick?: (tab: "documents" | "pricing" | "specs") => void;
}

export function CustomerStageDetailModal(props: CustomerStageDetailModalProps) {
  if (!props.isOpen || (!props.station && !props.stage)) return null;
  const syncKey = `${props.station?.key || props.stage?.key || ""}_${props.shipment?.updated_at || ""}_${props.pricing?.updated_at || ""}_${props.acid?.updated_at || ""}`;
  return <CustomerStageDetailModalContent key={syncKey} {...props} />;
}

function CustomerStageDetailModalContent({
  isOpen,
  onClose,
  shipment = null,
  station = null,
  stage = null,
  documents,
  pricing = null,
  acid = null,
  financialSummary = null,
  financialStatement = [],
  customsObligations = [],
  onPreviewDocument,
  onActionClick,
}: CustomerStageDetailModalProps) {
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

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Preliminary Invoice Resubmit state
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);

  // Final Documents Upload state
  const [uploadingDocType, setUploadingDocType] = useState<FinalShipmentDocumentType | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

  const handleApproveEstimate = () => {
    if (!shipment?.id || !pricing) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    if (pricing.updated_at) {
      fd.append("expected_pricing_updated_at", pricing.updated_at);
    }
    startTransition(async () => {
      const res = await customerApproveEstimateAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم اعتماد تقدير السعر بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل اعتماد السعر." });
      }
    });
  };

  const handleRequestNegotiation = () => {
    if (!shipment?.id) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    startTransition(async () => {
      const res = await customerRequestNegotiationAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم طلب التفاوض على السعر بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل إرسال طلب التفاوض." });
      }
    });
  };

  const handleApproveFinalPrice = () => {
    if (!shipment?.id || !pricing?.final_price) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("expected_final_price", String(pricing.final_price));
    startTransition(async () => {
      const res = await customerApproveFinalPriceAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم اعتماد السعر النهائي بنجاح." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل اعتماد السعر النهائي." });
      }
    });
  };

  const handleResubmitInvoice = (e: React.FormEvent, docId: string) => {
    e.preventDefault();
    if (!shipment?.id || !docId || !invoiceFile) return;
    if (invoiceFile.size > MAX_FILE_SIZE) {
      setFeedback({ type: "error", text: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت)." });
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(invoiceFile.type)) {
      setFeedback({ type: "error", text: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP)." });
      return;
    }
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_id", docId);
    fd.append("file", invoiceFile);
    startTransition(async () => {
      const res = await customerResubmitInvoiceAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم رفع الفاتورة المحدثة بنجاح." });
        setInvoiceFile(null);
        if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = "";
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل إعادة رفع الفاتورة." });
      }
    });
  };

  const handleUploadShipmentDoc = (file: File, docType: FinalShipmentDocumentType) => {
    if (!shipment?.id) return;
    if (file.size > MAX_FILE_SIZE) {
      setFeedback({ type: "error", text: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت)." });
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setFeedback({ type: "error", text: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP)." });
      return;
    }
    setFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_type", docType);
    fd.append("file", file);
    startTransition(async () => {
      const res = await customerUploadShipmentDocumentAction(fd);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "تم رفع المستند بنجاح." });
        setUploadingDocType(null);
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "فشل رفع المستند." });
      }
    });
  };

  if (!isOpen || (!station && !stage)) return null;

  const itemNumber = station?.number || stage?.number || "01";
  const itemTitle = station?.title || stage?.title || "";
  const itemStatusLabel = station?.statusLabel || stage?.statusLabel || "";
  const itemIsCompleted = station?.isCompleted ?? stage?.isCompleted ?? false;
  const itemIsCurrent = station?.isCurrent ?? stage?.isCurrent ?? false;
  const itemCompletedAt = station?.completedAt || stage?.completedAt || null;
  const itemDescription = station?.customerDescription || stage?.customerDescription || "";
  const itemMetaInfo = station?.metaInfo || stage?.metaInfo || null;

  // Station Key or Stage Key identifier
  const isPricingStation =
    station?.key === "02_pricing_approval" || stage?.key === "02_pricing";
  const isInvoiceNafezaStation =
    station?.key === "03_invoice_nafeza_acid" || stage?.key === "03_invoice_nafeza";
  const isDocumentsStation =
    station?.key === "04_documents_procedures" ||
    stage?.key === "04_documents" ||
    (stage?.key as string) === "05_type_procedures";
  const isInspectionDataStation =
    station?.key === "05_inspection_data_entry" ||
    stage?.key === "05_scouting" ||
    stage?.key === "06_inspection" ||
    stage?.key === "07_data_entry";
  const isValuationSettlementStation =
    station?.key === "06_valuation_settlement" ||
    stage?.key === "08_valuation" ||
    stage?.key === "09_settlement";
  const isReleaseDeliveryStation =
    station?.key === "07_release_delivery" || stage?.key === "10_clearance_release";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/70 backdrop-blur-xs font-sans overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white border border-neutral-800 rounded-3xl w-full max-w-lg my-auto shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="bg-neutral-950 text-white p-4 sm:p-6 flex items-center justify-between gap-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#F5C500] text-neutral-950 font-black text-sm flex items-center justify-center shrink-0 shadow-sm font-mono">
              {itemNumber}
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                {itemTitle}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold shrink-0 ${
                    itemIsCompleted
                      ? "bg-emerald-950/90 text-emerald-300 border border-emerald-700/60"
                      : itemIsCurrent
                      ? "bg-[#F5C500] text-neutral-950"
                      : "bg-neutral-800 text-neutral-300 border border-neutral-700/60"
                  }`}
                >
                  {itemStatusLabel}
                </span>
                {itemCompletedAt && (
                  <span className="text-[10px] text-neutral-400 truncate">
                    • اكتملت في {formatDateAr(itemCompletedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F5C500] shrink-0"
            title="إغلاق"
          >
            <DynamicIcon name="X" size={18} />
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5 text-neutral-800 text-xs sm:text-sm">
          {/* Explanation Banner */}
          <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs leading-relaxed text-neutral-600">
            <div className="font-bold text-neutral-900 mb-1.5 flex items-center gap-1.5">
              <DynamicIcon name="FileText" className="w-3.5 h-3.5 text-neutral-500" />
              <span>تفاصيل ومحددات هذه المحطة:</span>
            </div>
            <div>{itemDescription}</div>
          </div>

          {/* Underlying Stages Grouping Breakdown (if station with multiple underlying stages) */}
          {station?.underlyingStages && station.underlyingStages.length > 1 && (
            <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col gap-2">
              <span className="text-xs font-bold text-neutral-800">
                المسارات التشغيلية المتضمنة:
              </span>
              <div className="space-y-1.5">
                {station.underlyingStages.map((sub) => (
                  <div
                    key={sub.number}
                    className="flex items-center justify-between p-2 rounded-xl bg-white border border-neutral-200/80 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-bold text-neutral-600 text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded">
                        {sub.number}
                      </span>
                      <span className="font-medium text-neutral-800 truncate">{sub.title}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-bold shrink-0 ${
                        sub.isCompleted
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : sub.isCurrent
                          ? "bg-[#F5C500] text-neutral-950 font-bold"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {sub.statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Public Milestone Reference if present */}
          {itemMetaInfo && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center justify-between text-xs">
              <span className="font-bold text-amber-900">المرجع الموثق:</span>
              <span className="font-bold text-neutral-950 bg-white px-2.5 py-1 rounded-lg border border-amber-300 font-mono text-xs">
                {itemMetaInfo}
              </span>
            </div>
          )}

          {/* Action Feedback Alert */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-rose-50 text-rose-800 border-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <DynamicIcon
                  name={feedback.type === "success" ? "CheckCircle" : "AlertTriangle"}
                  className="w-4 h-4 shrink-0"
                />
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-neutral-500 hover:text-neutral-800 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Station 02: Pricing Actions for Customer */}
          {isPricingStation && (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col gap-3">
              <div className="font-bold text-xs text-neutral-900 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <DynamicIcon name="Receipt" className="w-4 h-4 text-neutral-500" />
                  <span>بيانات تسعير الخدمة:</span>
                </div>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${
                    pricing?.status === "customer_approved" && pricing?.approval_type === "final_fixed"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : pricing?.status === "negotiation_requested" || shipment?.status === "negotiation"
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : pricing?.status === "final_proposed" || pricing?.final_price || shipment?.status === "price_agreed"
                      ? "bg-blue-50 text-blue-800 border-blue-300"
                      : pricing?.status === "customer_approved" && pricing?.approval_type === "estimated_range"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : pricing?.estimated_min_price
                      ? "bg-yellow-50 text-yellow-800 border-yellow-300"
                      : "bg-neutral-100 text-neutral-600 border-neutral-300"
                  }`}
                >
                  {pricing?.status === "customer_approved" && pricing?.approval_type === "final_fixed"
                    ? "تمت الموافقة على السعر النهائي ✓"
                    : pricing?.status === "negotiation_requested" || shipment?.status === "negotiation"
                    ? "طلب التفاوض على السعر"
                    : pricing?.status === "final_proposed" || pricing?.final_price || shipment?.status === "price_agreed"
                    ? "تم تحديد السعر النهائي"
                    : pricing?.status === "customer_approved" && pricing?.approval_type === "estimated_range"
                    ? "تم اعتماد النطاق التقديري ✓"
                    : pricing?.estimated_min_price
                    ? "في انتظار موافقة العميل"
                    : "قيد إعداد عرض السعر"}
                </span>
              </div>

              {/* State 1: Customer Approved Final Fixed Price */}
              {pricing?.status === "customer_approved" && pricing?.approval_type === "final_fixed" ? (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>تم اعتماد السعر النهائي بنجاح</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    السعر المعتمد: {pricing.final_price?.toLocaleString("ar-EG")} {pricing.currency || "EGP"}
                    {pricing.customer_approved_at && ` • بتاريخ ${formatDateAr(pricing.customer_approved_at)}`}
                  </p>
                </div>
              ) : pricing?.status === "final_proposed" || pricing?.final_price || shipment?.status === "price_agreed" ? (
                /* State 2: Final Price Set by Admin -> Client Approves */
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                    <span className="text-xs text-blue-900 font-bold block mb-1">السعر النهائي المتفق عليه:</span>
                    <div className="text-lg font-black text-blue-950 font-mono">
                      {pricing?.final_price?.toLocaleString("ar-EG")} {pricing?.currency || "EGP"}
                    </div>
                    <p className="text-[11px] text-blue-800 mt-1">
                      تم تحديد هذا السعر النهائي بعد الاتفاق. يرجى الضغط على زر الاعتماد للمتابعة لمراجعة الفاتورة.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleApproveFinalPrice}
                    className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                    <span>{isPending ? "جاري الاعتماد..." : "اعتماد وموافقة على السعر النهائي"}</span>
                  </button>
                </div>
              ) : pricing?.status === "customer_approved" && pricing?.approval_type === "estimated_range" ? (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>تم اعتماد النطاق التقديري المبدئي</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    النطاق المعتمد: {pricing.estimated_min_price.toLocaleString("ar-EG")} - {pricing.estimated_max_price.toLocaleString("ar-EG")} {pricing.currency || "EGP"}
                  </p>
                </div>
              ) : pricing?.status === "negotiation_requested" || shipment?.status === "negotiation" ? (
                /* State 3: Client Requested Negotiation */
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <DynamicIcon name="Clock" className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>طلب التفاوض قيد المتابعة</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    تم استلام طلبكم للتفاوض على السعر. سيقوم فريق العمليات بالتواصل معكم هاتفياً للاتفاق على السعر النهائي وتثبيته.
                  </p>
                </div>
              ) : pricing?.estimated_min_price ? (
                /* State 4: Initial Estimate Offered -> Client Can Approve or Negotiate */
                <div className="space-y-3">
                  <div className="p-3 bg-yellow-50/70 border border-yellow-200 rounded-xl">
                    <span className="text-xs text-yellow-900 font-bold block mb-1">نطاق السعر التقديري:</span>
                    <div className="text-base font-black text-neutral-950 font-mono">
                      {pricing.estimated_min_price.toLocaleString("ar-EG")} - {pricing.estimated_max_price?.toLocaleString("ar-EG")} {pricing.currency || "EGP"}
                    </div>
                    <p className="text-[11px] text-neutral-600 mt-1">
                      تقدير مبدئي لتكلفة التخليص الجمركي بناءً على بنود البضاعة.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleApproveEstimate}
                      className="py-2.5 px-3 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                      <span>{isPending ? "جاري الاعتماد..." : "الموافقة على التقدير المبدئي"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleRequestNegotiation}
                      className="py-2.5 px-3 bg-white hover:bg-neutral-100 text-neutral-800 font-bold rounded-xl text-xs border border-neutral-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <DynamicIcon name="MessageSquare" className="w-3.5 h-3.5 text-neutral-500" />
                      <span>طلب التفاوض على السعر</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* State 5: Awaiting Pricing */
                <div className="text-xs text-neutral-500 py-3 text-center">
                  فريق العمل يقوم بدراسة بنود الشحنة لتقديم عرض السعر المبدئي.
                </div>
              )}
            </div>
          )}

          {/* Station 03: Preliminary Invoice & ACID info */}
          {isInvoiceNafezaStation && (
            <div className="flex flex-col gap-3">
              {acid?.acid_number && (
                <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">
                    رقم القيد الجمركي المبدئي (ACID):
                  </span>
                  <span className="font-mono font-bold text-xs text-neutral-900">
                    {acid.acid_number}
                  </span>
                </div>
              )}

              <div className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                <DynamicIcon name="FileCheck" className="w-3.5 h-3.5 text-neutral-500" />
                <span>الفاتورة المبدئية للشحنة:</span>
              </div>

              {documents
                .filter((d) =>
                  [
                    "commercial_invoice",
                    "proforma_invoice",
                    "invoice",
                    "فاتورة مبدئية",
                    "الفاتورة التجارية",
                  ].includes(d.document_type || ""),
                )
                .map((doc) => {
                  const isApproved = doc.status === "approved";
                  const isRevision = doc.status === "revision_required";

                  return (
                    <div key={doc.id} className="space-y-2">
                      <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-neutral-800 truncate">
                            {doc.file_name}
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-0.5">
                            {isApproved
                              ? "فاتورة معتمدة رسمياً (غير قابلة للتعديل)"
                              : isRevision
                              ? "مطلوب تعديل الفاتورة وإعادة رفعها"
                              : "قيد التدقيق من العمليات"}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-md border font-medium ${
                              isApproved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : isRevision
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-neutral-100 text-neutral-600 border-neutral-300"
                            }`}
                          >
                            {isApproved ? "معتمدة ✓" : isRevision ? "تعديل مطلوب" : "بانتظار الاعتماد"}
                          </span>

                          {onPreviewDocument && (
                            <button
                              type="button"
                              onClick={() => onPreviewDocument(doc)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-neutral-800 font-bold"
                            >
                              <DynamicIcon name="Eye" className="w-3 h-3 text-neutral-500" />
                              <span>معاينة</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Revision Note & Re-upload Form */}
                      {isRevision && (
                        <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2.5">
                          <div className="flex items-start gap-2">
                            <DynamicIcon name="AlertCircle" className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-xs font-bold text-rose-900 block">سبب طلب التعديل من الإدارة:</strong>
                              <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                                {doc.review_note || "يرجى مراجعة الفاتورة وإعادة رفع نسخة مصححة."}
                              </p>
                            </div>
                          </div>

                          <form onSubmit={(e) => handleResubmitInvoice(e, doc.id)} className="pt-2 border-t border-rose-200/80 space-y-2">
                            <label className="block text-xs font-bold text-neutral-800">اختيار ملف الفاتورة المحدثة (PDF أو صور، بحد أقصى 20 ميجابايت):</label>
                            <input
                              type="file"
                              ref={invoiceFileInputRef}
                              accept=".pdf,image/jpeg,image/png,image/webp"
                              required
                              onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                              className="w-full text-xs p-2 rounded-lg border border-neutral-300 bg-white"
                            />
                            <button
                              type="submit"
                              disabled={isPending || !invoiceFile}
                              className="w-full py-2 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              <DynamicIcon name="Upload" className="w-3.5 h-3.5" />
                              <span>{isPending ? "جاري الرفع..." : "إعادة رفع الفاتورة المصححة"}</span>
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Station 04: Documents List for Customer */}
          {isDocumentsStation && (
            <div className="flex flex-col gap-3">
              <div className="font-bold text-xs text-neutral-900 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <DynamicIcon name="FileCheck" className="w-3.5 h-3.5 text-neutral-500" />
                  <span>مستندات الشحن النهائية الأربعة:</span>
                </div>
                <span className="text-[11px] text-neutral-500">
                  الحد الأقصى للملف: 20 ميجابايت (PDF أو صور)
                </span>
              </div>

              {/* Hidden file input for uploading shipment documents */}
              <input
                type="file"
                ref={docFileInputRef}
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && uploadingDocType) {
                    handleUploadShipmentDoc(file, uploadingDocType);
                  }
                  if (docFileInputRef.current) docFileInputRef.current.value = "";
                }}
              />

              <div className="flex flex-col gap-2.5">
                {FINAL_SHIPMENT_DOCUMENT_TYPES.map((docType) => {
                  const docLabel = FINAL_DOCUMENT_TYPE_LABELS[docType];
                  const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === docType);
                  const isApproved = doc?.status === "approved";
                  const isRevision = doc?.status === "revision_required";
                  const isPendingDoc = doc?.status === "pending";

                  return (
                    <div key={docType} className="space-y-1.5">
                      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-neutral-900 truncate">
                            {docLabel}
                          </div>
                          <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                            {doc ? doc.file_name : "لم يتم رفع المستند بعد"}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${
                              isApproved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : isRevision
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : isPendingDoc
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-neutral-100 text-neutral-500 border-neutral-300"
                            }`}
                          >
                            {isApproved
                              ? "معتمد ✓"
                              : isRevision
                              ? "تعديل مطلوب"
                              : isPendingDoc
                              ? "قيد المراجعة"
                              : "مفقود"}
                          </span>

                          {doc && onPreviewDocument && (
                            <button
                              type="button"
                              onClick={() => onPreviewDocument(doc)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-neutral-800 font-bold"
                            >
                              <DynamicIcon name="Eye" className="w-3 h-3 text-neutral-500" />
                              <span>معاينة</span>
                            </button>
                          )}

                          {/* Upload or Re-upload trigger: enabled only if NOT approved */}
                          {!isApproved && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                setUploadingDocType(docType);
                                docFileInputRef.current?.click();
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                                isRevision
                                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                                  : doc
                                  ? "bg-neutral-200 hover:bg-neutral-300 text-neutral-900"
                                  : "bg-[#F5C500] hover:bg-[#e0b400] text-neutral-950"
                              }`}
                            >
                              <DynamicIcon name="Upload" className="w-3 h-3" />
                              <span>{doc ? "استبدال" : "رفع"}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* If revision requested on this document, show admin note */}
                      {isRevision && doc?.review_note && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-start gap-1.5">
                          <DynamicIcon name="AlertCircle" className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">ملاحظة التعديل: </span>
                            <span>{doc.review_note}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Station 05: Inspection & Data Entry */}
          {isInspectionDataStation && (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col gap-2 text-xs">
              <span className="font-bold text-neutral-900">
                الكشف الميداني والمعاينة وإدراج البيانات:
              </span>
              <p className="text-neutral-600 text-[11px] leading-relaxed">
                يقوم فريق العمل الميداني بالكشف في ساحة الوصول ومتابعة المعاينة الجمركية الدقيقة
                لمطابقة الطرود والأوزان، وإتمام إدراج البيانات الجمركية على المنظومة الرسمية.
              </p>
            </div>
          )}

          {/* Station 06: Duties Settlement info for Customer */}
          {isValuationSettlementStation && (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-neutral-900">التقييم الجمركي وسداد الرسوم:</span>
                {financialSummary && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      financialSummary.is_financial_settlement_complete
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-yellow-50 text-neutral-900 border-yellow-300"
                    }`}
                  >
                    {financialSummary.is_financial_settlement_complete ? "مكتملة التسوية" : "قيد المتابعة"}
                  </span>
                )}
              </div>

              {financialSummary ? (
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">الرسوم الجمركية المقررة ({customsObligations.length} مطالبة):</span>
                    <strong className="font-mono text-neutral-950">
                      {financialSummary.assessed_customs_obligation.toLocaleString("ar-EG")} ج.م
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">المتبقي على المطالبات الجمركية:</span>
                    <strong className="font-mono text-neutral-950">
                      {financialSummary.remaining_customs_obligation.toLocaleString("ar-EG")} ج.م
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">إجمالي المستحق لـ OUT (يشمل الأتعاب المعتمدة):</span>
                    <strong className="font-mono text-neutral-950">
                      {financialSummary.total_customer_receivable_to_out.toLocaleString("ar-EG")} ج.م
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">الرصيد المتبقي لشركة OUT:</span>
                    <strong className="font-mono text-neutral-950">
                      {financialSummary.outstanding_balance_to_out.toLocaleString("ar-EG")} ج.م
                    </strong>
                  </div>
                  {financialStatement.length > 0 && (
                    <p className="text-neutral-500 pt-1">
                      الحركات المالية المعتمدة المسجلة في كشف الحساب: {financialStatement.length} حركة.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-neutral-600 text-[11px] leading-relaxed">
                  يتم احتساب الرسوم الجمركية والضرائب المقررة رسمياً، وسدادها مباشرة أو عبر حساب شركة
                  OUT بالنيابة وتوثيق إيصال السداد البنكي لإنهاء متطلبات الإفراج.
                </p>
              )}

              {onActionClick && (
                <button
                  type="button"
                  onClick={() => onActionClick("pricing")}
                  className="self-start px-3.5 py-2 rounded-xl bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold text-[11px] transition-colors cursor-pointer"
                >
                  عرض كشف الحساب المالي الكامل
                </button>
              )}
            </div>
          )}

          {/* Station 07: Clearance and delivery milestones */}
          {isReleaseDeliveryStation && (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col gap-2 text-xs">
              <span className="font-bold text-neutral-900">الإفراج وخروج الميناء والتسليم:</span>
              <p className="text-neutral-600 text-[11px] leading-relaxed">
                بمجرد صدور إذن الإفراج الجمركي الرسمي، يتم إنهاء إجراءات بوابات الميناء وتنسيق خروج
                الشحنة وتسليمها الفعلي إلى مستودعك أو الناقل المعتمد.
              </p>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="bg-neutral-50 p-3.5 sm:p-4 border-t border-neutral-200 flex items-center justify-end shrink-0">
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
