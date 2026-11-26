"use server";

/**
 * Shipment Pricing Server Actions
 *
 * Secure server mutations for the Pricing & Negotiation workflow:
 *  - Admin: submit initial estimate
 *  - Customer: approve initial estimate (Scenario A — estimated_range vs final_fixed)
 *  - Customer: request negotiation (Scenario B)
 *  - Admin: set final agreed price
 *  - Customer: approve final agreed price
 *  - Admin: record customer approval on behalf of customer (auditable, non-impersonating)
 *
 * Strictly enforces role guards, customer company ownership,
 * race-condition protection, and automatic audit history logging.
 */

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCustomerCompany } from "@/lib/company/queries";
import { createNotification, notifyAdmins } from "@/lib/notifications/queries";
import type { PricingApprovalChannel, PricingApprovalType } from "@/types";

export interface PricingActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

const VALID_ADMIN_APPROVAL_CHANNELS: PricingApprovalChannel[] = [
  "phone_call",
  "whatsapp",
  "in_person",
  "email",
];

/**
 * 1. Admin submits initial price estimate.
 * Shipment status transitions from 'awaiting_pricing' -> 'price_proposed'.
 * Pricing status transitions to 'proposed'.
 */
export async function submitPriceEstimateAction(
  formData: FormData,
): Promise<PricingActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);
    const shipmentId = formData.get("shipment_id") as string;
    const minPriceRaw = formData.get("estimated_min_price") as string;
    const maxPriceRaw = formData.get("estimated_max_price") as string;
    const currency = (formData.get("currency") as string) || "EGP";

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة مطلوب." };
    }

    const minPrice = parseFloat(minPriceRaw);
    const maxPrice = parseFloat(maxPriceRaw);

    if (isNaN(minPrice) || minPrice < 0) {
      return { success: false, error: "الحد الأدنى للتقدير يجب أن يكون رقماً أكبر من أو يساوي صفر." };
    }
    if (isNaN(maxPrice) || maxPrice < 0) {
      return { success: false, error: "الحد الأقصى للتقدير يجب أن يكون رقماً أكبر من أو يساوي صفر." };
    }
    if (minPrice > maxPrice) {
      return {
        success: false,
        error: "الحد الأدنى للتقدير لا يمكن أن يكون أكبر من الحد الأقصى.",
      };
    }

    const supabase = await createClient();

    // Verify shipment existence and eligible status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, status, customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (shipment.status !== "awaiting_pricing" && shipment.status !== "price_proposed") {
      return {
        success: false,
        error: "لا يمكن تقديم عرض سعر لشحنة ليست في مرحلة انتظار التسعير.",
      };
    }

    // Check if a pricing record already exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingPricing } = await (supabase.from("shipment_pricing") as any)
      .select("id")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    let pricingId = existingPricing?.id;

    if (pricingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase.from("shipment_pricing") as any)
        .update({
          estimated_min_price: minPrice,
          estimated_max_price: maxPrice,
          final_price: null,
          approval_type: null,
          approval_source: null,
          approval_recorded_by: null,
          approval_channel: null,
          confirmed_by_name: null,
          confirmation_reference: null,
          currency,
          status: "proposed",
          updated_by: adminUser.id,
        })
        .eq("id", pricingId);

      if (updateErr) {
        return { success: false, error: "تعذر تحديث سجل التسعير." };
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertErr } = await (supabase.from("shipment_pricing") as any)
        .insert({
          shipment_id: shipmentId,
          estimated_min_price: minPrice,
          estimated_max_price: maxPrice,
          final_price: null,
          currency,
          status: "proposed",
          created_by: adminUser.id,
          updated_by: adminUser.id,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        return { success: false, error: "تعذر حفظ سجل التسعير." };
      }
      pricingId = inserted.id;
    }

    // Update shipment status -> price_proposed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipments") as any)
      .update({ status: "price_proposed", updated_by: adminUser.id })
      .eq("id", shipmentId);

    // Record in history audit trail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_pricing_history") as any).insert({
      shipment_id: shipmentId,
      pricing_id: pricingId,
      action: "estimate_created",
      estimated_min_price: minPrice,
      estimated_max_price: maxPrice,
      final_price: null,
      currency,
      performed_by: adminUser.id,
      notes: "تم تقديم تقدير مبدئي لسعر خدمة التخليص",
    });

    if (shipment?.customer_id) {
      await createNotification({
        userId: shipment.customer_id,
        shipmentId,
        title: "تم تقديم عرض السعر",
        message: `تم تقديم عرض سعر لشحنتك ${shipment.reference_number || ""} يتراوح بين ${minPrice} و ${maxPrice} ${currency}.`,
        type: "pricing",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath("/shipments");
    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath("/my-shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);

    return {
      success: true,
      message: "تم تقديم تقدير السعر بنجاح، وأصبح متاحاً للعميل للمراجعة.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[submitPriceEstimateAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ أثناء حفظ تقدير السعر." };
  }
}

/**
 * 2. Customer approves initial price estimate (Scenario A).
 * Distinguishes acceptance of an estimated range ('estimated_range', final_price remains null)
 * from acceptance of a single fixed value ('final_fixed').
 */
export async function customerApproveEstimateAction(
  formData: FormData,
): Promise<PricingActionResult> {
  try {
    const currentUser = await requireAuth();
    const customerCompany = await getCustomerCompany();

    if (!customerCompany) {
      return { success: false, error: "الحساب غير مرتبط بشركة صالحة." };
    }

    const shipmentId = formData.get("shipment_id") as string;
    const expectedUpdatedAt = formData.get("expected_pricing_updated_at") as string | null;

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة غير محدد." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, company_id, customer_id, status")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (
      shipment.company_id !== customerCompany.id ||
      (shipment.customer_id && shipment.customer_id !== currentUser.id)
    ) {
      return { success: false, error: "غير مصرح لك باعتماد سعر هذه الشحنة." };
    }

    if (shipment.status === "awaiting_invoice_review") {
      return {
        success: true,
        message: "تم اعتماد السعر بنجاح، والطلب الآن بانتظار مراجعة الفاتورة.",
      };
    }

    if (shipment.status !== "price_proposed") {
      return {
        success: false,
        error: "حالة الشحنة الحالية لا تسمح باعتماد السعر التقديري.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pricing, error: pricingErr } = await (supabase.from("shipment_pricing") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (pricingErr || !pricing) {
      return { success: false, error: "سجل التسعير غير متوفر." };
    }

    if (pricing.status === "customer_approved") {
      return {
        success: true,
        message: "تم اعتماد السعر بنجاح، والطلب الآن بانتظار مراجعة الفاتورة.",
      };
    }

    if (pricing.status !== "proposed") {
      return {
        success: false,
        error: "عرض السعر لم يعد متاحاً للاعتماد أو تم تغييره.",
      };
    }

    if (expectedUpdatedAt && pricing.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: "تم تحديث عرض السعر من قِبل الإدارة. يرجى مراجعة التقدير الجديد والموافقة عليه.",
      };
    }

    const nowIso = new Date().toISOString();
    // Do NOT silently treat an estimated range (min < max) as a fixed final_price
    const isExactFixedAmount =
      Number(pricing.estimated_min_price) === Number(pricing.estimated_max_price);
    const approvedPrice = isExactFixedAmount ? Number(pricing.estimated_min_price) : null;
    const approvalType: PricingApprovalType = isExactFixedAmount
      ? "final_fixed"
      : "estimated_range";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedPricing, error: updatePricingErr } = await (supabase.from("shipment_pricing") as any)
      .update({
        status: "customer_approved",
        final_price: approvedPrice,
        customer_approved_at: nowIso,
        customer_approved_by: currentUser.id,
        approval_type: approvalType,
        approval_source: "customer_direct",
        approval_recorded_by: currentUser.id,
        approval_channel: "portal",
      })
      .eq("id", pricing.id)
      .eq("status", "proposed")
      .select("id");

    if (updatePricingErr) {
      return { success: false, error: "تعذر تسجيل الموافقة على السعر." };
    }

    if (!updatedPricing || updatedPricing.length === 0) {
      return {
        success: true,
        message: "تم اعتماد السعر بنجاح، والطلب الآن بانتظار مراجعة الفاتورة.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipments") as any)
      .update({ status: "awaiting_invoice_review", updated_by: currentUser.id })
      .eq("id", shipmentId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_pricing_history") as any).insert({
      shipment_id: shipmentId,
      pricing_id: pricing.id,
      action: "customer_approved",
      estimated_min_price: pricing.estimated_min_price,
      estimated_max_price: pricing.estimated_max_price,
      final_price: approvedPrice,
      currency: pricing.currency,
      performed_by: currentUser.id,
      approval_type: approvalType,
      approval_source: "customer_direct",
      approval_recorded_by: currentUser.id,
      approval_channel: "portal",
      notes:
        approvedPrice !== null
          ? `وافق العميل مباشرة على السعر الثابت (${approvedPrice} ${pricing.currency})`
          : `وافق العميل مباشرة على النطاق التقديري (${pricing.estimated_min_price} – ${pricing.estimated_max_price} ${pricing.currency}) — يتم تثبيت القيمة النهائية قبل التسوية`,
    });

    revalidatePath("/my-shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath(`/shipments/${shipmentId}`);

    return {
      success: true,
      message: "تم اعتماد عرض السعر بنجاح، وسيتم الآن مراجعة الفاتورة المبدئية.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[customerApproveEstimateAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء اعتماد السعر." };
  }
}

