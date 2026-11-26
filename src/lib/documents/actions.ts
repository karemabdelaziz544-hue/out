"use server";

/**
 * Documents Server Actions
 *
 * Secure server-side mutations for document uploads, updates, replacements,
 * deletion, and admin approvals.
 * Strictly enforces customer ownership, role authorization, and approved document locking.
 */

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_DOCUMENT_TYPES } from "@/types";

export interface DocumentActionResult {
  success: boolean;
  message?: string;
  error?: string;
  documentId?: string;
  signedUrl?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Upload a document on behalf of the authenticated customer.
 * Starts in 'pending' status.
 */
export async function uploadCustomerDocumentAction(
  formData: FormData,
): Promise<DocumentActionResult> {
  try {
    const currentUser = await requireAuth();

    const file = formData.get("file") as File | null;
    const titleInput = formData.get("title") as string | null;
    const documentTypeInput = formData.get("document_type") as string | null;

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
        error: "نوع الملف غير مدعوم. الأنواع المسموح بها هي PDF أو الصور (JPG, PNG, WebP).",
      };
    }

    const documentType =
      documentTypeInput && documentTypeInput.trim()
        ? documentTypeInput.trim()
        : DEFAULT_DOCUMENT_TYPES[0];

    const title =
      titleInput && titleInput.trim()
        ? titleInput.trim()
        : file.name.replace(/\.[^/.]+$/, "");

    const sanitizedFileName = file.name
      .replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, "_")
      .toLowerCase();

    const documentId = crypto.randomUUID();
    const storagePath = `${currentUser.id}/${documentId}/${sanitizedFileName}`;

    const supabase = await createClient();

    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[uploadCustomerDocumentAction] Storage error:", storageError);
      }
      return {
        success: false,
        error: "تعذر حفظ الملف في التخزين السحابي. يرجى المحاولة مرة أخرى.",
      };
    }

    // Insert with status = 'pending'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase.from("documents") as any).insert({
      id: documentId,
      customer_id: currentUser.id,
      shipment_id: null,
      title,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      document_type: documentType,
      status: "pending",
      approved_at: null,
      approved_by: null,
    });

    if (dbError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[uploadCustomerDocumentAction] DB error:", dbError);
      }
      await supabase.storage.from("documents").remove([storagePath]);

      return {
        success: false,
        error: "تعذر حفظ بيانات المستند في قاعدة البيانات.",
      };
    }

    revalidatePath("/my-documents");
    revalidatePath("/documents");
    revalidatePath(`/customers/${currentUser.id}`);

    return {
      success: true,
      message: "تم رفع المستند بنجاح.",
      documentId,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[uploadCustomerDocumentAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ غير متوقع أثناء معالجة المستند.",
    };
  }
}

/**
 * Edit document title and document type.
 * STRICT SECURITY: Rejects if document is already approved.
 */
