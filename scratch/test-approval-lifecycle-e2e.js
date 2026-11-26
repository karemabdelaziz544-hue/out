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

async function runTests() {
  console.log('================================================================');
  console.log('  OUT PLATFORM — DOCUMENT VIEW & APPROVAL WORKFLOW TEST SUITE   ');
  console.log('================================================================\n');

  const adminEmail = 'karemabdelaziz211@gmail.com';
  const customerAEmail = 'admin@out.dev';
  const customerBEmail = 'nile.imports@out.dev';

  // Ensure role assignments in profiles
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
    .select('id, full_name, email')
    .eq('email', customerAEmail)
    .single();

  const { data: custBProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email')
    .eq('email', customerBEmail)
    .single();

  const { cookieHeader: adminCookie, userClient: adminUserClient } = await getSessionCookie(adminEmail);
  const { cookieHeader: custACookie, userClient: custAClient } = await getSessionCookie(customerAEmail);
  const { cookieHeader: custBCookie, userClient: custBClient } = await getSessionCookie(customerBEmail);

  let passed = 0;
  let total = 8;

  // -------------------------------------------------------------
  // TEST 1 — Customer Upload -> status = 'pending'
  // -------------------------------------------------------------
  console.log('[TEST 1] Customer A uploads a document: status must be pending');
  const testFileName = `test-cert-${Date.now()}.pdf`;
  const storagePath = `${custAProfile.id}/tests/${testFileName}`;
  const pdfBuffer = Buffer.from('%PDF-1.4 sample test invoice');

  // Upload file to bucket as Customer A
  const { error: upErr } = await custAClient.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (upErr) {
    console.error('  FAIL: Customer A storage upload failed:', upErr.message);
  } else {
    // Insert document record as Customer A
    const { data: newDoc, error: insErr } = await custAClient
      .from('documents')
      .insert({
        title: 'شهادة المنشأ الأصلية',
        file_name: testFileName,
        file_path: storagePath,
        file_size: pdfBuffer.length,
        mime_type: 'application/pdf',
        document_type: 'شهادة منشأ',
        customer_id: custAProfile.id,
      })
      .select()
      .single();

    if (insErr) {
      console.error('  FAIL: Insert document failed:', insErr.message);
    } else if (newDoc.status === 'pending' && !newDoc.approved_at) {
      console.log(`  PASS: Document inserted with id=${newDoc.id}, status='pending', approved_at=null`);
      passed++;
      global.testDocId = newDoc.id;
      global.storagePath = storagePath;
    } else {
      console.error('  FAIL: Expected status pending but got:', newDoc.status);
    }
  }

  // -------------------------------------------------------------
  // TEST 2 — Admin Review in /documents
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Admin reviews /documents: sees document, customer info, pending status');
  const adminPageRes = await requestPage('/documents', adminCookie);
  if (
    adminPageRes.status === 200 &&
    adminPageRes.text.includes('شهادة المنشأ الأصلية') &&
    adminPageRes.text.includes('قيد المراجعة')
  ) {
    console.log('  PASS: Admin documents page lists document with "قيد المراجعة" status');
    passed++;
  } else {
    console.error(`  FAIL: Document or pending badge missing from /documents (status: ${adminPageRes.status})`);
  }

  // -------------------------------------------------------------
  // TEST 3 — Admin Approves Document
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Admin approves document: sets status=approved, approved_by, approved_at');
  const nowBefore = new Date(Date.now() - 5000).toISOString();
  const { data: approvedDoc, error: approveErr } = await adminUserClient
    .from('documents')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: adminProfile.id,
    })
    .eq('id', global.testDocId)
    .select()
    .single();

  if (approveErr) {
    console.error('  FAIL: Admin approval update error:', approveErr.message);
  } else if (
    approvedDoc.status === 'approved' &&
    approvedDoc.approved_by === adminProfile.id &&
    approvedDoc.approved_at >= nowBefore
  ) {
    console.log(`  PASS: Document successfully approved by Admin: status='${approvedDoc.status}', approved_at=${approvedDoc.approved_at}`);
    passed++;
  } else {
    console.error('  FAIL: Approval data mismatch:', approvedDoc);
  }

  // -------------------------------------------------------------
  // TEST 4 — Customer after Approval in /my-documents
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Customer checks /my-documents after approval: shows "معتمد ✓"');
  const custPageRes = await requestPage('/my-documents', custACookie);
  if (
    custPageRes.status === 200 &&
    custPageRes.text.includes('شهادة المنشأ الأصلية') &&
    custPageRes.text.includes('معتمد')
  ) {
    console.log('  PASS: Customer sees approved document badge "معتمد" in /my-documents');
    passed++;
  } else {
    console.error(`  FAIL: Customer view missing approved state (status: ${custPageRes.status})`);
  }

  // -------------------------------------------------------------
  // TEST 5 — Direct Request: Customer tries to modify approved doc
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Direct update attempt on approved document by Customer A: must be REJECTED');
  const { data: updateRes, error: updateErr } = await custAClient
    .from('documents')
    .update({ title: 'محاولة تعديل غير مصرح بها' })
    .eq('id', global.testDocId)
    .select();

  // With RLS enforcing status = 'pending', this returns empty data array or error
  if (updateErr || (updateRes && updateRes.length === 0)) {
    // Check that title didn't change in DB
    const { data: checkDoc } = await adminClient
      .from('documents')
      .select('title')
      .eq('id', global.testDocId)
      .single();
    if (checkDoc.title === 'شهادة المنشأ الأصلية') {
      console.log('  PASS: Direct update on approved document was blocked by database RLS');
      passed++;
    } else {
      console.error('  FAIL: Document title was illegally modified to:', checkDoc.title);
    }
  } else {
    console.error('  FAIL: Update unexpectedly succeeded on approved doc:', updateRes);
  }

  // -------------------------------------------------------------
  // TEST 6 — Direct Delete: Customer tries to delete approved doc
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Direct delete attempt on approved document by Customer A: must be REJECTED');
  const { data: delRes, error: delErr } = await custAClient
    .from('documents')
    .delete()
    .eq('id', global.testDocId)
    .select();

  if (delErr || (delRes && delRes.length === 0)) {
    // Verify document still exists
    const { data: stillExists } = await adminClient
      .from('documents')
      .select('id')
      .eq('id', global.testDocId)
      .single();

    if (stillExists) {
      console.log('  PASS: Direct delete on approved document was blocked by database RLS');
      passed++;
    } else {
      console.error('  FAIL: Document was deleted despite being approved!');
    }
  } else {
    console.error('  FAIL: Delete unexpectedly succeeded on approved doc:', delRes);
  }

  // -------------------------------------------------------------
  // TEST 7 — Customer Isolation: Customer B cannot access A's doc
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Customer Isolation: Customer B tries to view/modify Customer A doc');
  const { data: custBSelect, error: bErr } = await custBClient
    .from('documents')
    .select('id, title')
    .eq('id', global.testDocId);

  const { data: custBUpdate } = await custBClient
    .from('documents')
    .update({ title: 'تعديل من عميل آخر' })
    .eq('id', global.testDocId)
    .select();

  if ((!custBSelect || custBSelect.length === 0) && (!custBUpdate || custBUpdate.length === 0)) {
    console.log('  PASS: Customer B cannot view or modify Customer A document (isolated by RLS)');
    passed++;
  } else {
    console.error('  FAIL: Customer B accessed Customer A doc:', custBSelect);
  }

  // -------------------------------------------------------------
  // TEST 8 — Admin Context vs Customer Context Isolation
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Context Separation: Admin page shows customer info; Customer page strictly hides customer info');
  const custHtml = custPageRes.text;
  const adminHtml = adminPageRes.text;

  // In customer view, the customer table header does NOT have a column for "العميل"
  const custHasCustomerColumn = custHtml.includes('<th scope="col" style="width: 20%">العميل</th>') || custHtml.includes('عرض العميل');
  // In admin view, the admin table header DOES have "العميل"
  const adminHasCustomerColumn = adminHtml.includes('العميل');

  if (!custHasCustomerColumn && adminHasCustomerColumn) {
    console.log('  PASS: Customer view strictly hides customer context & "عرض العميل". Admin view includes customer context.');
    passed++;
  } else {
    console.error('  FAIL: Context leak detected! custHasCustomerColumn=' + custHasCustomerColumn);
  }

  // Cleanup test doc
  await adminClient.from('documents').delete().eq('id', global.testDocId);
  await adminClient.storage.from('documents').remove([global.storagePath]);

  console.log('\n================================================================');
  console.log(`  FINAL RESULT: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
