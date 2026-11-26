"use server";

/**
 * External Operations Server Actions
 *
 * Secure server actions for recording manual Nafeza and CargoX operational actions.
 * Enforces role authorization and strict audit attribution.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import type { ExternalPlatform, ExternalOperationOutcome } from "@/types";

export interface CreateExternalOperationActionResult {
  success: boolean;
  message?: string;
  error?: string;
  operationId?: string;
}

/**
 * Record a manual external operation performed on Nafeza or CargoX.
 */
export async function recordExternalOperationAction(
  formData: FormData,
): Promise<CreateExternalOperationActionResult> {
  try {
    // 1. Role Authorization: Internal staff only
    await requireRole(["admin", "manager", "data_entry", "inspector"]);
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "المستخدم غير مصرح له بتسجيل إجراءات." };
    }

    // 2. Extract and Validate Form Data
    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const platform = formData.get("platform")?.toString().trim() as ExternalPlatform;
    const operationType = formData.get("operation_type")?.toString().trim();
    const title = formData.get("title")?.toString().trim();
    const description = formData.get("description")?.toString().trim() || null;
    const operationDateInput = formData.get("operation_date")?.toString().trim();
    const externalReference = formData.get("external_reference")?.toString().trim() || null;
    const acidNumber = formData.get("acid_number")?.toString().trim() || null;
    const outcome = formData.get("outcome")?.toString().trim() as ExternalOperationOutcome;
    const externalResponse = formData.get("external_response")?.toString().trim() || null;
    const documentId = formData.get("document_id")?.toString().trim() || null;

    if (!shipmentId) {
      return { success: false, error: "رقم الشحنة مطلوب." };
    }

    // DEF-07: Strictly enforce that only Nafeza is supported for active creation. CargoX is rejected.
    if (!platform || platform !== "nafeza") {
      return { success: false, error: "المنصة الخارجية المعتمدة هي منظومة نافذة (Nafeza) فقط." };
    }

    if (operationType && (operationType.includes("cargox") || operationType === "cargox_other")) {
      return { success: false, error: "إجراءات CargoX مستبعدة تماماً من سير العمل المعتمد في OUT." };
    }

    if (!operationType) {
      return { success: false, error: "نوع الإجراء مطلوب." };
    }

    if (!title) {
      return { success: false, error: "عنوان الإجراء مطلوب." };
    }

    // If 'other' is selected, description is mandatory
    if (
      (operationType === "other" || operationType === "nafeza_other") &&
      (!description || description.length < 5)
    ) {
      return {
        success: false,
        error: "يرجى كتابة وصف توضيحي مفصل للإجراء في خانة الملاحظات (5 أحرف على الأقل).",
      };
    }

    const validOutcomes: ExternalOperationOutcome[] = [
      "pending",
      "successful",
      "failed",
      "rejected",
      "requires_follow_up",
    ];
    if (!outcome || !validOutcomes.includes(outcome)) {
      return { success: false, error: "يرجى تحديد نتيجة الإجراء بشكل صحيح." };
    }

    // Parse operation date
    let operationDateIso = new Date().toISOString();
    if (operationDateInput) {
      const parsed = new Date(operationDateInput);
      if (isNaN(parsed.getTime())) {
        return { success: false, error: "تاريخ ووقت الإجراء الفعلي غير صالح." };
      }
      operationDateIso = parsed.toISOString();
    }

    const supabase = await createClient();

    // 3. Verify shipment existence
    const { data: shipment, error: shipErr } = await supabase
      .from("shipments")
      .select("id, status")
      .eq("id", shipmentId)
      .single();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة المحددة غير موجودة." };
    }

    // 4. Insert External Operation Record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await (supabase.from("shipment_external_operations") as any)
      .insert({
        shipment_id: shipmentId,
        platform,
        operation_type: operationType,
        title,
        description,
        operation_date: operationDateIso,
        created_by: currentUser.id,
        external_reference: externalReference,
        acid_number: acidNumber,
        outcome,
        external_response: externalResponse,
        document_id: documentId,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("[external-operations] Insert error:", insertErr?.message);
      return {
        success: false,
        error: `تعذر حفظ الإجراء الخارجي: ${insertErr?.message || "خطأ غير متوقع"}`,
      };
    }

    revalidatePath(`/shipments/${shipmentId}`);
    return {
      success: true,
      message: "تم تسجيل وتوثيق الإجراء الخارجي بنجاح.",
      operationId: inserted.id,
    };
  } catch (err) {
    console.error("[external-operations] Unexpected exception:", err);
    return {
      success: false,
      error: "حدث خطأ غير متوقع أثناء معالجة الطلب.",
    };
  }
}
