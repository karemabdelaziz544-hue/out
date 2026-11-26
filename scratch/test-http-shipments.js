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
  return cookieHeader;
}

async function runHttpVerification() {
  console.log('Testing HTTP Pages...');
  const customerCookie = await getSessionCookie('admin@out.dev');
  const adminCookie = await getSessionCookie('karemabdelaziz211@gmail.com');

  const { data: latestShip } = await adminClient.from('shipments').select('id').limit(1).single();
  const shipId = latestShip?.id;

  // 1. Customer GET /shipments/new
  const res1 = await fetch('http://localhost:3000/shipments/new', {
    headers: { Cookie: customerCookie },
  });
  console.log('Customer /shipments/new status:', res1.status);

  // 2. Customer GET /my-shipments
  const res2 = await fetch('http://localhost:3000/my-shipments', {
    headers: { Cookie: customerCookie },
  });
  console.log('Customer /my-shipments status:', res2.status);

  // 3. Customer GET /my-shipments/[id]
  const res3 = await fetch(`http://localhost:3000/my-shipments/${shipId}`, {
    headers: { Cookie: customerCookie },
  });
  console.log('Customer /my-shipments/[id] status:', res3.status);

  // 4. Admin GET /shipments
  const res4 = await fetch('http://localhost:3000/shipments', {
    headers: { Cookie: adminCookie },
  });
  console.log('Admin /shipments status:', res4.status);

  // 5. Admin GET /shipments/[id]
  const res5 = await fetch(`http://localhost:3000/shipments/${shipId}`, {
    headers: { Cookie: adminCookie },
  });
  console.log('Admin /shipments/[id] status:', res5.status);

  if (res1.status === 200 && res2.status === 200 && res3.status === 200 && res4.status === 200 && res5.status === 200) {
    console.log('🎉 ALL HTTP PAGES RENDERED WITH STATUS 200 OK!');
  } else {
    process.exit(1);
  }
}

runHttpVerification().catch(console.error);
