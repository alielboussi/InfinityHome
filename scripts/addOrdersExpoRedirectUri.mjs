/**
 * Expo Go redirect for Orders app (Web OAuth client).
 *
 * Usage (repo root):
 *   node scripts/addOrdersExpoRedirectUri.mjs
 *   node scripts/addOrdersExpoRedirectUri.mjs --apply
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { platform } from 'os';
import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'bestrest-portal-system-43108';
const PROJECT_NUMBER = '876299148810';
const WEB_CLIENT_ID = '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';
const REDIRECT_URI = 'https://auth.expo.io/@alielboussi/infinity-orders';
const CUSTOM_SCHEME_URI = 'infinity-orders://oauth';

const consoleUrl = `https://console.cloud.google.com/apis/credentials/oauthclient/${WEB_CLIENT_ID}?project=${PROJECT_ID}`;

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
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function tryPatchViaApi() {
  const credentials = loadServiceAccount();
  if (!credentials) return { ok: false, reason: 'no service account' };

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) return { ok: false, reason: 'no token' };

  const name = `projects/${PROJECT_NUMBER}/locations/global/oauthClients/${WEB_CLIENT_ID.split('.apps.googleusercontent.com')[0]}`;
  const getUrl = `https://oauthclients.googleapis.com/v1/${name}`;
  const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!getRes.ok) {
    const errText = await getRes.text();
    return { ok: false, reason: `GET oauthClients: ${getRes.status} ${errText.slice(0, 200)}` };
  }
  const current = await getRes.json();
  const redirects = new Set(current.redirectUris || []);
  const origins = new Set(current.allowedOrigins || current.javascriptOrigins || []);
  redirects.add(REDIRECT_URI);
  redirects.add(CUSTOM_SCHEME_URI);
  origins.add('https://auth.expo.io');

  const patchRes = await fetch(`${getUrl}?updateMask=redirectUris`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      redirectUris: [...redirects],
    }),
  });
  if (patchRes.ok) {
    return { ok: true, added: [REDIRECT_URI, CUSTOM_SCHEME_URI] };
  }
  return { ok: false, reason: `PATCH oauthClients: ${patchRes.status} ${(await patchRes.text()).slice(0, 300)}` };
}

function openConsole() {
  if (platform() === 'win32') {
    try {
      execSync(`start "" "${consoleUrl}"`, { stdio: 'ignore', shell: true });
    } catch { /* ignore */ }
  } else if (platform() === 'darwin') {
    try { execSync(`open "${consoleUrl}"`); } catch { /* ignore */ }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply) {
    const result = await tryPatchViaApi();
    if (result.ok) {
      console.log('Updated Web OAuth client redirect URIs:');
      for (const uri of result.added) console.log(`  + ${uri}`);
      console.log('\nWait 1–2 minutes, then test Continue with Google in Expo Go or the Orders APK.');
      return;
    }
    console.warn('API patch not available:', result.reason);
    console.warn('Add these URIs manually on the Web client:\n');
  } else {
    console.log('Add these Authorized redirect URIs on the Web client:\n');
  }
  console.log(`  ${REDIRECT_URI}`);
  console.log(`  ${CUSTOM_SCHEME_URI}  (installed APK / custom scheme fallback)`);
  console.log('\nAuthorized JavaScript origin (if shown):');
  console.log('  https://auth.expo.io');
  console.log('\nConsole URL:\n', consoleUrl, '\n');
  openConsole();
  if (!apply) {
    console.log('Re-run with --apply to attempt automatic patch via Google OAuth Clients API.');
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
