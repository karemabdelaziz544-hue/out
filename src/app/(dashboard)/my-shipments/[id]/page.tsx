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
import {
  getCustomerShipmentFinancialStatementQuery,
  getShipmentCustomsObligationsQuery,
  getShipmentFinancialSummaryQuery,
} from "@/lib/shipments/financial-queries";
import type { CustomerCustomsObligationItem } from "@/types/financial";
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

  const [
    documents,
    pricing,
    acid,
    stageHistory,
    customerJourney,
    invoiceReviews,
    pricingHistory,
    financialSummaryRes,
    financialStatementRes,
    customsObligationsRes,
  ] = await Promise.all([
    getShipmentDocuments(shipment.id),
    getShipmentPricing(shipment.id),
    getShipmentAcid(shipment.id),
    getShipmentStageHistory(shipment.id),
    getCustomerShipmentCustomsJourney(shipment.id),
    getShipmentInvoiceReviews(shipment.id),
    getShipmentPricingHistory(shipment.id),
    getShipmentFinancialSummaryQuery(shipment.id),
    getCustomerShipmentFinancialStatementQuery(shipment.id),
    getShipmentCustomsObligationsQuery(shipment.id),
  ]);

  const financialSummary =
    financialSummaryRes.success && financialSummaryRes.data
      ? financialSummaryRes.data
      : customerJourney?.financialSummary ?? null;

  const financialStatement =
    financialStatementRes.success && financialStatementRes.data
      ? financialStatementRes.data
      : [];

  // Strip internal staff-only fields (notes, created_by, updated_by) before client serialization
  const customsObligations: CustomerCustomsObligationItem[] =
    customsObligationsRes.success && customsObligationsRes.data
      ? customsObligationsRes.data.map((ob) => ({
          id: ob.id,
          shipment_id: ob.shipment_id,
          claim_type: ob.claim_type,
          customs_claim_number: ob.customs_claim_number,
          assessed_amount: ob.assessed_amount,
          currency: ob.currency,
          status: ob.status,
          assessed_at: ob.assessed_at,
          created_at: ob.created_at,
          updated_at: ob.updated_at,
        }))
      : [];

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
        financialSummary={financialSummary}
        financialStatement={financialStatement}
        customsObligations={customsObligations}
      />
    </div>
  );
}
