"use client";

export function TrackingLoadingState() {
  return (
    <div className="tracking-skeleton-container" dir="rtl" aria-busy="true" aria-label="جاري تحميل بيانات الشحنة...">
      {/* Header skeleton */}
      <div className="skeleton-box skeleton-header">
        <div className="skeleton-line w-48 h-6 mb-3" />
        <div className="skeleton-line w-32 h-4" />
      </div>

      {/* Route grid skeleton */}
      <div className="skeleton-route-grid">
        <div className="skeleton-box skeleton-card">
          <div className="skeleton-line w-24 h-4 mb-2" />
          <div className="skeleton-line w-40 h-6 mb-2" />
          <div className="skeleton-line w-32 h-4" />
        </div>
        <div className="skeleton-box skeleton-card vessel">
          <div className="skeleton-line w-16 h-16 rounded-full mx-auto mb-2" />
          <div className="skeleton-line w-28 h-4 mx-auto" />
        </div>
        <div className="skeleton-box skeleton-card">
          <div className="skeleton-line w-24 h-4 mb-2" />
          <div className="skeleton-line w-40 h-6 mb-2" />
          <div className="skeleton-line w-32 h-4" />
        </div>
      </div>

      {/* Map placeholder skeleton */}
      <div className="skeleton-box skeleton-map">
        <div className="skeleton-spinner-center">
          <div className="tracking-spinner-circle" />
          <span>جاري الاتصال بأنظمة التتبع البحري...</span>
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="skeleton-box skeleton-timeline">
        <div className="skeleton-line w-40 h-5 mb-4" />
        <div className="skeleton-timeline-items">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-timeline-row">
              <div className="skeleton-circle" />
              <div className="skeleton-text-group">
                <div className="skeleton-line w-48 h-4 mb-1" />
                <div className="skeleton-line w-32 h-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
