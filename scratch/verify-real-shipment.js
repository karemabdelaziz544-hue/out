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

// Import the compiled or transpiled journey builder logic or replicate its interface check
async function test() {
  const { data: shipment } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', 'adb63d10-9873-4bbd-9835-e408338601c2')
    .single();

  const { data: pricing } = await supabase
    .from('shipment_pricing')
    .select('*')
    .eq('shipment_id', shipment.id)
    .single();

  const { data: customsStages } = await supabase
    .from('shipment_customs_stages')
    .select('*')
    .eq('shipment_id', shipment.id);

  console.log('Shipment:', shipment.reference_number, 'Status:', shipment.status);
  console.log('Pricing:', pricing ? pricing.status : 'None');
  console.log('Customs stages count:', customsStages ? customsStages.length : 0);
}

test();
