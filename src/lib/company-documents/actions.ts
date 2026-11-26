"use server";

/**
 * Company Documents Server Actions
 *
 * Secure mutations for company documents.
 * Completely independent from shipment documents.
 * Enforces server-side company derivation, role checks, and approval locking.
 */

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCustomerCompany } from "@/lib/company/queries";
import type { CompanyDocumentType } from "@/types";
import { COMPANY_DOCUMENT_TYPES } from "@/types";

export interface CompanyDocumentActionResult {
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

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isValidExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Upload a company document for the authenticated customer.
 * Starts in 'pending' status.
 */
export async function uploadCompanyDocumentAction(
  formData: FormData,
): Promise<CompanyDocumentActionResult> {
  try {
    await requireAuth();

    // 1. Resolve company strictly from server-side session
    const company = await getCustomerCompany();
    if (!company) {
      return {
        success: false,
        error: "لم يتم العثور على شركة مرتبطة بحسابك. يرجى حفظ بيانات الشركة أولاً.",
      };
    }

    const file = formData.get("file") as File | null;
    const documentType = formData.get("document_type") as CompanyDocumentType | null;

    if (!documentType || !COMPANY_DOCUMENT_TYPES.includes(documentType)) {
      return {
        success: false,
        error: "نوع المستند غير صالح.",
      };
    }

    if (!file || !(file instanceof File) || file.size === 0) {
      return {
        success: false,
        error: "يرجى اختيار ملف صالح للرفع.",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت).",
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type) || !isValidExtension(file.name)) {
      return {
        success: false,
        error: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF, JPEG, PNG, WEBP.",
      };
    }

    const supabase = await createClient();

    // 2. Check if this document type already exists for this company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingDoc } = await (supabase.from("company_documents") as any)
      .select("id, status, file_path")
      .eq("company_id", company.id)
      .eq("document_type", documentType)
      .maybeSingle();

    if (existingDoc && existingDoc.status === "approved") {
      return {
        success: false,
        error: "لا يمكن تعديل أو رفع المستند لأنه معتمد بالفعل من الإدارة.",
      };
    }

    // 3. Upload to Storage: company-documents/{company_id}/{timestamp}_{filename}
    const cleanFileName = sanitizeFileName(file.name);
    const storagePath = `${company.id}/${documentType}_${Date.now()}_${cleanFileName}`;

    const { error: storageError } = await supabase.storage
      .from("company-documents")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (storageError) {
      return {
        success: false,
        error: "حدث خطأ أثناء رفع الملف إلى وحدة التخزين. يرجى المحاولة لاحقاً.",
      };
    }

    // 4. Save or update DB record
    let docId: string;

    if (existingDoc) {
      // Update existing record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updatedDoc, error: updateError } = await (supabase.from("company_documents") as any)
        .update({
          file_name: file.name,
          file_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          status: "pending",
          uploaded_at: new Date().toISOString(),
          approved_at: null,
          approved_by: null,
        })
        .eq("id", existingDoc.id)
        .select("id")
        .single();

      if (updateError || !updatedDoc) {
        // Rollback uploaded storage file
        await supabase.storage.from("company-documents").remove([storagePath]);
        return {
          success: false,
          error: "حدث خطأ أثناء تحديث بيانات المستند في قاعدة البيانات.",
        };
      }

      // Cleanup old storage file if different
      if (existingDoc.file_path && existingDoc.file_path !== storagePath) {
        await supabase.storage.from("company-documents").remove([existingDoc.file_path]);
      }

      docId = updatedDoc.id;
    } else {
      // Insert new record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insertedDoc, error: insertError } = await (supabase.from("company_documents") as any)
        .insert({
          company_id: company.id,
          document_type: documentType,
          file_name: file.name,
          file_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          status: "pending",
          uploaded_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !insertedDoc) {
        // Rollback uploaded storage file
        await supabase.storage.from("company-documents").remove([storagePath]);
        return {
          success: false,
          error: "حدث خطأ أثناء تسجيل بيانات المستند في قاعدة البيانات.",
        };
      }

      docId = insertedDoc.id;
    }

    revalidatePath("/company");
    revalidatePath("/customers", "layout");

    return {
      success: true,
      message: "تم رفع المستند بنجاح وهو الآن قيد المراجعة.",
      documentId: docId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء الرفع.",
    };
  }
}

/**
 * Replace a pending company document.
 * Blocked if status is 'approved'.
 */
export async function replaceCompanyDocumentAction(
  formData: FormData,
): Promise<CompanyDocumentActionResult> {
  try {
    await requireAuth();

    const company = await getCustomerCompany();
    if (!company) {
      return {
        success: false,
        error: "لم يتم العثور على شركة مرتبطة بحسابك.",
      };
    }

    const documentId = formData.get("document_id") as string | null;
    const file = formData.get("file") as File | null;

    if (!documentId) {
      return {
        success: false,
        error: "معرف المستند غير محدد.",
      };
    }

    if (!file || !(file instanceof File) || file.size === 0) {
      return {
        success: false,
        error: "يرجى اختيار ملف صالح للاستبدال.",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت).",
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type) || !isValidExtension(file.name)) {
      return {
        success: false,
        error: "نوع الملف غير مدعوم. الصيغ المقبولة: PDF, JPEG, PNG, WEBP.",
      };
    }

    const supabase = await createClient();

    // 1. Fetch existing doc and verify ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: fetchError } = await (supabase.from("company_documents") as any)
      .select("*")
      .eq("id", documentId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchError || !doc) {
      return {
        success: false,
        error: "المستند المطلوب غير موجود أو ليس لديك صلاحية تعديله.",
      };
    }

    // 2. Reject if already approved!
    if (doc.status === "approved") {
      return {
        success: false,
        error: "لا يمكن استبدال المستند بعد اعتماده من الإدارة.",
      };
    }

    // 3. Upload new storage file
    const cleanFileName = sanitizeFileName(file.name);
    const newStoragePath = `${company.id}/${doc.document_type}_${Date.now()}_${cleanFileName}`;

    const { error: storageError } = await supabase.storage
      .from("company-documents")
      .upload(newStoragePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (storageError) {
      return {
        success: false,
        error: "حدث خطأ أثناء رفع الملف البديل إلى وحدة التخزين.",
      };
    }

    // 4. Update DB record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase.from("company_documents") as any)
      .update({
        file_name: file.name,
        file_path: newStoragePath,
        mime_type: file.type,
        file_size: file.size,
        status: "pending",
        uploaded_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
      })
      .eq("id", documentId)
      .eq("company_id", company.id);

    if (updateError) {
      await supabase.storage.from("company-documents").remove([newStoragePath]);
      return {
        success: false,
        error: "حدث خطأ أثناء تحديث بيانات المستند في قاعدة البيانات.",
      };
    }

    // 5. Clean up old file
    if (doc.file_path && doc.file_path !== newStoragePath) {
      await supabase.storage.from("company-documents").remove([doc.file_path]);
    }

    revalidatePath("/company");
    revalidatePath("/customers", "layout");

    return {
      success: true,
      message: "تم استبدال المستند بنجاح وهو الآن قيد المراجعة.",
      documentId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء استبدال المستند.",
    };
  }
}

/**
 * Delete a company document.
 * Allowed only when status is 'pending'.
 * Strictly forbidden when status is 'approved'.
 */
export async function deleteCompanyDocumentAction(
  documentId: string,
): Promise<CompanyDocumentActionResult> {
  try {
    await requireAuth();

    const company = await getCustomerCompany();
    if (!company) {
      return {
        success: false,
        error: "لم يتم العثور على شركة مرتبطة بحسابك.",
      };
    }

    const supabase = await createClient();

    // 1. Fetch document and verify ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: fetchError } = await (supabase.from("company_documents") as any)
      .select("*")
      .eq("id", documentId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchError || !doc) {
      return {
        success: false,
        error: "المستند غير موجود أو ليس لديك صلاحية لحذفه.",
      };
    }

    // 2. Reject if approved
    if (doc.status === "approved") {
      return {
        success: false,
        error: "لا يمكن حذف المستند بعد اعتماده من الإدارة.",
      };
    }

    // 3. Delete from storage
    if (doc.file_path) {
      await supabase.storage.from("company-documents").remove([doc.file_path]);
    }

    // 4. Delete DB record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase.from("company_documents") as any)
      .delete()
      .eq("id", documentId)
      .eq("company_id", company.id);

    if (deleteError) {
      return {
        success: false,
        error: "حدث خطأ أثناء حذف المستند من قاعدة البيانات.",
      };
    }

    revalidatePath("/company");
    revalidatePath("/customers", "layout");

    return {
      success: true,
      message: "تم حذف المستند بنجاح.",
      documentId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء الحذف.",
    };
  }
}

/**
 * Admin action to approve a company document.
 * Sets status='approved', approved_at=now(), approved_by=currentAdmin.id.
 */
export async function approveCompanyDocumentAction(
  documentId: string,
): Promise<CompanyDocumentActionResult> {
  try {
    const currentAdmin = await requireRole(["admin"]);

    if (!documentId) {
      return {
        success: false,
        error: "معرف المستند مطلوب.",
      };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedDoc, error } = await (supabase.from("company_documents") as any)
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: currentAdmin.id,
      })
      .eq("id", documentId)
      .select("id")
      .maybeSingle();

