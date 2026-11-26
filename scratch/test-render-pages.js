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

async function run() {
  const stages = [
    'استلام طلب الشحنة',
    'التسعير وموافقة العميل',
    'مراجعة الفاتورة المبدئية',
    'إصدار رقم ACID',
    'مراجعة مستندات الشحنة',
    'إجراءات التخليص حسب نوع الشحنة',
    'استكمال إجراءات التخليص والإفراج الجمركي'
  ];

  console.log('Testing Admin Page Rendering...');
  const adminCookie = await getSessionCookie('karemabdelaziz211@gmail.com');
  const adminRes = await fetch('http://localhost:3000/shipments/adb63d10-9873-4bbd-9835-e408338601c2', {
    headers: { Cookie: adminCookie }
  });
  console.log('Admin Page HTTP Status:', adminRes.status);
  const adminHtml = await adminRes.text();
  console.log('Admin Page length:', adminHtml.length);
  
  console.log('\n--- Checking 7 stages in Admin HTML ---');
  stages.forEach(st => console.log(`  Stage [${st}]:`, adminHtml.includes(st) ? 'FOUND' : 'MISSING'));
  console.log('Admin has no CargoX:', !adminHtml.includes('CargoX'));

  console.log('\nTesting Customer Page Rendering...');
  const customerCookie = await getSessionCookie('admin@out.dev');
  const custRes = await fetch('http://localhost:3000/my-shipments/adb63d10-9873-4bbd-9835-e408338601c2', {
    headers: { Cookie: customerCookie }
  });
  console.log('Customer Page HTTP Status:', custRes.status);
  const custHtml = await custRes.text();
  console.log('Customer Page length:', custHtml.length);
  
  console.log('\n--- Checking 7 stages in Customer HTML ---');
  stages.forEach(st => console.log(`  Stage [${st}]:`, custHtml.includes(st) ? 'FOUND' : 'MISSING'));
  console.log('Customer has no CargoX:', !custHtml.includes('CargoX'));
}

run().catch(console.error);
