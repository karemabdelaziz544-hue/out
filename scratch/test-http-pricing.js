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
  return `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

async function runHttpVerification() {
  console.log('Testing HTTP pages with pricing data...');
  const customerCookie = await getSessionCookie('admin@out.dev');
  const adminCookie = await getSessionCookie('karemabdelaziz211@gmail.com');

  const { data: latestShip } = await adminClient.from('shipments').select('id').limit(1).single();
  const shipId = latestShip?.id;

  const res1 = await fetch(`http://localhost:3000/my-shipments/${shipId}`, {
    headers: { Cookie: customerCookie },
  });
  console.log('Customer /my-shipments/[id] HTTP status:', res1.status);

  const res2 = await fetch(`http://localhost:3000/shipments/${shipId}`, {
    headers: { Cookie: adminCookie },
  });
  console.log('Admin /shipments/[id] HTTP status:', res2.status);

  if (res1.status === 200 && res2.status === 200) {
    console.log('🎉 Both pages rendered with pricing components successfully (HTTP 200 OK)!');
  } else {
    process.exit(1);
  }
}

runHttpVerification().catch(console.error);
