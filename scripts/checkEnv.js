#!/usr/bin/env node
// Build-time environment verification
// Load .env.local and .env if present so local builds work without exporting vars in the shell
try {
  const path = require('path');
  // Prefer .env.local, then .env
  try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), override: true }); } catch {}
  try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), override: false }); } catch {}
} catch {}

const required = ['REACT_APP_SUPABASE_URL', 'REACT_APP_SUPABASE_ANON_KEY'];
let missing = [];
for (const k of required) {
  if (!process.env[k] || !String(process.env[k]).trim()) missing.push(k);
}
if (missing.length) {
  console.error('[env:fail] Missing required env vars: ' + missing.join(', '));
  process.exit(1);
}
// Guard: ensure no accidental service role key leaked into anon var
if (/service_role/i.test(process.env.REACT_APP_SUPABASE_ANON_KEY)) {
  console.error('[env:fail] Anon key appears to contain service_role token – aborting.');
  process.exit(1);
}
console.log('[env:ok] Core environment variables present.');

// Optional diagnostics for serverless endpoints (do not fail build if missing)
const optionalServerVars = [
  // Supabase (server-side)
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE'
];
const present = [];
const absent = [];
for(const k of optionalServerVars){
  if(process.env[k] && String(process.env[k]).trim()) present.push(k); else absent.push(k);
}
console.log('[env:info] Serverless env present: ' + (present.length? present.join(', '): '(none)'));
if(absent.length) console.log('[env:info] Serverless env missing (ok for local build): ' + absent.join(', '));

// Vercel Hobby has a small serverless function budget. Keep physical files in
// api/*.js consolidated; logical endpoints should use vercel.json rewrites.
try {
  const fs = require('fs');
  const path = require('path');
  const apiDir = path.resolve(process.cwd(), 'api');
  const apiFiles = fs.existsSync(apiDir)
    ? fs.readdirSync(apiDir).filter((name) => name.endsWith('.js'))
    : [];
  const hardLimit = 12;
  const target = 9;
  if (apiFiles.length > hardLimit) {
    console.error(`[api-budget:fail] ${apiFiles.length} api/*.js files found. Hard limit is ${hardLimit}. Consolidate endpoints before deploying.`);
    console.error(`[api-budget:fail] Files: ${apiFiles.sort().join(', ')}`);
    process.exit(1);
  }
  if (apiFiles.length > target) {
    console.warn(`[api-budget:warn] ${apiFiles.length} api/*.js files found. Target is ${target}; hard limit is ${hardLimit}.`);
  } else {
    console.log(`[api-budget:ok] ${apiFiles.length}/${hardLimit} api/*.js files found.`);
  }
} catch (e) {
  console.warn('[api-budget:warn] Could not check api/*.js budget: ' + (e?.message || e));
}