/**
 * 3. Customer requests negotiation on the price estimate.
 */
export async function customerRequestNegotiationAction(
  formData: FormData,
): Promise<PricingActionResult> {
  try {
    const currentUser = await requireAuth();
    const customerCompany = await getCustomerCompany();

    if (!customerCompany) {
      return { success: false, error: "الحساب غير مرتبط بشركة صالحة." };
    }

    const shipmentId = formData.get("shipment_id") as string;

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة غير محدد." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, company_id, customer_id, status, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (
      shipment.company_id !== customerCompany.id ||
      (shipment.customer_id && shipment.customer_id !== currentUser.id)
    ) {
      return { success: false, error: "غير مصرح لك بالتفاوض على هذه الشحنة." };
    }

    if (shipment.status === "negotiation") {
      return {
        success: true,
        message: "تم تسجيل طلب التفاوض مسبقاً، وسيتم التواصل معك قريباً.",
      };
    }

    if (shipment.status !== "price_proposed") {
      return {
        success: false,
        error: "لا يمكن طلب التفاوض إلا عندما يكون هناك عرض سعر مقدم.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pricing, error: pricingErr } = await (supabase.from("shipment_pricing") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (pricingErr || !pricing) {
      return { success: false, error: "سجل التسعير غير متوفر." };
    }

    if (pricing.status === "negotiation_requested") {
      return {
        success: true,
        message: "تم تسجيل طلب التفاوض مسبقاً، وسيتم التواصل معك قريباً.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedPricing, error: updatePricingErr } = await (supabase.from("shipment_pricing") as any)
      .update({
        status: "negotiation_requested",
        updated_by: currentUser.id,
      })
      .eq("id", pricing.id)
      .eq("status", "proposed")
      .select("id");

    if (updatePricingErr) {
      return { success: false, error: "تعذر تسجيل طلب التفاوض." };
    }

    if (!updatedPricing || updatedPricing.length === 0) {
      return {
        success: true,
        message: "تم تسجيل طلب التفاوض مسبقاً، وسيتم التواصل معك قريباً.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipments") as any)
      .update({ status: "negotiation", updated_by: currentUser.id })
      .eq("id", shipmentId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_pricing_history") as any).insert({
      shipment_id: shipmentId,
      pricing_id: pricing.id,
      action: "negotiation_requested",
      estimated_min_price: pricing.estimated_min_price,
      estimated_max_price: pricing.estimated_max_price,
      final_price: null,
      currency: pricing.currency,
      performed_by: currentUser.id,
      notes: "طلب العميل التفاوض على السعر",
    });

    await notifyAdmins({
      shipmentId,
      title: "طلب تفاوض على السعر",
      message: `طلب العميل التفاوض على سعر الشحنة ${shipment?.reference_number || ""}.`,
      type: "pricing",
      link: `/shipments/${shipmentId}`,
    });

    revalidatePath("/my-shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath(`/shipments/${shipmentId}`);

    return {
      success: true,
      message: "تم طلب التفاوض بنجاح، وسيقوم فريق العمل بالتواصل معك لتحديد السعر النهائي.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[customerRequestNegotiationAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء طلب التفاوض." };
  }
}

/**
 * 4. Admin sets final agreed price after communication with customer,
 *    OR establishes the final fixed price before settlement for a shipment that was approved on an estimated range.
 */
export async function adminSetFinalPriceAction(
  formData: FormData,
): Promise<PricingActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);
    const shipmentId = formData.get("shipment_id") as string;
    const finalPriceRaw = formData.get("final_price") as string;

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة غير محدد." };
    }

    const finalPrice = parseFloat(finalPriceRaw);
    if (isNaN(finalPrice) || finalPrice <= 0) {
      return { success: false, error: "السعر النهائي يجب أن يكون قيمة رقمية موجبة." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, status, customer_id, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (["customs_cleared", "delivered"].includes(shipment.status)) {
      return {
        success: false,
        error: "لا يمكن تعديل السعر النهائي بعد إتمام التخليص الجمركي أو تسليم الشحنة.",
      };
    }

    // Check Stage 9 status: block price changes after financial settlement is completed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stage9Row } = await (supabase.from("shipment_customs_stages") as any)
      .select("status")
      .eq("shipment_id", shipmentId)
      .eq("stage_key", "stage_9_fees_payments")
      .maybeSingle();

    if (stage9Row?.status === "completed") {
      return {
        success: false,
        error: "لا يمكن تعديل السعر النهائي بعد إغلاق مرحلة التسوية المالية (المرحلة التاسعة).",
      };
    }

    // Fetch existing pricing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pricing, error: pricingErr } = await (supabase.from("shipment_pricing") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (pricingErr || !pricing) {
      return { success: false, error: "سجل التسعير غير متوفر." };
    }

    const canSetOrUpdateFinalPrice =
      ["negotiation", "price_agreed"].includes(shipment.status) ||
      ["customer_approved", "final_proposed"].includes(pricing.status);

    if (!canSetOrUpdateFinalPrice) {
      return {
        success: false,
        error: "لا يمكن تحديد السعر النهائي إلا لشحنة في مرحلة التفاوض أو بعد اعتماد العرض المبدئي وقبل التسوية النهائية.",
      };
    }

    const isUnchangedApprovedFixed =
      pricing.status === "customer_approved" &&
      pricing.approval_type === "final_fixed" &&
      pricing.final_price !== null &&
      Number(pricing.final_price) === finalPrice;

    if (isUnchangedApprovedFixed) {
      return {
        success: true,
        message: "السعر النهائي مسجل ومعتمد من العميل بنفس القيمة مسبقاً.",
      };
    }

    const wasPreviouslyApproved = pricing.status === "customer_approved";
    const wasRangeApproval = pricing.approval_type === "estimated_range";

    // Any new or updated final_price requires explicit customer confirmation (`final_proposed`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updatePricingErr } = await (supabase.from("shipment_pricing") as any)
      .update({
        final_price: finalPrice,
        status: "final_proposed",
        customer_approved_at: null,
        customer_approved_by: null,
        approval_type: null,
        approval_source: null,
        approval_recorded_by: null,
        approval_channel: null,
        confirmed_by_name: null,
        confirmation_reference: null,
        updated_by: adminUser.id,
      })
      .eq("id", pricing.id);

    if (updatePricingErr) {
      return { success: false, error: "تعذر تسجيل السعر النهائي." };
    }

    // Only transition shipments.status to 'price_agreed' during negotiation/price_agreed;
    // preserve later operational statuses (awaiting_invoice_review, acid_issued, customs_in_progress, etc.)
    if (["negotiation", "price_agreed"].includes(shipment.status)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipments") as any)
        .update({ status: "price_agreed", updated_by: adminUser.id })
        .eq("id", shipmentId);
    }

    // Record in history audit trail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_pricing_history") as any).insert({
      shipment_id: shipmentId,
      pricing_id: pricing.id,
      action: "final_price_set",
      estimated_min_price: pricing.estimated_min_price,
      estimated_max_price: pricing.estimated_max_price,
      final_price: finalPrice,
      currency: pricing.currency,
      performed_by: adminUser.id,
      notes: wasPreviouslyApproved
        ? wasRangeApproval
          ? `تم تحديد السعر النهائي المقترح (${finalPrice} ${pricing.currency}) بدلاً من النطاق التقديري المعتمد — بانتظار موافقة العميل`
          : `تم تعديل السعر النهائي إلى (${finalPrice} ${pricing.currency}) وإلغاء الاعتماد السابق — بانتظار موافقة العميل الجديدة`
        : `تم تحديد السعر النهائي بعد التفاوض: ${finalPrice} ${pricing.currency}`,
    });

    if (shipment?.customer_id) {
      await createNotification({
        userId: shipment.customer_id,
        shipmentId,
        title: wasPreviouslyApproved ? "تحديث السعر النهائي — مطلوب اعتمادك" : "تحديد السعر النهائي",
        message: wasPreviouslyApproved
          ? `تم ${wasRangeApproval ? "تحديد" : "تعديل"} السعر النهائي لأتعاب التخليص للشحنة ${shipment.reference_number || ""} إلى ${finalPrice} ${pricing.currency}. يرجى المراجعة والاعتماد.`
          : `تم تحديد السعر النهائي للشحنة ${shipment.reference_number || ""}: ${finalPrice} ${pricing.currency}. بانتظار موافقتك.`,
        type: "pricing",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath("/shipments");
    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath("/my-shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);

    return {
      success: true,
      message: wasPreviouslyApproved
        ? "تم تحديث السعر النهائي وإعادة فتحه بانتظار موافقة العميل."
        : "تم حفظ السعر النهائي المتفق عليه، وأصبح جاهزاً لموافقة العميل.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminSetFinalPriceAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء حفظ السعر النهائي." };
  }
}

/**
 * 5. Customer approves final agreed price (Scenario B).
 */
export async function customerApproveFinalPriceAction(
  formData: FormData,
): Promise<PricingActionResult> {
  try {
    const currentUser = await requireAuth();
    const customerCompany = await getCustomerCompany();

    if (!customerCompany) {
      return { success: false, error: "الحساب غير مرتبط بشركة صالحة." };
    }

    const shipmentId = formData.get("shipment_id") as string;
    const expectedFinalPriceRaw = formData.get("expected_final_price") as string | null;

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة غير محدد." };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, company_id, customer_id, status, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    if (
      shipment.company_id !== customerCompany.id ||
      (shipment.customer_id && shipment.customer_id !== currentUser.id)
    ) {
      return { success: false, error: "غير مصرح لك باعتماد هذا السعر." };
    }

    const allowedFinalApprovalStatuses = [
      "price_agreed",
      "awaiting_invoice_review",
      "invoice_revision_required",
      "acid_issued",
      "documents_completed",
      "ready_for_external_stage",
      "customs_in_progress",
    ];

    if (!allowedFinalApprovalStatuses.includes(shipment.status)) {
      return {
        success: false,
        error: "حالة الشحنة الحالية لا تسمح باعتماد السعر النهائي.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pricing, error: pricingErr } = await (supabase.from("shipment_pricing") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (pricingErr || !pricing || pricing.final_price === null) {
      return { success: false, error: "السعر النهائي غير متوفر." };
    }

    if (pricing.status === "customer_approved" && pricing.approval_type === "final_fixed") {
      return {
        success: true,
        message: "تم اعتماد السعر النهائي مسبقاً، والطلب قيد المتابعة.",
      };
    }

    if (pricing.status !== "final_proposed") {
      return {
        success: false,
        error: "السعر النهائي غير متاح للاعتماد حالياً.",
      };
    }

    if (expectedFinalPriceRaw) {
      const expected = parseFloat(expectedFinalPriceRaw);
      if (!isNaN(expected) && Number(pricing.final_price) !== expected) {
        return {
          success: false,
          error: "تم تعديل السعر النهائي من قبل الإدارة. يرجى مراجعة السعر الحالي قبل الاعتماد.",
        };
      }
    }

    const nowIso = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedPricing, error: updatePricingErr } = await (supabase.from("shipment_pricing") as any)
      .update({
        status: "customer_approved",
        customer_approved_at: nowIso,
        customer_approved_by: currentUser.id,
        approval_type: "final_fixed",
        approval_source: "customer_direct",
        approval_recorded_by: currentUser.id,
        approval_channel: "portal",
      })
      .eq("id", pricing.id)
      .eq("status", "final_proposed")
      .select("id");

    if (updatePricingErr) {
      return { success: false, error: "تعذر تسجيل الموافقة على السعر النهائي." };
    }

    if (!updatedPricing || updatedPricing.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: racedPricing } = await (supabase.from("shipment_pricing") as any)
        .select("status, approval_type")
        .eq("id", pricing.id)
        .maybeSingle();

      if (
        racedPricing?.status === "customer_approved" &&
        racedPricing?.approval_type === "final_fixed"
      ) {
        return {
          success: true,
          message: "تم اعتماد السعر النهائي مسبقاً.",
        };
      }

      return {
        success: false,
        error: "تعذر اعتماد السعر النهائي بسبب تحديث متزامن أو عدم كفاية الصلاحية.",
      };
    }

    if (shipment.status === "price_agreed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipments") as any)
        .update({ status: "awaiting_invoice_review", updated_by: currentUser.id })
        .eq("id", shipmentId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_pricing_history") as any).insert({
      shipment_id: shipmentId,
      pricing_id: pricing.id,
      action: "customer_approved",
      estimated_min_price: pricing.estimated_min_price,
      estimated_max_price: pricing.estimated_max_price,
      final_price: pricing.final_price,
      currency: pricing.currency,
      performed_by: currentUser.id,
      approval_type: "final_fixed",
      approval_source: "customer_direct",
      approval_recorded_by: currentUser.id,
      approval_channel: "portal",
      notes: `وافق العميل مباشرة على السعر النهائي (${pricing.final_price} ${pricing.currency})`,
    });

    await notifyAdmins({
      shipmentId,
      title: "موافقة العميل على السعر النهائي",
      message: `وافق العميل على السعر النهائي للشحنة ${shipment?.reference_number || ""}. الشحنة بانتظار مراجعة الفاتورة.`,
      type: "pricing",
      link: `/shipments/${shipmentId}`,
    });

    revalidatePath("/my-shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath(`/shipments/${shipmentId}`);

    return {
      success: true,
      message: "تم اعتماد السعر النهائي بنجاح، وسيتم الآن مراجعة الفاتورة المبدئية.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[customerApproveFinalPriceAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء اعتماد السعر النهائي." };
  }
}

