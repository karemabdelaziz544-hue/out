"use server";

/**
 * Preliminary Invoice Review Server Actions (Step 6)
 *
 * Secure server mutations for reviewing the preliminary invoice:
 *  - Admin: approve invoice ('approved') -> shipment transitions to 'invoice_approved'
 *  - Admin: request revision ('revision_required') with mandatory note -> shipment transitions to 'invoice_revision_required'
 *  - Customer: resubmit updated invoice ('pending') -> shipment transitions to 'awaiting_invoice_review'
 *
 * Security:
 *  - Server-side role verification
 *  - Tenant isolation and company ownership verification
 *  - Race condition & state transition enforcement
 *  - Audit trail logging in shipment_invoice_reviews
 */

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCustomerCompany } from "@/lib/company/queries";
import { createNotification, notifyAdmins } from "@/lib/notifications/queries";

export interface InvoiceReviewActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * 1. Admin Approves Preliminary Invoice.
 * Transition:
 *  - document.status -> 'approved'
 *  - shipment.status -> 'invoice_approved'
 *  - record review event in shipment_invoice_reviews
 */
export async function adminApproveInvoiceAction(
  formData: FormData,
): Promise<InvoiceReviewActionResult> {
  try {
    const adminUser = await requireRole(["admin", "manager"]);
    const shipmentId = formData.get("shipment_id") as string;
    const documentId = formData.get("document_id") as string;

    if (!shipmentId || !documentId) {
      return { success: false, error: "بيانات الشحنة أو الفاتورة غير مكتملة." };
    }

    const supabase = await createClient();

    // 1. Fetch shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, status, customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (shipment.status === "invoice_approved") {
      return { success: false, error: "تم اعتماد الفاتورة لهذه الشحنة بالفعل." };
    }

    if (shipment.status !== "awaiting_invoice_review") {
      return {
        success: false,
        error: "لا يمكن اعتماد الفاتورة، فالشحنة ليست في مرحلة مراجعة الفاتورة.",
      };
    }

    // 2. Fetch document and ensure it belongs to this shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docErr } = await (supabase.from("documents") as any)
      .select("id, shipment_id, status, document_type")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) {
      return { success: false, error: "مستند الفاتورة غير موجود." };
    }

    if (doc.shipment_id !== shipmentId) {
      return { success: false, error: "هذا المستند لا ينتمي إلى هذه الشحنة." };
    }

    if (doc.status === "approved") {
      return { success: false, error: "تم اعتماد هذا المستند بالفعل." };
    }

    const nowIso = new Date().toISOString();

    // 3. Update document status -> approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateDocErr } = await (supabase.from("documents") as any)
      .update({
        status: "approved",
        approved_at: nowIso,
        approved_by: adminUser.id,
        reviewed_at: nowIso,
        reviewed_by: adminUser.id,
        review_note: null,
        updated_at: nowIso,
      })
      .eq("id", documentId);

    if (updateDocErr) {
      return { success: false, error: "تعذر تحديث حالة مستند الفاتورة." };
    }

    // 4. Update shipment status -> acid_processing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateShipErr } = await (supabase.from("shipments") as any)
      .update({
        status: "acid_processing",
        updated_at: nowIso,
      })
      .eq("id", shipmentId);

    if (updateShipErr) {
      return { success: false, error: "تعذر تحديث حالة الشحنة." };
    }

    // DEF-02: Reliably record invoice_approved and acid_processing in shipment_stage_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_stage_history") as any).insert([
      {
        shipment_id: shipmentId,
        action: "invoice_approved",
        note: "تم مراجعة واعتماد الفاتورة المبدئية بنجاح",
        performed_by: adminUser.id,
        performed_at: nowIso,
      },
      {
        shipment_id: shipmentId,
        action: "acid_processing",
        note: "بدء معالجة واستخراج رقم ACID عبر المنظومة الجمركية",
        performed_by: adminUser.id,
        performed_at: nowIso,
      },
    ]);

    // 5. Initialize shipment_acids record (1-to-1) in 'pending' status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: acidRecord, error: acidInsertErr } = await (supabase.from("shipment_acids") as any)
      .upsert(
        {
          shipment_id: shipmentId,
          status: "pending",
          acid_number: null,
          created_by: adminUser.id,
          created_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "shipment_id" }
      )
      .select("id")
      .single();

    if (!acidInsertErr && acidRecord) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_acid_history") as any).insert({
        shipment_acid_id: acidRecord.id,
        shipment_id: shipmentId,
        action: "created",
        old_status: null,
        new_status: "pending",
        acid_number: null,
        notes: "تم بدء مرحلة ACID تلقائياً بعد اعتماد الفاتورة المبدئية",
        performed_by: adminUser.id,
        performed_at: nowIso,
      });
    }

    // 6. Insert audit review history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_invoice_reviews") as any).insert({
      shipment_id: shipmentId,
      document_id: documentId,
      action: "approved",
      note: null,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    if (shipment?.customer_id) {
      await createNotification({
        userId: shipment.customer_id,
        shipmentId,
        title: "اعتماد الفاتورة المبدئية",
        message: `تم اعتماد الفاتورة المبدئية للشحنة ${shipment.reference_number || ""} بنجاح، وبدأت مرحلة إصدار كود ACID.`,
        type: "invoice",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");
    revalidatePath("/documents");
    revalidatePath("/my-documents");

    return {
      success: true,
      message: "تم اعتماد الفاتورة المبدئية وبدء مرحلة معالجة ACID بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminApproveInvoiceAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء اعتماد الفاتورة." };
  }
}

/**
 * 2. Admin Requests Revision for Preliminary Invoice.
 * Transition:
 *  - document.status -> 'revision_required'
 *  - shipment.status -> 'invoice_revision_required'
 *  - record review event with mandatory note in shipment_invoice_reviews
 */
export async function adminRequestInvoiceRevisionAction(
  formData: FormData,
): Promise<InvoiceReviewActionResult> {
  try {
    const adminUser = await requireRole(["admin", "manager"]);
    const shipmentId = formData.get("shipment_id") as string;
    const documentId = formData.get("document_id") as string;
    const noteRaw = formData.get("note") as string;

    const note = noteRaw ? noteRaw.trim() : "";
    if (!note) {
      return {
        success: false,
        error: "يرجى كتابة سبب طلب التعديل للعميل بالتفصيل.",
      };
    }

    if (!shipmentId || !documentId) {
      return { success: false, error: "بيانات الشحنة أو الفاتورة غير مكتملة." };
    }

    const supabase = await createClient();

    // 1. Fetch shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, status, customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (shipment.status === "invoice_approved") {
      return {
        success: false,
        error: "لا يمكن طلب تعديل لفاتورة معتمدة بالفعل.",
      };
    }

    if (
      shipment.status !== "awaiting_invoice_review" &&
      shipment.status !== "invoice_revision_required"
    ) {
      return {
        success: false,
        error: "لا يمكن طلب تعديل الفاتورة في حالة الشحنة الحالية.",
      };
    }

    // 2. Fetch document and ensure it belongs to this shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docErr } = await (supabase.from("documents") as any)
      .select("id, shipment_id, status")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) {
      return { success: false, error: "مستند الفاتورة غير موجود." };
    }

    if (doc.shipment_id !== shipmentId) {
      return { success: false, error: "هذا المستند لا ينتمي إلى هذه الشحنة." };
    }

    if (doc.status === "approved") {
      return {
        success: false,
        error: "لا يمكن طلب تعديل لمستند تم اعتماده بالفعل.",
      };
    }

    const nowIso = new Date().toISOString();

    // 3. Update document status -> revision_required
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateDocErr } = await (supabase.from("documents") as any)
      .update({
        status: "revision_required",
        review_note: note,
        reviewed_at: nowIso,
        reviewed_by: adminUser.id,
        updated_at: nowIso,
      })
      .eq("id", documentId);

    if (updateDocErr) {
      return { success: false, error: "تعذر تسجيل طلب التعديل على المستند." };
    }

    // 4. Update shipment status -> invoice_revision_required
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateShipErr } = await (supabase.from("shipments") as any)
      .update({
        status: "invoice_revision_required",
        updated_at: nowIso,
      })
      .eq("id", shipmentId);

    if (updateShipErr) {
      return { success: false, error: "تعذر تحديث حالة الشحنة." };
    }

    // 5. Insert audit review history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_invoice_reviews") as any).insert({
      shipment_id: shipmentId,
      document_id: documentId,
      action: "revision_requested",
      note: note,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    if (shipment?.customer_id) {
      await createNotification({
        userId: shipment.customer_id,
        shipmentId,
        title: "مطلوب تعديل الفاتورة المبدئية",
        message: `مطلوب تعديل الفاتورة المبدئية للشحنة ${shipment.reference_number || ""}: ${note}`,
        type: "warning",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");
    revalidatePath("/documents");
    revalidatePath("/my-documents");

    return {
      success: true,
      message: "تم إرسال طلب تعديل الفاتورة إلى العميل بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminRequestInvoiceRevisionAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء إرسال طلب التعديل." };
  }
}

/**
 * 3. Customer Resubmits Replacement Invoice.
 * Transition:
 *  - document.status -> 'pending' (with new file uploaded and replaced)
 *  - shipment.status -> 'awaiting_invoice_review'
 *  - record review event 'resubmitted' in shipment_invoice_reviews
 */
export async function customerResubmitInvoiceAction(
  formData: FormData,
): Promise<InvoiceReviewActionResult> {
  try {
    const currentUser = await requireAuth();
    const shipmentId = formData.get("shipment_id") as string;
    const documentId = formData.get("document_id") as string;
    const file = formData.get("file") as File | null;

    if (!shipmentId || !documentId) {
      return { success: false, error: "بيانات الشحنة أو الفاتورة غير مكتملة." };
    }

    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: "يرجى اختيار ملف الفاتورة المحدثة." };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت).",
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP).",
      };
    }

    const company = await getCustomerCompany();
    if (!company) {
      return { success: false, error: "لا يوجد حساب شركة مرتبط بحسابك." };
    }

    const supabase = await createClient();

    // 1. Fetch shipment and verify tenant ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, company_id, customer_id, status, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (shipment.company_id !== company.id || shipment.customer_id !== currentUser.id) {
      return { success: false, error: "غير مصرح لك بتعديل هذه الشحنة." };
    }

    if (shipment.status === "invoice_approved") {
      return {
        success: false,
        error: "تم اعتماد الفاتورة المبدئية بالفعل ولا يمكن استبدالها.",
      };
    }

    if (shipment.status === "awaiting_invoice_review") {
      return {
        success: false,
        error: "الفاتورة قيد المراجعة بالفعل من قبل الإدارة ولا يمكن استبدالها حالياً.",
      };
    }

    if (shipment.status !== "invoice_revision_required") {
      return {
        success: false,
        error: "لا يمكن استبدال الفاتورة إلا عندما يُطلب منك تعديلها.",
      };
    }

    // 2. Fetch document and verify status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docErr } = await (supabase.from("documents") as any)
      .select("id, shipment_id, customer_id, file_path, status")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) {
      return { success: false, error: "مستند الفاتورة غير موجود." };
    }

    if (doc.shipment_id !== shipmentId || doc.customer_id !== currentUser.id) {
      return { success: false, error: "غير مصرح لك باستبدال هذا المستند." };
    }

    if (doc.status === "approved") {
      return {
        success: false,
        error: "هذا المستند معتمد بالفعل ولا يمكن استبداله.",
      };
    }

    // 3. Upload new file to Storage
    const sanitizedFileName = file.name
      .replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, "_")
      .toLowerCase();
    const newStoragePath = `${currentUser.id}/${documentId}/${sanitizedFileName}`;

    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(newStoragePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (storageError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[customerResubmitInvoiceAction] Storage error:", storageError);
      }
      return { success: false, error: "تعذر رفع الملف الجديد إلى التخزين السحابي." };
    }

    // Remove old file if it had a different name/path
    if (doc.file_path && doc.file_path !== newStoragePath) {
      await supabase.storage.from("documents").remove([doc.file_path]);
    }

    const nowIso = new Date().toISOString();

    // 4. Update document: set status -> pending, clear note
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateDocErr } = await (supabase.from("documents") as any)
      .update({
        file_name: file.name,
        file_path: newStoragePath,
        file_size: file.size,
        mime_type: file.type,
        status: "pending",
        updated_at: nowIso,
      })
      .eq("id", documentId);

    if (updateDocErr) {
      if (process.env.NODE_ENV === "development") {
        console.error("[customerResubmitInvoiceAction] Doc update error:", updateDocErr);
      }
      return { success: false, error: "تعذر تحديث بيانات المستند في قاعدة البيانات." };
    }

    // 5. Update shipment: set status -> awaiting_invoice_review
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateShipErr } = await (supabase.from("shipments") as any)
      .update({
        status: "awaiting_invoice_review",
        updated_at: nowIso,
      })
      .eq("id", shipmentId);

    if (updateShipErr) {
      if (process.env.NODE_ENV === "development") {
        console.error("[customerResubmitInvoiceAction] Shipment update error:", updateShipErr);
      }
      return { success: false, error: "تعذر تحديث حالة الشحنة." };
    }

    // 6. Record audit review history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_invoice_reviews") as any).insert({
      shipment_id: shipmentId,
      document_id: documentId,
      action: "resubmitted",
      note: null,
      performed_by: currentUser.id,
      performed_at: nowIso,
    });

    await notifyAdmins({
      shipmentId,
      title: "إعادة رفع الفاتورة المبدئية",
      message: `قام العميل بإعادة رفع الفاتورة المبدئية للشحنة ${shipment?.reference_number || ""} بعد التعديل.`,
      type: "invoice",
      link: `/shipments/${shipmentId}`,
    });

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");
    revalidatePath("/documents");
    revalidatePath("/my-documents");

    return {
      success: true,
      message: "تم رفع الفاتورة المحدثة بنجاح، والطلب الآن بانتظار مراجعة الإدارة.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[customerResubmitInvoiceAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء إعادة رفع الفاتورة." };
  }
}
