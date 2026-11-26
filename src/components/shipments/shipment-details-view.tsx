"use client";

/**
 * Customer Shipment Details View Component — Visual Redesign
 *
 * High-End Logistics & Customs Clearance SaaS Experience for Customers:
 * 1. Back Navigation & Breadcrumbs to /my-shipments.
 * 2. Visual Header (Section 3.A): Monospace Reference Number, Copy Action,
 *    Prominent Status Badge, Category & Arrival Port Chips, and Direct Stage CTA.
 * 3. Responsive 4-Card KPI Summary Grid (Section 3.B):
 *    - Current Stage & Status
 *    - Port of Arrival & Classification
 *    - Financial & Pricing Status
 *    - ACID Number & Documents Count
 * 4. Customs Clearance Journey (Section 3.C — The Visual Centerpiece):
 *    - 7 Canonical Stages with Connected Stepper Timeline & Progress Bar
 *    - Distinctive styling for Active/Current (OUT Black & Yellow), Completed (Emerald Check),
 *      Upcoming (Muted Neutral), and Action Required (Amber/Rose Alert)
 *    - Click-to-open CustomerUnifiedStageModal (Section 3.D)
 * 5. Subordinate Information Hub (Sections 3.E, 3.F, 3.G):
 *    - Segmented Tab Navigation:
 *      * Documents Grid with Status & Preview Triggers
 *      * Financial & Invoicing Summary
 *      * Cargo & Logistics Specifications
 *      * Timeline of Shipment Milestones
 */

