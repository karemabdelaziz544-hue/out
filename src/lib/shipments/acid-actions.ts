"use server";

/**
 * Shipment ACID Workflow Server Actions (Step 7)
 *
 * Secure server mutations for managing the internal OUT ACID lifecycle:
 *  - Admin: start processing ('processing')
 *  - Admin: record issued ACID number ('issued')
 *  - Admin: record failure reason ('failed')
 *
 * Security:
 *  - Role verification: Staff/Admin only for all write operations
 *  - Duplicate prevention: Enforces 1-to-1 relationship and uniqueness
 *  - Issued lock: Rejects modifications once ACID is officially issued
 *  - Full audit logging in shipment_acid_history
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/queries";

export interface AcidActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 1. Admin Starts ACID Processing.
 * Transition:
 *  - status: 'pending' | 'failed' -> 'processing'
 *  - shipment.status: 'acid_processing'
 *  - record audit history event 'processing_started'
 */
export async function adminStartAcidProcessingAction(
  formData: FormData,
): Promise<AcidActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);
    const shipmentId = formData.get("shipment_id") as string;
    const notesRaw = formData.get("notes") as string | null;

    if (!shipmentId) {
      return { success: false, error: "معرّف الشحنة غير محدد." };
    }

    const supabase = await createClient();

    // 1. Fetch shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, status")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    // 2. Fetch or initialize shipment_acids
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAcid, error: acidFetchErr } = await (supabase.from("shipment_acids") as any)
      .select("id, status, notes")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (acidFetchErr) {
      return { success: false, error: "تعذر التحقق من سجل ACID." };
    }

    if (existingAcid?.status === "issued") {
      return {
        success: false,
        error: "تم إصدار رقم ACID لهذه الشحنة بالفعل ولا يمكن تعديله أو إعادة معالجته.",
      };
    }

    const nowIso = new Date().toISOString();
    const notes = notesRaw?.trim() || existingAcid?.notes || null;
    let acidId = existingAcid?.id;
    const oldStatus = existingAcid?.status || "pending";

    if (!acidId) {
      // Create initial record in processing status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertErr } = await (supabase.from("shipment_acids") as any)
        .insert({
          shipment_id: shipmentId,
          status: "processing",
          acid_number: null,
          notes,
          created_by: adminUser.id,
          updated_by: adminUser.id,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        return { success: false, error: "تعذر إنشاء سجل معالجة ACID." };
      }
      acidId = inserted.id;
    } else {
      // Update existing record to processing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase.from("shipment_acids") as any)
        .update({
          status: "processing",
          notes,
          updated_by: adminUser.id,
          updated_at: nowIso,
        })
        .eq("id", acidId);

      if (updErr) {
        return { success: false, error: "تعذر تحديث حالة معالجة ACID." };
      }
    }

    // Update shipment status if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipments") as any)
      .update({
        status: "acid_processing",
        updated_at: nowIso,
      })
      .eq("id", shipmentId);

    // Record in history audit trail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_acid_history") as any).insert({
      shipment_acid_id: acidId,
      shipment_id: shipmentId,
      action: "processing_started",
      old_status: oldStatus,
      new_status: "processing",
      acid_number: null,
      notes,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");

    return {
      success: true,
      message: "تم بدء معالجة ACID بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminStartAcidProcessingAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء بدء معالجة ACID." };
  }
}

/**
 * 2. Admin Enters and Issues ACID Number.
 * Transition:
 *  - status: 'processing' | 'pending' | 'failed' -> 'issued'
 *  - acid_number: entered value
 *  - issued_at: now
 *  - shipment.status: 'acid_issued'
 *  - record audit history event 'issued'
 */
