"use server";

/**
 * Shipment Server Actions
 *
 * Secure server mutations for creating shipments, saving drafts,
 * submitting clearance requests, and uploading preliminary invoices.
 * Strictly enforces customer ownership, server-side company derivation,
 * explicit goods_category selection ('agricultural' | 'industrial'),
 * and empty initial applicable_procedures (no auto-assumed Food Safety).
 */

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCustomerCompany } from "@/lib/company/queries";
import { notifyAdmins } from "@/lib/notifications/queries";
import type { ShipmentStatus, GoodsCategory } from "@/types";
import { GOODS_CATEGORIES } from "@/types/journey";

export interface ShipmentActionResult {
  success: boolean;
  message?: string;
  error?: string;
  shipmentId?: string;
  referenceNumber?: string;
  status?: ShipmentStatus;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Create or save a shipment clearance request (as draft or awaiting_pricing).
 */
export async function createOrSaveShipmentAction(
  formData: FormData,
): Promise<ShipmentActionResult> {
  try {
    const currentUser = await requireAuth();

    // 1. Verify that Customer has a linked Company (Server-side ownership verification)
    const company = await getCustomerCompany();
    if (!company) {
      return {
        success: false,
        error:
          "يرجى استكمال بيانات الشركة أولًا قبل إنشاء طلب تخليص شحنة.",
      };
    }

    const shipmentIdInput = formData.get("shipment_id") as string | null;
    const actionType = (formData.get("action_type") as string) || "submit"; // 'draft' | 'submit'
    const goodsCategoryRaw = (formData.get("goods_category") as string | null)?.trim() || null;
    const supplierName = (formData.get("supplier_name") as string | null)?.trim() || null;
    const countryOfOrigin = (formData.get("country_of_origin") as string | null)?.trim() || null;
    const portOfArrival = (formData.get("port_of_arrival") as string | null)?.trim() || null;
    const goodsDescription = (formData.get("goods_description") as string | null)?.trim() || null;
    const packagesCountRaw = formData.get("packages_count") as string | null;
    const packageType = (formData.get("package_type") as string | null)?.trim() || null;
    const grossWeightRaw = formData.get("gross_weight") as string | null;
    const notes = (formData.get("notes") as string | null)?.trim() || null;

    const goodsCategory: GoodsCategory | null =
      goodsCategoryRaw && GOODS_CATEGORIES.includes(goodsCategoryRaw as GoodsCategory)
        ? (goodsCategoryRaw as GoodsCategory)
        : null;

    const packagesCount =
      packagesCountRaw && !isNaN(Number(packagesCountRaw))
        ? Math.max(0, parseInt(packagesCountRaw, 10))
        : null;

    const grossWeight =
      grossWeightRaw && !isNaN(Number(grossWeightRaw))
        ? Math.max(0, parseFloat(grossWeightRaw))
        : null;

    const file = formData.get("preliminary_invoice") as File | null;
    const hasNewFile = file instanceof File && file.size > 0;

    if (hasNewFile) {
      if (file.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: "حجم ملف الفاتورة المبدئية يتجاوز 20 ميجابايت.",
        };
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return {
          success: false,
          error:
            "نوع ملف الفاتورة المبدئية غير مدعوم. الصيغ المقبولة: PDF أو صور (JPG, PNG, WebP).",
        };
      }
    }

    const supabase = await createClient();

    let shipmentId = shipmentIdInput;
    let existingShipment: {
      id: string;
      company_id: string;
      customer_id: string;
      status: string;
      reference_number: string;
      goods_category?: GoodsCategory | null;
    } | null = null;

    if (shipmentId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("shipments") as any)
        .select("id, company_id, customer_id, status, reference_number, goods_category")
        .eq("id", shipmentId)
        .maybeSingle();

      if (error || !data) {
        return { success: false, error: "الشحنة غير موجودة." };
      }

      if (data.company_id !== company.id || data.customer_id !== currentUser.id) {
        return { success: false, error: "غير مصرح لك بتعديل هذه الشحنة." };
      }

      if (data.status !== "draft" && actionType === "draft") {
        return {
          success: false,
          error: "لا يمكن تعديل هذه الشحنة لأنها دخلت مرحلة المعالجة بالفعل.",
        };
      }

      existingShipment = data;
    }

