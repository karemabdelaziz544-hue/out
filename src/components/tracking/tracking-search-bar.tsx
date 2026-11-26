"use client";

import { useState, useTransition, useId } from "react";
import { Search, Loader2, X, Sparkles, AlertCircle } from "lucide-react";
import { detectIdentifierType, validateIdentifier } from "@/lib/tracking/identifier-validator";
import type { TrackingIdentifierType } from "@/lib/tracking/types";

interface TrackingSearchBarProps {
  initialValue?: string;
  initialType?: TrackingIdentifierType;
  onSearch: (number: string, type?: TrackingIdentifierType) => void;
  isLoading?: boolean;
  isDev?: boolean;
}

const TYPE_LABELS: Record<TrackingIdentifierType, string> = {
  container: "رقم حاوية (ISO)",
  bill_of_lading: "بوليصة شحن (B/L)",
  booking: "رقم حجز ملاحي",
  out_reference: "رقم OUT الداخلي",
  acid: "رقم ACID جمركي",
  unknown: "تحديد تلقائي",
};

export function TrackingSearchBar({
  initialValue = "",
  initialType,
  onSearch,
  isLoading = false,
  isDev = false,
}: TrackingSearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [selectedType, setSelectedType] = useState<TrackingIdentifierType>(initialType || "unknown");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const searchInputId = useId();
  const typeSelectId = useId();

  // Compute live detection & format validation directly during render (no setState in useEffect)
  const trimmed = query.trim();
  let detectedType: TrackingIdentifierType = "unknown";
  let liveValidationError: string | null = null;

  if (trimmed) {
    if (selectedType === "unknown") {
      const detected = detectIdentifierType(trimmed);
      detectedType = detected.type;
      if (trimmed.length >= 4 && !detected.isValid) {
        liveValidationError = detected.errorMessage || "صيغة الرقم غير متوافقة";
      }
    } else {
      const validated = validateIdentifier(trimmed, selectedType);
      if (trimmed.length >= 4 && !validated.isValid) {
        liveValidationError = validated.errorMessage || "الرقم لا يتطابق مع النوع المحدد";
      }
    }
  }

  const activeError = submitError || liveValidationError;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!trimmed) {
      setSubmitError("يرجى إدخال رقم التتبع أولاً");
      return;
    }
    setSubmitError(null);

    startTransition(() => {
      onSearch(trimmed, selectedType !== "unknown" ? selectedType : undefined);
    });
  };

  const handleSelectSample = (sampleNumber: string, type?: TrackingIdentifierType) => {
    setQuery(sampleNumber);
    setSubmitError(null);
    if (type) setSelectedType(type);
    startTransition(() => {
      onSearch(sampleNumber, type);
    });
  };

  const activeBusy = isLoading || isPending;

  return (
    <div className="tracking-search-box" dir="rtl">
      <form onSubmit={handleSubmit} className="tracking-search-form" noValidate>
        <div className="tracking-search-row">
          {/* Identifier Type Selector */}
          <div className="tracking-type-select-wrapper">
            <label htmlFor={typeSelectId} className="sr-only">نوع المعرف</label>
            <select
              id={typeSelectId}
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value as TrackingIdentifierType);
                setSubmitError(null);
              }}
              className="tracking-type-select"
              disabled={activeBusy}
            >
              <option value="unknown">كشف تلقائي</option>
              <option value="container">رقم حاوية (Container)</option>
              <option value="bill_of_lading">بوليصة شحن (B/L)</option>
              <option value="booking">رقم حجز ملاحي (Booking)</option>
              <option value="out_reference">رقم OUT الداخلي</option>
              <option value="acid">رقم ACID الجمركي</option>
            </select>
          </div>

          {/* Main Input Field */}
          <div className="tracking-input-wrapper">
            <Search className="tracking-input-icon" size={20} aria-hidden="true" />
            <label htmlFor={searchInputId} className="sr-only">رقم الشحنة أو الحاوية</label>
            <input
              id={searchInputId}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitError(null);
              }}
              placeholder="أدخل رقم الحاوية (MSKU...)، بوليصة الشحن (MEDU...)، رقم OUT، أو ACID"
              className="tracking-input"
              dir="ltr"
              autoComplete="off"
              spellCheck="false"
              disabled={activeBusy}
            />

            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSubmitError(null);
                }}
                className="tracking-clear-btn"
                aria-label="مسح النص"
                disabled={activeBusy}
              >
                <X size={16} />
              </button>
            )}

            {/* Live detection pill if auto-detect is on */}
            {selectedType === "unknown" && detectedType !== "unknown" && (
              <span className="tracking-detected-badge" title="نوع الرقم المكتشف تلقائياً">
                <Sparkles size={12} className="inline-block" />
                {TYPE_LABELS[detectedType]}
              </span>
            )}
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            className="tracking-submit-btn"
            disabled={activeBusy || !query.trim()}
          >
            {activeBusy ? (
              <>
                <Loader2 size={18} className="tracking-spinner" />
                <span>جاري البحث...</span>
              </>
            ) : (
              <>
                <span>تتبع الشحنة</span>
              </>
            )}
          </button>
        </div>

        {/* Validation error or guidance */}
        {activeError && (
          <div className="tracking-validation-message" role="alert">
            <AlertCircle size={15} />
            <span>{activeError}</span>
          </div>
        )}

        {/* Quick Demo Sample Identifiers (Only in Development or Demo Mode) */}
        {isDev && (
          <div className="tracking-sample-chips">
            <span className="tracking-sample-label">أمثلة تجريبية (بيئة التطوير):</span>
            <button
              type="button"
              onClick={() => handleSelectSample("DEMO-FULL", "container")}
              className="tracking-chip"
              disabled={activeBusy}
            >
              حاوية تجريبية كاملة (DEMO-FULL)
            </button>
            <button
              type="button"
              onClick={() => handleSelectSample("MEDU987654321", "bill_of_lading")}
              className="tracking-chip"
              disabled={activeBusy}
            >
              بوليصة شحن (MEDU987654321)
            </button>
            <button
              type="button"
              onClick={() => handleSelectSample("OUT-2026-000044", "out_reference")}
              className="tracking-chip"
              disabled={activeBusy}
            >
              رقم OUT الداخلي (OUT-2026-000044)
            </button>
            <button
              type="button"
              onClick={() => handleSelectSample("2026102712345678901", "acid")}
              className="tracking-chip"
              disabled={activeBusy}
            >
              رقم ACID جمركي (2026102712345678901)
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
