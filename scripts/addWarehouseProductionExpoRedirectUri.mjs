/**
 * Opens the Firebase Web OAuth client in Google Cloud Console and prints the
 * Expo Go redirect URI to add (Google does not expose a supported public API
 * for patching consumer OAuth redirect URIs with a service account).
 *
 * Usage (repo root):
 *   node scripts/addWarehouseProductionExpoRedirectUri.mjs
 */
import { execSync } from 'child_process';
import { platform } from 'os';

const PROJECT_ID = 'bestrest-portal-system-43108';
const WEB_CLIENT_ID = '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';
const REDIRECT_URI = 'https://auth.expo.io/@alielboussi/warehouse-production';

const consoleUrl = `https://console.cloud.google.com/auth/clients/${WEB_CLIENT_ID}?project=${PROJECT_ID}`;

console.log('Add this Authorized redirect URI on the Web client (not Android):\n');
console.log(`  ${REDIRECT_URI}\n`);
console.log('Console URL:\n', consoleUrl, '\n');

if (platform() === 'win32') {
  try {
    execSync(`start "" "${consoleUrl}"`, { stdio: 'ignore', shell: true });
    console.log('Opened the OAuth client page in your default browser.');
  } catch {
    console.log('Open the URL above in your browser.');
  }
} else if (platform() === 'darwin') {
  try {
    execSync(`open "${consoleUrl}"`);
    console.log('Opened the OAuth client page in your default browser.');
  } catch {
    console.log('Open the URL above in your browser.');
  }
} else {
  console.log('Open the URL above in your browser.');
}

console.log('\nAfter Save, wait 1–2 minutes, then tap Continue with Google in Expo Go.');
