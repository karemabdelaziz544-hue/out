"use server";

/**
 * Final Shipment Documents Server Actions (Step 8)
 *
 * Secure server mutations for managing the 4 core final shipment documents:
 *  - Commercial Invoice (الفاتورة التجارية)
 *  - Packing List (قائمة التعبئة)
 *  - Bill of Lading (بوليصة الشحن)
 *  - Certificate of Origin (شهادة المنشأ)
 *
 * Actions:
 *  1. Customer uploads or replaces document (starts in 'pending', locks once 'approved')
 *  2. Admin approves document ('approved')
 *  3. Admin requests revision with mandatory note ('revision_required')
 *  4. Full audit logging in shipment_document_reviews
 *  5. Automatic transition of shipment to 'documents_completed' when all 4 are approved
 */

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCustomerCompany } from "@/lib/company/queries";
import { createNotification, notifyAdmins } from "@/lib/notifications/queries";
import {
  FINAL_SHIPMENT_DOCUMENT_TYPES,
  FINAL_DOCUMENT_TYPE_LABELS,
  matchFinalDocumentType,
  type FinalShipmentDocumentType,
} from "@/types";

export interface ShipmentDocumentActionResult {
  success: boolean;
  message?: string;
  error?: string;
  documentId?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Helper to check if all 4 required final documents for a shipment are approved.
 */
async function checkAndApplyDocumentsCompletion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  shipmentId: string,
) {
  const { data: docs } = await supabase
    .from("documents")
    .select("document_type, status")
    .eq("shipment_id", shipmentId);

  if (!docs || docs.length === 0) return false;

  const approvedTypes = new Set<FinalShipmentDocumentType>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of docs as any[]) {
    const matched = matchFinalDocumentType(doc.document_type);
    if (matched && doc.status === "approved") {
      approvedTypes.add(matched);
    }
  }

  const isAllApproved = FINAL_SHIPMENT_DOCUMENT_TYPES.every((t) =>
    approvedTypes.has(t),
  );

  if (isAllApproved) {
    // DEF-04: Guard against status regression. Only transition to 'documents_completed'
    // if the shipment is currently in 'awaiting_shipment_documents'.
    // If it has already progressed to 'ready_for_external_stage' or later, keep the advanced status intact.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedShipment } = await (supabase.from("shipments") as any)
      .update({
        status: "documents_completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipmentId)
      .eq("status", "awaiting_shipment_documents")
      .select("id, status")
      .maybeSingle();

    if (updatedShipment) {
      // Record milestone in stage history audit log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_stage_history") as any).insert({
        shipment_id: shipmentId,
        action: "documents_completed",
        note: "اكتملت كافة مستندات الشحنة الأربعة المطلوبة واعتمدت بنجاح",
        performed_at: new Date().toISOString(),
      });
    }

    return true;
  }

  return false;
}

/**
 * 1. Customer Uploads or Replaces a Final Shipment Document.
 * Enforces:
 *  - Customer ownership & company verification
 *  - 1 current document per type per shipment (replaces if exists and not approved)
 *  - Approved document locking (cannot replace/edit if already approved)
 *  - Sets status to 'pending'
 *  - Logs audit event in shipment_document_reviews ('uploaded' or 'resubmitted')
 */
