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

import { buildUnifiedSevenStageJourney } from '../src/lib/shipments/journey-builder.js';

async function runTests() {
  console.log('--- 1. Real Persisted Shipment ---');
  const { data: shipment } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', 'adb63d10-9873-4bbd-9835-e408338601c2')
    .single();

  const journey1 = buildUnifiedSevenStageJourney({ shipment });
  console.log(`Current Stage: [${journey1.currentStageNumber}] ${journey1.currentStageTitle}`);
  if (journey1.currentStageNumber !== '02') throw new Error('Expected stage 02 for awaiting_pricing');

  console.log('\n--- 2. Scenario: Pricing Proposed -> Waiting for Customer ---');
  const journey2 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'price_proposed' },
    pricing: { status: 'proposed', estimated_min_price: 5000, estimated_max_price: 8000 },
  });
  const st2 = journey2.stages.find(s => s.key === '02_pricing');
  console.log(`Stage 02 Status: ${st2.status} (${st2.statusLabel})`);
  if (st2.status !== 'waiting_customer') throw new Error('Expected waiting_customer for proposed pricing');

  console.log('\n--- 3. Scenario: Pricing Approved -> Stage 03 Invoice Review ---');
  const journey3 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'awaiting_invoice_review' },
    pricing: { status: 'customer_approved', final_price: 6500 },
  });
  console.log(`Current Stage: [${journey3.currentStageNumber}] ${journey3.currentStageTitle}`);
  if (journey3.currentStageNumber !== '03') throw new Error('Expected stage 03 for awaiting_invoice_review');

  console.log('\n--- 4. Scenario: Invoice Revision Required -> Needs Correction ---');
  const journey4 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'invoice_revision_required' },
    pricing: { status: 'customer_approved', final_price: 6500 },
  });
  const st3 = journey4.stages.find(s => s.key === '03_invoice_review');
  console.log(`Stage 03 Status: ${st3.status} (${st3.statusLabel})`);
  if (st3.status !== 'needs_correction') throw new Error('Expected needs_correction for invoice_revision_required');

  console.log('\n--- 5. Scenario: Invoice Approved -> Stage 04 ACID Issuance ---');
  const journey5 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'invoice_approved' },
    pricing: { status: 'customer_approved', final_price: 6500 },
  });
  console.log(`Current Stage: [${journey5.currentStageNumber}] ${journey5.currentStageTitle}`);
  if (journey5.currentStageNumber !== '04') throw new Error('Expected stage 04 for invoice_approved');

  console.log('\n--- 6. Scenario: ACID Issued -> Stage 05 Documents Review ---');
  const journey6 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'awaiting_shipment_documents' },
    pricing: { status: 'customer_approved', final_price: 6500 },
    acid: { status: 'issued', acid_number: '1234567890123456789' },
  });
  console.log(`Current Stage: [${journey6.currentStageNumber}] ${journey6.currentStageTitle}`);
  if (journey6.currentStageNumber !== '05') throw new Error('Expected stage 05 for awaiting_shipment_documents');

  console.log('\n--- 7. Scenario: 4/4 Documents Approved -> Stage 06 Customs Procedures ---');
  const mock4Docs = [
    { document_type: 'commercial_invoice', status: 'approved' },
    { document_type: 'packing_list', status: 'approved' },
    { document_type: 'bill_of_lading', status: 'approved' },
    { document_type: 'certificate_of_origin', status: 'approved' },
  ];
  const journey7 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'ready_for_external_stage' },
    pricing: { status: 'customer_approved', final_price: 6500 },
    acid: { status: 'issued', acid_number: '1234567890123456789' },
    documents: mock4Docs,
  });
  console.log(`Current Stage: [${journey7.currentStageNumber}] ${journey7.currentStageTitle}`);
  if (journey7.currentStageNumber !== '06') throw new Error('Expected stage 06 for ready_for_external_stage');

  console.log('\n--- 8. Scenario: Customs Procedures Completed -> Stage 07 Clearance & Duties ---');
  const journey8 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'ready_for_external_stage' },
    pricing: { status: 'customer_approved', final_price: 6500 },
    acid: { status: 'issued', acid_number: '1234567890123456789' },
    documents: mock4Docs,
    journey: {
      stages: [
        { stage_key: 'stage_6_inspection', status: 'completed' },
        { stage_key: 'stage_9_fees_payments', status: 'in_progress' },
      ],
    },
  });
  console.log(`Current Stage: [${journey8.currentStageNumber}] ${journey8.currentStageTitle}`);
  if (journey8.currentStageNumber !== '07') throw new Error('Expected stage 07 for inspection completed');

  console.log('\n--- 9. Scenario: Fully Cleared and Released (100%) ---');
  const journey9 = buildUnifiedSevenStageJourney({
    shipment: { ...shipment, status: 'ready_for_external_stage' },
    pricing: { status: 'customer_approved', final_price: 6500 },
    acid: { status: 'issued', acid_number: '1234567890123456789' },
    documents: mock4Docs,
    journey: {
      stages: [
        { stage_key: 'stage_6_inspection', status: 'completed' },
        { stage_key: 'stage_10_clearance_release', status: 'completed', reference_number: 'REL-998811' },
      ],
      isFullyCleared: true,
    },
  });
  console.log(`Current Stage: [${journey9.currentStageNumber}] ${journey9.currentStageTitle}`);
  console.log(`Completed Count: ${journey9.completedCount} / ${journey9.totalCount}`);
  console.log(`Progress: ${journey9.progressPercentage}%`);
  console.log(`Is Completed: ${journey9.isCompleted}`);
  if (!journey9.isCompleted || journey9.completedCount !== 7 || journey9.progressPercentage !== 100) {
    throw new Error('Expected all 7 stages completed for fully cleared shipment');
  }

  console.log('\n🎉 ALL 9 CRITICAL WORKFLOW SCENARIOS PASSED WITH 100% ACCURACY!');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
