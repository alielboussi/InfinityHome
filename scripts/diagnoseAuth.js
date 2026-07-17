/**
 * Diagnose Supabase auth + anon key for Hassan login issues.
 * Usage: node scripts/diagnoseAuth.js
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function testAnonKey(label, key) {
  const res = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  const payload = decodeJwt(key);
  console.log(`[${label}] iat=${payload?.iat} status=${res.status} body=${text.slice(0, 80)}`);
}

async function main() {
  console.log('Target:', url);
  if (!url || !anonKey || !serviceKey) {
    console.error('Missing env vars in .env.local');
    process.exit(1);
  }

  await testAnonKey('local-anon', anonKey);

  const badKey = anonKey.replace('1784225407', '178425407');
  if (badKey !== anonKey) await testAnonKey('typo-anon', badKey);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error('listUsers failed:', error.message);
    process.exit(1);
  }

  const hassan = (data.users || []).find((u) => String(u.email || '').toLowerCase() === 'hassanawad18@gmail.com');
  if (!hassan) {
    console.log('Hassan NOT found in auth.users');
  } else {
    console.log('Hassan found:', {
      id: hassan.id,
      email: hassan.email,
      providers: hassan.app_metadata?.providers || [],
      confirmed: hassan.email_confirmed_at ? 'yes' : 'no',
      expectedId: '6b992ac8-8e39-4f31-a323-2271a974da8c',
      idMatch: hassan.id === '6b992ac8-8e39-4f31-a323-2271a974da8c',
    });
  }

  const signIn = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: loginData, error: loginErr } = await signIn.auth.signInWithPassword({
    email: 'hassanawad18@gmail.com',
    password: '123456',
  });
  console.log('password login:', loginErr ? loginErr.message : `ok user=${loginData.user?.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
