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

const EXPO_APPLICATION_METRO_APPS = new Set([
  'warehouse-upholstery',
  'warehouse-delivery',
  'carpentry-workshop',
  'painting-workshop',
]);

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
    const easIgnore = path.join(appRoot, '.easignore');
    if (!fs.existsSync(easIgnore)) {
      console.error(`[${slug}] missing .easignore — run node mobile-apps/scripts/syncEasignore.js`);
      failed = true;
    } else {
      const ignoreBody = fs.readFileSync(easIgnore, 'utf8');
      if (!ignoreBody.includes('**/node_modules/') || !ignoreBody.includes('/src/')) {
        console.error(`[${slug}] .easignore must exclude monorepo src/ and **/node_modules/`);
        failed = true;
      }
      const { renderMonorepoEasignore } = require(path.join(root, 'mobile-apps', 'shared', 'renderEasignoreContent.js'));
      const canonical = renderMonorepoEasignore(slug);
      if (ignoreBody !== canonical) {
        console.error(`[${slug}] .easignore out of date — run node mobile-apps/scripts/syncEasignore.js`);
        failed = true;
      }
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

  if (EXPO_APPLICATION_METRO_APPS.has(slug)) {
    const metroPath = path.join(appRoot, 'metro.config.js');
    const shimPath = path.join(appRoot, 'shared', 'expoApplicationSafeShim.js');
    if (!fs.existsSync(shimPath)) {
      console.error(`[${slug}] missing shared/expoApplicationSafeShim.js`);
      failed = true;
    } else if (fs.existsSync(metroPath)) {
      const metro = fs.readFileSync(metroPath, 'utf8');
      if (!metro.includes('expoApplicationSafeShim') || !metro.includes('expo-application')) {
        console.error(`[${slug}] metro.config.js must alias expo-application to expoApplicationSafeShim`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('verifyMobileAndroidLightweight: OK');
