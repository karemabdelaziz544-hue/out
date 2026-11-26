import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { getAdminShipmentDetails } from "@/lib/shipments/queries";
import { AdminShipmentDetails } from "@/components/shipments";

export const metadata: Metadata = {
  title: "تفاصيل طلب التخليص الجمركي | OUT",
  description: "مراجعة تفاصيل طلب التخليص الجمركي، العميل، الشركة، والمستندات.",
};

interface AdminShipmentDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminShipmentDetailsPage({
  params,
}: AdminShipmentDetailsPageProps) {
  await connection();
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const { id } = await params;

  // If customer navigates to /shipments/[id], route them to their customer shipment details
  if (currentUser.role === "customer") {
    redirect(`/my-shipments/${id}`);
  }

  await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);

  const details = await getAdminShipmentDetails(id);

  if (!details) {
    notFound();
  }

  return (
    <div className="dashboard-content">
      <AdminShipmentDetails
        shipment={details.shipment}
        company={details.company}
        customer={details.customer}
        documents={details.documents}
        pricing={details.pricing}
        pricingHistory={details.pricingHistory}
        invoiceReviews={details.invoiceReviews}
        acid={details.acid}
        acidHistory={details.acidHistory}
        documentReviews={details.documentReviews}
        stageHistory={details.stageHistory}
        externalOperations={details.externalOperations}
        journey={details.journey}
      />
    </div>
  );
}
