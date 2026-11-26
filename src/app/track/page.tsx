"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  ArrowRight,
  ShieldCheck,
  LogIn,
  Ship,
  Info,
  PackageCheck,
} from "lucide-react";
import { TrackingSearchBar } from "@/components/tracking/tracking-search-bar";
import { TrackingSummaryCard } from "@/components/tracking/tracking-summary-card";
import { TrackingTimeline } from "@/components/tracking/tracking-timeline";
import { TrackingMap } from "@/components/tracking/tracking-map";
import { OutClearanceCard } from "@/components/tracking/out-clearance-card";
import { TrackingLoadingState } from "@/components/tracking/tracking-loading-state";
import { TrackingErrorState } from "@/components/tracking/tracking-error-state";
import { DemoIdentifiersBar } from "@/components/tracking/demo-identifiers-bar";
import type { TrackingResult, TrackingIdentifierType } from "@/lib/tracking/types";

function TrackingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlNumber = searchParams.get("number") || "";
  const urlType = (searchParams.get("type") as TrackingIdentifierType) || undefined;

  const [currentQuery, setCurrentQuery] = useState(urlNumber);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isDev = process.env.NODE_ENV !== "production";

  // Perform tracking search via server API
  const handleSearch = useCallback(
    async (number: string, type?: TrackingIdentifierType) => {
      const trimmed = number.trim();
      if (!trimmed) return;

      setIsLoading(true);
      setHasSearched(true);
      setCurrentQuery(trimmed);

      // Update URL search parameters without full page reload
      const params = new URLSearchParams();
      params.set("number", trimmed);
      if (type && type !== "unknown") {
        params.set("type", type);
      }
      router.replace(`/track?${params.toString()}`);

      try {
        const response = await fetch("/api/tracking/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: trimmed, type }),
        });

        const data: TrackingResult = await response.json();
        setResult(data);
      } catch (err) {
        console.error("Tracking lookup error:", err);
        setResult({
          trackingNumber: trimmed,
          identifierType: type || "unknown",
          status: "provider_error",
          events: [],
          dataSource: "none",
          isDemo: false,
          userMessage: "تعذر الاتصال بخدمة التتبع. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const hasSearchedRef = useRef(false);

  // Trigger search on mount if URL has a query parameter
  useEffect(() => {
    if (urlNumber && !hasSearchedRef.current) {
      hasSearchedRef.current = true;
      const timer = setTimeout(() => {
        handleSearch(urlNumber, urlType);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [urlNumber, urlType, handleSearch]);

  const isSuccessful =
    result &&
    (result.status === "success" ||
      result.status === "success_text_only" ||
      (result.status === "internal_only" && result.outClearanceSummary));

  const isError = result && !isSuccessful;

  return (
    <div className="tracking-page-wrapper" dir="rtl">
      {/* ─── Header: Navigation & Brand ─────────────────────────────────────── */}
      <header className="tracking-top-nav">
        <div className="tracking-nav-container">
          <Link href="/" className="tracking-brand-link" aria-label="الصفحة الرئيسية لمنصة OUT">
            <span className="tracking-brand-logo">OUT</span>
            <span className="tracking-brand-badge">تتبع دولي</span>
          </Link>

          <div className="tracking-nav-actions">
            <Link href="/login" className="tracking-login-link">
              <LogIn size={15} />
              <span>دخول العملاء</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero Section: Title & Search ──────────────────────────────────── */}
      <section className="tracking-hero-section">
        <div className="tracking-hero-container">
          <div className="tracking-hero-badge">
            <Globe size={14} className="inline-block ml-1" />
            <span>نظام التتبع الملاحي والجمركي الموحد</span>
          </div>

          <h1 className="tracking-hero-title">تتبع شحنتك عالمياً</h1>
          <p className="tracking-hero-description">
            استعلم مباشرة عن موقع سفينتك، مسار الحاويات البحرية، ومحطات الوصول، مع المتابعة المباشرة لإجراءات التخليص الجمركي في الموانئ المصرية.
          </p>

          {/* Search Box */}
          <div className="tracking-hero-search-wrapper">
            <TrackingSearchBar
              initialValue={currentQuery}
              initialType={urlType}
              onSearch={handleSearch}
              isLoading={isLoading}
              isDev={isDev}
            />
          </div>

          {/* Development Demo Buttons */}
          {isDev && (
            <div className="tracking-demo-panel-wrapper">
              <DemoIdentifiersBar
                onSelect={(number, type) => handleSearch(number, type)}
                disabled={isLoading}
              />
            </div>
          )}
        </div>
      </section>

      {/* ─── Results Content Section ────────────────────────────────────────── */}
      <main className="tracking-results-section" id="tracking-content">
        <div className="tracking-results-container">
          {/* 1. Loading State */}
          {isLoading && <TrackingLoadingState />}

          {/* 2. Error State */}
          {!isLoading && isError && result && (
            <TrackingErrorState
              status={result.status}
              userMessage={result.userMessage}
              trackingNumber={result.trackingNumber}
              onRetry={() => handleSearch(result.trackingNumber, result.identifierType)}
            />
          )}

          {/* 3. Success State */}
          {!isLoading && isSuccessful && result && (
            <div className="tracking-success-grid">
              {/* Shipment Summary Card */}
              <div className="tracking-grid-full">
                <TrackingSummaryCard result={result} />
              </div>

              {/* Maritime Interactive Map or Visual Schematic */}
              <div className="tracking-grid-col-8">
                <TrackingMap result={result} />
              </div>

              {/* OUT Customs Clearance Procedures Card */}
              <div className="tracking-grid-col-4">
                <OutClearanceCard
                  summary={result.outClearanceSummary}
                />
              </div>

              {/* Detailed Journey Timeline */}
              <div className="tracking-grid-full">
                <TrackingTimeline events={result.events} />
              </div>
            </div>
          )}

          {/* 4. Initial Pre-Search State (Guidance Cards) */}
          {!isLoading && !hasSearched && (
            <div className="tracking-initial-features">
              <div className="features-section-header">
                <h2 className="features-title">كيف يعمل نظام التتبع في OUT؟</h2>
                <p className="features-subtitle">
                  نوفر لك رؤية شاملة تربط بين خطوط الملاحة الدولية ومنظومة التخليص الجمركي المصرية.
                </p>
              </div>

              <div className="features-cards-grid">
                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <Ship size={24} />
                  </div>
                  <h3 className="feature-card-title">تتبع الحاويات والخطوط الملاحية</h3>
                  <p className="feature-card-desc">
                    استعلم برقم الحاوية (MSKU, MSCU, CMAU...) أو رقم بوليصة الشحن (B/L) لمعرفة موقع السفينة والموانئ وموعد الوصول المتوقع (ETA).
                  </p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="feature-card-title">التكامل مع نافذة المصرية</h3>
                  <p className="feature-card-desc">
                    تعرف على حالة طلبات ACID وإجراءات القيد الجمركي المبدئي للشحنات الموجهة للموانئ المصرية بسهولة ودقة.
                  </p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <PackageCheck size={24} />
                  </div>
                  <h3 className="feature-card-title">خصوصية وحماية البيانات</h3>
                  <p className="feature-card-desc">
                    حماية كاملة للبيانات التجارية وأسماء الشركات والمستندات، مع عرض المسار اللوجستي العام بأعلى معايير الأمان.
                  </p>
                </div>
              </div>

              {/* FAQ or Tips Box */}
              <div className="tracking-info-banner">
                <div className="info-banner-icon">
                  <Info size={20} />
                </div>
                <div className="info-banner-content">
                  <h4 className="info-banner-title">هل لديك رقم شحنة داخلي من OUT؟</h4>
                  <p className="info-banner-text">
                    إذا كنت عميلاً مسجلاً لدى OUT ولديك شحنة قيد التنفيذ، يمكنك إدخال رقم الشحنة الداخلي (مثل OUT-2026-XXXX) للاطلاع على ملخص الحالة، أو تسجيل الدخول لبوابتك للاطلاع على كافة المستندات والفواتير.
                  </p>
                </div>
                <Link href="/login" className="info-banner-btn">
                  <span>تسجيل الدخول</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="tracking-page-footer">
        <div className="tracking-footer-container">
          <div className="tracking-footer-brand">
            <span className="footer-logo">OUT</span>
            <span className="footer-tagline">منصة التخليص الجمركي والخدمات اللوجستية</span>
          </div>

          <div className="tracking-footer-links">
            <Link href="/" className="footer-link">الرئيسية</Link>
            <Link href="/login" className="footer-link">بوابة العملاء</Link>
            <Link href="/register" className="footer-link">إنشاء حساب جديد</Link>
          </div>

          <div className="tracking-footer-copy">
            &copy; {new Date().getFullYear()} OUT Platform. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<TrackingLoadingState />}>
      <TrackingPageContent />
    </Suspense>
  );
}
