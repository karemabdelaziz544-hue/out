/**
 * Skeleton Components — Standard Loading States
 *
 * Reusable layout skeletons for OUT platform.
 */

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? "skeleton-text__last" : ""} />
      ))}
    </div>
  );
}

export function CardSkeleton({ height = "120px" }: { height?: string }) {
  return (
    <div className="card" style={{ padding: "1.25rem", height }} aria-hidden="true">
      <Skeleton style={{ width: "40%", height: "20px", marginBottom: "0.75rem" }} />
      <Skeleton style={{ width: "70%", height: "16px" }} />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card" style={{ padding: "1.25rem", overflow: "hidden" }} aria-hidden="true">
      {/* Table Header */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.75rem" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} style={{ flex: 1, height: "18px" }} />
        ))}
      </div>
      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid var(--color-gray-100)" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} style={{ flex: 1, height: "16px" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-content" aria-hidden="true">
      {/* Welcome banner skeleton */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <Skeleton style={{ width: "120px", height: "20px", marginBottom: "0.5rem" }} />
        <Skeleton style={{ width: "240px", height: "28px", marginBottom: "0.5rem" }} />
        <Skeleton style={{ width: "60%", height: "16px" }} />
      </div>

      {/* KPI Cards skeleton */}
      <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
        <CardSkeleton height="110px" />
        <CardSkeleton height="110px" />
        <CardSkeleton height="110px" />
        <CardSkeleton height="110px" />
      </div>

      {/* Recent items table skeleton */}
      <TableSkeleton rows={4} cols={5} />
    </div>
  );
}

export function ShipmentDetailsSkeleton() {
  return (
    <div className="dashboard-content" aria-hidden="true">
      {/* Top Banner */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <Skeleton style={{ width: "200px", height: "26px", marginBottom: "0.5rem" }} />
            <Skeleton style={{ width: "160px", height: "16px" }} />
          </div>
          <Skeleton style={{ width: "120px", height: "36px", borderRadius: "var(--radius-full)" }} />
        </div>
        {/* Stepper skeleton */}
        <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ flex: 1, height: "42px", borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <Skeleton style={{ width: "180px", height: "22px", marginBottom: "1.5rem" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} height="85px" />
          ))}
        </div>
      </div>
    </div>
  );
}
