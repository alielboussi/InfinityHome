/**
 * One-time setup for Lusaka Stock APK Google Sign-In:
 * 1. Ensures Firebase Android app com.bestrest.lusakastock exists
 * 2. Registers release SHA-1 (from env or APK download)
 * 3. Writes mobile-apps/lusaka-stock/google-services.json
 *
 * Usage:
 *   LUSAKA_STOCK_ANDROID_SHA1=AA:BB:... node scripts/setupLusakaStockGoogleSignIn.mjs
 *   node scripts/setupLusakaStockGoogleSignIn.mjs <apk-url-or-path>
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT_ID = 'bestrest-portal-system-43108';
const PACKAGE_NAME = 'com.bestrest.lusakastock';
const DISPLAY_NAME = 'Lusaka Stock';
const OUTPUT_PATH = path.join(process.cwd(), 'mobile-apps', 'lusaka-stock', 'google-services.json');
const APK_URL = process.env.LUSAKA_STOCK_APK_URL || '';

function discoverServiceAccountFile() {
  const explicit = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const root = process.cwd();
  const matches = fs.readdirSync(root).filter((name) => /firebase-adminsdk.*\.json$/i.test(name));
  if (matches.length === 1) return path.join(root, matches[0]);
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

function extractSha1FromApk(apkPath) {
  const apksignerCandidates = [
    process.env.ANDROID_APKSIGNER,
    process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'build-tools', '37.0.0', process.platform === 'win32' ? 'apksigner.bat' : 'apksigner') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'build-tools', '37.0.0', process.platform === 'win32' ? 'apksigner.bat' : 'apksigner') : null,
  ].filter(Boolean);

  for (const apksigner of apksignerCandidates) {
    if (!fs.existsSync(apksigner)) continue;
    try {
      const output = execSync(`"${apksigner}" verify --print-certs "${apkPath}"`, { encoding: 'utf8' });
      const match = output.match(/certificate SHA-1 digest:\s*([0-9a-f:]+)/i);
      if (match) {
        const raw = match[1].toUpperCase();
        return raw.includes(':') ? raw : raw.match(/.{1,2}/g).join(':');
      }
    } catch {
      // try next signer path
    }
  }
  throw new Error('Could not read SHA-1 from APK. Pass LUSAKA_STOCK_ANDROID_SHA1 or install Android build-tools apksigner.');
}

async function resolveSha1() {
  const fromEnv = String(process.env.LUSAKA_STOCK_ANDROID_SHA1 || process.argv[2] || '').trim();
  if (fromEnv && /^[0-9A-F:]+$/i.test(fromEnv)) {
    return fromEnv.toUpperCase();
  }

  const apkSource = fromEnv || APK_URL;
  if (!apkSource) {
    throw new Error('Provide LUSAKA_STOCK_ANDROID_SHA1 or an APK URL/path as the first argument.');
  }

  let apkPath = apkSource;
  if (/^https?:\/\//i.test(apkSource)) {
    apkPath = path.join(os.tmpdir(), 'lusaka-stock-release.apk');
    const apkRes = await fetch(apkSource);
    if (!apkRes.ok) throw new Error(`Failed to download APK (${apkRes.status})`);
    fs.writeFileSync(apkPath, Buffer.from(await apkRes.arrayBuffer()));
  } else if (!fs.existsSync(apkPath)) {
    throw new Error(`APK not found: ${apkPath}`);
  }

  return extractSha1FromApk(apkPath);
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
  if (existing) return existing.name;

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
  console.log('Registered SHA-1 for Lusaka Stock:', sha1);
}

async function writeGoogleServices(token, androidAppResource) {
  const res = await fetch(`https://firebase.googleapis.com/v1beta1/${androidAppResource}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message || JSON.stringify(payload));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(payload.configFileContents, 'base64').toString('utf8'));
  console.log('Wrote', OUTPUT_PATH);
}

async function main() {
  const sha1 = await resolveSha1();
  const token = await getAccessToken();
  const androidAppResource = await ensureAndroidApp(token);
  await registerSha(token, androidAppResource, sha1);
  await writeGoogleServices(token, androidAppResource);
  console.log('\nNext: rebuild the APK from mobile-apps/lusaka-stock (npm run build:apk:prod)');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