    let hasExistingInvoice = false;
    if (shipmentId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from("documents") as any)
        .select("id", { count: "exact", head: true })
        .eq("shipment_id", shipmentId);
      hasExistingInvoice = (count ?? 0) > 0;
    }

    // Submission Validations:
    if (actionType === "submit") {
      if (!goodsCategory) {
        return {
          success: false,
          error: "يرجى اختيار نوع الشحنة (زراعية أو صناعية).",
        };
      }
      if (!goodsDescription) {
        return {
          success: false,
          error: "يرجى إدخال وصف مختصر للبضاعة.",
        };
      }
      if (!supplierName) {
        return {
          success: false,
          error: "يرجى إدخال اسم المورد.",
        };
      }
      if (!countryOfOrigin) {
        return {
          success: false,
          error: "يرجى تحديد بلد المنشأ.",
        };
      }
      if (!portOfArrival) {
        return {
          success: false,
          error: "يرجى تحديد ميناء الوصول.",
        };
      }
      if (!hasNewFile && !hasExistingInvoice) {
        return {
          success: false,
          error: "يرجى رفع الفاتورة المبدئية لإتمام إرسال طلب التخليص.",
        };
      }
    }

    const targetStatus: ShipmentStatus =
      actionType === "submit" ? "awaiting_pricing" : "draft";

    const resolvedGoodsCategory: GoodsCategory =
      goodsCategory || existingShipment?.goods_category || "industrial";

    let referenceNumber = existingShipment?.reference_number || "";

    if (existingShipment) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated, error: updateErr } = await (supabase.from("shipments") as any)
        .update({
          status: targetStatus,
          goods_category: resolvedGoodsCategory,
          supplier_name: supplierName,
          country_of_origin: countryOfOrigin,
          port_of_arrival: portOfArrival,
          goods_description: goodsDescription,
          packages_count: packagesCount,
          package_type: packageType,
          gross_weight: grossWeight,
          notes: notes,
          updated_by: currentUser.id,
        })
        .eq("id", shipmentId!)
        .select("id, reference_number, status")
        .single();

      if (updateErr) {
        if (process.env.NODE_ENV === "development") {
          console.error("[createOrSaveShipmentAction] Update error:", updateErr);
        }
        return { success: false, error: "تعذر تحديث بيانات الشحنة." };
      }

      referenceNumber = updated.reference_number;
    } else {
      // Insert new shipment — applicable_procedures starts empty '{}' (Admin selects manually)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertErr } = await (supabase.from("shipments") as any)
        .insert({
          company_id: company.id,
          customer_id: currentUser.id,
          created_by: currentUser.id,
          updated_by: currentUser.id,
          management_mode: "self_service",
          status: targetStatus,
          goods_category: resolvedGoodsCategory,
          applicable_procedures: [],
          supplier_name: supplierName,
          country_of_origin: countryOfOrigin,
          port_of_arrival: portOfArrival,
          goods_description: goodsDescription,
          packages_count: packagesCount,
          package_type: packageType,
          gross_weight: grossWeight,
          notes: notes,
        })
        .select("id, reference_number, status")
        .single();

      if (insertErr || !inserted) {
        if (process.env.NODE_ENV === "development") {
          console.error("[createOrSaveShipmentAction] Insert error:", insertErr);
        }
        return { success: false, error: "تعذر إنشاء طلب التخليص للشحنة." };
      }

      shipmentId = inserted.id;
      referenceNumber = inserted.reference_number;
    }

    // Upload Preliminary Invoice if provided
    if (hasNewFile && shipmentId) {
      const sanitizedFileName = file.name
        .replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, "_")
        .toLowerCase();
      const documentId = crypto.randomUUID();
      const storagePath = `${currentUser.id}/${documentId}/${sanitizedFileName}`;

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
          console.error("[createOrSaveShipmentAction] Storage error:", storageError);
        }
        return {
          success: false,
          error:
            "تم حفظ بيانات الشحنة، ولكن تعذر رفع ملف الفاتورة المبدئية. يرجى إعادة المحاولة.",
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: docDbError } = await (supabase.from("documents") as any).insert({
        id: documentId,
        customer_id: currentUser.id,
        company_id: company.id,
        shipment_id: shipmentId,
        title: "الفاتورة المبدئية",
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        document_type: "فاتورة مبدئية",
        status: "pending",
        approved_at: null,
        approved_by: null,
      });

      if (docDbError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[createOrSaveShipmentAction] Doc DB error:", docDbError);
        }
        await supabase.storage.from("documents").remove([storagePath]);
      }
    }

    revalidatePath("/my-shipments");
    revalidatePath("/shipments");
    revalidatePath("/dashboard");
    if (shipmentId) {
      revalidatePath(`/my-shipments/${shipmentId}`);
      revalidatePath(`/shipments/${shipmentId}`);
    }

    if (actionType === "submit" && shipmentId) {
      await notifyAdmins({
        shipmentId,
        title: "طلب تخليص شحنة جديد",
        message: `تم إرسال طلب تخليص شحنة جديد برقم ${referenceNumber || ""} من شركة ${company.name}.`,
        type: "info",
        link: `/shipments/${shipmentId}`,
      });
    }

    const message =
      actionType === "submit"
        ? "تم إرسال طلب التخليص بنجاح، وسيتم مراجعته وتحديد السعر المبدئي."
        : "تم حفظ مسودة الشحنة بنجاح.";

    return {
      success: true,
      message,
      shipmentId: shipmentId || undefined,
      referenceNumber,
      status: targetStatus,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[createOrSaveShipmentAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ غير متوقع أثناء معالجة طلب التخليص.",
    };
  }
}

