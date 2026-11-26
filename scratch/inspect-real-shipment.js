const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  const shipmentId = '433ead3b-3b9e-4295-bb80-128d71dad02e';

  // 1. Shipment
  const { data: shipment } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', shipmentId)
    .single();

  console.log('--- SHIPMENT ---');
  console.log('ID:', shipment.id);
  console.log('Ref:', shipment.reference_number);
  console.log('Status:', shipment.status);
  console.log('Goods Category:', shipment.goods_category);

  // 2. Pricing
  const { data: pricing } = await supabase
    .from('shipment_pricing')
    .select('*')
    .eq('shipment_id', shipmentId)
    .maybeSingle();
  console.log('\n--- PRICING ---', pricing);

  // 3. ACID
  const { data: acid } = await supabase
    .from('shipment_acids')
    .select('*')
    .eq('shipment_id', shipmentId)
    .maybeSingle();
  console.log('\n--- ACID ---', acid);

  // 4. Documents
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, document_type, status')
    .eq('shipment_id', shipmentId);
  console.log('\n--- DOCUMENTS ---', docs);

  // 5. Customs Stages
  const { data: stages } = await supabase
    .from('shipment_customs_stages')
    .select('stage_key, stage_order, status, is_applicable, reference_number, completed_at, outcome, stage_data')
    .eq('shipment_id', shipmentId)
    .order('stage_order', { ascending: true });
  console.log('\n--- CUSTOMS STAGES ---');
  for (const st of stages || []) {
    console.log(`[Order ${st.stage_order}] ${st.stage_key}: status=${st.status}, is_app=${st.is_applicable}, ref=${st.reference_number}, completed_at=${st.completed_at}`);
    if (st.stage_data && Object.keys(st.stage_data).length > 0) {
      console.log('   stage_data:', JSON.stringify(st.stage_data));
    }
  }

  // 6. Stage History
  const { data: stageHistory } = await supabase
    .from('shipment_stage_history')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('performed_at', { ascending: true });
  console.log('\n--- SHIPMENT STAGE HISTORY (Milestones) ---', stageHistory);

  // 7. Customs Stage History
  const { data: customsHistory } = await supabase
    .from('shipment_customs_stage_history')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('performed_at', { ascending: true });
  console.log('\n--- CUSTOMS STAGE HISTORY ---', customsHistory);
}

inspect();
