/**
 * Local Metro gate before EAS — materialize + android export.
 * Usage: node scripts/verifyExpoBundle.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const outDir = path.join(appRoot, '.expo-bundle-verify');

execSync('node scripts/materializeCarpentryStandalone.js', { cwd: appRoot, stdio: 'inherit' });
execSync('node scripts/assertCarpentryKioskStandalone.js', { cwd: appRoot, stdio: 'inherit' });

const shim = path.join(appRoot, 'lib', 'buildDeliveryNotePrintHtml.js');
if (!fs.existsSync(shim)) {
  console.error('verifyExpoBundle: missing lib/buildDeliveryNotePrintHtml.js — materialize failed');
  process.exit(1);
}
const shimBody = fs.readFileSync(shim, 'utf8');
if (/\.\/_repoUtils\//.test(shimBody)) {
  console.error('verifyExpoBundle: lib shims still use ./_repoUtils — re-run materialize');
  process.exit(1);
}

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
execSync(`npx expo export --platform android --output-dir "${outDir}"`, {
  cwd: appRoot,
  stdio: 'inherit',
  env: { ...process.env, CI: '1' },
});
console.log('verifyExpoBundle: ok');
