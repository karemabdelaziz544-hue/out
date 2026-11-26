"use client";

/**
 * Customer Unified Stage Modal Component
 *
 * Implements the customer-safe stage popup for the 7-stage OUT customs journey:
 * 1. Shows only customer-appropriate information (no internal staff notes, employee IDs, or checklists).
 * 2. If upcoming: Shows concise friendly preview without exposing internal operations.
 * 3. If completed: Shows concise approved results and verified references.
 * 4. If current:
 *    - If customer action required (e.g. approve price, revise invoice, upload documents),
 *      exposes the exact permitted controls.
 *    - If waiting for OUT operations, provides clear and reassuring operational status.
 */

import React, { useState, useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type {
  UnifiedJourneyStage,
  ShipmentCustomsJourney,
  CustomsDutiesSettlementData,
  ClearanceReleaseStageData,
} from "@/types/journey";
import { GOODS_CATEGORY_LABELS } from "@/types/journey";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  ShipmentInvoiceReview,
  ShipmentAcid,
  FinalShipmentDocumentType,
} from "@/types";
import { FINAL_SHIPMENT_DOCUMENT_TYPES, FINAL_DOCUMENT_TYPE_LABELS, matchFinalDocumentType } from "@/types";

// Customer Server Actions
import {
  customerApproveEstimateAction,
  customerRequestNegotiationAction,
  customerApproveFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import { customerResubmitInvoiceAction } from "@/lib/shipments/invoice-review-actions";
import { customerUploadShipmentDocumentAction } from "@/lib/shipments/document-actions";

interface CustomerUnifiedStageModalProps {
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

export function CustomerUnifiedStageModal({
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
}: CustomerUnifiedStageModalProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [copiedAcid, setCopiedAcid] = useState(false);

  // Stage 03 replacement invoice state
  const [replacementInvoiceFile, setReplacementInvoiceFile] = useState<File | null>(null);

  // Stage 05 document upload states
  const [uploadingDocType, setUploadingDocType] = useState<FinalShipmentDocumentType | null>(null);
  const [selectedDocFiles, setSelectedDocFiles] = useState<Partial<Record<FinalShipmentDocumentType, File>>>({});

  if (!isOpen) return null;

  const isCurrent = stage.isCurrent;
  const isCompleted = stage.isCompleted;
  const isUpcoming = stage.isUpcoming;

  // Find preliminary invoice document
  const invoiceDoc = documents.find(
    (d) =>
      d.document_type === "commercial_invoice" ||
      d.document_type === "الفاتورة التجارية" ||
      d.document_type === "proforma_invoice" ||
      d.document_type === "فاتورة مبدئية",
  );
  const latestInvoiceReview = invoiceReviews[0] || null;

  // Group 4 final shipment documents
  const finalDocs = FINAL_SHIPMENT_DOCUMENT_TYPES.map((type) => {
    const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === type);
    return {
      type,
      label: FINAL_DOCUMENT_TYPE_LABELS[type],
      doc: doc || null,
    };
  });

  const st9 = journey?.stages?.find((s) => s.stage_key === "stage_9_fees_payments");
  const stage9Settlement = (st9?.stage_data as CustomsDutiesSettlementData | undefined) || null;

  const st10 = journey?.stages?.find((s) => s.stage_key === "stage_10_clearance_release");
  const stage10Data = (st10?.stage_data as ClearanceReleaseStageData | undefined) || null;

  const handleCopyAcid = () => {
    if (!acid?.acid_number) return;
    navigator.clipboard.writeText(acid.acid_number);
    setCopiedAcid(true);
    setTimeout(() => setCopiedAcid(false), 2000);
  };

  return (
    <div
      className="unified-stage-modal-backdrop"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="unified-stage-modal-card max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="p-5 border-b border-neutral-100 flex items-start justify-between gap-4 bg-neutral-50/80">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-neutral-900 text-[#F5C500] font-mono text-sm font-black flex items-center justify-center shadow-inner">
              {stage.number}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-900">{stage.title}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isCurrent
                      ? "bg-[#F5C500]/20 text-neutral-950 border border-[#F5C500]"
                      : isCompleted
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {stage.statusLabel}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{stage.customerDescription}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            title="إغلاق"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        {/* ── Feedback Alert ── */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3.5 rounded-xl text-xs sm:text-sm flex items-center gap-2.5 ${
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

        {/* ── Modal Body ── */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
          {/* ── Upcoming Stage Preview (Section 6) ── */}
          {isUpcoming && (
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-700 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-neutral-900">
                <DynamicIcon name="Clock" className="w-4 h-4 text-neutral-400" />
                المرحلة لم تبدأ بعد
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                {stage.customerDescription}
              </p>
              <p className="text-[11px] text-neutral-400 pt-1">
                سيتم تفعيل هذه المرحلة تلقائياً فور استكمال المرحلة السابقة.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 01: استلام طلب الشحنة
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "01_intake" && (
            <div className="space-y-4">
              <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/80 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  بيانات الشحنة المسجلة
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[11px]">رقم الشحنة</span>
                    <span className="font-mono font-bold text-neutral-900">
                      {shipment.reference_number || shipment.id.slice(0, 8)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">ميناء الوصول</span>
                    <span className="font-semibold text-neutral-900">
                      {shipment.port_of_arrival || "لم يحدد"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">نوع البضائع</span>
                    <span className="font-semibold text-neutral-900">
                      {journey?.goods_category
                        ? GOODS_CATEGORY_LABELS[journey.goods_category]
                        : shipment.goods_category
                        ? GOODS_CATEGORY_LABELS[shipment.goods_category]
                        : "عامة"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[11px]">بلد المنشأ</span>
                    <span className="font-semibold text-neutral-900">
                      {shipment.country_of_origin || "غير محدد"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-emerald-900 flex items-start gap-3">
                <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">تم استلام طلب الشحنة وتدقيقه بنجاح</p>
                  <p className="text-emerald-800 text-[11px] leading-relaxed">
                    قام فريق OUT بتدقيق البيانات الأساسية وتحديد المسار الجمركي المناسب للشحنة.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 02: التسعير وموافقة العميل
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "02_pricing" && (
            <div className="space-y-4">
              {pricing && (
                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                      عرض السعر لخدمة التخليص
                    </span>
                    <span className="text-xs font-bold text-neutral-900">
                      {pricing.status === "customer_approved"
                        ? "معتمد ومؤكد ✓"
                        : pricing.status === "final_proposed"
                        ? "سعر نهائي بانتظار موافقتك"
                        : pricing.status === "negotiation_requested"
                        ? "طلب تفاوض قيد المتابعة"
                        : pricing.status === "proposed"
                        ? "عرض سعر متاح للمراجعة"
                        : "قيد الإعداد"}
                    </span>
                  </div>

                  {/* Display Price Values */}
                  <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-sm">
                    {pricing.final_price != null ? (
                      <div>
                        <span className="text-xs text-neutral-400 block">السعر النهائي المتفق عليه:</span>
                        <div className="text-2xl font-black text-neutral-900 mt-1">
                          {pricing.final_price.toLocaleString("ar-EG")}{" "}
                          <span className="text-sm font-bold text-neutral-500">{pricing.currency || "EGP"}</span>
                        </div>
                      </div>
                    ) : pricing.estimated_min_price != null && pricing.estimated_max_price != null ? (
                      <div>
                        <span className="text-xs text-neutral-400 block">نطاق السعر التقديري:</span>
                        <div className="text-xl font-black text-neutral-900 mt-1">
                          {pricing.estimated_min_price.toLocaleString("ar-EG")} – {pricing.estimated_max_price.toLocaleString("ar-EG")}{" "}
                          <span className="text-sm font-bold text-neutral-500">{pricing.currency || "EGP"}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">يقوم فريق OUT بإعداد عرض السعر للشحنة...</p>
                    )}

                    {pricingHistory && pricingHistory[0]?.notes && (
                      <p className="text-xs text-neutral-500 pt-1 border-t border-neutral-100">
                        {pricingHistory[0].notes}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Actions (When Waiting for Customer) */}
              {isCurrent && stage.status === "waiting_customer" && pricing && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-neutral-900">الإجراء المطلوب من سيادتكم:</h4>

                  {/* Proposed estimate */}
                  {pricing.status === "proposed" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          startTransition(async () => {
                            setFeedback(null);
                            const fd = new FormData();
                            fd.set("shipment_id", shipment.id);
                            if (pricing.updated_at) {
                              fd.set("expected_pricing_updated_at", pricing.updated_at);
                            }
                            const res = await customerApproveEstimateAction(fd);
                            if (res.success) {
                              setFeedback({ type: "success", message: res.message || "تم اعتماد السعر بنجاح" });
                              setTimeout(() => onClose(), 1000);
                            } else {
                              setFeedback({ type: "error", message: res.error || "فشل اعتماد السعر" });
                            }
                          });
                        }}
                        disabled={isPending}
                        className="py-3 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                      >
                        <DynamicIcon name="CheckCircle" className="w-4 h-4 text-[#F5C500]" />
                        {isPending ? "جاري الحفظ..." : "الموافقة على التقدير المبدئي"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          startTransition(async () => {
                            setFeedback(null);
                            const fd = new FormData();
                            fd.set("shipment_id", shipment.id);
                            const res = await customerRequestNegotiationAction(fd);
                            if (res.success) {
                              setFeedback({ type: "success", message: res.message || "تم إرسال طلب التفاوض بنجاح" });
                            } else {
                              setFeedback({ type: "error", message: res.error || "فشل إرسال طلب التفاوض" });
                            }
                          });
                        }}
                        disabled={isPending}
                        className="py-3 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <DynamicIcon name="MessageSquare" className="w-4 h-4 text-neutral-600" />
                        {isPending ? "جاري الإرسال..." : "طلب التفاوض على السعر"}
                      </button>
                    </div>
                  )}

                  {/* Final proposed */}
                  {pricing.status === "final_proposed" && (
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          setFeedback(null);
                          const fd = new FormData();
                          fd.set("shipment_id", shipment.id);
                          if (pricing.final_price) {
                            fd.set("expected_final_price", pricing.final_price.toString());
                          }
                          const res = await customerApproveFinalPriceAction(fd);
                          if (res.success) {
                            setFeedback({ type: "success", message: res.message || "تم اعتماد السعر النهائي بنجاح" });
                            setTimeout(() => onClose(), 1000);
                          } else {
                            setFeedback({ type: "error", message: res.error || "فشل اعتماد السعر النهائي" });
                          }
                        });
                      }}
                      disabled={isPending}
                      className="w-full py-3.5 px-4 rounded-xl bg-[#F5C500] hover:bg-[#e0b000] text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                    >
                      <DynamicIcon name="Check" className="w-4 h-4 text-neutral-950" />
                      {isPending ? "جاري الحفظ..." : "اعتماد السعر النهائي والبدء في الإجراءات"}
                    </button>
                  )}
                </div>
              )}

              {/* Already approved */}
              {pricing?.status === "customer_approved" && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5">
                  <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold block">تم اعتماد عرض السعر والموافقة الرسمية</span>
                    {pricing.customer_approved_at && (
                      <span className="text-[11px] text-emerald-700">
                        بتاريخ: {formatDateAr(pricing.customer_approved_at)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 03: مراجعة الفاتورة المبدئية
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "03_invoice_review" && (
            <div className="space-y-4">
              {/* Document Overview */}
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DynamicIcon name="FileText" className="w-5 h-5 text-neutral-500" />
                  <div>
                    <h5 className="font-bold text-xs text-neutral-900">
                      {invoiceDoc?.file_name || "الفاتورة المبدئية (Proforma Invoice)"}
                    </h5>
                    <span className="text-[11px] text-neutral-500">
                      {invoiceDoc?.status === "approved"
                        ? "معتمدة ومطابقة ✓"
                        : invoiceDoc?.status === "revision_required"
                        ? "مطلوب تعديل"
                        : "قيد التدقيق"}
                    </span>
                  </div>
                </div>
                {invoiceDoc && onPreviewDocument && (
                  <button
                    type="button"
                    onClick={() => onPreviewDocument(invoiceDoc)}
                    className="text-xs font-bold text-neutral-900 hover:underline flex items-center gap-1"
                  >
                    <DynamicIcon name="Eye" className="w-3.5 h-3.5" />
                    معاينة
                  </button>
                )}
              </div>

              {/* Revision note from admin if revision required */}
              {(stage.status === "needs_correction" || invoiceDoc?.status === "revision_required") && latestInvoiceReview?.note && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <DynamicIcon name="AlertTriangle" className="w-4 h-4 text-rose-600" />
                    ملاحظات التعديل المطلوبة من إدارة التخليص:
                  </div>
                  <p className="text-xs bg-white/80 p-2.5 rounded-lg border border-rose-100 leading-relaxed font-mono">
                    {latestInvoiceReview.note}
                  </p>
                </div>
              )}

              {/* Re-upload form if revision required */}
              {(stage.status === "needs_correction" || invoiceDoc?.status === "revision_required") && (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
                  <h5 className="font-bold text-xs text-neutral-900">رفع الفاتورة بعد التعديل:</h5>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setReplacementInvoiceFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-neutral-600 file:mr-0 file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-900 file:text-white hover:file:bg-neutral-800 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!invoiceDoc) return;
                      if (!replacementInvoiceFile) {
                        setFeedback({ type: "error", message: "يرجى اختيار ملف الفاتورة المحدث أولاً." });
                        return;
                      }
                      startTransition(async () => {
                        setFeedback(null);
                        const fd = new FormData();
                        fd.set("shipment_id", shipment.id);
                        fd.set("document_id", invoiceDoc.id);
                        fd.set("file", replacementInvoiceFile);
                        const res = await customerResubmitInvoiceAction(fd);
                        if (res.success) {
                          setFeedback({ type: "success", message: res.message || "تم رفع الفاتورة المحدثة بنجاح" });
                          setReplacementInvoiceFile(null);
                        } else {
                          setFeedback({ type: "error", message: res.error || "فشل رفع الفاتورة" });
                        }
                      });
                    }}
                    disabled={isPending || !replacementInvoiceFile}
                    className="w-full py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <DynamicIcon name="Upload" className="w-4 h-4 text-[#F5C500]" />
                    {isPending ? "جاري الرفع..." : "إرسال الفاتورة المعدلة للمراجعة"}
                  </button>
                </div>
              )}

              {/* Completed state */}
              {isCompleted && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5">
                  <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>تم اعتماد الفاتورة المبدئية واستيفاء كافة البنود الجمركية المطلوبة.</span>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 04: إصدار رقم ACID من نافذة
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "04_acid" && (
            <div className="space-y-4">
              {acid?.acid_number ? (
                <div className="p-5 rounded-2xl bg-neutral-950 text-white space-y-3 border border-neutral-800 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5C500] uppercase tracking-wider">
                      الرقم التعريفي المسبق للشحنة (ACID)
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      معتمد وصادر
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-3 py-3 bg-neutral-900 rounded-xl border border-neutral-800">
                    <span className="text-2xl font-mono font-black text-[#F5C500] tracking-wider">
                      {acid.acid_number}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAcid}
                      className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors"
                      title={copiedAcid ? "تم النسخ" : "نسخ رقم ACID"}
                    >
                      <DynamicIcon
                        name={copiedAcid ? "Check" : "Copy"}
                        className={`w-4 h-4 ${copiedAcid ? "text-emerald-400" : ""}`}
                      />
                    </button>
                  </div>
                  {acid.issued_at && (
                    <span className="text-[11px] text-neutral-400 block text-center">
                      تاريخ الإصدار: {formatDateAr(acid.issued_at)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-600 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-neutral-900">
                    <DynamicIcon name="Clock" className="w-4 h-4 text-neutral-400" />
                    جاري التنسيق واستخراج رقم ACID
                  </div>
                  <p className="text-neutral-500 leading-relaxed text-[11px]">
                    يقوم فريق OUT بإدراج بيانات الشحنة والفاتورة المعتمدة على منظومة نافذة الجمركية لاستخراج رقم القيد المسبق (ACID).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 05: مراجعة مستندات الشحنة
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "05_documents" && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                قائمة المستندات الأساسية الأربعة المطلوبة للشحن:
              </p>

              <div className="space-y-2.5">
                {finalDocs.map(({ type, label, doc }) => {
                  const isDocApproved = doc?.status === "approved";
                  const isRevisionReq = doc?.status === "revision_required";
                  const isUploaded = !!doc;

                  return (
                    <div
                      key={type}
                      className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name={isDocApproved ? "CheckCircle" : "FileText"}
                            className={`w-4 h-4 ${isDocApproved ? "text-emerald-600" : "text-neutral-500"}`}
                          />
                          <span className="font-bold text-xs text-neutral-900">{label}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isDocApproved
                              ? "bg-emerald-100 text-emerald-800"
                              : isRevisionReq
                              ? "bg-rose-100 text-rose-800"
                              : isUploaded
                              ? "bg-blue-100 text-blue-800"
                              : "bg-neutral-200 text-neutral-700"
                          }`}
                        >
                          {isDocApproved
                            ? "معتمد"
                            : isRevisionReq
                            ? "مطلوب تعديل"
                            : isUploaded
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

                      {/* Upload / Re-upload input if not approved */}
                      {!isDocApproved && isCurrent && (
                        <div className="pt-2 border-t border-neutral-200/60 space-y-2">
                          <input
                            type="file"
                            accept=".pdf,image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setSelectedDocFiles((prev) => ({ ...prev, [type]: f }));
                            }}
                            className="block w-full text-xs text-neutral-600 file:mr-0 file:ml-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-neutral-200 file:text-neutral-800 hover:file:bg-neutral-300 cursor-pointer"
                          />
                          {selectedDocFiles[type] && (
                            <button
                              type="button"
                              onClick={() => {
                                const f = selectedDocFiles[type];
                                if (!f) return;
                                setUploadingDocType(type);
                                startTransition(async () => {
                                  setFeedback(null);
                                  const fd = new FormData();
                                  fd.set("shipment_id", shipment.id);
                                  fd.set("document_type", type);
                                  fd.set("file", f);
                                  const res = await customerUploadShipmentDocumentAction(fd);
                                  setUploadingDocType(null);
                                  if (res.success) {
                                    setFeedback({ type: "success", message: res.message || "تم رفع المستند بنجاح" });
                                    setSelectedDocFiles((prev) => {
                                      const next = { ...prev };
                                      delete next[type];
                                      return next;
                                    });
                                  } else {
                                    setFeedback({ type: "error", message: res.error || "فشل رفع المستند" });
                                  }
                                });
                              }}
                              disabled={isPending && uploadingDocType === type}
                              className="w-full py-2 px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <DynamicIcon name="Upload" className="w-3.5 h-3.5 text-[#F5C500]" />
                              {isPending && uploadingDocType === type ? "جاري الرفع..." : `تأكيد رفع ${label}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 06: إجراءات التخليص حسب نوع الشحنة
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "06_customs_procedures" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs space-y-2">
                <h5 className="font-bold text-xs text-neutral-900">طبيعة الإجراءات الجمركية</h5>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  تخضع الشحنة لمعاينات مصلحة الجمارك والجهات الرقابية المختصة بناءً على تصنيف البضائع المعتمد. يقوم فريق العمليات الميداني بإنهاء المعاينة الجمركية وسحب العينات إن لزم الأمر.
                </p>
              </div>

              {journey?.goods_category && (
                <div className="p-3 bg-neutral-100 rounded-lg text-xs flex items-center justify-between">
                  <span className="text-neutral-500">التصنيف المطبق:</span>
                  <span className="font-bold text-neutral-900">
                    {GOODS_CATEGORY_LABELS[journey.goods_category]}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STAGE 07: استكمال إجراءات التخليص والإفراج
          ══════════════════════════════════════════════════════════════════════ */}
          {stage.key === "07_clearance_release" && (
            <div className="space-y-4">
              {isCompleted ? (
                <div className="p-5 rounded-2xl bg-emerald-950 text-white space-y-3 border border-emerald-800 shadow-lg">
                  <div className="flex items-center gap-2">
                    <DynamicIcon name="CheckCircle" className="w-5 h-5 text-emerald-400" />
                    <h5 className="font-bold text-sm text-emerald-300">تم الإفراج الجمركي بنجاح ✓</h5>
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed">
                    تم سداد كافة الرسوم الجمركية والضرائب المقررة واستلام إذن الإفراج الجمركي النهائي. الشحنة جاهزة للاستلام والنقل.
                  </p>
                  {stage10Data?.release_permit_number && (
                    <div className="p-2.5 bg-emerald-900/60 rounded-xl border border-emerald-700/50 text-xs font-mono text-[#F5C500]">
                      رقم إذن الإفراج النهائي: <strong>{stage10Data.release_permit_number}</strong>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-600 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-neutral-900">
                    <DynamicIcon name="Clock" className="w-4 h-4 text-neutral-400" />
                    جاري استكمال تسوية الرسوم وإذن الإفراج
                  </div>
                  <p className="text-neutral-500 leading-relaxed text-[11px]">
                    يتم حالياً احتساب ودفع الرسوم الجمركية والضرائب ومطابقة إذن التسليم تمهيداً لصدور إذن الإفراج النهائي للشحنة.
                  </p>
                </div>
              )}

              {/* Public Milestone Status for Customer */}
              <div className="space-y-2 pt-1">
                {(stage9Settlement?.assessed_customs_amount ?? stage9Settlement?.duties_amount) && (
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-neutral-800 font-bold">
                      <DynamicIcon name="Receipt" className="w-4 h-4 text-amber-600" />
                      <span>إجمالي الرسوم الجمركية المقررة</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-neutral-900">
                      {(stage9Settlement?.assessed_customs_amount ?? stage9Settlement?.duties_amount)?.toLocaleString("ar-EG")} ج.م
                    </span>
                  </div>
                )}
                {stage9Settlement?.settlement_status === "customer_paid_direct" && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                      <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600" />
                      <span>حالة تسوية الرسوم الجمركية</span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700">
                      مسددة مباشرة لمصلحة الجمارك ✅
                    </span>
                  </div>
                )}
                {stage10Data?.customs_released_at && (
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-neutral-800 font-bold">
                      <DynamicIcon name="FileCheck" className="w-4 h-4 text-emerald-600" />
                      <span>إذن الإفراج الجمركي</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {formatDateAr(stage10Data.customs_released_at)}
                    </span>
                  </div>
                )}

                {stage10Data?.port_exit_at && (
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-neutral-800 font-bold">
                      <DynamicIcon name="Truck" className="w-4 h-4 text-blue-600" />
                      <span>خروج الشحنة من الميناء</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {formatDateAr(stage10Data.port_exit_at)}
                    </span>
                  </div>
                )}

                {stage10Data?.delivered_at && (
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-neutral-800 font-bold">
                      <DynamicIcon name="CheckCheck" className="w-4 h-4 text-emerald-600" />
                      <span>تسليم الشحنة للعميل</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {formatDateAr(stage10Data.delivered_at)}
                    </span>
                  </div>
                )}
              </div>
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
