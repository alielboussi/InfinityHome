/**
 * Downloads the latest google-services.json for the Ledger Android app.
 */
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'bestrest-portal-system-43108';
const ANDROID_APP_RESOURCE = 'projects/bestrest-portal-system-43108/androidApps/1:876299148810:android:a84ed178b9dcc4c59049f3';
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
  const res = await fetch(`https://firebase.googleapis.com/v1beta1/${ANDROID_APP_RESOURCE}/config`, {
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