/**
 * 6. Admin records customer approval on behalf of the customer after explicit confirmation
 *    via an external communication channel (Owner Decision #2).
 *    NEVER impersonates the customer: records the actual Admin ID in `performed_by` and `approval_recorded_by`.
 */
export async function adminRecordCustomerPriceApprovalAction(
  formData: FormData,
): Promise<PricingActionResult> {
  try {
    const adminUser = await requireRole(["admin"]);
    const shipmentId = formData.get("shipment_id")?.toString().trim();
    const approvalChannel = formData.get("approval_channel")?.toString().trim() as PricingApprovalChannel;
    const confirmedByName = formData.get("confirmed_by_name")?.toString().trim() || "";
    const confirmationReference = formData.get("confirmation_reference")?.toString().trim() || "";

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة مطلوب." };
    }

    if (!approvalChannel || !VALID_ADMIN_APPROVAL_CHANNELS.includes(approvalChannel)) {
      return {
        success: false,
        error: "يرجى تحديد قناة التواصل التي تم عبرها استلام موافقة العميل (هاتف، واتساب، حضور شخصي، أو بريد إلكتروني).",
      };
    }

    if (confirmedByName.length < 2) {
      return {
        success: false,
        error: "يرجى إدخال اسم الشخص الذي أكد الموافقة من طرف العميل.",
      };
    }

    if (confirmationReference.length < 3) {
      return {
        success: false,
        error: "يرجى إدخال مرجع أو ملاحظة توثيق الموافقة (3 أحرف على الأقل).",
      };
    }

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shipment, error: shipErr } = await (supabase.from("shipments") as any)
      .select("id, customer_id, status, reference_number")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipment) {
      return { success: false, error: "الشحنة غير موجودة." };
    }

    const allowedStatuses = [
      "price_proposed",
      "price_agreed",
      "awaiting_invoice_review",
      "invoice_revision_required",
      "acid_issued",
      "documents_completed",
      "ready_for_external_stage",
      "customs_in_progress",
    ];

    if (!allowedStatuses.includes(shipment.status)) {
      return {
        success: false,
        error: "حالة الشحنة الحالية لا تسمح بتوثيق موافقة على عرض السعر.",
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pricing, error: pricingErr } = await (supabase.from("shipment_pricing") as any)
      .select("*")
      .eq("shipment_id", shipmentId)
      .maybeSingle();

    if (pricingErr || !pricing) {
      return { success: false, error: "سجل التسعير غير متوفر." };
    }

    const canRecordProposedEstimate =
      pricing.status === "proposed" && shipment.status === "price_proposed";
    const canRecordFinalOffer =
      pricing.status === "final_proposed" && pricing.final_price !== null;

    if (!canRecordProposedEstimate && !canRecordFinalOffer) {
      return {
        success: false,
        error: "عرض السعر الحالي ليس في حالة انتظار موافقة.",
      };
    }

    const nowIso = new Date().toISOString();
    const isFinalOffer =
      pricing.status === "final_proposed" && pricing.final_price !== null;
    const isExactRange =
      Number(pricing.estimated_min_price) === Number(pricing.estimated_max_price);
    const resolvedFinalPrice = isFinalOffer
      ? Number(pricing.final_price)
      : isExactRange
      ? Number(pricing.estimated_min_price)
      : null;
    const approvalType: PricingApprovalType =
      resolvedFinalPrice !== null ? "final_fixed" : "estimated_range";

    // Update pricing record — customer_approved_by stores the customer whose approval was received,
    // while approval_recorded_by and updated_by store the actual Admin actor!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("shipment_pricing") as any)
      .update({
        status: "customer_approved",
        final_price: resolvedFinalPrice,
        customer_approved_at: nowIso,
        customer_approved_by: shipment.customer_id,
        approval_type: approvalType,
        approval_source: "admin_on_behalf",
        approval_recorded_by: adminUser.id,
        approval_channel: approvalChannel,
        confirmed_by_name: confirmedByName,
        confirmation_reference: confirmationReference,
        updated_by: adminUser.id,
      })
      .eq("id", pricing.id);

    if (updateErr) {
      return { success: false, error: `تعذر تسجيل الموافقة: ${updateErr.message}` };
    }

    if (shipment.status === "price_proposed" || shipment.status === "price_agreed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("shipments") as any)
        .update({ status: "awaiting_invoice_review", updated_by: adminUser.id })
        .eq("id", shipmentId);
    }

    // Record in history audit trail under the ACTUAL Admin actor (`performed_by: adminUser.id`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("shipment_pricing_history") as any).insert({
      shipment_id: shipmentId,
      pricing_id: pricing.id,
      action: "customer_approved",
      estimated_min_price: pricing.estimated_min_price,
      estimated_max_price: pricing.estimated_max_price,
      final_price: resolvedFinalPrice,
      currency: pricing.currency,
      performed_by: adminUser.id,
      approval_type: approvalType,
      approval_source: "admin_on_behalf",
      approval_recorded_by: adminUser.id,
      approval_channel: approvalChannel,
      confirmed_by_name: confirmedByName,
      confirmation_reference: confirmationReference,
      notes: `سجل المشرف موافقة العميل (${confirmedByName}) عبر (${approvalChannel}) — المرجع: ${confirmationReference}`,
    });

    if (shipment.customer_id) {
      await createNotification({
        userId: shipment.customer_id,
        shipmentId,
        title: "تأكيد الموافقة على عرض السعر",
        message: `تم توثيق موافقتكم على عرض سعر الشحنة ${shipment.reference_number || ""} والبدء في مراجعة الفاتورة المبدئية.`,
        type: "pricing",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    revalidatePath("/shipments");
    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath("/my-shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);

    return {
      success: true,
      message: "تم توثيق موافقة العميل بنجاح والانتقال إلى مراجعة الفاتورة المبدئية.",
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[adminRecordCustomerPriceApprovalAction] Exception:", err);
    }
    return { success: false, error: "حدث خطأ غير متوقع أثناء توثيق موافقة العميل." };
  }
}
