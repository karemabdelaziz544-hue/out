import { createClient } from "@supabase/supabase-js";
import { CUSTOMS_STAGE_DEFINITIONS, OPERATIONAL_ROLES_INFO, CUSTOMS_STAGE_STATUS_CONFIG } from "../src/types/journey";

async function testQuery() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: stages, error } = await supabase
    .from("shipment_customs_stages")
    .select(`
      id,
      shipment_id,
      stage_key,
      stage_order,
      status,
      expected_role,
      is_applicable,
      notes,
      rejection_or_delay_reason,
      reference_number,
      stage_data,
      completed_at,
      completed_by,
      created_at,
      updated_at,
      shipments:shipment_id (
        id,
        reference_number,
        goods_description,
        status,
        company_id,
        customer_id,
        created_at,
        companies:company_id ( name ),
        profiles:customer_id ( full_name )
      )
    `)
    .eq("is_applicable", true)
    .order("stage_order", { ascending: true });

  if (error) {
    console.error("Query error:", error);
    return;
  }

  console.log(`Fetched ${stages.length} applicable stages.`);
  
  let totalTasks = 0;
  let pendingTasks = 0;
  let inProgressTasks = 0;
  let overdueTasks = 0;
  let completedTasks = 0;
  let blockedTasks = 0;

  const now = Date.now();

  const mapped = stages.map((st: any) => {
    totalTasks++;
    const meta = (CUSTOMS_STAGE_DEFINITIONS as any)[st.stage_key];
    const roleInfo = (OPERATIONAL_ROLES_INFO as any)[st.expected_role];
    const statusCfg = (CUSTOMS_STAGE_STATUS_CONFIG as any)[st.status];

    if (st.status === "pending") pendingTasks++;
    else if (st.status === "in_progress" || st.status === "awaiting_external_response") inProgressTasks++;
    else if (st.status === "completed") completedTasks++;
    else if (st.status === "blocked" || st.status === "needs_correction") blockedTasks++;

    const targetHours = meta?.targetDurationHours || 24;
    const stageData = st.stage_data || {};
    let targetCompletion = stageData.target_completion_at ? new Date(stageData.target_completion_at).getTime() : null;
    if (!targetCompletion && st.status === "in_progress") {
      targetCompletion = new Date(st.updated_at).getTime() + targetHours * 3600 * 1000;
    }

    const isOverdue =
      st.status !== "completed" &&
      st.status !== "not_applicable" &&
      targetCompletion !== null &&
      now > targetCompletion;

    if (isOverdue) overdueTasks++;

    return {
      id: st.id,
      title: meta?.title || st.stage_key,
      shipmentRef: st.shipments?.reference_number || "غير محدد",
      companyName: st.shipments?.companies?.name || "عميل فردي",
      customerName: st.shipments?.profiles?.full_name || "غير محدد",
      status: st.status,
      statusLabel: statusCfg?.label || st.status,
      role: st.expected_role,
      roleLabel: roleInfo?.label || st.expected_role,
      isOverdue,
    };
  });

  console.log("Stats computed:", {
    totalTasks,
    pendingTasks,
    inProgressTasks,
    overdueTasks,
    completedTasks,
    blockedTasks,
  });

  console.log("Sample mapped tasks:", mapped.slice(0, 3));
}

testQuery();
