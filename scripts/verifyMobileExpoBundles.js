/**
 * Gate before EAS: materialize (where applicable) and android JS bundle for staff apps.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apps = [
  {
    slug: 'warehouse-upholstery',
    pre: 'node scripts/materializeSharedForEas.js',
  },
  {
    slug: 'warehouse-delivery',
    pre: 'node scripts/materializeDeliveryStandalone.js',
  },
  {
    slug: 'carpentry-workshop',
    pre: 'node scripts/materializeCarpentryStandalone.js',
  },
  {
    slug: 'painting-workshop',
    pre: 'node scripts/materializeSharedStandalone.js && node scripts/materializePaintingUi.js',
  },
];

let failed = false;

for (const { slug, pre } of apps) {
  const appRoot = path.join(root, 'mobile-apps', slug);
  const outDir = path.join(appRoot, '.expo-bundle-verify');
  if (!fs.existsSync(path.join(appRoot, 'package.json'))) {
    console.error(`[verifyMobileExpoBundles] missing ${slug}`);
    failed = true;
    continue;
  }
  try {
    console.log(`[verifyMobileExpoBundles] ${slug}: materialize…`);
    execSync(pre, { cwd: appRoot, stdio: 'inherit' });
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
    console.log(`[verifyMobileExpoBundles] ${slug}: expo export android…`);
    execSync(`npx expo export --platform android --output-dir "${outDir}"`, {
      cwd: appRoot,
      stdio: 'inherit',
      env: { ...process.env, CI: '1' },
    });
    console.log(`[verifyMobileExpoBundles] ${slug}: ok`);
  } catch (err) {
    console.error(`[verifyMobileExpoBundles] ${slug}: FAIL`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('verifyMobileExpoBundles: ok');
