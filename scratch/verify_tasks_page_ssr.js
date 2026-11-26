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

async function verifyTasksPage() {
  console.log('Testing Admin Tasks Page Live SSR with authenticated admin session...');
  const adminCookie = await getSessionCookie('karemabdelaziz211@gmail.com');
  const res = await fetch('http://localhost:3000/tasks', {
    headers: { Cookie: adminCookie }
  });

  console.log('Admin Tasks Page HTTP Status:', res.status);
  if (res.status !== 200) {
    console.error('Expected HTTP 200, got:', res.status);
    const body = await res.text();
    console.error('Body snippet:', body.slice(0, 500));
    process.exit(1);
  }

  const html = await res.text();

  const requiredSnippets = [
    'المهام والعمليات التشغيلية',
    'إجمالي المهام التشغيلية',
    'بانتظار البدء',
    'قيد التنفيذ والمتابعة',
    'مهام متأخرة',
    'مهام مكتملة وموثقة',
    'بحث باسم المهمة، رقم الشحنة، العميل، أو الوصف',
    'المهمة والمرحلة',
    'الشحنة المرتبطة',
    'الدور المسؤول',
    'الحالة التشغيلية',
    'الأولوية والموعد',
    'متابعة'
  ];

  let missing = [];
  for (const s of requiredSnippets) {
    if (!html.includes(s)) {
      missing.push(s);
    }
  }

  if (missing.length > 0) {
    console.error('Missing snippets in /tasks HTML:', missing);
    process.exit(1);
  }

  console.log('SUCCESS! All required sections, KPI cards, table headers, and actions rendered cleanly in live SSR!');
}

verifyTasksPage();
