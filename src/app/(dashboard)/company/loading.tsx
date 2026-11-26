import { CardSkeleton } from "@/components/ui";

export default function CompanyLoading() {
  return (
    <div className="dashboard-content" aria-busy="true">
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ width: "200px", height: "24px", backgroundColor: "var(--color-gray-200)", borderRadius: "var(--radius-sm)", marginBottom: "0.5rem" }} />
        <div style={{ width: "300px", height: "16px", backgroundColor: "var(--color-gray-100)", borderRadius: "var(--radius-sm)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <CardSkeleton height="140px" />
        <CardSkeleton height="140px" />
        <CardSkeleton height="140px" />
        <CardSkeleton height="140px" />
      </div>
    </div>
  );
}
