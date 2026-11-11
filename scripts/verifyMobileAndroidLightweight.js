/**
 * Ensures every staff Expo app wires lightweight Android release settings.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apps = [
  'warehouse-upholstery',
  'warehouse-delivery',
  'carpentry-workshop',
  'painting-workshop',
  'warehouse-catalog',
  'lusaka-stock',
  'customer-credit',
  'orders',
];

let failed = false;

const sharedHelper = path.join(root, 'mobile-apps', 'shared', 'expoAndroidLightweight.js');
if (!fs.existsSync(sharedHelper)) {
  console.error('missing', sharedHelper);
  process.exit(1);
}

for (const slug of apps) {
  const appRoot = path.join(root, 'mobile-apps', slug);
  const appConfig = path.join(appRoot, 'app.config.js');
  const pkgPath = path.join(appRoot, 'package.json');
  const easPath = path.join(appRoot, 'eas.json');

  if (!fs.existsSync(appConfig)) {
    console.error(`[${slug}] missing app.config.js`);
    failed = true;
    continue;
  }
  const appBody = fs.readFileSync(appConfig, 'utf8');
  if (!appBody.includes('finalizeExpoConfig')) {
    console.error(`[${slug}] app.config.js must call finalizeExpoConfig`);
    failed = true;
  }

  if (!fs.existsSync(pkgPath)) {
    console.error(`[${slug}] missing package.json`);
    failed = true;
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps['expo-build-properties']) {
    console.error(`[${slug}] package.json missing expo-build-properties`);
    failed = true;
  }

  if (fs.existsSync(easPath)) {
    const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
    const legacy = eas?.build?.['preview-legacy'];
    if (!legacy?.env?.ORG_GRADLE_PROJECT_reactNativeArchitectures) {
      console.error(`[${slug}] eas.json missing preview-legacy ORG_GRADLE_PROJECT_reactNativeArchitectures`);
      failed = true;
    }
  }

  const appJs = path.join(appRoot, 'App.js');
  if (fs.existsSync(appJs)) {
    const appJsBody = fs.readFileSync(appJs, 'utf8');
    if (!appJsBody.includes('lightweightRuntime')) {
      console.error(`[${slug}] App.js should import ./shared/lightweightRuntime.js`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('verifyMobileAndroidLightweight: OK');
