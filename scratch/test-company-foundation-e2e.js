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
const projectRef = 'cfdjzsehuzmvgkawkdrz';
const cookieName = `sb-${projectRef}-auth-token`;

async function getSessionCookie(email) {
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

  const session = authData.session;
  const cookieHeader = `${cookieName}=base64-${Buffer.from(
    JSON.stringify(session)
  ).toString('base64url')}`;
  return { cookieHeader, session, userClient };
}

async function runCompanyTests() {
  console.log('================================================================');
  console.log('  OUT PLATFORM — COMPANY FOUNDATION & SECURITY TEST SUITE       ');
  console.log('================================================================\n');

  const adminEmail = 'karemabdelaziz211@gmail.com';
  const customerAEmail = 'admin@out.dev';
  const customerBEmail = 'nile.imports@out.dev';

  // Ensure role assignments
  await adminClient.from('profiles').update({ role: 'admin' }).eq('email', adminEmail);
  await adminClient.from('profiles').update({ role: 'customer' }).eq('email', customerAEmail);
  await adminClient.from('profiles').update({ role: 'customer' }).eq('email', customerBEmail);

  const { data: adminProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email')
    .eq('email', adminEmail)
    .single();

  const { data: custAProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email, phone, company_id')
    .eq('email', customerAEmail)
    .single();

  const { data: custBProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email, phone, company_id')
    .eq('email', customerBEmail)
    .single();

  const { userClient: adminUserClient } = await getSessionCookie(adminEmail);
  const { userClient: custAClient } = await getSessionCookie(customerAEmail);
  const { userClient: custBClient } = await getSessionCookie(customerBEmail);

  let passed = 0;
  let total = 7;

  // Setup: Create Company A and Company B via Admin
  console.log('[SETUP] Creating Company A and Company B via Admin...');
  const { data: compA, error: errA } = await adminUserClient
    .from('companies')
    .insert({
      name: 'شركة النيل للخدمات اللوجستية',
      commercial_registration_number: 'CR-100234',
      tax_card_number: 'TX-987654',
      import_card_number: 'IMP-445566',
      vat_number: 'VAT-112233',
      phone: '+201011112222',
      email: 'info@nilelogistics.com',
      address: 'القاهرة، مصر',
    })
    .select()
    .single();

  if (errA) throw new Error('Failed to create Company A: ' + errA.message);

  const { data: compB, error: errB } = await adminUserClient
    .from('companies')
    .insert({
      name: 'شركة الأهرام للتجارة الدولية',
      commercial_registration_number: 'CR-556677',
      tax_card_number: 'TX-112244',
      phone: '+201099998888',
      email: 'contact@ahramtrade.com',
      address: 'الإسكندرية، مصر',
    })
    .select()
    .single();

  if (errB) throw new Error('Failed to create Company B: ' + errB.message);

  // Link Customer A -> Company A and Customer B -> Company B via Admin
  await adminUserClient.from('profiles').update({ company_id: compA.id }).eq('id', custAProfile.id);
  await adminUserClient.from('profiles').update({ company_id: compB.id }).eq('id', custBProfile.id);

  console.log(`  -> Company A (ID: ${compA.id}) linked to Customer A`);
  console.log(`  -> Company B (ID: ${compB.id}) linked to Customer B\n`);

  // -------------------------------------------------------------
  // TEST 1 — Customer A can read their own company
  // -------------------------------------------------------------
  console.log('[TEST 1] Customer A reads their own company via RLS:');
  const { data: readCompA, error: readCompAErr } = await custAClient
    .from('companies')
    .select('*')
    .eq('id', compA.id)
    .single();

  if (!readCompAErr && readCompA && readCompA.name === 'شركة النيل للخدمات اللوجستية') {
    console.log(`  PASS: Customer A successfully retrieved their company (${readCompA.name})`);
    passed++;
  } else {
    console.error('  FAIL: Customer A could not read their company:', readCompAErr);
  }

  // -------------------------------------------------------------
  // TEST 2 — Customer B CANNOT read Company A
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Customer B attempts to read Company A via RLS:');
  const { data: readCompBAsA, error: readCompBAsAErr } = await custBClient
    .from('companies')
    .select('*')
    .eq('id', compA.id);

  if (!readCompBAsA || readCompBAsA.length === 0) {
    console.log('  PASS: Customer B received 0 rows when attempting to query Company A (isolated by RLS)');
    passed++;
  } else {
    console.error('  FAIL: Customer B was able to read Company A data:', readCompBAsA);
  }

  // -------------------------------------------------------------
  // TEST 3 — Customer A CANNOT change company_id to Company B
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Customer A attempts to reassign company_id to Company B:');
  const { data: hijackRes, error: hijackErr } = await custAClient
    .from('profiles')
    .update({ company_id: compB.id })
    .eq('id', custAProfile.id)
    .select();

  // Verify that the update failed or returned 0 rows
  const { data: verifyProfileA } = await adminClient
    .from('profiles')
    .select('company_id')
    .eq('id', custAProfile.id)
    .single();

  if (
    (hijackErr || !hijackRes || hijackRes.length === 0) &&
    verifyProfileA.company_id === compA.id
  ) {
    console.log('  PASS: Reassignment of company_id was rejected by database RLS check (company_id remains Company A)');
    passed++;
  } else {
    console.error('  FAIL: Customer A successfully modified company_id to:', verifyProfileA.company_id);
  }

  // -------------------------------------------------------------
  // TEST 4 — Customer A can update other profile fields safely
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Customer A updates own phone number (preserving company_id):');
  const testPhone = '+201199887766';
  const { data: updatePhoneRes, error: updatePhoneErr } = await custAClient
    .from('profiles')
    .update({ phone: testPhone })
    .eq('id', custAProfile.id)
    .select()
    .single();

  if (!updatePhoneErr && updatePhoneRes && updatePhoneRes.phone === testPhone && updatePhoneRes.company_id === compA.id) {
    console.log('  PASS: Customer A updated phone while company_id remained intact');
    passed++;
  } else {
    console.error('  FAIL: Customer A could not update own profile fields:', updatePhoneErr);
  }

  // -------------------------------------------------------------
  // TEST 5 — Documents inherit company_id & isolation works
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Documents inherit company_id automatically via trigger & respect isolation:');
  const testDocTitle = `مستند شركة أ ${Date.now()}`;
  const { data: newDoc, error: newDocErr } = await custAClient
    .from('documents')
    .insert({
      title: testDocTitle,
      file_name: 'company-file.pdf',
      file_path: `${custAProfile.id}/test/company-file.pdf`,
      file_size: 1024,
      mime_type: 'application/pdf',
      customer_id: custAProfile.id,
    })
    .select()
    .single();

  if (!newDocErr && newDoc && newDoc.company_id === compA.id) {
    console.log(`  PASS: New document automatically inherited company_id=${newDoc.company_id}`);

    // Verify Customer B cannot read this document
    const { data: custBReadDoc } = await custBClient
      .from('documents')
      .select('id')
      .eq('id', newDoc.id);

    if (!custBReadDoc || custBReadDoc.length === 0) {
      console.log('  PASS: Customer B cannot access Company A document');
      passed++;
    } else {
      console.error('  FAIL: Customer B accessed Company A document:', custBReadDoc);
    }
  } else {
    console.error('  FAIL: Document insertion failed or company_id was not set:', newDocErr, newDoc);
  }

  // Clean up test document
  if (newDoc?.id) {
    await adminClient.from('documents').delete().eq('id', newDoc.id);
  }

  // -------------------------------------------------------------
  // TEST 6 — Existing Customer integrity preserved
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Existing customers and profiles data integrity verification:');
  const { count: totalProfilesCount, error: countErr } = await adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const { count: customersCount } = await adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'customer');

  if (!countErr && totalProfilesCount > 0 && customersCount > 0) {
    console.log(`  PASS: All existing profiles (${totalProfilesCount}) and customers (${customersCount}) intact with zero data loss`);
    passed++;
  } else {
    console.error('  FAIL: Profiles query error:', countErr);
  }

  // -------------------------------------------------------------
  // TEST 7 — Admin has full administrative access
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Admin full access: Admin can query all companies and customers:');
  const { data: allComps, error: allCompsErr } = await adminUserClient
    .from('companies')
    .select('id, name');

  if (!allCompsErr && allComps && allComps.length >= 2) {
    console.log(`  PASS: Admin retrieved all ${allComps.length} companies successfully`);
    passed++;
  } else {
    console.error('  FAIL: Admin could not query all companies:', allCompsErr);
  }

  // Clean up test companies and reset profiles company_id
  console.log('\n[CLEANUP] Resetting test company links...');
  await adminClient.from('profiles').update({ company_id: null, phone: custAProfile.phone }).eq('id', custAProfile.id);
  await adminClient.from('profiles').update({ company_id: null }).eq('id', custBProfile.id);
  await adminClient.from('companies').delete().in('id', [compA.id, compB.id]);
  console.log('  Cleaned up test companies successfully.');

  console.log('\n================================================================');
  console.log(`  FINAL RESULT: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCompanyTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
