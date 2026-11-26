import { createClient } from "@supabase/supabase-js";

async function inspectData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: shipments, count: shipCount } = await supabase
    .from("shipments")
    .select("id, tracking_number, title, status, customer_id, company_id, created_at, updated_at", { count: "exact" });
  console.log("Total Shipments in DB:", shipments?.length, "count:", shipCount);
  if (shipments && shipments.length > 0) {
    console.log("Shipments sample:", shipments.slice(0, 3));
  }

  const { data: stages, count: stageCount } = await supabase
    .from("shipment_customs_stages")
    .select("id, shipment_id, stage_key, stage_order, status, expected_role, is_applicable, updated_at, completed_at", { count: "exact" });
  console.log("Total Customs Stages in DB:", stageCount);

  const { data: extOps, count: extCount } = await supabase
    .from("shipment_external_operations")
    .select("id, shipment_id, platform, operation_type, title, outcome, created_at", { count: "exact" });
  console.log("Total External Operations in DB:", extCount);

  const { data: profiles, count: profCount } = await supabase
    .from("profiles")
    .select("id, full_name, email, role", { count: "exact" });
  console.log("Total Profiles in DB:", profCount);
  console.log("Profiles by role:", profiles?.reduce((acc: any, p: any) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {}));

  if (stages && stages.length > 0) {
    console.log("Stages sample:", stages.slice(0, 5));
    const statusCounts = stages.reduce((acc: any, s: any) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});
    console.log("Stages by status:", statusCounts);
  }
}

inspectData();
