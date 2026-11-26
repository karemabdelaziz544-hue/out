/**
 * External Operations Queries — Server Side
 *
 * Fetches manually recorded Nafeza and CargoX actions for a shipment.
 * Strictly restricted to internal staff via RLS and server guards.
 */

import { createClient } from "@/lib/supabase/server";
import type { ShipmentExternalOperation } from "@/types";

/**
 * Fetch chronological external operations log for a shipment.
 */
export async function getShipmentExternalOperations(
  shipmentId: string,
): Promise<ShipmentExternalOperation[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_external_operations") as any)
    .select(`
      *,
      creator:created_by ( id, full_name, role, email ),
      doc:document_id ( id, title, file_name, document_type ),
      updater:updated_by ( id, full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("operation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[external-operations] Error fetching records:", error?.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    shipment_id: row.shipment_id,
    platform: row.platform,
    operation_type: row.operation_type,
    title: row.title,
    description: row.description || null,
    operation_date: row.operation_date,
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.creator?.full_name || null,
    created_by_role: row.creator?.role || null,
    external_reference: row.external_reference || null,
    acid_number: row.acid_number || null,
    outcome: row.outcome,
    external_response: row.external_response || null,
    document_id: row.document_id || null,
    document_title: row.doc?.title || null,
    document_file_name: row.doc?.file_name || null,
    document_type: row.doc?.document_type || null,
    updated_at: row.updated_at,
    updated_by: row.updated_by || null,
    updated_by_name: row.updater?.full_name || null,
  }));
}
