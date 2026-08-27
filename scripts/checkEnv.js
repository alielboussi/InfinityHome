#!/usr/bin/env node
// Build-time environment verification (Firebase only).
const fs = require('fs');
const path = require('path');

const VERCEL_ENV = String(process.env.VERCEL_ENV || '').trim().toLowerCase();

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

try {
  try { require('dotenv').config({ path: path.resolve(process.cwd(), 'vercel.env'), override: true }); } catch {}
  try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), override: true }); } catch {}
  try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), override: false }); } catch {}
} catch {}

const required = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missing.length) {
  console.error('[env:fail] Missing required Firebase env vars: ' + missing.join(', '));
  if (VERCEL_ENV === 'preview' || VERCEL_ENV === 'development') {
    console.error(`[env:fail] This is a ${VERCEL_ENV || 'non-production'} Vercel build. Enable Preview for all REACT_APP_FIREBASE_* vars.`);
  }
  process.exit(1);
}

console.log('[env:info] Backend mode: firebase.');
console.log('[env:ok] Core environment variables present.');

try {
  const productionEnvPath = path.resolve(process.cwd(), '.env.production.local');
  const productionLines = [
    'REACT_APP_USE_FIREBASE=true',
    'USE_FIREBASE=true',
  ];
  for (const key of required) {
    productionLines.push(`${key}=${JSON.stringify(String(process.env[key]).trim())}`);
  }
  fs.writeFileSync(productionEnvPath, `${productionLines.join('\n')}\n`, 'utf8');
  console.log('[env:ok] Wrote .env.production.local for CRA build.');
} catch (err) {
  console.warn('[env:warn] Could not write .env.production.local: ' + (err?.message || err));
}

const optionalServerVars = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'LABEL_WORKER_SECRET', 'GEMINI_API_KEY'];
const present = optionalServerVars.filter((k) => process.env[k] && String(process.env[k]).trim());
const absent = optionalServerVars.filter((k) => !present.includes(k));
console.log('[env:info] Serverless env present: ' + (present.length ? present.join(', ') : '(none)'));
if (absent.length) console.log('[env:info] Serverless env missing (ok for local build): ' + absent.join(', '));

try {
  const apiDir = path.resolve(process.cwd(), 'api');
  const apiFiles = fs.existsSync(apiDir)
    ? fs.readdirSync(apiDir).filter((name) => name.endsWith('.js'))
    : [];
  const hardLimit = 12;
  const target = 9;
  if (apiFiles.length > hardLimit) {
    console.error(`[api-budget:fail] ${apiFiles.length} api/*.js files found. Hard limit is ${hardLimit}.`);
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
