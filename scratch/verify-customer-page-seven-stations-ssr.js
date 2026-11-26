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

async function verifyCustomerPage() {
  const customerStations = [
    'تقديم طلب الشحنة',
    'التسعير والموافقة',
    'الفاتورة ونافذة وACID',
    'المستندات والإجراءات المطلوبة',
    'الكشف والمعاينة وإدراج البيانات',
    'التقييم الجمركي والتسوية',
    'الإفراج وخروج الشحنة والتسليم'
  ];

  console.log('Testing Customer Page Live SSR...');
  const userCookie = await getSessionCookie('testclient@out.com');
  const shipmentId = '433ead3b-3b9e-4295-bb80-128d71dad02e';
  const res = await fetch(`http://localhost:3000/my-shipments/${shipmentId}`, {
    headers: { Cookie: userCookie }
  });

  console.log('Customer Page HTTP Status:', res.status);
  const html = await res.text();
  console.log('HTML Length:', html.length, 'bytes');

  let allFound = true;
  console.log('\n--- Checking 7 Customer Stations in Live Customer Page ---');
  customerStations.forEach((stationName, idx) => {
    const num = idx + 1;
    const isFound = html.includes(stationName);
    console.log(`  Station ${num} [${stationName}]:`, isFound ? 'FOUND ✓' : 'MISSING ✗');
    if (!isFound) allFound = false;
  });

  if (allFound) {
    console.log('\n🎉 ALL 7 CUSTOMER STATIONS VERIFIED ON LIVE CUSTOMER PAGE SSR!');
  } else {
    console.log('Note: If status was 307 or 403 because testclient is not owner of shipment 433ead3b, verify shipment ownership.');
  }
}

verifyCustomerPage().catch(err => {
  console.error('Customer verification failed:', err);
});
