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

async function runShipmentFoundationTests() {
  console.log('================================================================');
  console.log('  OUT PLATFORM — STEP 4: SHIPMENT FOUNDATION TEST SUITE        ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 12;

  const adminEmail = 'karemabdelaziz211@gmail.com';
  const customerAEmail = 'admin@out.dev';
  const customerBEmail = 'nile.imports@out.dev';
  const customerNoCompanyEmail = 'nocompany@out.dev';

  // Ensure user profiles and roles
  await adminClient.from('profiles').update({ role: 'admin' }).eq('email', adminEmail);
  await adminClient.from('profiles').update({ role: 'customer' }).eq('email', customerAEmail);
  await adminClient.from('profiles').update({ role: 'customer' }).eq('email', customerBEmail);

  // Setup Customer Without Company
  let { data: noCompUser } = await adminClient.from('profiles').select('*').eq('email', customerNoCompanyEmail).maybeSingle();
  if (!noCompUser) {
    const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: customerNoCompanyEmail,
      email_confirm: true,
      user_metadata: { full_name: 'عميل بدون شركة' },
    });
    if (!createErr && createdUser?.user) {
      await adminClient.from('profiles').insert({
        id: createdUser.user.id,
        email: customerNoCompanyEmail,
        full_name: 'عميل بدون شركة',
        role: 'customer',
        company_id: null,
      });
    }
  } else {
    await adminClient.from('profiles').update({ company_id: null, role: 'customer' }).eq('email', customerNoCompanyEmail);
  }

  // Get authenticated clients
  const { userClient: clientA, user: userA } = await getUserClient(customerAEmail);
  const { userClient: clientB, user: userB } = await getUserClient(customerBEmail);
  const { userClient: clientAdmin, user: adminUser } = await getUserClient(adminEmail);
  const { userClient: clientNoComp, user: userNoComp } = await getUserClient(customerNoCompanyEmail);

  // Retrieve Customer A company
  const { data: profA } = await adminClient.from('profiles').select('company_id').eq('id', userA.id).single();
  const companyAId = profA.company_id;
  if (!companyAId) throw new Error("Customer A must have a linked company for testing");

  // Retrieve Customer B company
  const { data: profB } = await adminClient.from('profiles').select('company_id').eq('id', userB.id).single();
  const companyBId = profB.company_id;
  if (!companyBId) throw new Error("Customer B must have a linked company for testing");

  let createdShipmentId = null;
  let createdRefNumber = null;

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Customer has Company -> Creates Shipment successfully
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: ship, error } = await clientA
      .from('shipments')
      .insert({
        company_id: companyAId,
        customer_id: userA.id,
        created_by: userA.id,
        status: 'draft',
        supplier_name: 'شركة شنغهاي الدولية',
        country_of_origin: 'الصين',
        port_of_arrival: 'ميناء الإسكندرية',
        goods_description: 'أجهزة ومعدات إلكترونية',
        packages_count: 100,
        package_type: 'كرتونة',
        gross_weight: 2500,
        notes: 'شحنة ذات أولوية',
      })
      .select('*')
      .single();

    if (error || !ship) {
      throw new Error(`Test 1 Failed: ${error?.message}`);
    }
    createdShipmentId = ship.id;
    createdRefNumber = ship.reference_number;
    console.log(`✅ Test 1 PASSED: Customer created shipment successfully. ID: ${ship.id}, Ref: ${ship.reference_number}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 1 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Saves Draft -> status is 'draft' ("مسودة")
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: ship, error } = await clientA
      .from('shipments')
      .select('status, reference_number')
      .eq('id', createdShipmentId)
      .single();

    if (error || ship.status !== 'draft') {
      throw new Error(`Test 2 Failed: Status is ${ship?.status}, expected 'draft'`);
    }
    console.log(`✅ Test 2 PASSED: Shipment status is 'draft' ("مسودة")`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 2 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Customer opens Draft and updates it
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: updated, error } = await clientA
      .from('shipments')
      .update({
        notes: 'ملاحظة محدثة: تم فحص البضاعة في المصنع',
        packages_count: 120,
      })
      .eq('id', createdShipmentId)
      .select('notes, packages_count')
      .single();

    if (error || updated.packages_count !== 120) {
      throw new Error(`Test 3 Failed: ${error?.message}`);
    }
    console.log(`✅ Test 3 PASSED: Customer updated draft shipment successfully (packages: ${updated.packages_count})`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 3 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Upload Preliminary Invoice -> Links to existing Shipment Documents
  // ─────────────────────────────────────────────────────────────
  let uploadedDocId = null;
  try {
    const testDocId = crypto.randomUUID();
    const storagePath = `${userA.id}/${testDocId}/preliminary_invoice_test.pdf`;

    // Upload to existing 'documents' storage bucket
    const fileContent = Buffer.from('%PDF-1.4 test invoice content');
    const { error: storageErr } = await clientA.storage
      .from('documents')
      .upload(storagePath, fileContent, { contentType: 'application/pdf' });

    if (storageErr) throw new Error(`Storage upload error: ${storageErr.message}`);

    // Insert into existing 'documents' table linked to shipment_id
    const { data: docRow, error: docErr } = await clientA
      .from('documents')
      .insert({
        id: testDocId,
        customer_id: userA.id,
        company_id: companyAId,
        shipment_id: createdShipmentId,
        title: 'الفاتورة المبدئية',
        file_name: 'preliminary_invoice_test.pdf',
        file_path: storagePath,
        file_size: fileContent.length,
        mime_type: 'application/pdf',
        document_type: 'فاتورة مبدئية',
        status: 'pending',
      })
      .select('*')
      .single();

    if (docErr || !docRow) throw new Error(`Doc DB insert error: ${docErr?.message}`);
    uploadedDocId = docRow.id;

    console.log(`✅ Test 4 PASSED: Preliminary invoice uploaded to existing 'documents' bucket & table. Linked to shipment_id: ${docRow.shipment_id}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 4 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Submit -> status transitions to 'awaiting_pricing'
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: submittedShip, error } = await clientA
      .from('shipments')
      .update({
        status: 'awaiting_pricing',
      })
      .eq('id', createdShipmentId)
      .select('status')
      .single();

    if (error || submittedShip.status !== 'awaiting_pricing') {
      throw new Error(`Test 5 Failed: Status is ${submittedShip?.status}, expected 'awaiting_pricing'`);
    }
    console.log(`✅ Test 5 PASSED: Shipment status transitioned to 'awaiting_pricing' ("بانتظار التسعير")`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 5 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Shipment appears in /my-shipments query for Customer A
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: myShipments, error } = await clientA
      .from('shipments')
      .select('*')
      .eq('company_id', companyAId);

    if (error || !myShipments.some((s) => s.id === createdShipmentId)) {
      throw new Error(`Test 6 Failed: Shipment not found in customer list`);
    }
    console.log(`✅ Test 6 PASSED: Shipment appears in Customer A list (${myShipments.length} total shipments)`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 6 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Customer B CANNOT see Customer A's shipments (RLS isolation)
  // ─────────────────────────────────────────────────────────────
  try {
    // Attempt to query Customer A's shipment directly as Customer B
    const { data: breachAttempt, error } = await clientB
      .from('shipments')
      .select('*')
      .eq('id', createdShipmentId);

    if (breachAttempt && breachAttempt.length > 0) {
      throw new Error(`Test 7 Failed: Customer B was able to read Customer A shipment! RLS leak!`);
    }
    console.log(`✅ Test 7 PASSED: Customer B cannot see Customer A's shipments (RLS strictly enforced)`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 7 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Admin sees Shipment in all shipments list
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: adminShipments, error } = await clientAdmin
      .from('shipments')
      .select('*, companies:company_id(name)')
      .eq('id', createdShipmentId);

    if (error || !adminShipments || adminShipments.length === 0) {
      throw new Error(`Test 8 Failed: Admin could not see shipment: ${error?.message}`);
    }
    console.log(`✅ Test 8 PASSED: Admin sees shipment. Reference: ${adminShipments[0].reference_number}, Company: ${adminShipments[0].companies?.name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 8 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Admin sees Company + Customer + Shipment Documents
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: fullShipment, error: sErr } = await clientAdmin
      .from('shipments')
      .select(`
        *,
        company:company_id (*),
        customer:customer_id (*),
        documents:documents (*)
      `)
      .eq('id', createdShipmentId)
      .single();

    if (sErr || !fullShipment) {
      throw new Error(`Test 9 Failed: ${sErr?.message}`);
    }

    if (!fullShipment.company || !fullShipment.customer || !fullShipment.documents || fullShipment.documents.length === 0) {
      throw new Error(`Test 9 Failed: Incomplete join data (company: ${Boolean(fullShipment.company)}, customer: ${Boolean(fullShipment.customer)}, docs: ${fullShipment.documents?.length})`);
    }

    console.log(`✅ Test 9 PASSED: Admin accesses full context: Company (${fullShipment.company.name}), Customer (${fullShipment.customer.email}), Docs (${fullShipment.documents.length})`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 9 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 10: Existing Company Documents still work as is
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: compDocs, error } = await clientA
      .from('company_documents')
      .select('*')
      .eq('company_id', companyAId);

    if (error) {
      throw new Error(`Test 10 Failed: ${error.message}`);
    }
    console.log(`✅ Test 10 PASSED: Existing company_documents system intact. Found ${compDocs.length} company docs.`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 10 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 11: Existing Shipment Documents system unaffected outside new link
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: generalDocs, error } = await clientA
      .from('documents')
      .select('*')
      .is('shipment_id', null);

    if (error) {
      throw new Error(`Test 11 Failed: ${error.message}`);
    }
    console.log(`✅ Test 11 PASSED: Existing standalone customer documents unaffected (${generalDocs.length} standalone docs).`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 11 FAILED:`, err.message);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 12: Customer without Company blocked from creating shipment
  // ─────────────────────────────────────────────────────────────
  try {
    // Attempt insert with no company or fake company
    const fakeCompanyId = crypto.randomUUID();
    const { data: blockedShip, error } = await clientNoComp
      .from('shipments')
      .insert({
        company_id: fakeCompanyId,
        customer_id: userNoComp.id,
        created_by: userNoComp.id,
        status: 'draft',
        goods_description: 'محاولة غير مصرحة',
      })
      .select('*');

    if (blockedShip && blockedShip.length > 0) {
      throw new Error(`Test 12 Failed: Customer without company was allowed to insert shipment!`);
    }

    console.log(`✅ Test 12 PASSED: Customer without company blocked by RLS/FK. Error: ${error?.message || 'Blocked'}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ Test 12 FAILED:`, err.message);
  }

  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 12 TESTS PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

runShipmentFoundationTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