    if (error || !updatedDoc) {
      return {
        success: false,
        error: "حدث خطأ أثناء اعتماد المستند. يرجى المحاولة لاحقاً.",
      };
    }

    revalidatePath("/customers", "layout");
    revalidatePath("/company");

    return {
      success: true,
      message: "تم اعتماد المستند بنجاح.",
      documentId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "حدث خطأ أثناء اعتماد المستند.",
    };
  }
}

/**
 * Fetch a fresh signed URL for viewing/downloading a company document.
 */
export async function getCompanyDocumentSignedUrlAction(
  documentId: string,
): Promise<CompanyDocumentActionResult> {
  try {
    const currentUser = await requireAuth();
    const supabase = await createClient();

    // Query doc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: doc, error: docError } = await (supabase.from("company_documents") as any)
      .select("id, company_id, file_path")
      .eq("id", documentId)
      .maybeSingle();

    if (docError || !doc) {
      return {
        success: false,
        error: "المستند غير موجود.",
      };
    }

    // If customer, verify company ownership
    if (currentUser.role === "customer") {
      const company = await getCustomerCompany();
      if (!company || company.id !== doc.company_id) {
        return {
          success: false,
          error: "ليس لديك صلاحية للوصول إلى هذا المستند.",
        };
      }
    }

    const { data, error } = await supabase.storage
      .from("company-documents")
      .createSignedUrl(doc.file_path, 3600);

    if (error || !data?.signedUrl) {
      return {
        success: false,
        error: "تعذر توليد رابط معاينة للمستند.",
      };
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
      documentId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "حدث خطأ أثناء تحضير المستند.",
    };
  }
}
