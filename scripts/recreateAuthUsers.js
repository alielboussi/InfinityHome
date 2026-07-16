/**
 * Recreate Auth login users on a NEW Supabase project using IDs from the backup
 * public.users table (keeps hardcoded accessControl UUIDs working).
 *
 * Usage:
 *   set TARGET_SUPABASE_URL=https://xxxx.supabase.co
 *   set TARGET_SUPABASE_SERVICE_ROLE=eyJ...
 *   node scripts/recreateAuthUsers.js [path-to-backup.json]
 *
 * Default temp password: ChangeMe-InfinityHome-2026
 * Users should reset passwords after login works.
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
  const out = { file: null, url: null, key: null, password: 'ChangeMe-InfinityHome-2026' };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === '--url') out.url = args.shift();
    else if (a === '--key') out.key = args.shift();
    else if (a === '--password') out.password = args.shift();
    else if (!a.startsWith('-') && !out.file) out.file = a;
  }
  return out;
}

function latestBackup() {
  const dir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? path.join(dir, files[0].f) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file || latestBackup();
  const url = args.url || process.env.TARGET_SUPABASE_URL || process.env.NEW_SUPABASE_URL;
  const key =
    args.key || process.env.TARGET_SUPABASE_SERVICE_ROLE || process.env.NEW_SUPABASE_SERVICE_ROLE;

  if (!file || !fs.existsSync(file)) {
    console.error('Backup file not found');
    process.exit(1);
  }
  if (!url || !key) {
    console.error('Set TARGET_SUPABASE_URL and TARGET_SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }
  if (/xolmjpsibkwkdllqadee/i.test(url)) {
    console.error('Refusing to run against the OLD project URL');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const users = Array.isArray(backup.tables?.users) ? backup.tables.users : [];
  if (!users.length) {
    console.error('No users rows in backup');
    process.exit(1);
  }

  // These emails MUST keep their exact Auth UUID or role/route access in
  // src/accessControl.js stops working. public.users.id is a legacy integer
  // and cannot be used as an Auth UUID, so only these are pinned.
  const KNOWN_AUTH_UUIDS = {
    'alielboussi00@gmail.com': '1b5e098e-1206-447e-b4bc-6d009b85b5d3',
    'husseinelboussizam@gmail.com': '99a0cdc5-1e67-40ff-93d4-a961cb9cff39',
    'hassanawad18@gmail.com': '6b992ac8-8e39-4f31-a323-2271a974da8c',
  };

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log(`Creating ${users.length} auth users on ${url}`);
  console.log(`Temp password: ${args.password}`);

  for (const row of users) {
    const email = String(row.email || '').trim();
    if (!email) {
      console.log(` skip incomplete row`, row);
      continue;
    }
    const pinnedId = KNOWN_AUTH_UUIDS[email.toLowerCase()] || null;
    const payload = {
      email,
      password: args.password,
      email_confirm: true,
      user_metadata: {
        full_name: row.full_name || row.name || null,
        role: row.role || null,
      },
    };
    // Only set id for the pinned accounts; others get a fresh Supabase UUID.
    if (pinnedId) payload.id = pinnedId;

    const { data, error } = await supabase.auth.admin.createUser(payload);
    if (error) {
      console.log(` ! ${email}: ${error.message}`);
    } else {
      const tag = pinnedId ? ' [pinned uuid]' : '';
      console.log(` + ${email} (${data?.user?.id})${tag}`);
    }
  }

  console.log('\nDone. Have each person change their password after first login.');
  console.log('Note: 3 role-critical accounts were pinned to their original UUIDs;');
  console.log('other accounts received new UUIDs (default access is full unless restricted).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