export async function editCustomerDocumentAction(
  documentId: string,
  title: string,
  documentType: string,
): Promise<DocumentActionResult> {
  try {
    const currentUser = await requireAuth();

    if (!documentId || !title?.trim()) {
      return { success: false, error: "بيانات التعديل غير مكتملة." };
    }

    const supabase = await createClient();

    // 1. Fetch document and check ownership + status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: queryError } = await (supabase.from("documents") as any)
      .select("id, customer_id, status")
      .eq("id", documentId)
      .single();

    if (queryError || !doc) {
      return { success: false, error: "المستند غير موجود." };
    }

    if (doc.customer_id !== currentUser.id && currentUser.role !== "admin") {
      return { success: false, error: "غير مصرح لك بتعديل هذا المستند." };
    }

    // 2. Lock check: Approved documents CANNOT be edited by customers
    if (doc.status === "approved" && currentUser.role !== "admin") {
      return {
        success: false,
        error: "هذا المستند معتمد بالفعل ولا يمكن تعديله.",
      };
    }

    // 3. Update database record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase.from("documents") as any)
      .update({
        title: title.trim(),
        document_type: documentType.trim() || DEFAULT_DOCUMENT_TYPES[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      return { success: false, error: "تعذر تحديث بيانات المستند." };
    }

    revalidatePath("/my-documents");
    revalidatePath("/documents");
    revalidatePath(`/customers/${doc.customer_id}`);

    return {
      success: true,
      message: "تم تحديث بيانات المستند بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[editCustomerDocumentAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء تعديل المستند." };
  }
}

/**
 * Replace a document file with a new file.
 * Preserves document.id, customer_id, and created_at.
 * STRICT SECURITY: Rejects if document is already approved.
 */
export async function replaceCustomerDocumentFileAction(
  documentId: string,
  formData: FormData,
): Promise<DocumentActionResult> {
  try {
    const currentUser = await requireAuth();

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: "يرجى اختيار ملف صالح للاستبدال." };
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
        error: "نوع الملف غير مدعوم. الأنواع المسموح بها هي PDF أو الصور.",
      };
    }

    const supabase = await createClient();

    // 1. Fetch document and verify ownership + lock status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: queryError } = await (supabase.from("documents") as any)
      .select("id, customer_id, file_path, status")
      .eq("id", documentId)
      .single();

    if (queryError || !doc) {
      return { success: false, error: "المستند غير موجود." };
    }

    if (doc.customer_id !== currentUser.id && currentUser.role !== "admin") {
      return { success: false, error: "غير مصرح لك باستبدال هذا المستند." };
    }

    // 2. Lock check: Approved documents CANNOT be replaced by customers
    if (doc.status === "approved" && currentUser.role !== "admin") {
      return {
        success: false,
        error: "هذا المستند معتمد بالفعل ولا يمكن استبدال ملفه.",
      };
    }

    const sanitizedFileName = file.name
      .replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, "_")
      .toLowerCase();

    const newStoragePath = `${doc.customer_id}/${documentId}/${sanitizedFileName}`;

    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    // 3. Upload new file
    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(newStoragePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (storageError) {
      return {
        success: false,
        error: "تعذر رفع الملف الجديد إلى التخزين السحابي.",
      };
    }

    // 4. If old path is different from new path, remove old file
    if (doc.file_path && doc.file_path !== newStoragePath) {
      await supabase.storage.from("documents").remove([doc.file_path]);
    }

    // 5. Update record in DB, keeping document.id and customer_id intact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase.from("documents") as any)
      .update({
        file_name: file.name,
        file_path: newStoragePath,
        file_size: file.size,
        mime_type: file.type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (dbError) {
      return {
        success: false,
        error: "تعذر تحديث بيانات المستند في قاعدة البيانات.",
      };
    }

    revalidatePath("/my-documents");
    revalidatePath("/documents");
    revalidatePath(`/customers/${doc.customer_id}`);

    return {
      success: true,
      message: "تم استبدال الملف بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[replaceCustomerDocumentFileAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء استبدال الملف." };
  }
}

/**
 * Delete a customer document and its storage file.
 * STRICT SECURITY: Rejects if document is already approved.
 */
export async function deleteCustomerDocumentAction(
  documentId: string,
): Promise<DocumentActionResult> {
  try {
    const currentUser = await requireAuth();

    if (!documentId) {
      return { success: false, error: "معرّف المستند غير صالح." };
    }

    const supabase = await createClient();

    // 1. Fetch document and verify ownership + lock status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: queryError } = await (supabase.from("documents") as any)
      .select("id, customer_id, file_path, status")
      .eq("id", documentId)
      .single();

    if (queryError || !doc) {
      return { success: false, error: "المستند غير موجود." };
    }

    if (doc.customer_id !== currentUser.id && currentUser.role !== "admin") {
      return { success: false, error: "غير مصرح لك بحذف هذا المستند." };
    }

    // 2. Lock check: Approved documents CANNOT be deleted by customers
    if (doc.status === "approved" && currentUser.role !== "admin") {
      return {
        success: false,
        error: "هذا المستند معتمد ولا يمكن حذفه.",
      };
    }

    // 3. Remove file from storage if path exists
    if (doc.file_path) {
      await supabase.storage.from("documents").remove([doc.file_path]);
    }

    // 4. Delete document record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from("documents") as any)
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      return { success: false, error: "تعذر حذف المستند من قاعدة البيانات." };
    }

    revalidatePath("/my-documents");
    revalidatePath("/documents");
    revalidatePath(`/customers/${doc.customer_id}`);

    return {
      success: true,
      message: "تم حذف المستند بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[deleteCustomerDocumentAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء حذف المستند." };
  }
}

/**
 * Approve a document (Admin Only).
 * Locks the document from customer edits, replacement, and deletion.
 */
export async function approveDocumentAction(
  documentId: string,
): Promise<DocumentActionResult> {
  try {
    // STRICT ADMIN/MANAGER CHECK
    const currentAdmin = await requireRole(["admin", "manager"]);

    if (!documentId) {
      return { success: false, error: "معرّف المستند غير صالح." };
    }

    const supabase = await createClient();

    // Update document status to approved and record approval metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedDoc, error: updateError } = await (supabase.from("documents") as any)
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: currentAdmin.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .select("customer_id")
      .single();

    if (updateError) {
      return { success: false, error: "تعذر اعتماد المستند في قاعدة البيانات." };
    }

    revalidatePath("/documents");
    revalidatePath("/my-documents");
    if (updatedDoc?.customer_id) {
      revalidatePath(`/customers/${updatedDoc.customer_id}`);
    }

    return {
      success: true,
      message: "تم اعتماد المستند بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[approveDocumentAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ أثناء اعتماد المستند أو ليس لديك الصلاحية الكافية.",
    };
  }
}

/**
 * Get a secure signed URL for previewing or downloading a document.
 * Strictly verifies ownership or admin role.
 */
export async function getDocumentSignedUrlAction(
  documentId: string,
): Promise<DocumentActionResult> {
  try {
    const currentUser = await requireAuth();

    if (!documentId) {
      return { success: false, error: "معرّف المستند غير صالح." };
    }

    const supabase = await createClient();

    // Query document record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: queryError } = await (supabase.from("documents") as any)
      .select("id, customer_id, file_path")
      .eq("id", documentId)
      .single();

    if (queryError || !doc) {
      return { success: false, error: "المستند غير موجود أو ليس لديك صلاحية الوصول إليه." };
    }

    const isAdmin = currentUser.role === "admin" || currentUser.role === "manager";
    const isOwner = doc.customer_id === currentUser.id;

    if (!isAdmin && !isOwner) {
      return { success: false, error: "غير مصرح لك بالوصول إلى هذا المستند." };
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 3600);

    if (signedError || !signedData?.signedUrl) {
      return { success: false, error: "تعذر إنشاء رابط المعاينة الآمن." };
    }

    return {
      success: true,
      signedUrl: signedData.signedUrl,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getDocumentSignedUrlAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ أثناء طلب رابط المستند.",
    };
  }
}
