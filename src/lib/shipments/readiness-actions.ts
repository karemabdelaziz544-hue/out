"use server";

/**
 * Step 9 — Nafeza & CargoX Preparation (Internal Readiness Actions)
 *
 * Implements:
 * 1. Server-side readiness validation logic (evaluateShipmentReadiness)
 * 2. Server mutation to transition shipment from 'documents_completed' -> 'ready_for_external_stage'
 * 3. Enforces strict role authorization, complete prerequisite verification,
 *    and immutable audit history logging in 'shipment_stage_history'.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Company } from "@/types/company";
import { DocumentItem } from "@/types/document";
import { Shipment, ShipmentPricing, ShipmentAcid } from "@/types/shipment";
import { ShipmentReadinessResult } from "@/types/readiness";
import { Database } from "@/types/database";
import { createNotification } from "@/lib/notifications/queries";

export interface ReadinessActionResult {
  success: boolean;
  message?: string;
  error?: string;
  readiness?: ShipmentReadinessResult;
}

/**
 * Helper to get a service-role admin Supabase client for atomic server operations.
 */
function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey);
}

import { evaluateShipmentReadiness } from "./readiness";

/**
 * Server Action: Mark Shipment Ready for External Stage
 *
 * Allowed roles: 'admin'
 * Transitions shipment: 'documents_completed' -> 'ready_for_external_stage'
 * Logs audit event in 'shipment_stage_history'
 */
export async function markShipmentReadyForExternalStageAction(
  shipmentId: string,
): Promise<ReadinessActionResult> {
  try {
    // 1. Role Guard
    const adminUser = await requireRole(["admin"]);

    if (!shipmentId) {
      return { success: false, error: "معرف الشحنة مطلوب." };
    }

    const supabaseAdmin = getAdminSupabase();

    // 2. Fetch current shipment
    const { data: shipmentRow, error: shipErr } = await supabaseAdmin
      .from("shipments")
      .select("*")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipErr || !shipmentRow) {
      return { success: false, error: "لم يتم العثور على الشحنة." };
    }

    const shipment = shipmentRow as Shipment;

    // Idempotency check: if already in ready_for_external_stage, return success
    if (shipment.status === "ready_for_external_stage") {
      return {
        success: true,
        message: "الشحنة مسجلة بالفعل بأنها جاهزة للمرحلة الخارجية.",
      };
    }

    // Must be in documents_completed before entering ready_for_external_stage
    if (shipment.status !== "documents_completed") {
      return {
        success: false,
        error: `لا يمكن نقل الشحنة للمرحلة الخارجية لأن حالتها الحالية هي '${shipment.status}' وليست 'documents_completed'.`,
      };
    }

    // 3. Fetch all related entities to evaluate readiness
    const [
      { data: companyRow },
      { data: pricingRow },
      { data: acidRow },
      { data: docsRows },
    ] = await Promise.all([
      supabaseAdmin.from("companies").select("*").eq("id", shipment.company_id).maybeSingle(),
      supabaseAdmin.from("shipment_pricing").select("*").eq("shipment_id", shipmentId).maybeSingle(),
      supabaseAdmin.from("shipment_acids").select("*").eq("shipment_id", shipmentId).maybeSingle(),
      supabaseAdmin.from("documents").select("*").eq("shipment_id", shipmentId),
    ]);

    const company = (companyRow as unknown as Company) || null;
    const pricing = (pricingRow as unknown as ShipmentPricing) || null;
    const acid = (acidRow as unknown as ShipmentAcid) || null;
    const documents = (docsRows as unknown as DocumentItem[]) || [];

    // 4. Run full readiness validation
    const readiness = evaluateShipmentReadiness({
      shipment,
      company,
      pricing,
      acid,
      documents,
    });

    if (!readiness.ready) {
      const failedNames = Object.values(readiness.checks)
        .filter((c) => !c.ready)
        .map((c) => c.name);

      return {
        success: false,
        error: `الشحنة غير جاهزة للمرحلة الخارجية. البنود غير المكتملة (${readiness.summary.failed}): ${failedNames.join("، ")}`,
        readiness,
      };
    }

    // 5. Update shipment status to 'ready_for_external_stage'
    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabaseAdmin.from("shipments") as any)
      .update({
        status: "ready_for_external_stage",
        updated_at: nowIso,
      })
      .eq("id", shipmentId);

    if (updateErr) {
      return {
        success: false,
        error: `فشل تحديث حالة الشحنة: ${updateErr.message}`,
      };
    }

    // 6. Record audit event in shipment_stage_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: histErr } = await (supabaseAdmin.from("shipment_stage_history") as any)
      .insert({
        shipment_id: shipmentId,
        action: "ready_for_external_stage",
        note: "تم تجهيز الشحنة للمرحلة الخارجية",
        performed_by: adminUser.id,
      });

    if (histErr && process.env.NODE_ENV === "development") {
      console.warn("[markShipmentReady] History insert warning:", histErr.message);
    }

    if (shipment?.customer_id) {
      await createNotification({
        userId: shipment.customer_id,
        shipmentId,
        title: "الشحنة جاهزة للمرحلة الخارجية",
        message: `تم استيفاء كافة الشروط المسبقة للشحنة ${shipment.reference_number || ""} واعتماد جاهزيتها للانتقال للعمليات الجمركية الخارجية بنجاح.`,
        type: "readiness",
        link: `/my-shipments/${shipmentId}`,
      });
    }

    // 7. Revalidate paths
    revalidatePath(`/shipments/${shipmentId}`);
    revalidatePath("/shipments");
    revalidatePath(`/my-shipments/${shipmentId}`);
    revalidatePath("/my-shipments");

    return {
      success: true,
      message: "تم تجهيز الشحنة للمرحلة الخارجية بنجاح ✅",
      readiness,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
    return { success: false, error: message };
  }
}
