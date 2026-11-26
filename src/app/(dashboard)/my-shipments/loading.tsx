import { TableSkeleton } from "@/components/ui";

export default function MyShipmentsLoading() {
  return (
    <div className="dashboard-content" aria-busy="true">
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ width: "200px", height: "24px", backgroundColor: "var(--color-gray-200)", borderRadius: "var(--radius-sm)", marginBottom: "0.5rem" }} />
        <div style={{ width: "320px", height: "16px", backgroundColor: "var(--color-gray-100)", borderRadius: "var(--radius-sm)" }} />
      </div>
      <TableSkeleton rows={5} cols={5} />
    </div>
  );
}
