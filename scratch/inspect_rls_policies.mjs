import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

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
  console.log("=== INSPECTING LIVE RLS POLICIES ===");
  const tables = [
    'shipments',
    'documents',
    'companies',
    'profiles',
    'shipment_customs_stages',
    'shipment_customs_stage_history',
    'shipment_pricing',
    'shipment_acids',
    'shipment_external_operations',
    'shipment_document_reviews',
    'shipment_invoice_reviews'
  ];

  // We can query pg_policies via rpc if available, or test anon/authenticated select simulation
  // Since service role client can query pg_tables / pg_policies via sql if allowed, or test via select on pg_catalog
  const { data, error } = await supabase.rpc('pg_catalog_query', {
    q: "SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'"
  });

  if (error) {
    console.log("Direct RPC not present (expected). Querying policy information directly or inspecting migration baseline.");
  } else {
    console.log(data);
  }
}

inspect();
