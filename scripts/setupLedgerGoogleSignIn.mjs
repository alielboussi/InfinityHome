/**
 * Recreate Ledger Firebase Android app + SHA-1 (+ google-services.json for future builds).
 * Existing installed APKs usually work again after SHA-1 is registered — no rebuild required
 * if the APK was signed with the same EAS keystore.
 *
 * Usage (repo root):
 *   LEDGER_ANDROID_SHA1=AA:BB:... node scripts/setupLedgerGoogleSignIn.mjs
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'bestrest-portal-system-43108';
const PACKAGE_NAME = 'com.bestrest.customerledger';
const DISPLAY_NAME = 'Ledger';
const OUTPUT_PATH = path.join(process.cwd(), 'mobile-apps', 'customer-credit', 'google-services.json');

function discoverServiceAccountFile() {
  const explicit = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const root = process.cwd();
  const matches = fs.readdirSync(root).filter((name) => /firebase-adminsdk.*\.json$/i.test(name));
  if (matches.length === 1) return path.join(root, matches[0]);
  const legacy = path.join(root, 'bestrest-portal-system-43108-firebase-adminsdk-fbsvc-b259e84074.json');
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const filePath = discoverServiceAccountFile();
  if (!filePath) {
    throw new Error('Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: loadServiceAccount(),
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function listAndroidApps(token) {
  const res = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/androidApps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message || JSON.stringify(payload));
  return payload.apps || [];
}

async function ensureAndroidApp(token) {
  const apps = await listAndroidApps(token);
  const existing = apps.find((app) => {
    const name = String(app.name || '');
    return name.includes(PACKAGE_NAME) || String(app.packageName || '') === PACKAGE_NAME;
  });
  if (existing) {
    console.log('Firebase Android app found:', PACKAGE_NAME);
    return existing.name;
  }

  const createRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/androidApps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      packageName: PACKAGE_NAME,
      displayName: DISPLAY_NAME,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    throw new Error(created?.error?.message || JSON.stringify(created));
  }
  console.log('Created Firebase Android app:', PACKAGE_NAME);
  return created.name;
}

async function registerSha(token, androidAppResource, sha1) {
  const listRes = await fetch(`https://firebase.googleapis.com/v1beta1/${androidAppResource}/sha`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const existing = await listRes.json();
  const alreadyRegistered = (existing.certificates || []).some(
    (row) => String(row.shaHash || '').toUpperCase() === sha1,
  );
  if (alreadyRegistered) {
    console.log('SHA-1 already registered:', sha1);
    return;
  }

  const createRes = await fetch(`https://firebase.googleapis.com/v1beta1/${androidAppResource}/sha`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      shaHash: sha1,
      certType: 'SHA_1',
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    throw new Error(created?.error?.message || JSON.stringify(created));
  }
  console.log('Registered SHA-1 for Ledger:', sha1);
}

async function writeGoogleServices(token, androidAppResource) {
  const res = await fetch(`https://firebase.googleapis.com/v1beta1/${androidAppResource}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message || JSON.stringify(payload));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(payload.configFileContents, 'base64').toString('utf8'));
  console.log('Wrote', OUTPUT_PATH, '(for future builds only)');
}

async function main() {
  const sha1 = String(process.env.LEDGER_ANDROID_SHA1 || process.argv[2] || '').trim().toUpperCase();
  if (!sha1 || !/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/.test(sha1)) {
    throw new Error('Provide LEDGER_ANDROID_SHA1=AA:BB:... (from Expo Android keystore).');
  }

  const token = await getAccessToken();
  const androidAppResource = await ensureAndroidApp(token);
  await registerSha(token, androidAppResource, sha1);
  await writeGoogleServices(token, androidAppResource);

  console.log('\nDone. Try Google sign-in on the APK already on your phone (no rebuild needed).');
  console.log('If it still fails, wait a few minutes for Google to propagate, then retry.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