export async function customerUploadShipmentDocumentAction(
  formData: FormData,
): Promise<ShipmentDocumentActionResult> {
  try {
    const currentUser = await requireAuth();

    const shipmentId = formData.get("shipment_id") as string | null;
    const documentTypeRaw = formData.get("document_type") as string | null;
    const file = formData.get("file") as File | null;

    if (!shipmentId) {
      return { success: false, error: "معرّف الشحنة غير محدد." };
    }

    if (!documentTypeRaw) {
      return { success: false, error: "نوع المستند غير محدد." };
    }

    const documentType = matchFinalDocumentType(documentTypeRaw);
    if (!documentType) {
      return {
        success: false,
        error: "نوع المستند غير صالح. يجب أن يكون أحد المستندات النهائية المعتمدة.",
      };
    }

    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: "يرجى اختيار ملف صالح للرفع." };
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
        error: "نوع الملف غير مدعوم. الصيغ المقبولة هي PDF أو الصور (JPG, PNG, WebP).",
      };
    }

    const company = await getCustomerCompany();
    if (!company) {
      return { success: false, error: "لم يتم العثور على الشركة التابعة للعميل." };
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

    if (shipment.company_id !== company.id) {
      return { success: false, error: "غير مصرح لك برفع مستندات لهذه الشحنة." };
    }

    // 2. Check if a document already exists for this (shipment_id, documentType)
    // We check both the english key and arabic equivalents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allShipDocs, error: docsFetchErr } = await (supabase.from("documents") as any)
      .select("id, status, file_path, document_type")
      .eq("shipment_id", shipmentId);

    if (docsFetchErr) {
      return { success: false, error: "تعذر التحقق من مستندات الشحنة." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingDoc = (allShipDocs || []).find((d: any) =>
      matchFinalDocumentType(d.document_type) === documentType,
    );

    // 3. Lock check: If document is already approved, reject modification
    if (existingDoc && existingDoc.status === "approved") {
      return {
        success: false,
        error: "تم اعتماد هذا المستند بالفعل ولا يمكن استبداله أو تعديله.",
      };
    }

    const nowIso = new Date().toISOString();
    const docTitle = FINAL_DOCUMENT_TYPE_LABELS[documentType] || documentType;
    const sanitizedFileName = file.name
      .replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, "_")
      .toLowerCase();

    const documentId = existingDoc?.id || crypto.randomUUID();
    const storagePath = `${currentUser.id}/${documentId}/${sanitizedFileName}`;

    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    // 4. Upload file to storage
    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (storageError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[customerUploadShipmentDocumentAction] Storage error:", storageError);
      }
      return {
        success: false,
        error: "تعذر حفظ الملف في التخزين السحابي. يرجى المحاولة مرة أخرى.",
      };
    }

    // 5. Insert or Update document record in database
    if (existingDoc) {
      // Replacement flow
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase.from("documents") as any)
        .update({
          file_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          status: "pending",
          review_note: null,
          reviewed_at: null,
          reviewed_by: null,
          approved_at: null,
          approved_by: null,
          updated_at: nowIso,
        })
        .eq("id", existingDoc.id);

      if (updateErr) {
        return { success: false, error: "تعذر تحديث بيانات المستند في قاعدة البيانات." };
      }

      // Log resubmitted audit event
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_document_reviews") as any).insert({
        document_id: existingDoc.id,
        shipment_id: shipmentId,
        document_type: documentType,
        action: "resubmitted",
        note: "تم استبدال ورفع نسخة جديدة من المستند",
        performed_by: currentUser.id,
        performed_at: nowIso,
      });
    } else {
      // Insert flow
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase.from("documents") as any).insert({
        id: documentId,
        customer_id: currentUser.id,
        company_id: company.id,
        shipment_id: shipmentId,
        title: docTitle,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        document_type: documentType,
        status: "pending",
        approved_at: null,
        approved_by: null,
        review_note: null,
        reviewed_at: null,
        reviewed_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (insertErr) {
        await supabase.storage.from("documents").remove([storagePath]);
        return { success: false, error: "تعذر حفظ سجل المستند في قاعدة البيانات." };
      }

      // Log uploaded audit event
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_document_reviews") as any).insert({
        document_id: documentId,
        shipment_id: shipmentId,
        document_type: documentType,
        action: "uploaded",
        note: null,
        performed_by: currentUser.id,
        performed_at: nowIso,
      });
    }

    await notifyAdmins({
      shipmentId,
      title: "مستند شحنة جديد بانتظار المراجعة",
      message: `قام العميل برفع مستند ${docTitle} للشحنة ${shipment?.reference_number || ""}.`,
      type: "document",
      link: `/shipments/${shipmentId}`,
    });

    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath("/my-shipments");
    revalidatePath("/shipments");

    return {
      success: true,
      message: `تم رفع ${docTitle} بنجاح وهو الآن قيد المراجعة.`,
      documentId,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[customerUploadShipmentDocumentAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء رفع المستند." };
  }
}

