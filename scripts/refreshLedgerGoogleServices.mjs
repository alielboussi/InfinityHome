/**
 * Downloads the latest google-services.json for the Ledger Android app.
 */
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'bestrest-portal-system-43108';
const PACKAGE_NAME = 'com.bestrest.customerledger';
const OUTPUT_PATH = path.join(process.cwd(), 'mobile-apps', 'customer-credit', 'google-services.json');
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(process.cwd(), 'bestrest-portal-system-43108-firebase-adminsdk-fbsvc-b259e84074.json');

async function main() {
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth.cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const listRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/androidApps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listPayload = await listRes.json();
  if (!listRes.ok) throw new Error(listPayload?.error?.message || JSON.stringify(listPayload));
  const hit = (listPayload.apps || []).find((app) => {
    const name = String(app.name || '');
    return name.includes(PACKAGE_NAME) || String(app.packageName || '') === PACKAGE_NAME;
  });
  if (!hit?.name) {
    throw new Error('Ledger Android app missing. Run scripts/setupLedgerGoogleSignIn.mjs first.');
  }
  const res = await fetch(`https://firebase.googleapis.com/v1beta1/${hit.name}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message || JSON.stringify(payload));
  }
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(payload.configFileContents, 'base64').toString('utf8'));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
