/**
 * Customers Skeleton Loading State
 */

import { Skeleton } from "@/components/ui/skeleton";

export function CustomersSkeleton() {
  return (
    <div className="customers-container" aria-busy="true" aria-label="جاري تحميل بيانات العملاء">
      {/* Header Skeleton */}
      <div className="customers-header">
        <div>
          <Skeleton style={{ width: "160px", height: "32px", marginBottom: "8px" }} />
          <Skeleton style={{ width: "320px", height: "18px" }} />
        </div>
        <Skeleton style={{ width: "120px", height: "38px" }} />
      </div>

      {/* Stats Cards Skeleton */}
      <div className="customers-stats-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="customers-stat-card">
            <Skeleton style={{ width: "48px", height: "48px", borderRadius: "8px" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <Skeleton style={{ width: "80px", height: "14px" }} />
              <Skeleton style={{ width: "40px", height: "24px" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar Skeleton */}
      <div className="customers-toolbar">
        <Skeleton style={{ width: "340px", height: "38px", borderRadius: "8px" }} />
        <Skeleton style={{ width: "220px", height: "38px", borderRadius: "8px" }} />
      </div>

      {/* Table Skeleton */}
      <div className="customers-table-card">
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                paddingBottom: "12px",
                borderBottom: i < 5 ? "1px solid var(--color-border)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "25%" }}>
                <Skeleton style={{ width: "36px", height: "36px", borderRadius: "50%" }} />
                <Skeleton style={{ width: "120px", height: "16px" }} />
              </div>
              <Skeleton style={{ width: "20%", height: "16px" }} />
              <Skeleton style={{ width: "15%", height: "16px" }} />
              <Skeleton style={{ width: "12%", height: "22px", borderRadius: "12px" }} />
              <Skeleton style={{ width: "15%", height: "16px" }} />
              <Skeleton style={{ width: "10%", height: "28px", borderRadius: "6px" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
