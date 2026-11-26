"use client";

/**
 * Admin Shipment Details Component — Visual Redesign
 *
 * High-End Logistics & Customs Clearance SaaS Dashboard:
 * 1. Back Navigation & Breadcrumb Trail.
 * 2. Visual Header (Section 3.A): Prominent Reference Number, Copy Action,
 *    Role-Based Status Badges, Customer & Company Links, and Active Stage Quick CTA.
 * 3. Responsive 4-Card KPI Summary Grid (Section 3.B):
 *    - Current Stage & SLA Timing
 *    - Classification & Port of Arrival
 *    - Pricing & Financial Agreement
 *    - ACID Number & Documents Count
 * 4. Customs Clearance Journey (Section 3.C — The Visual Centerpiece):
 *    - 7 Canonical Stages with Connected Stepper Timeline & Progress Bar
 *    - Distinctive styling for Active/Current (OUT Black & Yellow), Completed (Emerald Check),
 *      Upcoming (Muted Neutral), and Needs Correction / Blocked (Alerts)
 *    - Click-to-open focused UnifiedStageModal (Section 3.D)
 * 5. Subordinate Information Hub (Sections 3.E, 3.F, 3.G):
 *    - Segmented Tab Navigation:
 *      * Documents Card Grid with Status & Preview/Approve Triggers
 *      * Pricing & Invoices Breakdown Cards
 *      * Technical Logistics & Cargo Specifications
 *      * Chronological Audit & Activity Timeline
 */

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { ShipmentStatusBadge } from "./shipment-status-badge";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { TenStageTimeline } from "./ten-stage-timeline";
import { AdminStageDetailModal } from "./admin-stage-detail-modal";
import { buildAuthoritativeTenStageJourney } from "@/lib/shipments/canonical-journey-adapter";
import { GOODS_CATEGORY_LABELS } from "@/types/journey";
import { formatDateAr } from "@/lib/utils";
import {
  submitPriceEstimateAction,
  adminSetFinalPriceAction,
} from "@/lib/shipments/pricing-actions";
import type { AuthoritativeJourneyStage } from "@/types/journey";
import type {
  Shipment,
  Company,
  Customer,
  DocumentItem,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  ShipmentInvoiceReview,
  ShipmentAcid,
  ShipmentAcidHistoryItem,
  ShipmentDocumentReviewItem,
  ShipmentStageHistoryItem,
  ShipmentExternalOperation,
  ShipmentCustomsJourney,
} from "@/types";

interface AdminShipmentDetailsProps {
  shipment: Shipment;
  company: Company | null;
  customer: Customer | null;
  documents: DocumentItem[];
  pricing?: ShipmentPricing | null;
  pricingHistory?: ShipmentPricingHistoryItem[];
  invoiceReviews?: ShipmentInvoiceReview[];
  acid?: ShipmentAcid | null;
  acidHistory?: ShipmentAcidHistoryItem[];
  documentReviews?: ShipmentDocumentReviewItem[];
  stageHistory?: ShipmentStageHistoryItem[];
  externalOperations?: ShipmentExternalOperation[];
  journey?: ShipmentCustomsJourney | null;
}

