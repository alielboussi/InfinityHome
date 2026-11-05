/**
 * One-time setup for Carpentry Workshop APK Google Sign-In:
 * 1. Ensures Firebase Android app com.bestrest.warehouseupholstery exists
 * 2. Registers release SHA-1 (from env or APK path) when provided
 * 3. Writes mobile-apps/carpentry-workshop/google-services.json
 *
 * Usage (from repo root):
 *   CARPENTRY_WORKSHOP_ANDROID_SHA1=AA:BB:... node scripts/setupCarpentryWorkshopGoogleSignIn.mjs
 *   node scripts/setupCarpentryWorkshopGoogleSignIn.mjs <apk-url-or-path>
 *
 * Create Firebase app + google-services.json without SHA-1 (register fingerprint later):
 *   node scripts/setupCarpentryWorkshopGoogleSignIn.mjs --create-app-only
 *
 * SHA-1: Expo → carpentry-workshop → Credentials → Android → Keystore
 */
import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT_ID = 'bestrest-portal-system-43108';
const PACKAGE_NAME = 'online.infinityhome.carpentry';
const DISPLAY_NAME = 'Carpentry Workshop';
const OUTPUT_PATH = path.join(process.cwd(), 'mobile-apps', 'carpentry-workshop', 'google-services.json');
const FINGERPRINTS_DOC = path.join(
  process.cwd(),
  'mobile-apps',
  'carpentry-workshop',
  'eas-android-keystore-fingerprints.txt',
);

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
  throw new Error('Could not read SHA-1 from APK. Pass CARPENTRY_WORKSHOP_ANDROID_SHA1 or install Android build-tools apksigner.');
}

async function resolveSha1(createAppOnly) {
  if (createAppOnly) return null;

  const fromEnv = String(process.env.CARPENTRY_WORKSHOP_ANDROID_SHA1 || '').trim();
  const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
  const candidate = fromEnv || arg;
  if (candidate && /^[0-9A-F:]+$/i.test(candidate)) {
    return candidate.toUpperCase();
  }

  if (!candidate) {
    return null;
  }

  let apkPath = candidate;
  if (/^https?:\/\//i.test(candidate)) {
    apkPath = path.join(os.tmpdir(), 'carpentry-workshop-release.apk');
    const apkRes = await fetch(candidate);
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
  if (existing) {
    console.log('Firebase Android app already exists:', PACKAGE_NAME);
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
  console.log('Registered SHA-1 for Carpentry:', sha1);
}

async function writeGoogleServices(token, androidAppResource) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
    const res = await fetch(`https://firebase.googleapis.com/v1beta1/${androidAppResource}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json();
    if (res.ok) {
      lastErr = null;
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      fs.writeFileSync(OUTPUT_PATH, Buffer.from(payload.configFileContents, 'base64').toString('utf8'));
      console.log('Wrote', OUTPUT_PATH);

      const json = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      const client = (json.client || []).find(
        (row) => row?.client_info?.android_client_info?.package_name === PACKAGE_NAME,
      );
      const appId = client?.client_info?.mobilesdk_app_id;
      if (appId) {
        console.log('mobilesdk_app_id (optional EXPO_PUBLIC_FIREBASE_APP_ID):', appId);
      }
      return;
    }
    lastErr = payload?.error?.message || JSON.stringify(payload);
    if (!String(lastErr).includes('invalid argument')) break;
  }
  throw new Error(lastErr || 'Failed to download google-services.json');
}

function appendFingerprintNote(sha1) {
  if (!sha1) return;
  const line = `SHA-1 registered ${new Date().toISOString()}: ${sha1}\n`;
  fs.mkdirSync(path.dirname(FINGERPRINTS_DOC), { recursive: true });
  if (!fs.existsSync(FINGERPRINTS_DOC)) {
    fs.writeFileSync(
      FINGERPRINTS_DOC,
      [
        'Carpentry Workshop — EAS Android keystore fingerprints (public only)',
        `Package: ${PACKAGE_NAME}`,
        `Firebase project: ${PROJECT_ID}`,
        '',
      ].join('\n'),
    );
  }
  fs.appendFileSync(FINGERPRINTS_DOC, line);
}

async function main() {
  const createAppOnly = process.argv.includes('--create-app-only');
  const sha1 = await resolveSha1(createAppOnly);
  const token = await getAccessToken();
  const androidAppResource = await ensureAndroidApp(token);
  if (sha1) {
    await registerSha(token, androidAppResource, sha1);
    appendFingerprintNote(sha1);
  } else if (!createAppOnly) {
    console.warn('No SHA-1 provided — skipped fingerprint. Re-run with CARPENTRY_WORKSHOP_ANDROID_SHA1=...');
  }
  await writeGoogleServices(token, androidAppResource);
  console.log('\nNext: enable Google in Firebase Auth, User Access → Carpentry for staff, then EAS build.');
  if (sha1) {
    console.log('Google Sign-In on APK usually works within a few minutes (same APK often OK).');
  } else {
    console.log('After EAS keystore exists, re-run with SHA-1 to enable native Google Sign-In on release APK.');
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
