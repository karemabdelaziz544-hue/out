"use client";

import { Sparkles, Terminal } from "lucide-react";
import type { TrackingIdentifierType } from "@/lib/tracking/types";

interface DemoIdentifiersBarProps {
  onSelect: (number: string, type?: TrackingIdentifierType) => void;
  disabled?: boolean;
}

export function DemoIdentifiersBar({ onSelect, disabled = false }: DemoIdentifiersBarProps) {
  // Only render in non-production environments
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const demoScenarios = [
    {
      label: "🟢 نتيجة كاملة + خريطة",
      number: "DEMO-FULL",
      type: "container" as TrackingIdentifierType,
      desc: "حاوية مكتملة مع إحداثيات وموقع سفينة",
    },
    {
      label: "📄 نتيجة نصية بدون خريطة",
      number: "DEMO-TEXT",
      type: "container" as TrackingIdentifierType,
      desc: "محطات ملاحية نصية بدون إحداثيات",
    },
    {
      label: "🟡 بيانات جزئية",
      number: "DEMO-PARTIAL",
      type: "container" as TrackingIdentifierType,
      desc: "حقول مفقودة بأمان",
    },
    {
      label: "🔍 غير موجودة",
      number: "DEMO-NOTFOUND",
      type: "container" as TrackingIdentifierType,
      desc: "محاكاة حالة عدم العثور",
    },
    {
      label: "🔴 خطأ المزود",
      number: "DEMO-ERROR",
      type: "container" as TrackingIdentifierType,
      desc: "محاكاة عطل في مزود التتبع",
    },
    {
      label: "⏱️ مهلة الاتصال",
      number: "DEMO-TIMEOUT",
      type: "container" as TrackingIdentifierType,
      desc: "محاكاة انتهاء المهلة (Timeout)",
    },
    {
      label: "🏛️ شحنة OUT داخلية",
      number: "OUT-2026-000044",
      type: "out_reference" as TrackingIdentifierType,
      desc: "رقم ملف التخليص الجمركي الداخلي",
    },
    {
      label: "🇪🇬 رقم ACID جمركي",
      number: "2026102712345678901",
      type: "acid" as TrackingIdentifierType,
      desc: "منظومة نافذة الجمركية المصرية",
    },
  ];

  return (
    <div className="demo-identifiers-container" dir="rtl">
      <div className="demo-bar-header">
        <div className="demo-bar-title">
          <Terminal size={14} className="inline-block ml-1" />
          <span>لوحة الاختبار والتطوير (تظهر فقط في بيئة التطوير):</span>
        </div>
        <span className="demo-bar-badge">
          <Sparkles size={11} className="inline-block ml-1" />
          بيانات تجريبية واضحة
        </span>
      </div>

      <div className="demo-buttons-grid">
        {demoScenarios.map((scenario) => (
          <button
            key={scenario.number}
            type="button"
            onClick={() => onSelect(scenario.number, scenario.type)}
            disabled={disabled}
            className="demo-scenario-btn"
            title={scenario.desc}
          >
            <span className="scenario-label">{scenario.label}</span>
            <span className="scenario-number" dir="ltr">{scenario.number}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
