import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { getCustomerCompany } from "@/lib/company/queries";
import { getCustomerShipments } from "@/lib/shipments/queries";
import { MyShipmentsList } from "@/components/shipments";

export const metadata: Metadata = {
  title: "شحناتي | OUT",
  description: "متابعة طلبات التخليص الجمركي والشحنات الخاصة بشركتك.",
};

export default async function MyShipmentsPage() {
  await connection();
  await requireAuth();

  const [company, shipments] = await Promise.all([
    getCustomerCompany(),
    getCustomerShipments(),
  ]);

  return (
    <div className="dashboard-content">
      <MyShipmentsList
        shipments={shipments}
        hasCompany={Boolean(company)}
      />
    </div>
  );
}
