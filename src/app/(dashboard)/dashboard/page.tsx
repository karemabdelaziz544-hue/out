import { connection } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { getRoleLabel } from "@/lib/utils";
import { getCustomerCompany } from "@/lib/company/queries";
import { getCustomerShipments, getAdminShipments } from "@/lib/shipments/queries";
import { createClient } from "@/lib/supabase/server";
import { CustomerDashboardView, AdminDashboardView } from "@/components/dashboard";
import type { Metadata } from "next";

export const instant = false;

export const metadata: Metadata = {
  title: "الرئيسية | OUT",
  description: "لوحة العمليات الرئيسية لمتابعة طلبات التخليص الجمركي والشحنات والمستندات.",
};

export default async function DashboardPage() {
  await connection();
  const currentUser = await requireAuth();

  const displayName = currentUser.fullName || currentUser.email || "المستخدم";
  const roleLabel = getRoleLabel(currentUser.role);

  // ─── 1. Customer View ────────────────────────────────────────────────────────
  if (currentUser.role === "customer") {
    const [company, shipments] = await Promise.all([
      getCustomerCompany(),
      getCustomerShipments(),
    ]);

    return (
      <div className="dashboard-content">
        <CustomerDashboardView
          displayName={displayName}
          company={company}
          shipments={shipments}
        />
      </div>
    );
  }

  // ─── 2. Admin & Staff Operational View ───────────────────────────────────────
  const supabase = await createClient();

  const [
    adminShipmentsResult,
    totalShipmentsRes,
    awaitingPricingRes,
    awaitingInvoiceRes,
    acidProcessingRes,
    awaitingDocsRes,
    readyExternalRes,
    customersCountRes,
  ] = await Promise.all([
    getAdminShipments({ page: 1, pageSize: 5 }),
    supabase.from("shipments").select("id", { count: "exact", head: true }),
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "awaiting_pricing"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "awaiting_invoice_review"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "acid_processing"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "awaiting_shipment_documents"),
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "ready_for_external_stage"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
  ]);

  const stats = {
    totalShipments: totalShipmentsRes.count || 0,
    awaitingPricing: awaitingPricingRes.count || 0,
    awaitingInvoiceReview: awaitingInvoiceRes.count || 0,
    acidProcessing: acidProcessingRes.count || 0,
    awaitingDocuments: awaitingDocsRes.count || 0,
    readyForExternal: readyExternalRes.count || 0,
    totalCustomers: customersCountRes.count || 0,
  };

  return (
    <div className="dashboard-content">
      <AdminDashboardView
        displayName={displayName}
        roleLabel={roleLabel}
        stats={stats}
        recentShipments={adminShipmentsResult.shipments}
      />
    </div>
  );
}
