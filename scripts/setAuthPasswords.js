/**
 * Set passwords for Auth users on the target Supabase project.
 *
 * Usage examples:
 *   # Set ONE user:
 *   node scripts/setAuthPasswords.js --email alielboussi00@gmail.com --password "YourNewPassword"
 *
 *   # Set ALL users to the same password:
 *   node scripts/setAuthPasswords.js --all --password "YourNewPassword"
 *
 * Uses TARGET_SUPABASE_URL + TARGET_SUPABASE_SERVICE_ROLE, or falls back to
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE from vercel.env / .env.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', 'vercel.env'));
loadEnvFile(path.join(__dirname, '..', '.env.local'));

function parseArgs(argv) {
  const out = { email: null, password: null, all: false };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === '--email') out.email = args.shift();
    else if (a === '--password') out.password = args.shift();
    else if (a === '--all') out.all = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url =
    process.env.TARGET_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.REACT_APP_SUPABASE_URL;
  const key =
    process.env.TARGET_SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }
  if (!args.password || String(args.password).length < 8) {
    console.error('Provide --password with at least 8 characters');
    process.exit(1);
  }
  if (!args.all && !args.email) {
    console.error('Provide --email someone@example.com  OR  --all');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log(`Target: ${url}`);

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw listError;

  const users = listed?.users || [];
  const targets = args.all
    ? users
    : users.filter((u) => String(u.email || '').toLowerCase() === String(args.email).toLowerCase());

  if (!targets.length) {
    console.error(args.all ? 'No auth users found' : `No auth user for ${args.email}`);
    process.exit(1);
  }

  for (const user of targets) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: args.password,
    });
    if (error) console.log(` ! ${user.email}: ${error.message}`);
    else console.log(` + password updated for ${user.email}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