/**
 * Delete a draft shipment owned by the current customer.
 */
export async function deleteShipmentDraftAction(
  shipmentId: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const currentUser = await requireAuth();
    const company = await getCustomerCompany();

    if (!company) {
      return { success: false, error: "غير مصرح." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error } = await (supabase.from("shipments") as any)
      .select("id, company_id, customer_id, status")
      .eq("id", shipmentId)
      .maybeSingle();

    if (error || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (
      shipment.company_id !== company.id ||
      shipment.customer_id !== currentUser.id
    ) {
      return { success: false, error: "غير مصرح لك بحذف هذه الشحنة." };
    }

    if (shipment.status !== "draft") {
      return {
        success: false,
        error: "لا يمكن حذف الشحنة إلا إذا كانت في حالة مسودة.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docs } = await (supabase.from("documents") as any)
      .select("id, file_path")
      .eq("shipment_id", shipmentId);

    if (docs && docs.length > 0) {
      const paths = docs.map((d: { file_path: string }) => d.file_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from("documents").remove(paths);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any)
        .delete()
        .eq("shipment_id", shipmentId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: delErr } = await (supabase.from("shipments") as any)
      .delete()
      .eq("id", shipmentId);

    if (delErr) {
      return { success: false, error: "تعذر حذف المسودة." };
    }

    revalidatePath("/my-shipments");
    revalidatePath("/shipments");

    return {
      success: true,
      message: "تم حذف المسودة بنجاح.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[deleteShipmentDraftAction] Exception:", err);
    }
    return {
      success: false,
      error: "حدث خطأ غير متوقع أثناء محاولة حذف المسودة.",
    };
  }
}
