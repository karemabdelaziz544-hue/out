const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const env = {};
if (fs.existsSync(".env.local")) {
  fs.readFileSync(".env.local", "utf-8").split("\n").forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from("shipment_customs_stages")
    .select("stage_key, stage_order");
  if (error) {
    console.error("Error:", error);
    return;
  }
  const map = new Map();
  data.forEach(d => map.set(d.stage_key, d.stage_order));
  console.log("Distinct stages in DB:", [...map.entries()].sort((a,b)=>a[1]-b[1]));

  // Count total stages
  console.log("Total stage rows in DB:", data.length);
}

main().catch(console.error);