/**
 * 2. Admin Approves a Final Shipment Document.
 * Enforces:
 *  - Role: Admin or Manager only
 *  - Locks document from future modifications
 *  - Logs audit event in shipment_document_reviews ('approved')
 *  - Automatically checks if all 4 required documents are approved -> transitions shipment to 'documents_completed'
 */
export async function adminApproveShipmentDocumentAction(
  formData: FormData,
): Promise<ShipmentDocumentActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);

    const shipmentId = formData.get("shipment_id") as string;
    const documentId = formData.get("document_id") as string;

    if (!shipmentId || !documentId) {
      return { success: false, error: "معرّف الشحنة أو المستند غير محدد." };
    }

    const supabase = await createClient();

    // 1. Fetch document and ensure it belongs to this shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docErr } = await (supabase.from("documents") as any)
      .select("id, shipment_id, status, document_type, title")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) {
      return { success: false, error: "المستند غير موجود." };
    }

    if (doc.shipment_id !== shipmentId) {
      return { success: false, error: "المستند لا ينتمي إلى هذه الشحنة." };
    }

    if (doc.status === "approved") {
      return { success: true, message: "تم اعتماد هذا المستند بالفعل." };
    }

    const nowIso = new Date().toISOString();
    const normalizedType = matchFinalDocumentType(doc.document_type) || doc.document_type;

    // 2. Update document status -> approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("documents") as any)
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

    if (updateErr) {
      return { success: false, error: "تعذر تحديث حالة المستند إلى معتمد." };
    }

    // 3. Log audit event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_document_reviews") as any).insert({
      document_id: documentId,
      shipment_id: shipmentId,
      document_type: normalizedType,
      action: "approved",
      note: null,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    // 4. Check if all 4 required documents are now approved
    const allApproved = await checkAndApplyDocumentsCompletion(supabase, shipmentId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipRecord } = await (supabase.from("shipments") as any)
      .select("customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipRecord?.customer_id) {
      await createNotification({
        userId: shipRecord.customer_id,
        shipmentId,
        title: allApproved ? "اكتمال مستندات الشحنة" : "اعتماد مستند شحنة",
        message: allApproved
          ? `تم اعتماد كافة المستندات النهائية للشحنة ${shipRecord.reference_number || ""} بنجاح.`
          : `تم اعتماد مستند ${FINAL_DOCUMENT_TYPE_LABELS[normalizedType as FinalShipmentDocumentType] || doc.title} للشحنة ${shipRecord.reference_number || ""}.`,
        type: allApproved ? "success" : "document",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");

    const message = allApproved
      ? "تم اعتماد المستند بنجاح، واكتملت جميع مستندات الشحنة المطلوبة ✅"
      : "تم اعتماد المستند بنجاح.";

    return {
      success: true,
      message,
      documentId,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminApproveShipmentDocumentAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء اعتماد المستند." };
  }
}

/**
 * 3. Admin Requests Revision for a Final Shipment Document.
 * Enforces:
 *  - Role: Admin or Manager only
 *  - Mandatory review note explaining the revision reason
 *  - Updates status to 'revision_required'
 *  - Logs audit event in shipment_document_reviews ('revision_requested')
 */
export async function adminRequestShipmentDocumentRevisionAction(
  formData: FormData,
): Promise<ShipmentDocumentActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);

    const shipmentId = formData.get("shipment_id") as string;
    const documentId = formData.get("document_id") as string;
    const noteRaw = formData.get("note") as string | null;

    if (!shipmentId || !documentId) {
      return { success: false, error: "معرّف الشحنة أو المستند غير محدد." };
    }

    const note = (noteRaw || "").trim();
    if (!note) {
      return {
        success: false,
        error: "يرجى كتابة سبب طلب التعديل بوضوح حتى يتمكن العميل من تصحيحه.",
      };
    }

    const supabase = await createClient();

    // 1. Fetch document and verify
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docErr } = await (supabase.from("documents") as any)
      .select("id, shipment_id, status, document_type")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) {
      return { success: false, error: "المستند غير موجود." };
    }

    if (doc.shipment_id !== shipmentId) {
      return { success: false, error: "المستند لا ينتمي إلى هذه الشحنة." };
    }

    const nowIso = new Date().toISOString();
    const normalizedType = matchFinalDocumentType(doc.document_type) || doc.document_type;

    // 2. Update document status -> revision_required
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("documents") as any)
      .update({
        status: "revision_required",
        review_note: note,
        reviewed_at: nowIso,
        reviewed_by: adminUser.id,
        updated_at: nowIso,
      })
      .eq("id", documentId);

    if (updateErr) {
      return { success: false, error: "تعذر تحديث حالة المستند." };
    }

    // 3. Log audit event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_document_reviews") as any).insert({
      document_id: documentId,
      shipment_id: shipmentId,
      document_type: normalizedType,
      action: "revision_requested",
      note,
      performed_by: adminUser.id,
      performed_at: nowIso,
    });

    // 4. Invalidate readiness or enforce operational phase lock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentShipment } = await (supabase.from("shipments") as any)
      .select("status, customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    const currentStatus = currentShipment?.status;
    const isCustomsOperationalPhase = [
      "customs_in_progress",
      "customs_cleared",
      "delivered",
    ].includes(currentStatus || "");

    // Check if any operational customs stage (order >= 4) has already started or completed
    let anyOperationalStageStarted = false;
    if (currentStatus === "ready_for_external_stage") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: activeCustomsStages } = await (supabase.from("shipment_customs_stages") as any)
        .select("stage_key, status, stage_order")
        .eq("shipment_id", shipmentId)
        .gte("stage_order", 4)
        .in("status", ["in_progress", "completed"]);

      if (activeCustomsStages && activeCustomsStages.length > 0) {
        anyOperationalStageStarted = true;
      }
    }

    if (isCustomsOperationalPhase || anyOperationalStageStarted) {
      // PHASE LOCK: Preserve operational status and do NOT regress to awaiting_shipment_documents.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_stage_history") as any).insert({
        shipment_id: shipmentId,
        action: "document_revision_requested_in_customs",
        note: `طلب تعديل مستند (${FINAL_DOCUMENT_TYPE_LABELS[normalizedType as FinalShipmentDocumentType] || doc.title}) أثناء العمليات الجمركية دون ارتداد الحالة: ${note}`,
        performed_by: adminUser.id,
        performed_at: nowIso,
      });
    } else if (
      currentStatus === "documents_completed" ||
      currentStatus === "ready_for_external_stage"
    ) {
      // Pre-customs phase: revert status to awaiting_shipment_documents because operational stages have not started
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipments") as any)
        .update({
          status: "awaiting_shipment_documents",
          updated_at: nowIso,
        })
        .eq("id", shipmentId);

      // Record rollback in shipment_stage_history
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipment_stage_history") as any).insert({
        shipment_id: shipmentId,
        action: "readiness_invalidated",
        note: `تم إلغاء جاهزية الشحنة والتراجع إلى بانتظار المستندات لطلب تعديل مستند: ${FINAL_DOCUMENT_TYPE_LABELS[normalizedType as FinalShipmentDocumentType] || doc.title}`,
        performed_by: adminUser.id,
        performed_at: nowIso,
      });
    }

    const revShipRecord = currentShipment;

    if (revShipRecord?.customer_id) {
      await createNotification({
        userId: revShipRecord.customer_id,
        shipmentId,
        title: "مطلوب تعديل مستند شحنة",
        message: `مطلوب تعديل مستند ${FINAL_DOCUMENT_TYPE_LABELS[normalizedType as FinalShipmentDocumentType] || "المستند"} للشحنة ${revShipRecord.reference_number || ""}: ${note}`,
        type: "warning",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath("/my-shipments");

    return {
      success: true,
      message: "تم إرسال طلب التعديل للعميل مع الملاحظة المحددة.",
      documentId,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminRequestShipmentDocumentRevisionAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء طلب تعديل المستند." };
  }
}
