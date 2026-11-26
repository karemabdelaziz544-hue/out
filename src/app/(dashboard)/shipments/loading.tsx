import { TableSkeleton } from "@/components/ui";

export default function AdminShipmentsLoading() {
  return (
    <div className="dashboard-content" aria-busy="true">
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ width: "220px", height: "26px", backgroundColor: "var(--color-gray-200)", borderRadius: "var(--radius-sm)", marginBottom: "0.5rem" }} />
        <div style={{ width: "350px", height: "16px", backgroundColor: "var(--color-gray-100)", borderRadius: "var(--radius-sm)" }} />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}
