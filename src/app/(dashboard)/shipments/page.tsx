import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { getAdminShipments } from "@/lib/shipments/queries";
import { AdminShipmentsTable } from "@/components/shipments";
import { DynamicIcon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "إدارة الشحنات | OUT",
  description: "المركز الإداري لمتابعة طلبات التخليص الجمركي وإدارة الشحنات.",
};

interface ShipmentsPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function ShipmentsPage({
  searchParams,
}: ShipmentsPageProps) {
  await connection();
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  // If customer navigates to /shipments, route them to their shipments page
  if (currentUser.role === "customer") {
    redirect("/my-shipments");
  }

  await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);

  const { q, status, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  const { shipments, totalCount, totalPages } = await getAdminShipments({
    query: q,
    status: status || "all",
    page: currentPage,
    pageSize: 10,
  });

  return (
    <div className="dashboard-content">
      {/* Header Banner */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-yellow-light)",
              color: "var(--color-yellow-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="Package" size={24} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "var(--font-size-2xl)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              إدارة الشحنات
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                margin: "0.25rem 0 0 0",
              }}
            >
              متابعة جميع طلبات التخليص الجمركي والشحنات الواردة من العملاء
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-700)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            إجمالي الطلبات: {totalCount}
          </span>
        </div>
      </div>

      <AdminShipmentsTable
        shipments={shipments}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
        currentQuery={q || ""}
        currentStatus={status || "all"}
      />
    </div>
  );
}
