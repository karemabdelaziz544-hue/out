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

async function requestPage(path, cookieHeader = '') {
  const headers = {};
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await fetch(`http://localhost:3000${path}`, {
    headers,
    redirect: 'manual',
  });
  const status = res.status;
  const location = res.headers.get('location');
  const text = await res.text();
  return { status, location, text };
}

async function runStep2TestSuite() {
  console.log('================================================================');
  console.log('  OUT PLATFORM — STEP 2: COMPANY PAGE & SECURITY TEST SUITE     ');
  console.log('================================================================\n');

  const adminEmail = 'karemabdelaziz211@gmail.com';
  const customerAEmail = 'admin@out.dev';
  const customerBEmail = 'nile.imports@out.dev';

  // Ensure role assignments
  await adminClient.from('profiles').update({ role: 'admin' }).eq('email', adminEmail);
  await adminClient.from('profiles').update({ role: 'customer' }).eq('email', customerAEmail);
  await adminClient.from('profiles').update({ role: 'customer' }).eq('email', customerBEmail);

  const { data: custAProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email, company_id')
    .eq('email', customerAEmail)
    .single();

  const { data: custBProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email, company_id')
    .eq('email', customerBEmail)
    .single();

  const { cookieHeader: adminCookie } = await getSessionCookie(adminEmail);
  const { cookieHeader: custACookie, userClient: custAClient } = await getSessionCookie(customerAEmail);
  const { cookieHeader: custBCookie, userClient: custBClient } = await getSessionCookie(customerBEmail);

  let passed = 0;
  let total = 7;

  // Setup: Create Company A and Company B
  console.log('[SETUP] Preparing test companies...');
  const { data: compA } = await adminClient
    .from('companies')
    .insert({
      name: 'شركة الفراعنة للاستيراد والتصدير',
      commercial_registration_number: 'CR-889900',
      tax_card_number: 'TX-554433',
      import_card_number: 'IMP-112233',
      vat_number: 'VAT-998877',
      phone: '+201012345678',
      email: 'pharaohs@out.dev',
      address: 'القاهرة الجديدة، مصر',
    })
    .select()
    .single();

  const { data: compB } = await adminClient
    .from('companies')
    .insert({
      name: 'شركة الإسكندرية للشحن',
      commercial_registration_number: 'CR-112244',
      tax_card_number: 'TX-998811',
      phone: '+201088776655',
      email: 'alex@out.dev',
      address: 'محطة الرمل، الإسكندرية',
    })
    .select()
    .single();

  await adminClient.from('profiles').update({ company_id: compA.id }).eq('id', custAProfile.id);
  await adminClient.from('profiles').update({ company_id: compB.id }).eq('id', custBProfile.id);

  // -------------------------------------------------------------
  // TEST 1 — Customer A loads /company
  // -------------------------------------------------------------
  console.log('[TEST 1] Customer A opens /company:');
  const pageRes = await requestPage('/company', custACookie);
  if (
    pageRes.status === 200 &&
    pageRes.text.includes('بيانات الشركة') &&
    pageRes.text.includes('شركة الفراعنة للاستيراد والتصدير')
  ) {
    console.log('  PASS: /company rendered successfully with Customer A company name and status banner');
    passed++;
  } else {
    console.error(`  FAIL: /company failed to load or missing company name (Status: ${pageRes.status})`);
  }

  // -------------------------------------------------------------
  // TEST 2 — Edit Company attributes as Customer A
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Customer A updates company information:');
  const updatedName = 'شركة الفراعنة اللوجستية الحديثة';
  const updatedAddress = 'التجمع الخامس، القاهرة، مصر';
  const { data: updateRes, error: updateErr } = await custAClient
    .from('companies')
    .update({
      name: updatedName,
      address: updatedAddress,
    })
    .eq('id', compA.id)
    .select()
    .single();

  if (!updateErr && updateRes && updateRes.name === updatedName) {
    console.log(`  PASS: Customer A updated company name to "${updatedName}" in Supabase`);
    passed++;
  } else {
    console.error('  FAIL: Update company error:', updateErr);
  }

  // -------------------------------------------------------------
  // TEST 3 — Reload /company to verify persistence
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Reloading /company to confirm persistence:');
  const reloadRes = await requestPage('/company', custACookie);
  if (
    reloadRes.status === 200 &&
    reloadRes.text.includes(updatedName) &&
    reloadRes.text.includes(updatedAddress)
  ) {
    console.log('  PASS: Reloaded page reflects updated company name and address');
    passed++;
  } else {
    console.error('  FAIL: Reloaded page did not contain updated values');
  }

  // -------------------------------------------------------------
  // TEST 4 — Security: Customer A cannot read or edit Company B
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Security isolation: Customer A cannot read or update Company B:');
  const { data: leakRead } = await custAClient
    .from('companies')
    .select('*')
    .eq('id', compB.id);

  const { data: leakUpdate } = await custAClient
    .from('companies')
    .update({ name: 'محاولة اختراق' })
    .eq('id', compB.id)
    .select();

  if ((!leakRead || leakRead.length === 0) && (!leakUpdate || leakUpdate.length === 0)) {
    console.log('  PASS: Customer A strictly blocked from reading or updating Company B by RLS');
    passed++;
  } else {
    console.error('  FAIL: Customer A accessed Company B:', leakRead, leakUpdate);
  }

  // -------------------------------------------------------------
  // TEST 5 — Role Restriction: Admin redirected away from /company
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Admin redirected away from customer-only /company:');
  const adminPageRes = await requestPage('/company', adminCookie);
  if (adminPageRes.status === 307 || adminPageRes.status === 302) {
    console.log(`  PASS: Admin correctly redirected (Status: ${adminPageRes.status}, Location: ${adminPageRes.location})`);
    passed++;
  } else {
    console.error(`  FAIL: Admin was not redirected from /company (Status: ${adminPageRes.status})`);
  }

  // -------------------------------------------------------------
  // TEST 6 — Customer with missing company (setup_customer_company)
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Customer without company initial setup flow:');
  // Temporarily unset company_id for Customer A to simulate brand new customer
  await adminClient.from('profiles').update({ company_id: null }).eq('id', custAProfile.id);

  const missingPageRes = await requestPage('/company', custACookie);
  const showsEmptyState = missingPageRes.text.includes('لم يتم إعداد بيانات الشركة بعد');

  // Customer A uses setup_customer_company RPC to create and link initial company
  const { data: setupRes, error: setupErr } = await custAClient.rpc('setup_customer_company', {
    p_name: 'شركة النجوم للاستيراد',
    p_commercial_registration_number: 'CR-990011',
    p_tax_card_number: 'TX-776655',
  });

  const { data: recheckedProfile } = await adminClient
    .from('profiles')
    .select('company_id')
    .eq('id', custAProfile.id)
    .single();

  if (showsEmptyState && !setupErr && setupRes && recheckedProfile.company_id === setupRes.id) {
    console.log('  PASS: Missing company state displayed correctly and setup_customer_company successfully initialized company');
    passed++;
    // Clean up temporary company
    await adminClient.from('companies').delete().eq('id', setupRes.id);
  } else {
    console.error('  FAIL: Initial company setup failed:', setupErr, showsEmptyState);
  }

  // -------------------------------------------------------------
  // TEST 7 — Existing Documents system unaffected
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Existing Customer Documents system unaffected:');
  const docsRes = await requestPage('/my-documents', custACookie);
  if (docsRes.status === 200 && docsRes.text.includes('مستنداتي')) {
    console.log('  PASS: /my-documents continues to render cleanly and without issues');
    passed++;
  } else {
    console.error(`  FAIL: /my-documents failed to load (Status: ${docsRes.status})`);
  }

  // Clean up
  console.log('\n[CLEANUP] Cleaning up test companies...');
  await adminClient.from('profiles').update({ company_id: null }).eq('id', custAProfile.id);
  await adminClient.from('profiles').update({ company_id: null }).eq('id', custBProfile.id);
  await adminClient.from('companies').delete().in('id', [compA.id, compB.id]);
  console.log('  Cleanup completed.');

  console.log('\n================================================================');
  console.log(`  FINAL RESULT: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runStep2TestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