export async function adminIssueAcidAction(
  formData: FormData,
): Promise<AcidActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);
    const shipmentId = formData.get("shipment_id") as string;
    const acidNumberRaw = formData.get("acid_number") as string;
    const notesRaw = formData.get("notes") as string | null;

    if (!shipmentId) {
      return { success: false, error: "معرّف الشحنة غير محدد." };
    }

    const acidNumber = (acidNumberRaw || "").trim();
    if (!acidNumber) {
      return { success: false, error: "يرجى إدخال رقم ACID الصادر." };
    }

    if (acidNumber.length < 5) {
      return {
        success: false,
        error: "رقم ACID غير مكتمل، يجب ألا يقل عن 5 خانات.",
      };
    }

    if (acidNumber.length > 50) {
      return {
        success: false,
        error: "رقم ACID يتجاوز الحد الأقصى المسموح به.",
      };
    }

    const supabase = await createClient();

    // 1. Check uniqueness: ensure this ACID number is not already assigned to another shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: duplicateCheck, error: dupErr } = await (supabase.from("shipment_acids") as any)
      .select("id, shipment_id")
      .eq("acid_number", acidNumber)
      .maybeSingle();

    if (!dupErr && duplicateCheck && duplicateCheck.shipment_id !== shipmentId) {
      return {
        success: false,
        error: "رقم ACID هذا مسجل مسبقاً لشحنة أخرى في النظام.",
      };
    }

    // 2. Fetch existing shipment_acids
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAcid, error: acidFetchErr } = await (supabase.from("shipment_acids") as any)
      .select("id, status, notes")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (acidFetchErr) {
      return { success: false, error: "تعذر التحقق من سجل ACID." };
    }

    if (existingAcid?.status === "issued") {
      return {
        success: false,
        error: "تم إصدار رقم ACID لهذه الشحنة مسبقاً، ولا يمكن تعديل الرقم بعد الاعتماد.",
      };
    }

    const nowIso = new Date().toISOString();
    const notes = notesRaw?.trim() || existingAcid?.notes || null;
    let acidId = existingAcid?.id;
    const oldStatus = existingAcid?.status || "pending";

    if (!acidId) {
      // Insert new record as issued
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertErr } = await (supabase.from("shipment_acids") as any)
        .insert({
          shipment_id: shipmentId,
          acid_number: acidNumber,
          status: "issued",
          notes,
          created_by: adminUser.id,
          updated_by: adminUser.id,
          issued_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        return {
          success: false,
          error: "تعذر حفظ وإصدار رقم ACID في قاعدة البيانات.",
        };
      }
      acidId = inserted.id;
    } else {
      // Update record to issued
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase.from("shipment_acids") as any)
        .update({
          acid_number: acidNumber,
          status: "issued",
          notes,
          issued_at: nowIso,
          updated_by: adminUser.id,
          updated_at: nowIso,
        })
        .eq("id", acidId);

      if (updErr) {
        return {
          success: false,
          error: "تعذر تحديث حالة وإصدار رقم ACID.",
        };
      }
    }

    // 3. Update shipment status -> awaiting_shipment_documents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: shipUpdErr } = await (supabase.from("shipments") as any)
      .update({
        status: "awaiting_shipment_documents",
        updated_at: nowIso,
      })
      .eq("id", shipmentId);

    if (shipUpdErr) {
      if (process.env.NODE_ENV === "development") {
        console.error("[adminIssueAcidAction] Shipment status update error:", shipUpdErr);
      }
    }

    // 4. Record in history audit trail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_acid_history") as any).insert({
      shipment_acid_id: acidId,
      shipment_id: shipmentId,
      action: "issued",
      old_status: oldStatus,
      new_status: "issued",
      acid_number: acidNumber,
      notes,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    // DEF-02: Reliably record acid_issued and awaiting_shipment_documents milestones in shipment_stage_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_stage_history") as any).insert([
      {
        shipment_id: shipmentId,
        action: "acid_issued",
        note: `تم استخراج وتوثيق رقم ACID: ${acidNumber}`,
        performed_by: adminUser.id,
        performed_at: nowIso,
      },
      {
        shipment_id: shipmentId,
        action: "awaiting_shipment_documents",
        note: "فتح باب رفع المستندات الأربعة النهائية للشحنة",
        performed_by: adminUser.id,
        performed_at: nowIso,
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipRecord } = await (supabase.from("shipments") as any)
      .select("customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipRecord?.customer_id) {
      await createNotification({
        userId: shipRecord.customer_id,
        shipmentId,
        title: "تم إصدار رقم ACID بنجاح",
        message: `تم إصدار كود ACID للشحنة ${shipRecord.reference_number || ""}: ${acidNumber}. يرجى البدء في رفع مستندات الشحنة النهائية.`,
        type: "acid",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");

    return {
      success: true,
      message: `تم تسجيل وإصدار رقم ACID (${acidNumber}) بنجاح.`,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminIssueAcidAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء إصدار رقم ACID." };
  }
}

/**
 * 3. Admin Records ACID Processing Failure.
 * Transition:
 *  - status: 'failed'
 *  - notes: mandatory failure reason
 *  - record audit history event 'failed'
 */
export async function adminFailAcidAction(
  formData: FormData,
): Promise<AcidActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);
    const shipmentId = formData.get("shipment_id") as string;
    const reasonRaw = formData.get("reason") as string;

    if (!shipmentId) {
      return { success: false, error: "معرّف الشحنة غير محدد." };
    }

    const reason = (reasonRaw || "").trim();
    if (!reason) {
      return {
        success: false,
        error: "يرجى كتابة سبب تعثر عملية إصدار ACID بالتفصيل.",
      };
    }

    const supabase = await createClient();

    // 1. Fetch existing shipment_acids
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAcid, error: acidFetchErr } = await (supabase.from("shipment_acids") as any)
      .select("id, status")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (acidFetchErr) {
      return { success: false, error: "تعذر التحقق من سجل ACID." };
    }

    if (existingAcid?.status === "issued") {
      return {
        success: false,
        error: "لا يمكن تسجيل تعثر لـ ACID تم إصداره بالفعل.",
      };
    }

    const nowIso = new Date().toISOString();
    let acidId = existingAcid?.id;
    const oldStatus = existingAcid?.status || "pending";

    if (!acidId) {
      // Create record in failed status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertErr } = await (supabase.from("shipment_acids") as any)
        .insert({
          shipment_id: shipmentId,
          status: "failed",
          notes: reason,
          created_by: adminUser.id,
          updated_by: adminUser.id,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        return { success: false, error: "تعذر تسجيل حالة التعثر." };
      }
      acidId = inserted.id;
    } else {
      // Update record to failed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase.from("shipment_acids") as any)
        .update({
          status: "failed",
          notes: reason,
          updated_by: adminUser.id,
          updated_at: nowIso,
        })
        .eq("id", acidId);

      if (updErr) {
        return { success: false, error: "تعذر تحديث حالة التعثر." };
      }
    }

    // Record in history audit trail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_acid_history") as any).insert({
      shipment_acid_id: acidId,
      shipment_id: shipmentId,
      action: "failed",
      old_status: oldStatus,
      new_status: "failed",
      acid_number: null,
      notes: reason,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");

    return {
      success: true,
      message: "تم تسجيل حالة التعثر بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminFailAcidAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء تسجيل حالة التعثر." };
  }
}
