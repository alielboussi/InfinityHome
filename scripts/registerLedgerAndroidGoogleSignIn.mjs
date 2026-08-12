/**
 * Registers the EAS release APK signing SHA-1 with the Ledger Firebase Android app.
 * Run after downloading the latest production APK from EAS.
 */
import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT_ID = 'bestrest-portal-system-43108';
const ANDROID_APP_RESOURCE = 'projects/bestrest-portal-system-43108/androidApps/1:876299148810:android:a84ed178b9dcc4c59049f3';
const APK_URL = process.env.LEDGER_APK_URL
  || 'https://expo.dev/artifacts/eas/hxocxxVTXP0b-r2cbNGw3y_v64k-XuuKNfFTgvINTH4.apk';
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(process.cwd(), 'bestrest-portal-system-43108-firebase-adminsdk-fbsvc-b259e84074.json');

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

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-apk-'));
  const certPath = path.join(tmpDir, 'cert.der');
  try {
    execSync(`tar -xf "${apkPath}" -C "${tmpDir}" META-INF/CERT.RSA`, { stdio: 'pipe' });
  } catch {
    execSync(`tar -xf "${apkPath}" -C "${tmpDir}" META-INF/CERT.DSA`, { stdio: 'pipe' });
  }
  const certFile = ['CERT.RSA', 'CERT.DSA', 'CERT.EC']
    .map((name) => path.join(tmpDir, 'META-INF', name))
    .find((file) => fs.existsSync(file));
  if (!certFile) {
    throw new Error('Could not find signing certificate in APK. Use LEDGER_ANDROID_SHA1 or install Android build-tools apksigner.');
  }
  fs.copyFileSync(certFile, certPath);
  const output = execSync(`keytool -printcert -file "${certPath}"`, { encoding: 'utf8' });
  const match = output.match(/SHA1:\s*([0-9A-F:]+)/i);
  if (!match) throw new Error('Could not parse SHA1 from APK certificate.');
  return match[1].toUpperCase();
}

async function registerSha(sha1) {
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const listRes = await fetch(`https://firebase.googleapis.com/v1beta1/${ANDROID_APP_RESOURCE}/sha`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const existing = await listRes.json();
  const alreadyRegistered = (existing.certificates || []).some(
    (row) => String(row.shaHash || '').toUpperCase() === sha1,
  );
  if (alreadyRegistered) {
    console.log('SHA-1 already registered for Ledger Android app.');
    return;
  }

  const createRes = await fetch(`https://firebase.googleapis.com/v1beta1/${ANDROID_APP_RESOURCE}/sha`, {
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
  console.log('Registered SHA-1 for Ledger Android app.');
}

async function main() {
  const shaFromEnv = String(process.env.LEDGER_ANDROID_SHA1 || process.argv[2] || '').trim().toUpperCase();
  if (shaFromEnv) {
    await registerSha(shaFromEnv);
    return;
  }

  const apkPath = path.join(os.tmpdir(), 'ledger-release.apk');
  const apkRes = await fetch(APK_URL);
  if (!apkRes.ok) throw new Error(`Failed to download APK (${apkRes.status})`);
  const buffer = Buffer.from(await apkRes.arrayBuffer());
  fs.writeFileSync(apkPath, buffer);

  const sha1 = extractSha1FromApk(apkPath);
  await registerSha(sha1);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
