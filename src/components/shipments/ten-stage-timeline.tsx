"use client";

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";
import type { AuthoritativeJourneyStage, AuthoritativeTenStageJourney } from "@/types/journey";

interface TenStageTimelineProps {
  journey: AuthoritativeTenStageJourney;
  onSelectStage: (stage: AuthoritativeJourneyStage) => void;
  selectedStageNumber?: string | null;
  isAdmin?: boolean;
}

export function TenStageTimeline({
  journey,
  onSelectStage,
  selectedStageNumber,
  isAdmin = false,
}: TenStageTimelineProps) {
  const { stages, completedCount, applicableCount, progressPercentage } = journey;

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* ── Progress Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 bg-white border border-neutral-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-neutral-950 text-[#F5C500] border border-neutral-800 flex items-center justify-center font-black text-base sm:text-lg shadow-xs shrink-0">
            10
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-lg font-black text-neutral-950 tracking-tight truncate">
              رحلة الشحنة الجمركية — المراحل العشر المعتمدة
            </h3>
            <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 leading-relaxed truncate">
              مسار التخليص الجمركي القياسي لشحنات OUT من الاستقبال وحتى الإفراج والتسليم
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 sm:border-r sm:border-neutral-200 sm:pr-5 shrink-0 w-full sm:w-auto">
          <div className="text-right sm:text-left">
            <div className="text-[11px] font-bold text-neutral-400">الإنجاز الكلي للمسار</div>
            <div className="text-xs sm:text-sm font-black text-neutral-950 font-mono mt-0.5">
              {completedCount} من {applicableCount} مرحلة ({progressPercentage}%)
            </div>
          </div>
          <div className="w-24 sm:w-36 bg-neutral-100 rounded-full h-2.5 overflow-hidden border border-neutral-200/80 p-0.5 shrink-0">
            <div
              className="bg-[#F5C500] h-full rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── 10-Stage Grid Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5">
        {stages.map((stage) => {
          const isSelected = selectedStageNumber === stage.number;
          const isCurrent = stage.isCurrent;
          const isCompleted = stage.isCompleted;
          const isNotApplicable = !stage.isApplicable;
          const isActionRequired = stage.isActionRequired;

          // Status Badge Styling (Strictly OUT brand: Yellow #F5C500, Black, White, Neutral Grays)
          let statusBadgeClass = "bg-neutral-50 text-neutral-500 border-neutral-200/90";
          let statusIcon = "Clock";

          if (isCurrent) {
            statusBadgeClass = "bg-[#F5C500] text-neutral-950 border-neutral-900/10 font-bold shadow-xs";
            statusIcon = "RotateCw";
          } else if (isActionRequired) {
            statusBadgeClass = "bg-neutral-950 text-[#F5C500] border-neutral-900 font-bold shadow-xs";
            statusIcon = "AlertCircle";
          } else if (isCompleted) {
            statusBadgeClass = "bg-neutral-100 text-neutral-900 border-neutral-300 font-bold";
            statusIcon = "Check";
          } else if (isNotApplicable) {
            statusBadgeClass = "bg-neutral-100 text-neutral-400 border-neutral-200";
            statusIcon = "MinusCircle";
          }

          // Card Border and Background Styling (Distinctive States)
          let cardContainerClass = "bg-white border-neutral-200/90 hover:border-neutral-300 hover:shadow-xs";
          if (isSelected) {
            cardContainerClass = "bg-yellow-50/40 border-2 border-[#F5C500] shadow-sm ring-2 ring-[#F5C500]/50";
          } else if (isCurrent) {
            cardContainerClass = "bg-white border-2 border-neutral-950 shadow-md ring-2 ring-[#F5C500]/40 hover:shadow-lg";
          } else if (isActionRequired) {
            cardContainerClass = "bg-neutral-50/90 border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900";
          } else if (isCompleted) {
            cardContainerClass = "bg-white border border-neutral-300 hover:border-neutral-400 hover:shadow-xs";
          } else if (isNotApplicable) {
            cardContainerClass = "bg-neutral-50/70 border-dashed border-neutral-300/80 opacity-70 hover:opacity-90";
          }

          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onSelectStage(stage)}
              className={`flex flex-col justify-between text-right p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 relative group cursor-pointer h-full w-full min-w-0 max-w-full overflow-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:outline-hidden ${cardContainerClass}`}
            >
              {/* Card Top: Stage Number, Icon & Status Badge */}
              <div className="flex items-center justify-between gap-1.5 mb-2.5 w-full min-w-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black transition-transform group-hover:scale-105 shrink-0 ${
                      isCurrent
                        ? "bg-neutral-950 text-[#F5C500] shadow-xs border border-neutral-800"
                        : isActionRequired
                        ? "bg-[#F5C500] text-neutral-950 shadow-xs border border-neutral-950 font-black"
                        : isCompleted
                        ? "bg-neutral-900 text-white shadow-xs font-black"
                        : isNotApplicable
                        ? "bg-neutral-200 text-neutral-500 font-bold"
                        : "bg-neutral-100 text-neutral-600 font-bold"
                    }`}
                  >
                    {stage.number}
                  </div>
                  <div className="w-6 h-6 rounded-lg bg-neutral-100/90 text-neutral-600 flex items-center justify-center shrink-0">
                    <DynamicIcon name={stage.icon || "Package"} size={13} />
                  </div>
                </div>

                <span
                  className={`text-[11px] px-2 py-0.5 rounded-lg border flex items-center gap-1 shrink-0 max-w-[130px] sm:max-w-none ${statusBadgeClass}`}
                >
                  <DynamicIcon name={statusIcon} size={12} className="shrink-0" />
                  <span className="truncate">{stage.statusLabel}</span>
                </span>
              </div>

              {/* Card Middle: Title & Short Description */}
              <div className="flex-1 flex flex-col justify-start w-full min-w-0">
                <h4
                  className={`text-xs sm:text-sm font-black leading-snug mb-1 line-clamp-2 break-words ${
                    isCurrent
                      ? "text-neutral-950 font-black"
                      : isActionRequired
                      ? "text-neutral-950 font-black"
                      : isNotApplicable
                      ? "text-neutral-400 font-bold"
                      : "text-neutral-900 font-bold"
                  }`}
                >
                  {stage.title}
                </h4>

                <p className="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed break-words">
                  {isAdmin ? stage.shortDescription : stage.customerDescription}
                </p>
              </div>

              {/* Card Bottom: Meta info / Sub-processes */}
              <div className="mt-3 pt-2.5 border-t border-neutral-100 flex flex-col gap-1.5 w-full min-w-0">
                {/* Meta info badge if present */}
                {stage.metaInfo && (
                  <div className="text-[10px] font-mono font-medium text-neutral-700 truncate bg-neutral-50 border border-neutral-200/80 rounded-md px-2 py-0.5">
                    {stage.metaInfo}
                  </div>
                )}

                {/* Stage 04 Type-Specific Procedure indicator if applicable */}
                {stage.key === "04_documents" && stage.typeProceduresSubProcess?.isApplicable && (
                  <div className="text-[10px] w-full min-w-0">
                    <span
                      className={`inline-block w-full text-center px-1.5 py-0.5 rounded-md border text-[9px] font-bold truncate ${
                        stage.typeProceduresSubProcess.status === "completed"
                          ? "bg-neutral-100 text-neutral-900 border-neutral-300"
                          : "bg-neutral-50 text-neutral-600 border-neutral-200"
                      }`}
                    >
                      جهات العرض: {stage.typeProceduresSubProcess.statusLabel}
                    </span>
                  </div>
                )}

                {/* Footer detail trigger */}
                <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-1">
                  <span className="truncate">{isAdmin ? (stage.assignedRoleLabel || "إدارة العمليات") : "تفاصيل المرحلة"}</span>
                  <span className="inline-flex items-center gap-0.5 text-neutral-700 group-hover:text-neutral-950 font-bold group-hover:-translate-x-0.5 transition-transform shrink-0">
                    <span>تفاصيل</span>
                    <DynamicIcon name="ChevronLeft" size={12} className="shrink-0" />
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
