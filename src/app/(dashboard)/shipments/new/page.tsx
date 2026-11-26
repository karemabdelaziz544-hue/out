import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { getCustomerCompany } from "@/lib/company/queries";
import { getShipmentById, getShipmentDocuments } from "@/lib/shipments/queries";
import { CreateShipmentForm } from "@/components/shipments";
import type { Shipment, DocumentItem } from "@/types";

export const metadata: Metadata = {
  title: "إنشاء طلب تخليص شحنة | OUT",
  description:
    "أدخل البيانات الأولية للشحنة وارفع الفاتورة المبدئية لمراجعة الطلب وتقديم عرض السعر.",
};

interface CreateShipmentPageProps {
  searchParams: Promise<{
    draftId?: string;
  }>;
}

export default async function CreateShipmentPage({
  searchParams,
}: CreateShipmentPageProps) {
  await connection();
  await requireAuth();

  const { draftId } = await searchParams;
  const company = await getCustomerCompany();

  let initialDraft: Shipment | null = null;
  let existingDocuments: DocumentItem[] = [];

  if (draftId) {
    const draft = await getShipmentById(draftId);
    if (draft && draft.status === "draft") {
      initialDraft = draft;
      existingDocuments = await getShipmentDocuments(draft.id);
    }
  }

  return (
    <div className="dashboard-content">
      <CreateShipmentForm
        company={company}
        initialDraft={initialDraft}
        existingDocuments={existingDocuments}
      />
    </div>
  );
}
