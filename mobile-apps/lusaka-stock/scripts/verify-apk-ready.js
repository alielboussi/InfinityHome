#!/usr/bin/env node
/**
 * Local pre-flight checks — run BEFORE spending an EAS build credit.
 * Usage: node scripts/verify-apk-ready.js
 * Exit 0 = ready to build (manual Google Console step still required).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_ASSETS = ['icon.png', 'splash.png', 'adaptive-icon.png'];
const GOOGLE_SERVICES = path.join(ROOT, 'google-services.json');

const failures = [];
const warnings = [];
const passed = [];

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
}

function check(name, ok, failMsg, warn = false) {
  if (ok) {
    passed.push(name);
    return;
  }
  if (warn) warnings.push(`${name}: ${failMsg}`);
  else failures.push(`${name}: ${failMsg}`);
}

// 1. Assets
for (const file of REQUIRED_ASSETS) {
  const full = path.join(ROOT, 'assets', file);
  check(`Asset ${file}`, fs.existsSync(full), `missing ${full}`);
}

// 2. EAS project linked
try {
  const config = require(path.join(ROOT, 'app.config.js'));
  const projectId = config?.expo?.extra?.eas?.projectId;
  check('EAS projectId', Boolean(projectId), 'app.config.js extra.eas.projectId is missing');
  check('googleServicesFile', Boolean(config?.expo?.android?.googleServicesFile), 'set android.googleServicesFile in app.config.js');
  check('google-services.json', fs.existsSync(GOOGLE_SERVICES), 'run: node ../../scripts/setupLusakaStockGoogleSignIn.mjs <SHA-1-or-apk-url>');
  check('no auth.expo proxy', config?.expo?.extra?.googleExpoAuthProxy !== true, 'remove extra.googleExpoAuthProxy — auth.expo.io is broken on APK');
  check('Android package', config?.expo?.android?.package === 'com.bestrest.lusakastock', 'unexpected android.package');
} catch (err) {
  failures.push(`app.config.js: ${err.message}`);
}

// 3. Syntax on critical files
const syntaxFiles = [
  'App.js',
  'screens/StockScreen.js',
  '../shared/GoogleSignInButton.js',
  '../shared/AuthGate.js',
  '../shared/lusakaStock/fetchStock.js',
];
for (const rel of syntaxFiles) {
  try {
    run(`node --check "${path.join(ROOT, rel)}"`, { silent: true });
    passed.push(`Syntax ${rel}`);
  } catch {
    failures.push(`Syntax error in ${rel}`);
  }
}

// 4. Android bundle export (catches Metro/import errors)
try {
  const outDir = path.join(ROOT, 'dist-prebuild-check');
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  run('npx expo export --platform android --output-dir dist-prebuild-check', { silent: true });
  const hasBundle = fs.existsSync(path.join(outDir, '_expo', 'static', 'js', 'android'));
  check('Android bundle export', hasBundle, 'expo export failed — fix Metro errors first');
} catch (err) {
  failures.push(`Android bundle export failed: ${String(err.message || err).split('\n')[0]}`);
}

// 5. expo-doctor (warnings only — metro monorepo overrides are intentional)
try {
  const doctor = run('npx expo-doctor', { silent: true });
  if (/Major version mismatches/i.test(doctor)) {
    failures.push('expo-doctor: dependency version mismatch — run npx expo install --check');
  } else if (/checks failed/i.test(doctor)) {
    warnings.push('expo-doctor reported non-blocking issues (metro monorepo config is expected)');
  } else {
    passed.push('expo-doctor');
  }
} catch {
  warnings.push('expo-doctor: some checks failed (often metro monorepo — review manually)');
}

console.log('\n=== Lusaka Stock APK pre-flight ===\n');
console.log(`Passed: ${passed.length}`);
passed.forEach((item) => console.log(`  ✓ ${item}`));

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach((item) => console.log(`  ⚠ ${item}`));
}

if (failures.length) {
  console.log(`\nBLOCKED (${failures.length}) — do NOT run eas build yet:`);
  failures.forEach((item) => console.log(`  ✗ ${item}`));
  process.exit(1);
}

console.log('\n--- Manual steps before EAS build (cannot auto-verify) ---');
console.log('1. Register APK SHA-1 + download google-services.json:');
console.log('   node ../../scripts/setupLusakaStockGoogleSignIn.mjs <eas-apk-url-or-sha1>');
console.log('2. Expo Go smoke test: npm start → sign in (Google + email) → stock loads');
console.log('3. Compare item count with https://www.infinity-home.online/lusaka-stock');
console.log('\nWhen all manual steps pass, run: npm run build:apk\n');
process.exit(0);
