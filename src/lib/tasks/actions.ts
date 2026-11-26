"use server";

/**
 * Admin Tasks Server Actions
 *
 * Provides safe operational updates for shipment tasks with optimistic
 * concurrency control and audit history preservation.
 */

import { revalidatePath } from "next/cache";
import { updateCustomsStageAction } from "@/lib/shipments/journey-actions";
import { requireRole } from "@/lib/auth/guards";
import type { JourneyActionResult } from "@/lib/shipments/journey-actions";

export async function updateTaskStatusAction(
  formData: FormData,
): Promise<JourneyActionResult> {
  await requireRole(["admin", "data_entry", "scout", "inspector"]);

  const shipmentId = formData.get("shipment_id")?.toString();

  const result = await updateCustomsStageAction(formData);

  revalidatePath("/tasks");
  if (shipmentId) {
    revalidatePath(`/shipments/${shipmentId}`);
  }

  return result;
}
