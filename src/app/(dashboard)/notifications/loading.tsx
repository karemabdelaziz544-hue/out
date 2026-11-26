import { CardSkeleton } from "@/components/ui";

export default function NotificationsLoading() {
  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }} aria-busy="true">
      <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
        <div style={{ width: "180px", height: "24px", backgroundColor: "var(--color-gray-200)", borderRadius: "var(--radius-sm)", marginBottom: "0.5rem" }} />
        <div style={{ width: "320px", height: "16px", backgroundColor: "var(--color-gray-100)", borderRadius: "var(--radius-sm)" }} />
      </div>
      <CardSkeleton height="90px" />
      <CardSkeleton height="90px" />
      <CardSkeleton height="90px" />
    </div>
  );
}
