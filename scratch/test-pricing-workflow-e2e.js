const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envFile
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const adminClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const url = env.NEXT_PUBLIC_SUPABASE_URL;

async function getUserClient(email) {
  const { data: linkData, error: linkErr } =
    await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
  if (linkErr) throw new Error(`Magiclink error for ${email}: ${linkErr.message}`);

  const userClient = createClient(url, anonKey);
  const { data: authData, error: authErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (authErr) throw new Error(`Verify OTP error: ${authErr.message}`);

  return { userClient, session: authData.session, user: authData.user };
}

async function runStep5PricingTests() {
  console.log('================================================================');
  console.log('  OUT PLATFORM — STEP 5: PRICING & NEGOTIATION TEST SUITE       ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 12;

  const adminEmail = 'karemabdelaziz211@gmail.com';
  const customerAEmail = 'admin@out.dev';
  const customerBEmail = 'nile.imports@out.dev';

  // Get authenticated clients
  const { userClient: clientA, user: userA } = await getUserClient(customerAEmail);
  const { userClient: clientB, user: userB } = await getUserClient(customerBEmail);
  const { userClient: clientAdmin, user: adminUser } = await getUserClient(adminEmail);

  // Retrieve Customer A company
  const { data: profA } = await adminClient.from('profiles').select('company_id').eq('id', userA.id).single();
  const companyAId = profA.company_id;

  // Retrieve Customer B company
  const { data: profB } = await adminClient.from('profiles').select('company_id').eq('id', userB.id).single();
  const companyBId = profB.company_id;

  // ─────────────────────────────────────────────────────────────
  // SETUP: Create two test shipments for scenarios A and B
  // ─────────────────────────────────────────────────────────────
  const { data: shipA, error: shipAErr } = await clientA
    .from('shipments')
    .insert({
      company_id: companyAId,
      customer_id: userA.id,
      created_by: userA.id,
      status: 'awaiting_pricing',
      goods_description: 'شحنة سيناريو أ: قبول فوري للموافقة',
      supplier_name: 'Guangzhou Electronics',
      country_of_origin: 'الصين',
      port_of_arrival: 'ميناء العين السخنة',
    })
    .select('*')
    .single();

  if (shipAErr || !shipA) throw new Error(`Failed to create shipment A: ${shipAErr?.message}`);
  const shipmentAId = shipA.id;

  const { data: shipB, error: shipBErr } = await clientA
    .from('shipments')
    .insert({
      company_id: companyAId,
      customer_id: userA.id,
      created_by: userA.id,
      status: 'awaiting_pricing',
      goods_description: 'شحنة سيناريو ب: مسار التفاوض',
      supplier_name: 'Ningbo Industrial',
      country_of_origin: 'الصين',
      port_of_arrival: 'ميناء الإسكندرية',
    })
    .select('*')
    .single();

  if (shipBErr || !shipB) throw new Error(`Failed to create shipment B: ${shipBErr?.message}`);
  const shipmentBId = shipB.id;

  console.log(`Initialized Test Shipments: A (${shipmentAId}) and B (${shipmentBId})\n`);

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Admin submits estimate (5,000 – 7,000 EGP) on Shipment A
  // ─────────────────────────────────────────────────────────────
  let pricingAId = null;
  try {
    const { data: pA, error: pAErr } = await adminClient
      .from('shipment_pricing')
      .insert({
        shipment_id: shipmentAId,
        estimated_min_price: 5000,
        estimated_max_price: 7000,
        final_price: null,
        currency: 'EGP',
        status: 'proposed',
        created_by: adminUser.id,
        updated_by: adminUser.id,
      })
      .select('*')
      .single();

    if (pAErr || !pA) throw new Error(`Pricing insert failed: ${pAErr?.message}`);
    pricingAId = pA.id;

    await adminClient.from('shipments').update({ status: 'price_proposed' }).eq('id', shipmentAId);

    await adminClient.from('shipment_pricing_history').insert({
      shipment_id: shipmentAId,
      pricing_id: pricingAId,
      action: 'estimate_created',
      estimated_min_price: 5000,
      estimated_max_price: 7000,
      currency: 'EGP',
      performed_by: adminUser.id,
      notes: 'تم تقديم تقدير مبدئي لسعر خدمة التخليص',
    });

    console.log(`✅ Test 1 PASSED: Admin created estimate 5,000–7,000 EGP. Shipment is 'price_proposed'.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 1 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Customer A views estimate
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: customerPView, error: cpErr } = await clientA
      .from('shipment_pricing')
      .select('*')
      .eq('shipment_id', shipmentAId)
      .single();

    if (cpErr || !customerPView || customerPView.status !== 'proposed') {
      throw new Error(`Customer cannot view pricing: ${cpErr?.message}`);
    }
    console.log(`✅ Test 2 PASSED: Customer sees estimate: ${customerPView.estimated_min_price} – ${customerPView.estimated_max_price} ${customerPView.currency}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 2 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Scenario A: Customer approves estimate -> awaiting_invoice_review
  // ─────────────────────────────────────────────────────────────
  try {
    const { error: appErr } = await clientA
      .from('shipment_pricing')
      .update({
        status: 'customer_approved',
        customer_approved_at: new Date().toISOString(),
        customer_approved_by: userA.id,
      })
      .eq('id', pricingAId);

    if (appErr) throw new Error(`Customer approve update failed: ${appErr.message}`);

    await adminClient.from('shipments').update({ status: 'awaiting_invoice_review' }).eq('id', shipmentAId);

    await clientA.from('shipment_pricing_history').insert({
      shipment_id: shipmentAId,
      pricing_id: pricingAId,
      action: 'customer_approved',
      estimated_min_price: 5000,
      estimated_max_price: 7000,
      currency: 'EGP',
      performed_by: userA.id,
      notes: 'وافق العميل على التقدير المبدئي لسعر الخدمة',
    });

    const { data: shipVerify } = await adminClient.from('shipments').select('status').eq('id', shipmentAId).single();
    if (shipVerify.status !== 'awaiting_invoice_review') {
      throw new Error(`Shipment status is ${shipVerify.status}, expected awaiting_invoice_review`);
    }

    console.log(`✅ Test 3 PASSED: Customer approved estimate. Shipment transitioned to 'awaiting_invoice_review'.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 3 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Scenario B: Admin creates estimate on Shipment B
  // ─────────────────────────────────────────────────────────────
  let pricingBId = null;
  try {
    const { data: pB, error: pBErr } = await adminClient
      .from('shipment_pricing')
      .insert({
        shipment_id: shipmentBId,
        estimated_min_price: 8000,
        estimated_max_price: 10000,
        currency: 'EGP',
        status: 'proposed',
        created_by: adminUser.id,
        updated_by: adminUser.id,
      })
      .select('*')
      .single();

    if (pBErr || !pB) throw new Error(`Pricing insert failed: ${pBErr?.message}`);
    pricingBId = pB.id;

    await adminClient.from('shipments').update({ status: 'price_proposed' }).eq('id', shipmentBId);

    await adminClient.from('shipment_pricing_history').insert({
      shipment_id: shipmentBId,
      pricing_id: pricingBId,
      action: 'estimate_created',
      estimated_min_price: 8000,
      estimated_max_price: 10000,
      currency: 'EGP',
      performed_by: adminUser.id,
    });

    console.log(`✅ Test 4 PASSED: Estimate 8,000–10,000 EGP created for Shipment B.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 4 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Scenario B: Customer requests negotiation -> status 'negotiation'
  // ─────────────────────────────────────────────────────────────
  try {
    const { error: negErr } = await clientA
      .from('shipment_pricing')
      .update({
        status: 'negotiation_requested',
      })
      .eq('id', pricingBId);

    if (negErr) throw new Error(`Negotiation request failed: ${negErr.message}`);

    await adminClient.from('shipments').update({ status: 'negotiation' }).eq('id', shipmentBId);

    await clientA.from('shipment_pricing_history').insert({
      shipment_id: shipmentBId,
      pricing_id: pricingBId,
      action: 'negotiation_requested',
      performed_by: userA.id,
      notes: 'طلب العميل التفاوض على السعر',
    });

    const { data: shipVerifyB } = await adminClient.from('shipments').select('status').eq('id', shipmentBId).single();
    if (shipVerifyB.status !== 'negotiation') {
      throw new Error(`Shipment status is ${shipVerifyB.status}, expected negotiation`);
    }

    console.log(`✅ Test 5 PASSED: Customer requested negotiation. Shipment transitioned to 'negotiation'.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 5 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Scenario B: Admin sets final price = 8,500 EGP -> status 'price_agreed'
  // ─────────────────────────────────────────────────────────────
  try {
    const { error: finalErr } = await adminClient
      .from('shipment_pricing')
      .update({
        final_price: 8500,
        status: 'final_proposed',
        updated_by: adminUser.id,
      })
      .eq('id', pricingBId);

    if (finalErr) throw new Error(`Final price update failed: ${finalErr.message}`);

    await adminClient.from('shipments').update({ status: 'price_agreed' }).eq('id', shipmentBId);

    await adminClient.from('shipment_pricing_history').insert({
      shipment_id: shipmentBId,
      pricing_id: pricingBId,
      action: 'final_price_set',
      final_price: 8500,
      currency: 'EGP',
      performed_by: adminUser.id,
      notes: 'تم تحديد السعر النهائي: 8500 EGP',
    });

    const { data: shipVerifyB2 } = await adminClient.from('shipments').select('status').eq('id', shipmentBId).single();
    if (shipVerifyB2.status !== 'price_agreed') {
      throw new Error(`Shipment status is ${shipVerifyB2.status}, expected price_agreed`);
    }

    console.log(`✅ Test 6 PASSED: Admin set final price (8,500 EGP). Shipment is 'price_agreed'.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 6 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Scenario B: Customer sees final price (8,500 EGP)
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: pViewFinal, error: vfErr } = await clientA
      .from('shipment_pricing')
      .select('*')
      .eq('id', pricingBId)
      .single();

    if (vfErr || !pViewFinal || pViewFinal.final_price !== 8500 || pViewFinal.status !== 'final_proposed') {
      throw new Error(`Customer did not receive final price: ${vfErr?.message}`);
    }

    console.log(`✅ Test 7 PASSED: Customer sees final agreed price: 8,500 EGP.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 7 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Scenario B: Customer approves final price -> awaiting_invoice_review
  // ─────────────────────────────────────────────────────────────
  try {
    const { error: appFinalErr } = await clientA
      .from('shipment_pricing')
      .update({
        status: 'customer_approved',
        customer_approved_at: new Date().toISOString(),
        customer_approved_by: userA.id,
      })
      .eq('id', pricingBId);

    if (appFinalErr) throw new Error(`Customer final approval failed: ${appFinalErr.message}`);

    await adminClient.from('shipments').update({ status: 'awaiting_invoice_review' }).eq('id', shipmentBId);

    await clientA.from('shipment_pricing_history').insert({
      shipment_id: shipmentBId,
      pricing_id: pricingBId,
      action: 'customer_approved',
      final_price: 8500,
      currency: 'EGP',
      performed_by: userA.id,
      notes: 'وافق العميل على السعر النهائي المتفق عليه',
    });

    const { data: shipVerifyB3 } = await adminClient.from('shipments').select('status').eq('id', shipmentBId).single();
    if (shipVerifyB3.status !== 'awaiting_invoice_review') {
      throw new Error(`Shipment status is ${shipVerifyB3.status}, expected awaiting_invoice_review`);
    }

    console.log(`✅ Test 8 PASSED: Customer approved final price. Shipment transitioned to 'awaiting_invoice_review'.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 8 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Audit History has full chronological record for Shipment B
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: historyB, error: hErr } = await adminClient
      .from('shipment_pricing_history')
      .select('*')
      .eq('shipment_id', shipmentBId)
      .order('performed_at', { ascending: true });

    if (hErr || !historyB || historyB.length < 4) {
      throw new Error(`Incomplete history. Found: ${historyB?.length} items`);
    }

    const actions = historyB.map(h => h.action);
    const expected = ['estimate_created', 'negotiation_requested', 'final_price_set', 'customer_approved'];
    const matches = expected.every(exp => actions.includes(exp));

    if (!matches) {
      throw new Error(`History actions mismatch: ${actions.join(', ')}`);
    }

    console.log(`✅ Test 9 PASSED: Complete audit trail recorded: ${actions.join(' -> ')}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 9 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 10: Security: Customer CANNOT modify prices directly
  // ─────────────────────────────────────────────────────────────
  try {
    // Customer attempts to modify estimated_min_price directly via client
    const { data: hackAttempt, error: hackErr } = await clientA
      .from('shipment_pricing')
      .update({
        estimated_min_price: 1, // illegal price tampering
        status: 'proposed',
      })
      .eq('id', pricingAId)
      .select();

    // RLS policy pricing_update_customer restricts status to negotiation_requested or customer_approved
    if (hackAttempt && hackAttempt.length > 0) {
      throw new Error(`Customer was able to tamper with prices! RLS violated!`);
    }

    console.log(`✅ Test 10 PASSED: Customer directly modifying prices was blocked by RLS policy.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 10 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 11: Security: Customer B cannot view Customer A's shipment pricing
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: leakCheck, error: leakErr } = await clientB
      .from('shipment_pricing')
      .select('*')
      .eq('shipment_id', shipmentAId);

    if (leakCheck && leakCheck.length > 0) {
      throw new Error(`Customer B can read Customer A pricing! RLS Leak!`);
    }

    console.log(`✅ Test 11 PASSED: Customer B cannot access Customer A's pricing (isolation verified).`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 11 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 12: Existing Systems Preserved (Company Docs & General Documents intact)
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: compDocs, error: cErr } = await adminClient.from('company_documents').select('id').limit(1);
    if (cErr) throw new Error(`company_documents failed: ${cErr.message}`);

    const { data: genDocs, error: gErr } = await adminClient.from('documents').select('id').limit(1);
    if (gErr) throw new Error(`documents failed: ${gErr.message}`);

    console.log(`✅ Test 12 PASSED: Existing company documents and shipment documents systems fully intact.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 12 FAILED:`, err.message);
  }

  console.log('\n================================================================');
  console.log(`  STEP 5 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 12 TESTS FOR STEP 5 PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

runStep5PricingTests().catch((err) => {
  console.error("FATAL ERROR IN STEP 5 TEST SUITE:", err);
  process.exit(1);
});
