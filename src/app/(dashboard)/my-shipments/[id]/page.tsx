import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import {
  getShipmentById,
  getShipmentDocuments,
  getShipmentPricing,
  getShipmentAcid,
  getShipmentStageHistory,
  getShipmentInvoiceReviews,
  getShipmentPricingHistory,
} from "@/lib/shipments/queries";
import { getCustomerShipmentCustomsJourney } from "@/lib/shipments/journey-queries";
import { ShipmentDetailsView } from "@/components/shipments";

export const metadata: Metadata = {
  title: "تفاصيل الشحنة | OUT",
  description: "عرض تفاصيل طلب التخليص الجمركي ومستندات الشحنة والتسعير وACID.",
};

interface CustomerShipmentDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CustomerShipmentDetailsPage({
  params,
}: CustomerShipmentDetailsPageProps) {
  await connection();
  await requireAuth();

  const { id } = await params;
  const shipment = await getShipmentById(id);

  if (!shipment) {
    notFound();
  }

  const [documents, pricing, acid, stageHistory, customerJourney, invoiceReviews, pricingHistory] = await Promise.all([
    getShipmentDocuments(shipment.id),
    getShipmentPricing(shipment.id),
    getShipmentAcid(shipment.id),
    getShipmentStageHistory(shipment.id),
    getCustomerShipmentCustomsJourney(shipment.id),
    getShipmentInvoiceReviews(shipment.id),
    getShipmentPricingHistory(shipment.id),
  ]);

  return (
    <div className="dashboard-content">
      <ShipmentDetailsView
        shipment={shipment}
        documents={documents}
        pricing={pricing}
        pricingHistory={pricingHistory}
        invoiceReviews={invoiceReviews}
        acid={acid || shipment.acid}
        stageHistory={stageHistory}
        customerJourney={customerJourney}
      />
    </div>
  );
}
