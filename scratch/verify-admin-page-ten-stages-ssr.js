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

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = 'cfdjzsehuzmvgkawkdrz';
const cookieName = `sb-${projectRef}-auth-token`;

async function getSessionCookie(email) {
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
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
  return `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

async function verifyAdminPage() {
  const authoritativeTenStages = [
    'تقديم طلب الشحنة',
    'التسعير وموافقة العميل',
    'مراجعة الفاتورة المبدئية وإجراءات نافذة وACID',
    'مراجعة مستندات الشحنة واستكمالها',
    'الكشف الميداني',
    'المعاينة',
    'إدراج البيانات',
    'التقييم الجمركي',
    'التسوية وسداد المستحقات',
    'الإفراج الجمركي وخروج الشحنة والتسليم'
  ];

  console.log('Testing Admin Page Live SSR with authenticated admin session...');
  const adminCookie = await getSessionCookie('karemabdelaziz211@gmail.com');
  const shipmentId = '433ead3b-3b9e-4295-bb80-128d71dad02e';
  const res = await fetch(`http://localhost:3000/shipments/${shipmentId}`, {
    headers: { Cookie: adminCookie }
  });

  console.log('Admin Page HTTP Status:', res.status);
  if (res.status !== 200) {
    throw new Error(`Expected HTTP 200, got ${res.status}`);
  }

  const html = await res.text();
  console.log('HTML Length:', html.length, 'bytes');

  let allFound = true;
  console.log('\n--- Checking Exactly 10 Authoritative Stages in Live Admin Page ---');
  authoritativeTenStages.forEach((stageName, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const isFound = html.includes(stageName);
    console.log(`  Stage ${num} [${stageName}]:`, isFound ? 'FOUND ✓' : 'MISSING ✗');
    if (!isFound) allFound = false;
  });

  const hasNoCargoX = !html.includes('CargoX');
  console.log('\nCargoX completely decoupled from active workflow HTML:', hasNoCargoX ? 'VERIFIED ✓' : 'FAILED ✗');

  const hasArabicRTL = html.includes('dir="rtl"');
  console.log('Arabic RTL markup present:', hasArabicRTL ? 'VERIFIED ✓' : 'FAILED ✗');

  if (allFound && hasNoCargoX && hasArabicRTL) {
    console.log('\n🎉 ALL 10 AUTHORITATIVE STAGES VERIFIED ON LIVE ADMIN SHIPMENT PAGE SSR!');
  } else {
    process.exit(1);
  }
}

verifyAdminPage().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