export function AdminShipmentDetails({
  shipment,
  company,
  customer,
  documents,
  pricing = null,
  pricingHistory = [],
  invoiceReviews = [],
  acid = null,
  acidHistory = [],
  documentReviews = [],
  stageHistory = [],
  journey = null,
}: AdminShipmentDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pricingFeedback, setPricingFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
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

  const handleAdminSubmitEstimate = (e: React.FormEvent) => {
    e.preventDefault();
    setPricingFeedback(null);
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (isNaN(min) || min < 0) {
      setPricingFeedback({ type: "error", text: "الحد الأدنى للتقدير يجب أن يكون رقماً موجباً أو صفراً." });
      return;
    }
    if (isNaN(max) || max < 0) {
      setPricingFeedback({ type: "error", text: "الحد الأقصى للتقدير يجب أن يكون رقماً موجباً أو صفراً." });
      return;
    }
    if (min > max) {
      setPricingFeedback({ type: "error", text: "الحد الأدنى للتقدير لا يمكن أن يتجاوز الحد الأقصى." });
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
        setPricingFeedback({ type: "success", text: res.message || "تم حفظ وتقديم تقدير السعر للعميل بنجاح." });
        setIsEditingEstimate(false);
        router.refresh();
      } else {
        setPricingFeedback({ type: "error", text: res.error || "فشل تقديم تقدير السعر." });
      }
    });
  };

  const handleAdminSetFinalPrice = (e: React.FormEvent) => {
    e.preventDefault();
    setPricingFeedback(null);
    const val = parseFloat(finalPriceInput);
    if (isNaN(val) || val <= 0) {
      setPricingFeedback({ type: "error", text: "يرجى إدخال سعر نهائي صالح أكبر من صفر." });
      return;
    }
    const fd = new FormData();
    fd.append("shipment_id", shipment.id);
    fd.append("final_price", finalPriceInput);

    startTransition(async () => {
      const res = await adminSetFinalPriceAction(fd);
      if (res.success) {
        setPricingFeedback({ type: "success", text: res.message || "تم تسجيل السعر النهائي المتفق عليه بنجاح." });
        router.refresh();
      } else {
        setPricingFeedback({ type: "error", text: res.error || "فشل تسجيل السعر النهائي." });
      }
    });
  };

  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [selectedStage, setSelectedStage] = useState<AuthoritativeJourneyStage | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "pricing" | "specs" | "activity">("documents");

  const acidRecord = acid || shipment.acid || null;

  // Build the Authoritative 10-Stage Journey (Package 6 Business Reference)
  const authoritativeJourney = buildAuthoritativeTenStageJourney({
    shipment,
    pricing,
    documents,
    acid: acidRecord,
    journey,
    invoiceReviews,
    pricingHistory,
    acidHistory,
    documentReviews,
    stageHistory,
    isCustomerView: false,
  });

  // Calculate high-level summary metrics
  const completedStagesCount = authoritativeJourney.completedCount;
  const currentStageObj =
    authoritativeJourney.stages.find((st) => st.isCurrent) ||
    authoritativeJourney.stages[0];

  const opAction = authoritativeJourney.currentOperationalAction;

  const handleOperationalAction = () => {
    if (!opAction) return;
    if (opAction.actionType === "open_pricing_tab") {
      setActiveTab("pricing");
      const el = document.getElementById("subordinate-info-hub");
      el?.scrollIntoView({ behavior: "smooth" });
    } else if (opAction.actionType === "open_documents_tab") {
      setActiveTab("documents");
      const el = document.getElementById("subordinate-info-hub");
      el?.scrollIntoView({ behavior: "smooth" });
    } else {
      const st = authoritativeJourney.stages.find((s) => s.number === opAction.stageNumber);
      if (st) setSelectedStage(st);
    }
  };

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

  // Financial status helper
  const getPricingStatusText = () => {
    if (!pricing && pricingHistory.length === 0) {
      return {
        main: "متابعة تشغيلية",
        sub: "التفاصيل المالية مقصورة على الإدارة",
        isReady: false,
      };
    }
    if (pricing?.final_price) {
      return {
        main: `${pricing.final_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`,
        sub: pricing.customer_approved_at ? "معتمد نهائياً من العميل ✓" : "السعر النهائي محدد",
        isReady: true,
      };
    }
    if (pricing?.estimated_min_price && pricing?.estimated_max_price) {
      return {
        main: `${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`,
        sub: "تقدير مبدئي مقدم",
        isReady: true,
      };
    }
    return {
      main: "قيد دراسة التكاليف",
      sub: "بانتظار تقديم التسعير المبدئي",
      isReady: false,
    };
  };

  const pricingStatusInfo = getPricingStatusText();

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-16 font-sans text-neutral-900" dir="rtl">
      {/* ── Breadcrumb & Top Bar ── */}
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <Link
            href="/shipments"
            className="flex items-center gap-1.5 text-neutral-600 hover:text-neutral-950 font-medium transition-colors"
          >
            <DynamicIcon name="ArrowRight" className="w-3.5 h-3.5" />
            <span>الشحنات</span>
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="font-mono text-neutral-900 font-bold">
            {shipment.reference_number || shipment.id.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-medium text-neutral-400">
          <span>نظام التخليص الجمركي الموحد</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
      </div>

      {/* ── 1. Shipment Header (Section 3.A) ── */}
      <header className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-7 shadow-sm transition-all hover:shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Reference, Meta Chips & Customer Info */}
          <div className="space-y-3.5 min-w-0">
            {/* Top row: Title, Copy, Badges */}
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

            {/* Customer & Company Details */}
            <div className="flex items-center gap-3 text-xs sm:text-sm text-neutral-500 flex-wrap">
              {customer && (
                <div className="flex items-center gap-1.5">
                  <DynamicIcon name="User" className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-neutral-400">العميل:</span>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-bold text-neutral-900 hover:text-neutral-950 hover:underline"
                  >
                    {customer.full_name}
                  </Link>
                </div>
              )}

              {company && (
                <>
                  <span className="text-neutral-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <DynamicIcon name="Building2" className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-neutral-400">الشركة:</span>
                    <span className="font-semibold text-neutral-800">{company.name}</span>
                  </div>
                </>
              )}

              {shipment.port_of_arrival && (
                <>
                  <span className="text-neutral-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <DynamicIcon name="Ship" className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-neutral-400">الميناء:</span>
                    <span className="font-semibold text-neutral-800">{shipment.port_of_arrival}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Primary Action & Current Stage Callout */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedStage(currentStageObj)}
              className="group inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-neutral-950 hover:bg-neutral-900 text-white font-bold text-sm shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] border border-neutral-800 cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-neutral-950"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#F5C500] animate-pulse shrink-0" />
              <span>إجراءات المرحلة الحالية ({currentStageObj.number})</span>
              <DynamicIcon
                name="ChevronLeft"
                className="w-4 h-4 text-[#F5C500] group-hover:-translate-x-0.5 transition-transform shrink-0"
              />
            </button>

            <span className="text-[11px] text-neutral-400 text-center lg:text-left">
              المرحلة النشطة: <strong className="text-neutral-800">{currentStageObj.title}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* ── 2. Shipment Summary Cards (Section 3.B) ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="ملخص مؤشرات الشحنة">
        {/* Card 1: Current Stage & SLA */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-5 shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between min-w-0 h-full">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2.5">
              <span className="text-xs font-bold text-neutral-500">المرحلة الحالية</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/60 flex items-center justify-center shrink-0">
                <DynamicIcon name="Navigation" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm sm:text-base font-black text-neutral-950 truncate" title={currentStageObj.title}>
              {currentStageObj.number} — {currentStageObj.title}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 truncate">
            {currentStageObj.timeStatusLabel || `متبقي ${10 - completedStagesCount} مراحل للاكتمال`}
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

        {/* Card 3: Pricing Status */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-5 shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between min-w-0 h-full">
          <div>
            <div className="flex items-center justify-between text-neutral-400 mb-2.5">
              <span className="text-xs font-bold text-neutral-500">الاتفاق المالي</span>
              <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 border border-neutral-200/60 flex items-center justify-center shrink-0">
                <DynamicIcon name="Receipt" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm sm:text-base font-black text-neutral-950 font-mono truncate" title={pricingStatusInfo.main}>
              {pricingStatusInfo.main}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 truncate">
            {pricingStatusInfo.sub}
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

      {/* ── 2.5 Operational Hero Card: Current Stage & Next Action (Section 5.3) ── */}
      {opAction && (
        <section
          className="bg-neutral-950 text-white border-2 border-neutral-900 rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden"
          aria-label="إجراءات المرحلة الحالية"
        >
          {/* Subtle OUT brand accent bar */}
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-[#F5C500] via-yellow-400 to-[#F5C500]" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="w-8 h-8 rounded-xl bg-[#F5C500] text-neutral-950 font-black text-sm flex items-center justify-center font-mono shadow-xs shrink-0">
                  {opAction.stageNumber}
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  {opAction.stageTitle}
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-neutral-800 text-neutral-300 border border-neutral-700/80 font-bold shrink-0">
                  المسؤول: {opAction.assignedRoleLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 bg-neutral-900/90 rounded-2xl border border-neutral-800/80">
                  <div className="text-[10px] font-bold text-neutral-400 mb-1 flex items-center gap-1.5">
                    <DynamicIcon name="HelpCircle" size={13} className="text-[#F5C500]" />
                    <span>سبب استمرار المرحلة الحالية</span>
                  </div>
                  <div className="text-neutral-200 font-medium leading-relaxed">
                    {opAction.currentReason}
                  </div>
                </div>

                <div className="p-3 bg-neutral-900/90 rounded-2xl border border-neutral-800/80">
                  <div className="text-[10px] font-bold text-neutral-400 mb-1 flex items-center gap-1.5">
                    <DynamicIcon name="ArrowRightCircle" size={13} className="text-[#F5C500]" />
                    <span>الإجراء والمطلوب تالياً</span>
                  </div>
                  <div className="text-neutral-200 font-medium leading-relaxed">
                    {opAction.nextStepDescription}
                  </div>
                </div>
              </div>

              {opAction.isBlocked && opAction.blockReason && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-2xl text-xs text-amber-200 flex items-center gap-2">
                  <DynamicIcon name="AlertTriangle" size={14} className="text-[#F5C500] shrink-0" />
                  <span>تنبيه تشغيلي: {opAction.blockReason}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleOperationalAction}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#F5C500] hover:bg-yellow-400 text-neutral-950 font-black text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>{opAction.actionButtonLabel}</span>
                <DynamicIcon name="ChevronLeft" size={16} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. Customs Clearance Journey (Section 3.C — The Visual Centerpiece) ── */}
      <section className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-sm">
        <TenStageTimeline
          journey={authoritativeJourney}
          onSelectStage={(st) => setSelectedStage(st)}
          selectedStageNumber={selectedStage?.number}
          isAdmin={true}
        />
      </section>

      {/* ── 4. Subordinate Information Hub (Sections 3.E, 3.F, 3.G) ── */}
      <section id="subordinate-info-hub" className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
        {/* Modern Tab Bar */}
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${activeTab === "documents"
              ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
              : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
              }`}
          >
            <DynamicIcon name="FileText" className="w-4 h-4" />
            <span>المستندات الجمركية</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${activeTab === "documents" ? "bg-neutral-800 text-[#F5C500]" : "bg-neutral-200 text-neutral-700"
                }`}
            >
              {documents.length}
            </span>
          </button>

          {(pricing !== null || pricingHistory.length > 0) && (
            <button
              type="button"
              onClick={() => setActiveTab("pricing")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${activeTab === "pricing"
                ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
                : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
                }`}
            >
              <DynamicIcon name="Receipt" className="w-4 h-4" />
              <span>التسعير والفواتير</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("specs")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${activeTab === "specs"
              ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
              : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
              }`}
          >
            <DynamicIcon name="Package" className="w-4 h-4" />
            <span>بيانات الشحنة اللوجستية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${activeTab === "activity"
              ? "bg-neutral-950 text-white shadow-xs border border-neutral-900"
              : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
              }`}
          >
            <DynamicIcon name="History" className="w-4 h-4" />
            <span>سجل النشاط والمراحل</span>
            {stageHistory.length > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${activeTab === "activity" ? "bg-neutral-800 text-[#F5C500]" : "bg-neutral-200 text-neutral-700"
                  }`}
              >
                {stageHistory.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1 Content: Documents Section (Section 3.E) */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">ملفات ومستندات الشحنة</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  عرض المستندات المرفوعة وحالة تدقيقها واعتمادها الجمركي
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
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

                <button
                  type="button"
                  onClick={() => {
                    const s4 = authoritativeJourney.stages.find((s) => s.key === "04_documents");
                    if (s4) setSelectedStage(s4);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <DynamicIcon name="FileCheck" className="w-3.5 h-3.5 text-[#F5C500]" />
                  <span>إدارة المستندات في المرحلة 04</span>
                </button>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                <DynamicIcon name="FileText" className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-neutral-700">لا توجد مستندات مرفوعة حتى الآن</p>
                <p className="text-xs text-neutral-400 mt-1">
                  سيتم إدراج المستندات فور قيام العميل برفعها أو استكمال متطلبات المرحلة
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isApproved
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : isRevisionReq
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-neutral-100 text-neutral-700"
                              }`}
                          >
                            <DynamicIcon name="FileText" className="w-5 h-5" />
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate" title={doc.title}>
                              {doc.title || doc.document_type || "مستند"}
                            </h4>
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
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-950 shrink-0"
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
        )}

        {/* Tab 2 Content: Pricing and Invoices (Section 3.F) */}
        {activeTab === "pricing" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Estimated Pricing Card */}
              <div className="border border-neutral-200/90 rounded-2xl p-5 bg-neutral-50/50 space-y-2">
                <span className="text-xs font-bold text-neutral-500 block">التقدير المالي المبدئي</span>
                <div className="text-lg font-black text-neutral-950 font-mono">
                  {pricing?.estimated_min_price && pricing?.estimated_max_price
                    ? `${pricing.estimated_min_price.toLocaleString("ar-EG")} - ${pricing.estimated_max_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`
                    : "لم يتم التقدير بعد"}
                </div>
                <p className="text-xs text-neutral-500">
                  {pricing?.created_at
                    ? `تم التقديم في: ${formatDateAr(pricing.created_at)}`
                    : "بانتظار دراسة البنود الجمركية"}
                </p>
              </div>

              {/* Final Agreed Price Card */}
              <div className="border border-neutral-200/90 rounded-2xl p-5 bg-neutral-50/50 space-y-2">
                <span className="text-xs font-bold text-neutral-500 block">السعر النهائي المتفق عليه</span>
                <div className="text-lg font-black text-neutral-950 font-mono">
                  {pricing?.final_price
                    ? `${pricing.final_price.toLocaleString("ar-EG")} ${pricing.currency || "EGP"}`
                    : "لم يحدد السعر النهائي"}
                </div>
                <p className="text-xs text-neutral-500">
                  {pricing?.customer_approved_at
                    ? `معتمد من العميل في: ${formatDateAr(pricing.customer_approved_at)}`
                    : pricing?.final_price
                      ? "بانتظار موافقة العميل"
                      : "يتم تحديده بعد الاتفاق"}
                </p>
              </div>

              {/* Invoicing Status Card */}
              <div className="border border-neutral-200/90 rounded-2xl p-5 bg-neutral-50/50 space-y-2">
                <span className="text-xs font-bold text-neutral-500 block">الفاتورة المبدئية والتسوية</span>
                <div className="text-lg font-black text-neutral-950 font-mono">
                  {invoiceReviews.length > 0
                    ? invoiceReviews[0].action === "approved"
                      ? "معتمدة بنجاح"
                      : "طلب تعديل"
                    : "لم تصدر بعد"}
                </div>
                <p className="text-xs text-neutral-500">
                  {invoiceReviews.length > 0 && invoiceReviews[0].performed_at
                    ? `آخر تدقيق: ${formatDateAr(invoiceReviews[0].performed_at)}`
                    : "مرتبطة بمرحلة استخراج الفاتورة"}
                </p>
              </div>
            </div>

            {/* Pricing Feedback Alert */}
            {pricingFeedback && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  pricingFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-rose-50 text-rose-800 border-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name={pricingFeedback.type === "success" ? "CheckCircle" : "AlertTriangle"}
                    className="w-4 h-4 shrink-0"
                  />
                  <span>{pricingFeedback.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPricingFeedback(null)}
                  className="text-neutral-500 hover:text-neutral-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Interactive Admin Pricing Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-neutral-50 rounded-2xl border border-neutral-200">
              <div className="text-xs text-neutral-600">
                <span className="font-bold text-neutral-900">إجراءات التسعير الرسمية:</span> يمكنك إدارة التقدير المالي، وتفاوض الأسعار، وتأكيد الموافقة عبر نافذة المرحلة 02.
              </div>
              <button
                type="button"
                onClick={() => {
                  const s2 = authoritativeJourney.stages.find((s) => s.key === "02_pricing");
                  if (s2) setSelectedStage(s2);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-950 hover:bg-neutral-900 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-xs"
              >
                <DynamicIcon name="Receipt" className="w-3.5 h-3.5 text-[#F5C500]" />
                <span>فتح نافذة المرحلة 02 للتسعير</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Form 1: Initial Estimate Submission / Edit */}
              <div className="p-5 bg-white border border-neutral-200/90 rounded-2xl space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-800 border border-yellow-200 flex items-center justify-center">
                      <DynamicIcon name="DollarSign" className="w-4 h-4 text-yellow-700" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">
                        {pricing?.estimated_min_price ? "تعديل التقدير المالي المبدئي" : "تقديم التقدير المالي المبدئي"}
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        المدى السعري المقترح للعميل لمرحلة الفحص وتخليص الشحنة
                      </p>
                    </div>
                  </div>
                  {pricing?.estimated_min_price && (
                    <button
                      type="button"
                      onClick={() => setIsEditingEstimate(!isEditingEstimate)}
                      className="text-xs text-neutral-600 hover:text-neutral-900 underline font-medium cursor-pointer"
                    >
                      {isEditingEstimate ? "إلغاء التعديل" : "تعديل"}
                    </button>
                  )}
                </div>

                <form onSubmit={handleAdminSubmitEstimate} className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
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
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono focus:border-neutral-900 focus:outline-hidden"
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
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono focus:border-neutral-900 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">العملة:</label>
                    <select
                      value={pricingCurrency}
                      onChange={(e) => setPricingCurrency(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 bg-white focus:border-neutral-900 focus:outline-hidden"
                    >
                      <option value="EGP">جنيه مصري (EGP)</option>
                      <option value="USD">دولار أمريكي (USD)</option>
                      <option value="EUR">يورو (EUR)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending || !minPrice || !maxPrice}
                    className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-neutral-950"
                  >
                    <DynamicIcon name="Send" className="w-3.5 h-3.5" />
                    <span>{isPending ? "جاري الإرسال..." : "حفظ وتقديم تقدير السعر للعميل"}</span>
                  </button>
                </form>
              </div>

              {/* Form 2: Negotiation Outcome & Final Price */}
              <div className="p-5 bg-white border border-neutral-200/90 rounded-2xl space-y-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center">
                      <DynamicIcon name="PhoneCall" className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">
                        نتيجة التفاوض والسعر النهائي
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        يتم التواصل هاتفياً مع العميل وتسجيل القيمة المتفق عليها
                      </p>
                    </div>
                  </div>

                  {pricing?.status === "customer_approved" ? (
                    <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                      <DynamicIcon name="CheckCircle" className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>تم اعتماد السعر بنجاح:</strong>
                        <p className="mt-1">
                          وافق العميل رسمياً على السعر النهائي ({pricing.final_price?.toLocaleString("ar-EG")} {pricing.currency || "EGP"}){pricing.customer_approved_at && ` بتاريخ ${formatDateAr(pricing.customer_approved_at)}`}.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAdminSetFinalPrice} className="space-y-3 pt-3">
                      {(shipment.status === "negotiation" || pricing?.status === "negotiation_requested") && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                          ⚠️ العميل طلب التفاوض على السعر. يرجى التواصل معه هاتفياً وتسجيل السعر المتفق عليه.
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1">
                          السعر النهائي المتفق عليه ({pricingCurrency}):
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={finalPriceInput}
                          onChange={(e) => setFinalPriceInput(e.target.value)}
                          placeholder="مثال: 4500"
                          className="w-full text-xs p-2.5 rounded-xl border border-neutral-300 font-mono focus:border-neutral-900 focus:outline-hidden"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isPending || !finalPriceInput}
                        className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-[#F5C500] font-bold rounded-xl text-xs transition-all shadow-xs border border-neutral-800 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-neutral-950"
                      >
                        <DynamicIcon name="Check" className="w-3.5 h-3.5" />
                        <span>{isPending ? "جاري الحفظ..." : "تسجيل السعر النهائي وإرساله للعميل"}</span>
                      </button>
                    </form>
                  )}
                </div>

                <div className="text-[11px] text-neutral-400 border-t border-neutral-100 pt-3">
                  الحالة: {pricing?.status === "customer_approved" ? "معتمد" : pricing?.final_price ? "بانتظار موافقة العميل" : "بانتظار الاتفاق"}
                </div>
              </div>
            </div>

            {/* Pricing History Timeline */}
            {pricingHistory.length > 0 && (
              <div className="border-t border-neutral-100 pt-5 space-y-3">
                <h4 className="text-xs font-bold text-neutral-700">سجل التعديلات والاتفاق المالي:</h4>
                <div className="space-y-2">
                  {pricingHistory.map((item) => (
                    <div
                      key={item.id}
                      className="text-xs p-3 rounded-xl bg-neutral-50 border border-neutral-200/70 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <DynamicIcon name="History" className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="font-bold text-neutral-900">{item.action}</span>
                        {item.notes && <span className="text-neutral-500">— {item.notes}</span>}
                      </div>
                      <span className="text-[11px] font-mono text-neutral-400">
                        {formatDateAr(item.performed_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3 Content: Logistics Specifications (Section 3.G) */}
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

            {shipment.classification_notes && (
              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 sm:col-span-2 lg:col-span-3 space-y-1">
                <span className="text-amber-900 block font-bold">ملاحظات الفحص الجمركي والتصنيف</span>
                <p className="text-neutral-800 leading-relaxed text-xs">
                  {shipment.classification_notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 4 Content: Activity & Audit Timeline (Section 3.G) */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-900">سجل الإجراءات ومسار المراحل</h3>

            {stageHistory.length === 0 && acidHistory.length === 0 ? (
              <div className="text-center py-8 border border-neutral-100 rounded-2xl bg-neutral-50 text-neutral-500 text-xs">
                لا توجد سجلات نشاط مؤرشفة بعد لهذه الشحنة.
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

      {/* ── 5. Focused Unified Stage Popup (Section 3.D) ── */}
      {selectedStage && (
        <AdminStageDetailModal
          isOpen={true}
          onClose={() => setSelectedStage(null)}
          stage={selectedStage}
          shipment={shipment}
          company={company}
          customer={customer}
          documents={documents}
          pricing={pricing}
          acid={acidRecord}
          invoiceReviews={invoiceReviews}
          journey={journey}
          onPreviewDocument={(doc) => setPreviewDoc(doc)}
          onSelectTab={(tab) => setActiveTab(tab)}
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
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
          <DynamicIcon name="Check" size={11} className="shrink-0" />
          <span>معتمد</span>
        </span>
      );
    case "rejected":
    case "revision_required":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 shrink-0">
          <DynamicIcon name="AlertCircle" size={11} className="shrink-0" />
          <span>مطلوب تعديل</span>
        </span>
      );
    case "pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
          <DynamicIcon name="Clock" size={11} className="shrink-0" />
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
