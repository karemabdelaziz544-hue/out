"use client";

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";
import type {
  CustomerJourneyStation,
  CustomerSevenStationJourney,
  CustomerStationNumber,
} from "@/types/journey";

interface CustomerSevenStationTimelineProps {
  journey: CustomerSevenStationJourney;
  onSelectStation: (station: CustomerJourneyStation) => void;
  selectedStationNumber?: CustomerStationNumber | null;
}

export function CustomerSevenStationTimeline({
  journey,
  onSelectStation,
  selectedStationNumber,
}: CustomerSevenStationTimelineProps) {
  const { stations, completedCount, totalCount, progressPercentage } = journey;

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* ── Progress Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-neutral-200/90 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-neutral-950 text-[#F5C500] border border-neutral-800 flex items-center justify-center font-black text-lg shadow-xs shrink-0">
            7
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black text-neutral-950 tracking-tight truncate">
              مسار متابعة الشحنة — محطات الإنجاز السبع
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed truncate">
              متابعة مبسطة وشاملة لرحلة تخليص شحنتك الجمركية من الاستقبال وحتى الاستلام النهائي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:border-r sm:border-neutral-200 sm:pr-5 shrink-0">
          <div className="text-right sm:text-left">
            <div className="text-[11px] font-bold text-neutral-400">الإنجاز الكلي</div>
            <div className="text-sm font-black text-neutral-950 font-mono mt-0.5">
              {completedCount} من {totalCount} محطات ({progressPercentage}%)
            </div>
          </div>
          <div className="w-28 sm:w-36 bg-neutral-100 rounded-full h-2.5 overflow-hidden border border-neutral-200/80 p-0.5 shrink-0">
            <div
              className="bg-[#F5C500] h-full rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── 7 Progress Stations Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {stations.map((st) => {
          const isSelected = selectedStationNumber === st.number;
          const isCurrent = st.isCurrent;
          const isCompleted = st.isCompleted;
          const isActionRequired = st.isActionRequired;

          // Status Badge Styling
          let statusBadgeClass = "bg-neutral-100 text-neutral-700 border-neutral-200";
          let statusIcon = "Clock";

          if (isCompleted) {
            statusBadgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200 font-bold";
            statusIcon = "Check";
          } else if (isCurrent) {
            statusBadgeClass = "bg-[#F5C500] text-neutral-950 border-neutral-900/10 font-bold shadow-xs";
            statusIcon = "RotateCw";
          } else if (isActionRequired) {
            statusBadgeClass = "bg-amber-50 text-amber-900 border-amber-300 font-bold";
            statusIcon = "AlertCircle";
          }

          // Card Container Styling
          let cardContainerClass = "bg-white border-neutral-200/90 hover:border-neutral-300 hover:shadow-xs";
          if (isSelected) {
            cardContainerClass = "bg-yellow-50/30 border-[#F5C500] shadow-sm ring-2 ring-[#F5C500]/50";
          } else if (isCurrent) {
            cardContainerClass = "bg-white border-2 border-neutral-950 shadow-md ring-2 ring-[#F5C500]/30 hover:shadow-lg";
          } else if (isCompleted) {
            cardContainerClass = "bg-white border-emerald-200/90 hover:border-emerald-300 hover:shadow-xs";
          }

          return (
            <button
              key={st.key}
              type="button"
              onClick={() => onSelectStation(st)}
              className={`flex flex-col justify-between text-right p-4 rounded-2xl border transition-all duration-200 relative group cursor-pointer h-full min-w-0 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:outline-hidden ${cardContainerClass}`}
            >
              {/* Card Top: Station Number, Icon & Status Badge */}
              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black transition-transform group-hover:scale-105 shrink-0 font-mono ${
                      isCompleted
                        ? "bg-emerald-600 text-white shadow-xs"
                        : isCurrent
                        ? "bg-neutral-950 text-[#F5C500] shadow-xs border border-neutral-800"
                        : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {st.number}
                  </div>
                  <div className="w-6 h-6 rounded-lg bg-neutral-100/90 text-neutral-600 flex items-center justify-center shrink-0">
                    <DynamicIcon name={st.icon || "PackageCheck"} size={13} />
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-lg border flex items-center gap-1 shrink-0 ${statusBadgeClass}`}
                >
                  <DynamicIcon name={statusIcon} size={11} className="shrink-0" />
                  <span className="truncate max-w-[80px]">{st.statusLabel}</span>
                </span>
              </div>

              {/* Card Middle: Title & Customer Friendly Description */}
              <div className="flex-1 flex flex-col justify-start min-w-0">
                <h4
                  className={`text-xs font-black leading-snug mb-1.5 line-clamp-2 break-words ${
                    isCurrent ? "text-neutral-950 font-black" : "text-neutral-900 font-bold"
                  }`}
                >
                  {st.title}
                </h4>

                <p className="text-[11px] text-neutral-500 line-clamp-3 leading-relaxed">
                  {st.customerDescription}
                </p>
              </div>

              {/* Card Bottom: Meta info badge & detail trigger */}
              <div className="mt-3 pt-2.5 border-t border-neutral-100 flex flex-col gap-1.5 min-w-0">
                {st.metaInfo && (
                  <div className="text-[10px] font-mono font-medium text-neutral-700 truncate bg-neutral-50 border border-neutral-200/80 rounded-md px-2 py-0.5">
                    {st.metaInfo}
                  </div>
                )}

                <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-1">
                  <span className="text-[10px] text-neutral-400">
                    {st.underlyingStageNumbers.length > 1
                      ? `تشمل (${st.underlyingStageNumbers.length}) مراحل`
                      : "المرحلة التشغيلية"}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-neutral-700 group-hover:text-neutral-950 font-bold group-hover:-translate-x-0.5 transition-transform shrink-0">
                    <span>تفاصيل</span>
                    <DynamicIcon name="ChevronLeft" size={11} className="shrink-0" />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
