/**
 * Pre-flight before EAS Android build (Google Sign-In + native config).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GOOGLE_SERVICES = path.join(ROOT, 'google-services.json');
const APP_CONFIG = path.join(ROOT, 'app.config.js');

let failed = 0;
function check(label, ok, hint) {
  if (ok) {
    console.log(`  OK  ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${label}`);
  if (hint) console.error(`       ${hint}`);
}

console.log('Warehouse Catalog — APK readiness\n');

function warnIfJavaNot17() {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) return;
  try {
    const { execSync } = require('child_process');
    const javaBin = require('path').join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    const out = execSync(`"${javaBin}" -version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const combined = out + (execSync(`"${javaBin}" -version`, { encoding: 'utf8' }) || '');
    if (!/version "17\./.test(combined)) {
      console.warn(
        '  WARN JAVA_HOME is not JDK 17. Local Gradle may fail on react-native-worklets CMake with',
      );
      console.warn('       "WARNING: A restricted method in java.lang.System has been called".');
      console.warn('       Use mobile-apps/warehouse-catalog/build-apk-local.ps1 or set JAVA_HOME to Temurin 17.\n');
    }
  } catch {
    // ignore
  }
}
warnIfJavaNot17();

check('google-services.json', fs.existsSync(GOOGLE_SERVICES), [
  'From repo root, register EAS release SHA-1:',
  '  WAREHOUSE_CATALOG_ANDROID_SHA1=AA:BB:... node scripts/setupWarehouseCatalogGoogleSignIn.mjs',
  'Expo credentials: expo.dev → warehouse-catalog → Android → Keystore → SHA-1',
].join('\n       '));

const appConfigSrc = fs.readFileSync(APP_CONFIG, 'utf8');
check(
  'app.config.js references googleServicesFile',
  /googleServicesFile:\s*['"]\.\/google-services\.json['"]/.test(appConfigSrc),
  'Add android.googleServicesFile in app.config.js',
);

if (fs.existsSync(GOOGLE_SERVICES)) {
  try {
    const json = JSON.parse(fs.readFileSync(GOOGLE_SERVICES, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === 'com.bestrest.warehousecatalog',
    );
    check('google-services.json package', Boolean(client), 'Expected com.bestrest.warehousecatalog');
  } catch (err) {
    check('google-services.json parse', false, err.message);
  }
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed. Google Sign-In on the installed APK will show DEVELOPER_ERROR until fixed.`);
  console.error('Email/password sign-in still works without google-services.json.');
  process.exit(1);
}
console.log('All checks passed. Safe to run eas build.');
