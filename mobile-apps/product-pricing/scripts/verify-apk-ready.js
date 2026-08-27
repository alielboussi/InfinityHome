#!/usr/bin/env node
/**
 * Local pre-flight checks before EAS APK build.
 * Usage: node scripts/verify-apk-ready.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_ASSETS = ['icon.png', 'splash.png', 'adaptive-icon.png'];

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

for (const file of REQUIRED_ASSETS) {
  const full = path.join(ROOT, 'assets', file);
  check(`Asset ${file}`, fs.existsSync(full), `missing ${full}`);
}

try {
  const config = require(path.join(ROOT, 'app.config.js'));
  check('EAS projectId', Boolean(config?.expo?.extra?.eas?.projectId), 'run: npx eas init in mobile-apps/product-pricing');
  check('Android package', config?.expo?.android?.package === 'com.bestrest.productpricing', 'unexpected android.package');
  check('Adaptive icon', Boolean(config?.expo?.android?.adaptiveIcon?.foregroundImage), 'android.adaptiveIcon.foregroundImage missing');
  check('Splash background', config?.expo?.splash?.backgroundColor === '#0a0a08', 'splash background should be #0a0a08');
} catch (err) {
  failures.push(`app.config.js: ${err.message}`);
}

const syntaxFiles = ['App.js', 'screens/CatalogScreen.js', 'services/catalog.js'];
for (const rel of syntaxFiles) {
  try {
    run(`node --check "${path.join(ROOT, rel)}"`, { silent: true });
    passed.push(`Syntax ${rel}`);
  } catch {
    failures.push(`Syntax error in ${rel}`);
  }
}

console.log('\n=== Product Photos APK pre-flight ===\n');
console.log(`Passed: ${passed.length}`);
passed.forEach((item) => console.log(`  ✓ ${item}`));

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach((item) => console.log(`  ⚠ ${item}`));
}

if (failures.length) {
  console.log(`\nBLOCKED (${failures.length}):`);
  failures.forEach((item) => console.log(`  ✗ ${item}`));
  process.exit(1);
}

console.log('\nReady for: npm run build:apk\n');
process.exit(0);