import React, { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { ShipmentStatusBadge } from "./shipment-status-badge";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { CustomerSevenStationTimeline } from "./customer-seven-station-timeline";
import { CustomerStageDetailModal } from "./customer-stage-detail-modal";
import {
  buildAuthoritativeTenStageJourney,
  buildCustomerSevenStationJourney,
} from "@/lib/shipments/canonical-journey-adapter";
import { GOODS_CATEGORY_LABELS } from "@/types/journey";
import { formatDateAr } from "@/lib/utils";
import {
  customerApproveEstimateAction,
  customerRequestNegotiationAction,
  customerApproveFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import { customerResubmitInvoiceAction } from "@/lib/shipments/invoice-review-actions";
import { customerUploadShipmentDocumentAction } from "@/lib/shipments/document-actions";
import {
  FINAL_SHIPMENT_DOCUMENT_TYPES,
  FINAL_DOCUMENT_TYPE_LABELS,
  matchFinalDocumentType,
  type FinalShipmentDocumentType,
} from "@/types";
import type { CustomerJourneyStation } from "@/types/journey";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  ShipmentInvoiceReview,
  ShipmentAcid,
  ShipmentStageHistoryItem,
  CustomerCustomsJourney,
} from "@/types";
import type { ShipmentCustomsJourney } from "@/types/journey";
import {
  FINANCIAL_OBLIGATION_CLAIM_TYPE_LABELS,
  FINANCIAL_OBLIGATION_STATUS_LABELS,
  FINANCIAL_PAYMENT_METHOD_LABELS,
  FINANCIAL_TRANSACTION_CATEGORY_LABELS,
  FINANCIAL_TRANSACTION_TYPE_LABELS,
  type CustomerCustomsObligationItem,
  type CustomerShipmentFinancialStatementItem,
  type ShipmentFinancialSummary,
} from "@/types/financial";

interface ShipmentDetailsViewProps {
  shipment: Shipment;
  documents: DocumentItem[];
  pricing?: ShipmentPricing | null;
  pricingHistory?: ShipmentPricingHistoryItem[];
  invoiceReviews?: ShipmentInvoiceReview[];
  acid?: ShipmentAcid | null;
  journey?: ShipmentCustomsJourney | null;
  customerJourney?: CustomerCustomsJourney | null;
  stageHistory?: ShipmentStageHistoryItem[];
  financialSummary?: ShipmentFinancialSummary | null;
  financialStatement?: CustomerShipmentFinancialStatementItem[];
  customsObligations?: CustomerCustomsObligationItem[];
}

export function ShipmentDetailsView({
  shipment,
  documents,
  pricing = null,
  pricingHistory = [],
  invoiceReviews = [],
  acid = null,
  journey = null,
  customerJourney = null,
  stageHistory = [],
  financialSummary = null,
  financialStatement = [],
  customsObligations = [],
}: ShipmentDetailsViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clientActionFeedback, setClientActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // File upload states
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocType, setUploadingDocType] = useState<FinalShipmentDocumentType | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

  const handleCustomerApproveEstimate = () => {
    if (!shipment.id || !pricing) return;
    setClientActionFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    if (pricing.updated_at) {
      fd.append("expected_pricing_updated_at", pricing.updated_at);
    }
    startTransition(async () => {
      const res = await customerApproveEstimateAction(fd);
      if (res.success) {
        setClientActionFeedback({ type: "success", text: res.message || "تم اعتماد تقدير السعر بنجاح." });
        router.refresh();
      } else {
        setClientActionFeedback({ type: "error", text: res.error || "فشل اعتماد السعر." });
      }
    });
  };

  const handleCustomerRequestNegotiation = () => {
    if (!shipment.id) return;
    setClientActionFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    startTransition(async () => {
      const res = await customerRequestNegotiationAction(fd);
      if (res.success) {
        setClientActionFeedback({ type: "success", text: res.message || "تم طلب التفاوض على السعر بنجاح." });
        router.refresh();
      } else {
        setClientActionFeedback({ type: "error", text: res.error || "فشل إرسال طلب التفاوض." });
      }
    });
  };

  const handleCustomerApproveFinalPrice = () => {
    if (!shipment.id || !pricing?.final_price) return;
    setClientActionFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("expected_final_price", String(pricing.final_price));
    startTransition(async () => {
      const res = await customerApproveFinalPriceAction(fd);
      if (res.success) {
        setClientActionFeedback({ type: "success", text: res.message || "تم اعتماد السعر النهائي بنجاح." });
        router.refresh();
      } else {
        setClientActionFeedback({ type: "error", text: res.error || "فشل اعتماد السعر النهائي." });
      }
    });
  };

  const handleCustomerResubmitInvoice = (e: React.FormEvent, docId: string) => {
    e.preventDefault();
    if (!shipment.id || !docId || !invoiceFile) return;
    if (invoiceFile.size > MAX_FILE_SIZE) {
      setClientActionFeedback({ type: "error", text: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت)." });
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(invoiceFile.type)) {
      setClientActionFeedback({ type: "error", text: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP)." });
      return;
    }
    setClientActionFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_id", docId);
    fd.append("file", invoiceFile);
    startTransition(async () => {
      const res = await customerResubmitInvoiceAction(fd);
      if (res.success) {
        setClientActionFeedback({ type: "success", text: res.message || "تم رفع الفاتورة المحدثة بنجاح." });
        setInvoiceFile(null);
        if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = "";
        router.refresh();
      } else {
        setClientActionFeedback({ type: "error", text: res.error || "فشل إعادة رفع الفاتورة." });
      }
    });
  };

  const handleCustomerUploadDoc = (file: File, docType: FinalShipmentDocumentType) => {
    if (!shipment.id) return;
    if (file.size > MAX_FILE_SIZE) {
      setClientActionFeedback({ type: "error", text: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت)." });
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setClientActionFeedback({ type: "error", text: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP)." });
      return;
    }
    setClientActionFeedback(null);
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("document_type", docType);
    fd.append("file", file);
    startTransition(async () => {
      const res = await customerUploadShipmentDocumentAction(fd);
      if (res.success) {
        setClientActionFeedback({ type: "success", text: res.message || "تم رفع المستند بنجاح." });
        setUploadingDocType(null);
        router.refresh();
      } else {
        setClientActionFeedback({ type: "error", text: res.error || "فشل رفع المستند." });
      }
    });
  };

  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [selectedStation, setSelectedStation] = useState<CustomerJourneyStation | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "pricing" | "specs" | "activity">("documents");

  const acidRecord = acid || shipment.acid || null;

  // Build the authoritative 10-stage journey synchronized with admin
  const authoritativeJourney = buildAuthoritativeTenStageJourney({
    shipment,
    pricing,
    documents,
    acid: acidRecord,
    journey,
    customerJourney,
    financialSummary,
    invoiceReviews,
    pricingHistory,
    isCustomerView: true,
  });

  // Group into the authoritative 7 customer progress stations
  const customerSevenStations = buildCustomerSevenStationJourney(authoritativeJourney);

  const completedStationsCount = customerSevenStations.completedCount;
  const currentStationObj =
    customerSevenStations.stations.find((st) => st.isCurrent) ||
    customerSevenStations.stations[0];

  const approvedDocsCount = documents.filter((d) => d.status === "approved").length;
  const pendingDocsCount = documents.filter((d) => d.status === "pending" || !d.status).length;
  const revisionDocsCount = documents.filter((d) => d.status === "revision_required").length;

  const handleCopyRef = () => {
    if (!shipment.reference_number) return;
    navigator.clipboard.writeText(shipment.reference_number);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const categoryLabel = journey?.goods_category
    ? GOODS_CATEGORY_LABELS[journey.goods_category]
    : shipment.goods_category
    ? GOODS_CATEGORY_LABELS[shipment.goods_category]
    : "بضائع عامة";

  // Financial summary helper for customer
  const getCustomerPricingInfo = () => {
    const isFinalApproved =
      pricing?.status === "customer_approved" && pricing?.approval_type === "final_fixed";
    const isRangeApprovedOnly =
      pricing?.status === "customer_approved" && pricing?.approval_type === "estimated_range";

    if (pricing?.final_price) {
      return {
        main: `${pricing.final_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`,
        sub: isFinalApproved
          ? "تم اعتماد السعر النهائي ✓"
          : "السعر النهائي بانتظار موافقتك",
        actionNeeded: !isFinalApproved,
      };
    }
    if (pricing?.estimated_min_price && pricing?.estimated_max_price) {
      return {
        main: `${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`,
        sub: isRangeApprovedOnly
          ? "تم اعتماد النطاق التقديري (بانتظار السعر النهائي)"
          : "تقدير تكلفة التخليص المبدئي",
        actionNeeded: false,
      };
    }
    return {
      main: "قيد الدراسة والتسعير",
      sub: "فريق العمل يدرس البنود الجمركية",
      actionNeeded: false,
    };
  };

  const pricingInfo = getCustomerPricingInfo();

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-16 font-sans text-neutral-900" dir="rtl">
      {/* ── Breadcrumb & Top Bar ── */}
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <Link
            href="/my-shipments"
            className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-950 font-medium transition-colors"
          >
            <DynamicIcon name="ArrowRight" className="w-3.5 h-3.5" />
            <span>شحناتي</span>
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="font-mono text-neutral-900 font-bold">
            {shipment.reference_number || shipment.id.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-medium text-neutral-400">
          <span>تتبع الشحنة المباشر</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
      </div>

      {/* ── 1. Shipment Header (Section 3.A) ── */}
      <header className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-7 shadow-sm transition-all hover:shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Reference & Core Meta */}
          <div className="space-y-3.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-950 font-mono tracking-tight">
                {shipment.reference_number || shipment.id.slice(0, 8)}
              </h1>

              <button
                type="button"
                onClick={handleCopyRef}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-950 transition-colors border border-neutral-200/60 focus-visible:ring-2 focus-visible:ring-neutral-950 shrink-0 cursor-pointer"
                title={copiedRef ? "تم نسخ الرقم" : "نسخ رقم الشحنة"}
              >
                <DynamicIcon
                  name={copiedRef ? "Check" : "Copy"}
                  className={`w-4 h-4 ${copiedRef ? "text-emerald-600" : ""}`}
                />
              </button>

              <span className="text-xs font-bold px-3 py-1 rounded-lg bg-neutral-100 text-neutral-800 border border-neutral-200/80">
                {categoryLabel}
              </span>

              <ShipmentStatusBadge status={shipment.status} />

              {shipment.created_at && (
                <span className="text-xs text-neutral-400 flex items-center gap-1.5 mr-1 font-medium">
                  <DynamicIcon name="Calendar" className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{formatDateAr(shipment.created_at)}</span>
                </span>
              )}
            </div>

            {/* Sub Meta: Port & ACID */}
            <div className="flex items-center gap-3 text-xs sm:text-sm text-neutral-500 flex-wrap">
              {shipment.port_of_arrival && (
                <div className="flex items-center gap-1.5">
                  <DynamicIcon name="Ship" className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-neutral-400">ميناء الوصول:</span>
                  <strong className="text-neutral-800">{shipment.port_of_arrival}</strong>
                </div>
              )}

              {acidRecord?.acid_number && (
                <>
                  <span className="text-neutral-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <DynamicIcon name="FileCheck" className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-neutral-400">رقم ACID:</span>
                    <strong className="font-mono text-neutral-800">{acidRecord.acid_number}</strong>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Primary Action & Current Station Callout */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedStation(currentStationObj)}
              className="group inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-neutral-950 hover:bg-neutral-900 text-white font-bold text-sm shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] border border-neutral-800 cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-neutral-950"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#F5C500] animate-pulse shrink-0" />
              <span>متابعة محطة الشحنة ({currentStationObj.number})</span>
              <DynamicIcon
                name="ChevronLeft"
                className="w-4 h-4 text-[#F5C500] group-hover:-translate-x-0.5 transition-transform shrink-0"
              />
            </button>

            <span className="text-[11px] text-neutral-400 text-center lg:text-left">
              المحطة الحالية: <strong className="text-neutral-800">{currentStationObj.title}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* ── 2. Shipment Summary Cards (Section 3.B) ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="ملخص مؤشرات الشحنة">
        {/* Card 1: Current Progress Station */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-5 shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between min-w-0 h-full">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2.5">
              <span className="text-xs font-bold text-neutral-500">المحطة الحالية</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/60 flex items-center justify-center shrink-0">
                <DynamicIcon name="Navigation" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm sm:text-base font-black text-neutral-950 truncate" title={currentStationObj.title}>
              {currentStationObj.number} — {currentStationObj.title}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 truncate">
            {completedStationsCount === 7 ? "اكتملت جميع المحطات بنجاح ✓" : `متبقي ${7 - completedStationsCount} محطات للاكتمال`}
          </p>
        </div>

        {/* Card 2: Cargo & Port */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-5 shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between min-w-0 h-full">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2.5">
              <span className="text-xs font-bold text-neutral-500">التصنيف والميناء</span>
              <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 border border-neutral-200/60 flex items-center justify-center shrink-0">
                <DynamicIcon name="Ship" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm sm:text-base font-black text-neutral-950 truncate">
              {shipment.port_of_arrival || "ميناء الوصول غير محدد"}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 truncate">
            {categoryLabel} • {shipment.country_of_origin ? `المنشأ: ${shipment.country_of_origin}` : "المنشأ غير مسجل"}
          </p>
        </div>

        {/* Card 3: Pricing */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-5 shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between min-w-0 h-full">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2.5">
              <span className="text-xs font-bold text-neutral-500">الاتفاق المالي</span>
              <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 border border-neutral-200/60 flex items-center justify-center shrink-0">
                <DynamicIcon name="Receipt" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm sm:text-base font-black text-neutral-950 font-mono truncate" title={pricingInfo.main}>
              {pricingInfo.main}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 truncate">
            {pricingInfo.sub}
          </p>
        </div>

        {/* Card 4: ACID & Documents */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-5 shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between min-w-0 h-full">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2.5">
              <span className="text-xs font-bold text-neutral-500">رقم ACID والمستندات</span>
              <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 border border-neutral-200/60 flex items-center justify-center shrink-0">
                <DynamicIcon name="FileCheck" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm sm:text-base font-black font-mono text-neutral-950 truncate">
              {acidRecord?.acid_number || "قيد الإصدار"}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 truncate">
            {approvedDocsCount} من أصل {documents.length} مستندات معتمدة
          </p>
        </div>
      </section>

      {/* ── 2.5 Customer Action Callout (Section 6.2) ── */}
      {customerSevenStations.primaryCustomerAction && (
        <section className="bg-neutral-950 text-white border-2 border-neutral-900 rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-[#F5C500] via-yellow-400 to-[#F5C500]" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F5C500] animate-pulse shrink-0" />
                <h3 className="text-base sm:text-lg font-black text-white">
                  {customerSevenStations.primaryCustomerAction.title}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-2xl">
                {customerSevenStations.primaryCustomerAction.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (customerSevenStations.primaryCustomerAction?.targetTab) {
                  setActiveTab(customerSevenStations.primaryCustomerAction.targetTab);
                }
              }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#F5C500] hover:bg-yellow-400 text-neutral-950 font-black text-xs sm:text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{customerSevenStations.primaryCustomerAction.buttonLabel}</span>
              <DynamicIcon name="ChevronLeft" size={16} />
            </button>
          </div>
        </section>
      )}

      {/* ── 3. Customs Clearance Journey (Section 6.1 — 7 Customer Progress Stations) ── */}
      <section className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-sm">
        <CustomerSevenStationTimeline
          journey={customerSevenStations}
          onSelectStation={(st) => setSelectedStation(st)}
          selectedStationNumber={selectedStation?.number}
        />
      </section>

      {/* ── 4. Subordinate Information Hub (Sections 3.E, 3.F, 3.G) ── */}
      <section className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
        {/* Modern Tab Bar */}
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "documents"
                ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
                : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
          >
            <DynamicIcon name="FileText" className="w-4 h-4" />
            <span>مستندات الشحنة</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                activeTab === "documents" ? "bg-neutral-800 text-[#F5C500]" : "bg-neutral-200 text-neutral-700"
              }`}
            >
              {documents.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pricing")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "pricing"
                ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
                : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
          >
            <DynamicIcon name="Receipt" className="w-4 h-4" />
            <span>التسعير والفواتير</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("specs")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "specs"
                ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
                : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
          >
            <DynamicIcon name="Package" className="w-4 h-4" />
            <span>بيانات ومواصفات الشحنة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "activity"
                ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
                : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
          >
            <DynamicIcon name="History" className="w-4 h-4" />
            <span>سجل مراحل الشحنة</span>
          </button>
        </div>

        {/* Tab 1 Content: Customer Documents (Section 3.E) */}
        {activeTab === "documents" && (
          <div className="space-y-6">
            {/* Hidden file input for uploading final shipment documents */}
            <input
              type="file"
              ref={docFileInputRef}
              accept=".pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && uploadingDocType) {
                  handleCustomerUploadDoc(file, uploadingDocType);
                }
                if (docFileInputRef.current) docFileInputRef.current.value = "";
              }}
            />

            {/* Document Action Feedback */}
            {clientActionFeedback && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  clientActionFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-rose-50 text-rose-800 border-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name={clientActionFeedback.type === "success" ? "CheckCircle" : "AlertTriangle"}
                    className="w-4 h-4 shrink-0"
                  />
                  <span>{clientActionFeedback.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setClientActionFeedback(null)}
                  className="text-neutral-500 hover:text-neutral-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Section A: Preliminary Invoice Revision Action (if required) */}
            {(() => {
              const prelimDoc = documents.find((d) =>
                [
                  "commercial_invoice",
                  "proforma_invoice",
                  "invoice",
                  "فاتورة مبدئية",
                  "الفاتورة التجارية",
                ].includes(d.document_type || ""),
              );

              if (prelimDoc?.status === "revision_required" || shipment.status === "invoice_revision_required") {
                return (
                  <div className="p-4 bg-rose-50/90 border border-rose-200 rounded-2xl space-y-3">
                    <div className="flex items-start gap-2.5">
                      <DynamicIcon name="AlertCircle" className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-sm font-bold text-rose-950 block">مطلوب تصحيح الفاتورة المبدئية</strong>
                        <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                          ملاحظات إدارة التخليص: <span className="font-semibold">{prelimDoc?.review_note || "يرجى تعديل الفاتورة المبدئية وإعادة رفعها لاستكمال إجراءات نافذة."}</span>
                        </p>
                      </div>
                    </div>

                    {prelimDoc && (
                      <form
                        onSubmit={(e) => handleCustomerResubmitInvoice(e, prelimDoc.id)}
                        className="pt-3 border-t border-rose-200/80 flex flex-col sm:flex-row sm:items-center gap-3"
                      >
                        <input
                          type="file"
                          ref={invoiceFileInputRef}
                          accept=".pdf,image/jpeg,image/png,image/webp"
                          required
                          onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                          className="text-xs p-2 rounded-xl border border-neutral-300 bg-white flex-1"
                        />
                        <button
                          type="submit"
                          disabled={isPending || !invoiceFile}
                          className="px-5 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-neutral-950"
                        >
                          <DynamicIcon name="Upload" className="w-3.5 h-3.5" />
                          <span>{isPending ? "جاري الرفع..." : "إعادة رفع الفاتورة المحدثة"}</span>
                        </button>
                      </form>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {/* Section B: 4 Mandatory Shipment Documents Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <DynamicIcon name="FileCheck" className="w-4 h-4 text-[#F5C500]" />
                    <span>المستندات الجمركية الأربعة الإلزامية للشحن</span>
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    الحد الأقصى لكل ملف: 20 ميجابايت (صيغ PDF أو صور معتمدة)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FINAL_SHIPMENT_DOCUMENT_TYPES.map((docType) => {
                  const label = FINAL_DOCUMENT_TYPE_LABELS[docType];
                  const doc = documents.find((d) => matchFinalDocumentType(d.document_type) === docType);
                  const isApproved = doc?.status === "approved";
                  const isRevision = doc?.status === "revision_required";
                  const isPendingDoc = doc?.status === "pending";

                  return (
                    <div
                      key={docType}
                      className="p-4 bg-white border border-neutral-200/90 rounded-2xl flex flex-col justify-between gap-3 shadow-xs hover:border-neutral-300 transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="text-xs font-bold text-neutral-900">{label}</h5>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-medium shrink-0 ${
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
                              ? "مطلوب تعديل"
                              : isPendingDoc
                              ? "قيد المراجعة"
                              : "مفقود"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-1 truncate">
                          {doc ? doc.file_name : "يرجى رفع المستند لإتمام التخليص"}
                        </p>
                        {isRevision && doc?.review_note && (
                          <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-900">
                            <strong>ملاحظة التعديل: </strong>{doc.review_note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-neutral-100 pt-2.5 text-xs">
                        {doc && (
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 font-bold text-xs transition-colors cursor-pointer"
                          >
                            <DynamicIcon name="Eye" className="w-3.5 h-3.5 text-neutral-500" />
                            <span>معاينة</span>
                          </button>
                        )}

                        {/* Upload or replace trigger: blocked if approved */}
                        {!isApproved ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setUploadingDocType(docType);
                              docFileInputRef.current?.click();
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                              isRevision
                                ? "bg-rose-600 hover:bg-rose-700 text-white"
                                : doc
                                ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-800"
                                : "bg-[#F5C500] hover:bg-[#e0b400] text-neutral-950"
                            }`}
                          >
                            <DynamicIcon name="Upload" className="w-3.5 h-3.5" />
                            <span>{doc ? "استبدال الملف" : "رفع المستند"}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-700 font-medium">مستند معتمد رسمياً</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section C: Complete Documents Archive */}
            <div className="space-y-3 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-neutral-800">كافة ملفات ومستندات الشحنة المسجلة</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    إجمالي المستندات: {documents.length} ملف
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>معتمد ({approvedDocsCount})</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>قيد التدقيق ({pendingDocsCount})</span>
                  </span>
                  {revisionDocsCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span>مطلوب تعديل ({revisionDocsCount})</span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                  <DynamicIcon name="FileText" className="w-8 h-8 text-neutral-300 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-neutral-600">لم يتم رفع أي مستندات إضافية</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {documents.map((doc) => {
                    const isApproved = doc.status === "approved";
                    const isRevisionReq = doc.status === "revision_required";

                    return (
                      <div
                        key={doc.id}
                        className="border border-neutral-200/90 rounded-2xl p-4 bg-white hover:border-neutral-300 transition-all shadow-xs flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isApproved
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : isRevisionReq
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-neutral-100 text-neutral-700"
                              }`}
                            >
                              <DynamicIcon name="FileText" className="w-5 h-5" />
                            </div>

                            <div className="min-w-0">
                              <h5 className="text-xs sm:text-sm font-bold text-neutral-900 truncate" title={doc.title}>
                                {doc.title || doc.document_type || "مستند"}
                              </h5>
                              <p className="text-[11px] text-neutral-500 mt-0.5">
                                {doc.document_type || "مستند عام"}
                                {doc.created_at && ` • ${formatDateAr(doc.created_at)}`}
                              </p>
                            </div>
                          </div>

                          {renderDocumentStatusBadge(doc.status)}
                        </div>

                        {/* Card Footer Actions */}
                        <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-xs">
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {doc.file_size ? formatFileSize(doc.file_size) : "ملف موثق"}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold transition-colors cursor-pointer text-xs focus-visible:ring-2 focus-visible:ring-neutral-950"
                            >
                              <DynamicIcon name="Eye" className="w-3.5 h-3.5" />
                              <span>معاينة</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2 Content: Customer Pricing (Section 3.F) */}
        {activeTab === "pricing" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Estimated Pricing Card */}
              <div className="border border-neutral-200/90 rounded-2xl p-5 bg-neutral-50/50 space-y-2">
                <span className="text-xs font-bold text-neutral-500 block">التقدير المالي المبدئي</span>
                <div className="text-lg font-black text-neutral-950 font-mono">
                  {pricing?.estimated_min_price && pricing?.estimated_max_price
                    ? `${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`
                    : "قيد الدراسة"}
                </div>
                <p className="text-xs text-neutral-500">
                  {pricing?.created_at
                    ? `تاريخ التقديم: ${formatDateAr(pricing.created_at)}`
                    : "سيتم إشعارك فور جاهزية التقدير"}
                </p>
              </div>

              {/* Final Agreed Price Card */}
              <div className="border border-neutral-200/90 rounded-2xl p-5 bg-neutral-50/50 space-y-2">
                <span className="text-xs font-bold text-neutral-500 block">السعر النهائي المتفق عليه</span>
                <div className="text-lg font-black text-neutral-950 font-mono">
                  {pricing?.final_price
                    ? `${pricing.final_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`
                    : "لم يحدد بعد"}
                </div>
                <p className="text-xs text-neutral-500">
                  {pricing?.status === "customer_approved" &&
                  pricing?.approval_type === "final_fixed" &&
                  pricing?.customer_approved_at
                    ? `تم اعتمادك في: ${formatDateAr(pricing.customer_approved_at)}`
                    : pricing?.final_price
                    ? "بانتظار موافقتك"
                    : "يتم تحديده بعد الاتفاق المالي"}
                </p>
              </div>

              {/* Proforma Invoice Status */}
              <div className="border border-neutral-200/90 rounded-2xl p-5 bg-neutral-50/50 space-y-2">
                <span className="text-xs font-bold text-neutral-500 block">حالة الفاتورة المبدئية</span>
                <div className="text-lg font-black text-neutral-950 font-mono">
                  {invoiceReviews.length > 0 && invoiceReviews[0].action === "approved"
                    ? "معتمدة بنجاح"
                    : "قيد المراجعة"}
                </div>
                <p className="text-xs text-neutral-500">
                  مطلوبة لإصدار رقم ACID عبر نافذة
                </p>
              </div>
            </div>

            {/* Feedback Alert for Customer Actions */}
            {clientActionFeedback && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  clientActionFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-rose-50 text-rose-800 border-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name={clientActionFeedback.type === "success" ? "CheckCircle" : "AlertTriangle"}
                    className="w-4 h-4 shrink-0"
                  />
                  <span>{clientActionFeedback.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setClientActionFeedback(null)}
                  className="text-neutral-500 hover:text-neutral-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Direct Customer Pricing Actions */}
            {pricing?.status === "customer_approved" && pricing?.approval_type === "final_fixed" ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name="CheckCircle" className="w-5 h-5 text-emerald-600 shrink-0" />
                  <strong className="text-sm font-bold">تمت الموافقة على السعر النهائي بنجاح</strong>
                </div>
                <p className="text-emerald-800">
                  تم اعتماد التكلفة النهائية لأتعاب التخليص الجمركي بمبلغ {pricing?.final_price?.toLocaleString("ar-EG")} {pricing?.currency || "EGP"}{pricing?.customer_approved_at ? ` بتاريخ ${formatDateAr(pricing.customer_approved_at)}` : ""}.
                </p>
              </div>
            ) : pricing?.status === "final_proposed" || pricing?.final_price || shipment.status === "price_agreed" ? (
              /* State 2: Final Agreed Price Awaiting Customer Approval */
              <div className="p-5 rounded-2xl bg-blue-50/80 border border-blue-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                    <DynamicIcon name="Receipt" className="w-5 h-5 text-blue-700" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      تم تحديد السعر النهائي
                    </span>
                    <h4 className="text-sm font-bold text-blue-950 mt-1">
                      مطلوب موافقتك على السعر النهائي المتفق عليه
                    </h4>
                    <p className="text-xs text-blue-800 mt-0.5">
                      القيمة الإجمالية المتفق عليها: <strong className="font-mono text-neutral-950">{pricing?.final_price?.toLocaleString("ar-EG")} {pricing?.currency || "EGP"}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleCustomerApproveFinalPrice}
                  className="px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold text-xs shrink-0 transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-neutral-950"
                >
                  <DynamicIcon name="Check" className="w-4 h-4" />
                  <span>{isPending ? "جاري الاعتماد..." : "اعتماد وموافقة على السعر النهائي"}</span>
                </button>
              </div>
            ) : pricing?.status === "customer_approved" && pricing?.approval_type === "estimated_range" ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name="CheckCircle" className="w-5 h-5 text-emerald-600 shrink-0" />
                  <strong className="text-sm font-bold">تمت الموافقة على النطاق التقديري المبدئي</strong>
                </div>
                <p className="text-emerald-800">
                  النطاق المعتمد: {pricing.estimated_min_price.toLocaleString("ar-EG")} - {pricing.estimated_max_price.toLocaleString("ar-EG")} {pricing.currency || "EGP"}. سيتم إرسال السعر النهائي الثابت لاعتماده قبل مرحلة التسوية المالية.
                </p>
              </div>
            ) : pricing?.status === "negotiation_requested" || shipment.status === "negotiation" ? (
              /* State 3: Negotiation Requested */
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name="PhoneCall" className="w-5 h-5 text-amber-700 shrink-0" />
                  <strong className="text-sm font-bold">طلب التفاوض على السعر قيد المتابعة</strong>
                </div>
                <p className="text-amber-800 leading-relaxed">
                  تم استلام طلبكم للتفاوض على السعر المبدئي. سيقوم مسؤول التخليص في OUT بالتواصل معكم هاتفياً للاتفاق على السعر النهائي وتسجيله.
                </p>
              </div>
            ) : pricing?.estimated_min_price ? (
              /* State 4: Initial Estimate Offered -> Customer Can Approve or Request Negotiation */
              <div className="p-5 rounded-2xl bg-yellow-50/80 border border-yellow-300 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-100 text-yellow-800 border border-yellow-300 flex items-center justify-center shrink-0 mt-0.5">
                    <DynamicIcon name="DollarSign" className="w-5 h-5 text-yellow-700" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded border border-yellow-300">
                      في انتظار موافقة العميل
                    </span>
                    <h4 className="text-sm font-bold text-neutral-900 mt-1">
                      عرض السعر المالي المبدئي متاح للاعتماد
                    </h4>
                    <p className="text-xs text-neutral-700 mt-0.5">
                      النطاق التقديري: <strong className="font-mono text-neutral-950">{pricing.estimated_min_price.toLocaleString("ar-EG")} - {pricing.estimated_max_price?.toLocaleString("ar-EG")} {pricing.currency || "EGP"}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleCustomerApproveEstimate}
                    className="px-4 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold text-xs transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-neutral-950"
                  >
                    <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                    <span>{isPending ? "جاري الاعتماد..." : "الموافقة على التقدير"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleCustomerRequestNegotiation}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-neutral-800 font-bold text-xs border border-neutral-300 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-neutral-950"
                  >
                    <DynamicIcon name="MessageSquare" className="w-3.5 h-3.5 text-neutral-500" />
                    <span>طلب التفاوض</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Live Financial Ledger Breakdown (Migration 0019 Customer View — Track A & Track B) */}
            {(financialSummary || customsObligations.length > 0 || financialStatement.length > 0) && (
              <div className="border-t border-neutral-200/80 pt-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-neutral-950 flex items-center gap-2">
                      <DynamicIcon name="CreditCard" className="w-4 h-4 text-[#F5C500]" />
                      <span>كشف المستحقات المالية والرسوم الجمركية</span>
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      بيان تفصيلي معتمد للرسوم الجمركية الرسمية وحساب شركة OUT بناءً على القيود المؤكدة
                    </p>
                  </div>
                  {financialSummary && (
                    <span
                      className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                        financialSummary.is_financial_settlement_complete
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-yellow-50 text-neutral-900 border-yellow-300"
                      }`}
                    >
                      {financialSummary.is_financial_settlement_complete
                        ? "التسوية المالية مكتملة ✓"
                        : "التسوية المالية جارية"}
                    </span>
                  )}
                </div>

                {financialSummary && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Track A: Official Customs Obligations */}
                    <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-200/90 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-neutral-900">أولاً: المطالبات والرسوم الجمركية</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            financialSummary.is_customs_coverage_complete
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {financialSummary.is_customs_coverage_complete ? "مغطاة بالكامل" : "قيد التسوية"}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">إجمالي المطالبات الجمركية المقررة</span>
                          <strong className="font-mono text-neutral-950">
                            {financialSummary.assessed_customs_obligation.toLocaleString("ar-EG")} ج.م
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-600">سداد مباشر من العميل للجمارك</span>
                          <strong className="font-mono text-neutral-950">
                            {financialSummary.verified_direct_customs_payments.toLocaleString("ar-EG")} ج.م
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-600">سداد جمركي عبر شركة OUT</span>
                          <strong className="font-mono text-neutral-950">
                            {financialSummary.out_customs_disbursements.toLocaleString("ar-EG")} ج.م
                          </strong>
                        </div>
                        {financialSummary.pending_direct_customs_payments > 0 && (
                          <div className="flex justify-between text-amber-800">
                            <span>إشعارات سداد مباشر بانتظار التحقق</span>
                            <strong className="font-mono">
                              {financialSummary.pending_direct_customs_payments.toLocaleString("ar-EG")} ج.م
                            </strong>
                          </div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-neutral-200 font-bold">
                          <span className="text-neutral-900">المتبقي على المطالبات الجمركية</span>
                          <span className="font-mono text-neutral-950">
                            {financialSummary.remaining_customs_obligation.toLocaleString("ar-EG")} ج.م
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Track B: OUT Receivable & Collections */}
                    <div className="p-5 rounded-2xl bg-neutral-950 text-white border border-neutral-900 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#F5C500]">ثانياً: مستحقات شركة OUT والتحصيل</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700">
                          {financialSummary.outstanding_balance_to_out === 0
                            ? "مسوى بالكامل"
                            : financialSummary.outstanding_balance_to_out < 0
                            ? "رصيد دائن زائد"
                            : "مستحق التحصيل"}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-neutral-300">أتعاب التخليص (من السعر النهائي المعتمد)</span>
                          <strong className="font-mono text-white">
                            {financialSummary.confirmed_out_service_fee.toLocaleString("ar-EG")} ج.م
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-300">مصروفات ورسوم إضافية محمّلة</span>
                          <strong className="font-mono text-white">
                            {(
                              financialSummary.billable_out_disbursements +
                              financialSummary.other_approved_customer_charges
                            ).toLocaleString("ar-EG")}{" "}
                            ج.م
                          </strong>
                        </div>
                        {financialSummary.approved_credits > 0 && (
                          <div className="flex justify-between text-emerald-300">
                            <span>خصومات وتسويات دائنة</span>
                            <strong className="font-mono">
                              -{financialSummary.approved_credits.toLocaleString("ar-EG")} ج.م
                            </strong>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-neutral-300">إجمالي المستحق لشركة OUT</span>
                          <strong className="font-mono text-white">
                            {financialSummary.total_customer_receivable_to_out.toLocaleString("ar-EG")} ج.م
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-300">إجمالي المدفوع لشركة OUT</span>
                          <strong className="font-mono text-emerald-300">
                            {financialSummary.total_received_by_out.toLocaleString("ar-EG")} ج.م
                          </strong>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-neutral-800 font-black">
                          <span className="text-[#F5C500]">الرصيد المتبقي لشركة OUT</span>
                          <span className="font-mono text-[#F5C500]">
                            {financialSummary.outstanding_balance_to_out.toLocaleString("ar-EG")} ج.م
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customs Obligations List */}
                {customsObligations.length > 0 && (
                  <div className="space-y-2.5">
                    <h5 className="text-xs font-bold text-neutral-800">تفاصيل المطالبات الجمركية</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {customsObligations.map((ob) => (
                        <div
                          key={ob.id}
                          className="p-3.5 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-neutral-900 truncate">
                              {FINANCIAL_OBLIGATION_CLAIM_TYPE_LABELS[ob.claim_type] || ob.claim_type}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              {ob.customs_claim_number ? `مرجع: ${ob.customs_claim_number} • ` : ""}
                              {formatDateAr(ob.assessed_at)}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className="font-mono font-black text-neutral-950">
                              {ob.assessed_amount.toLocaleString("ar-EG")} {ob.currency || "EGP"}
                            </div>
                            <span className="text-[10px] font-bold text-neutral-600">
                              {FINANCIAL_OBLIGATION_STATUS_LABELS[ob.status] || ob.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer-Safe Financial Ledger Statement */}
                {financialStatement.length > 0 && (
                  <div className="space-y-2.5">
                    <h5 className="text-xs font-bold text-neutral-800">سجل الحركات المالية المعتمدة</h5>
                    <div className="space-y-2">
                      {financialStatement.map((tx) => (
                        <div
                          key={tx.transaction_id}
                          className="p-3.5 rounded-xl bg-white border border-neutral-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-neutral-900">
                                {FINANCIAL_TRANSACTION_CATEGORY_LABELS[tx.entry_category] || tx.entry_category}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                                {FINANCIAL_TRANSACTION_TYPE_LABELS[tx.entry_type] || tx.entry_type}
                              </span>
                              {tx.direction === -1 && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                                  قيد عكسي
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {tx.payment_method
                                ? `${FINANCIAL_PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method} • `
                                : ""}
                              {tx.reference_number ? `مرجع: ${tx.reference_number} • ` : ""}
                              {formatDateAr(tx.transaction_date)}
                            </div>
                            {tx.description && (
                              <p className="text-[11px] text-neutral-600">{tx.description}</p>
                            )}
                          </div>
                          <div className="text-left shrink-0">
                            <span
                              className={`font-mono font-black text-sm ${
                                tx.direction === -1 ? "text-amber-700" : "text-neutral-950"
                              }`}
                            >
                              {tx.direction === -1 ? "-" : ""}
                              {tx.amount.toLocaleString("ar-EG")} {tx.currency || "EGP"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3 Content: Customer Logistics Specs (Section 3.G) */}
        {activeTab === "specs" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 space-y-1">
              <span className="text-neutral-400 block font-medium">بلد المنشأ</span>
              <strong className="text-neutral-900 text-sm font-bold block">
                {shipment.country_of_origin || "غير مسجل"}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 space-y-1">
              <span className="text-neutral-400 block font-medium">ميناء الوصول الجمركي</span>
              <strong className="text-neutral-900 text-sm font-bold block">
                {shipment.port_of_arrival || "غير مسجل"}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 space-y-1">
              <span className="text-neutral-400 block font-medium">اسم المورد / الشاحن</span>
              <strong className="text-neutral-900 text-sm font-bold block">
                {shipment.supplier_name || "غير مسجل"}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 space-y-1">
              <span className="text-neutral-400 block font-medium">عدد الطرود ونوع التعبئة</span>
              <strong className="text-neutral-900 text-sm font-bold block">
                {shipment.packages_count ? `${shipment.packages_count} ${shipment.package_type || "طرد"}` : "غير محدد"}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 space-y-1">
              <span className="text-neutral-400 block font-medium">الوزن الإجمالي القائم</span>
              <strong className="text-neutral-900 text-sm font-bold block">
                {shipment.gross_weight ? `${shipment.gross_weight.toLocaleString("ar-EG")} كجم` : "غير مسجل"}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 space-y-1">
              <span className="text-neutral-400 block font-medium">تصنيف البضاعة</span>
              <strong className="text-neutral-900 text-sm font-bold block">
                {categoryLabel}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 sm:col-span-2 lg:col-span-3 space-y-1">
              <span className="text-neutral-400 block font-medium">وصف البضائع</span>
              <p className="text-neutral-800 leading-relaxed text-sm">
                {shipment.goods_description || "لا يوجد وصف مدخل لهذه الشحنة."}
              </p>
            </div>
          </div>
        )}

        {/* Tab 4 Content: Customer Activity Timeline (Section 3.G) */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-900">سجل مراحل الشحنة</h3>

            {stageHistory.length === 0 ? (
              <div className="text-center py-8 border border-neutral-100 rounded-2xl bg-neutral-50 text-neutral-500 text-xs">
                لا توجد سجلات مراحل مؤرشفة حتى الآن.
              </div>
            ) : (
              <div className="relative space-y-3">
                {stageHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-neutral-200/80 bg-neutral-50/50 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-neutral-200/70 text-neutral-800 flex items-center justify-center font-bold shrink-0">
                        <DynamicIcon name="History" className="w-4 h-4" />
                      </div>
                      <div>
                        <strong className="text-neutral-900 block font-bold">{item.action}</strong>
                        {item.note && (
                          <span className="text-neutral-500 text-[11px]">
                            {item.note}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                      {formatDateAr(item.performed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 5. Focused Customer Station Popup (Section 6.1) ── */}
      {selectedStation && (
        <CustomerStageDetailModal
          isOpen={true}
          onClose={() => setSelectedStation(null)}
          shipment={shipment}
          station={selectedStation}
          documents={documents}
          pricing={pricing}
          acid={acidRecord}
          financialSummary={financialSummary}
          financialStatement={financialStatement}
          customsObligations={customsObligations}
          onPreviewDocument={(doc) => setPreviewDoc(doc)}
          onActionClick={(tab) => {
            setSelectedStation(null);
            setActiveTab(tab);
          }}
        />
      )}

      {/* ── 6. Document Preview Modal ── */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={true}
          onClose={() => setPreviewDoc(null)}
          document={previewDoc}
        />
      )}
    </div>
  );
}

function renderDocumentStatusBadge(status?: string | null) {
  switch (status) {
    case "approved":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
          <DynamicIcon name="Check" className="w-3 h-3 text-emerald-700" />
          <span>معتمد</span>
        </span>
      );
    case "rejected":
    case "revision_required":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
          <DynamicIcon name="AlertCircle" className="w-3 h-3 text-rose-700" />
          <span>مطلوب تعديل</span>
        </span>
      );
    case "pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
          <DynamicIcon name="Clock" className="w-3 h-3 text-amber-700" />
          <span>قيد المراجعة</span>
        </span>
      );
  }
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
