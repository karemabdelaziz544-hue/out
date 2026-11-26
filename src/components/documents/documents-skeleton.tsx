/**
 * Documents Skeleton Loader
 *
 * Displays placeholder loading cards and table while documents data loads.
 */

export function DocumentsSkeleton() {
  return (
    <div className="customers-container" aria-busy="true" aria-label="جاري تحميل المستندات">
      {/* 1. Header Skeleton */}
      <div className="customers-header">
        <div>
          <div className="skeleton" style={{ width: "160px", height: "32px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "280px", height: "18px" }} />
        </div>
        <div className="skeleton" style={{ width: "96px", height: "38px" }} />
      </div>

      {/* 2. Stats Grid Skeleton */}
      <div className="customers-stats-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="customers-stat-card">
            <div className="skeleton" style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)" }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: "90px", height: "14px", marginBottom: "8px" }} />
              <div className="skeleton" style={{ width: "50px", height: "24px" }} />
            </div>
          </div>
        ))}
      </div>

      {/* 3. Toolbar Skeleton */}
      <div className="customers-toolbar">
        <div className="skeleton" style={{ maxWidth: "420px", width: "100%", height: "42px" }} />
      </div>

      {/* 4. Table Card Skeleton */}
      <div className="customers-table-card">
        <div style={{ padding: "1.5rem" }}>
          <div className="skeleton" style={{ width: "100%", height: "40px", marginBottom: "16px" }} />
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="skeleton"
              style={{
                width: "100%",
                height: "52px",
                marginBottom: "8px",
                borderRadius: "var(--radius-sm)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
