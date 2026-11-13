/**
 * Orders Android app + Hassan Awad web quotationer dashboard must stay aligned.
 * ORDERS_APP_DASHBOARD_PARITY_LOCKED
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  ORDERS_APP_DASHBOARD_PARITY,
  buildQuotationerOnlyNavGroups,
  hassanParityWebPaths,
} from '../src/mobile/ordersAppDashboardParity.js';
import { ORDERS_APP_SCREENS } from '../src/mobile/mobileAccessManifest.js';
import { HASSAN_AWAD } from '../src/accessControl.js';

const root = path.resolve(import.meta.dirname, '..');

const manifest = fs.readFileSync(path.join(root, 'src/mobile/mobileAccessManifest.js'), 'utf8');
const sharedManifest = fs.readFileSync(path.join(root, 'mobile-apps/shared/mobileAccessManifest.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
const dash = fs.readFileSync(path.join(root, 'mobile-apps/orders/screens/DashboardScreen.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mobile-apps/orders/App.js'), 'utf8');
const accessUi = fs.readFileSync(path.join(root, 'src/UserAccessManagement.js'), 'utf8');
const appChrome = fs.readFileSync(path.join(root, 'src/AppChrome.js'), 'utf8');
const srcParity = fs.readFileSync(path.join(root, 'src/mobile/ordersAppDashboardParity.js'), 'utf8');
const sharedParity = fs.readFileSync(path.join(root, 'mobile-apps/shared/ordersAppDashboardParity.js'), 'utf8');

assert(srcParity.includes('ORDERS_APP_DASHBOARD_PARITY_LOCKED'));
assert(
  srcParity === sharedParity,
  'mobile-apps/shared/ordersAppDashboardParity.js must match src/mobile/ordersAppDashboardParity.js (copy after edits)',
);

assert(manifest.includes("ORDERS_APP_OWNER_EMAIL = 'hassanawad18@gmail.com'"));
assert(manifest.includes('evaluateOrdersAppAccess'));
assert(sharedManifest.includes('evaluateOrdersAppAccess'));
assert(mobile.includes("'orders-access-self'"));
assert(mobile.includes("'orders-quote-save'"));
assert(app.includes("signInMethods=\"both\""));
assert(app.includes('titleKey="dashTitle"'));
assert(accessUi.includes('<option value="orders">Orders</option>'));

assert(
  appChrome.includes('QUOTATIONER_ONLY_NAV_GROUPS'),
  'AppChrome must import Hassan sidebar nav from ordersAppDashboardParity',
);
assert(
  dash.includes('ORDERS_APP_DASHBOARD_PARITY'),
  'DashboardScreen must build tiles from ordersAppDashboardParity',
);

const parityScreenIds = ORDERS_APP_DASHBOARD_PARITY.map((r) => r.screenId);
const manifestScreenIds = ORDERS_APP_SCREENS.map((r) => r.id);
assert.deepEqual(
  parityScreenIds,
  manifestScreenIds,
  'ORDERS_APP_DASHBOARD_PARITY screenIds must match ORDERS_APP_SCREENS in mobileAccessManifest',
);

for (const row of ORDERS_APP_DASHBOARD_PARITY) {
  assert(
    app.includes(`name="${row.mobileStack}"`),
    `orders App.js missing Stack.Screen ${row.mobileStack} for ${row.screenId}`,
  );
}

const i18n = fs.readFileSync(path.join(root, 'mobile-apps/orders/lib/productionKioskI18n.js'), 'utf8');
for (const row of ORDERS_APP_DASHBOARD_PARITY) {
  assert(i18n.includes(`${row.i18nKey}:`), `productionKioskI18n missing ${row.i18nKey}`);
}

const navGroups = buildQuotationerOnlyNavGroups();
const navItems = navGroups.flatMap((g) => g.items || []);
assert.equal(navItems.length, ORDERS_APP_DASHBOARD_PARITY.length + 1, 'web nav = parity rows + Layby Dashboard home');

for (const row of ORDERS_APP_DASHBOARD_PARITY) {
  const match = navItems.find(
    (item) => item.label === row.webLabel && item.route === row.webRoute
      && (item.search || '') === (row.webSearch || ''),
  );
  assert(match, `AppChrome nav missing ${row.webLabel} → ${row.webRoute}${row.webSearch || ''}`);
}

for (const allowed of HASSAN_AWAD.allowedRoutes) {
  assert(
    hassanParityWebPaths().includes(allowed),
    `HASSAN_AWAD.allowedRoutes ${allowed} must appear in ordersAppDashboardParity`,
  );
}

assert(fs.existsSync(path.join(root, 'mobile-apps/orders/app.config.js')));
assert(fs.existsSync(path.join(root, 'mobile-apps/orders/eas.json')));
const ordersConfig = fs.readFileSync(path.join(root, 'mobile-apps/orders/app.config.js'), 'utf8');
assert(ordersConfig.includes("expoProjectFullName: '@alielboussi/infinity-orders'"), 'Orders must set Expo Go OAuth project name');
assert(ordersConfig.includes('googleServicesFile'), 'Orders must wire google-services.json for native Google Sign-In');
assert(ordersConfig.includes('eas:') && ordersConfig.includes('projectId:'), 'Orders must set extra.eas.projectId in app.config.js');
assert(fs.existsSync(path.join(root, 'scripts/setupOrdersGoogleSignIn.mjs')), 'Orders Google setup script must exist');
const gs = fs.readFileSync(path.join(root, 'mobile-apps/orders/google-services.json'), 'utf8');
assert(gs.includes('online.infinityhome.orders'), 'orders google-services.json must include Orders package');

console.log('verifyOrdersApp: ok');
