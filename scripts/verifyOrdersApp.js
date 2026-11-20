/**
 * Orders Android app + Hassan Awad web quotationer dashboard must stay aligned.
 * ORDERS_APP_DASHBOARD_PARITY_LOCKED
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  ORDERS_APP_DASHBOARD_PARITY,
  ORDERS_APP_HOME_TILES,
  HASSAN_WEB_ORDERS_PATH,
  HASSAN_WEB_ORDERS_SIDEBAR_SCREEN_IDS,
  HASSAN_WEB_ORDER_CREATE_PATH,
  HASSAN_WEB_ORDER_CREATE_SIDEBAR_SCREEN_IDS,
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
  dash.includes('ORDERS_APP_HOME_TILES'),
  'DashboardScreen must build tiles from ORDERS_APP_HOME_TILES',
);
assert.equal(ORDERS_APP_HOME_TILES.length, 7, 'Orders home dashboard is 7 tiles (create/list/showroom/floor2 + deliveries + tracking)');
const homeIds = ORDERS_APP_HOME_TILES.map((t) => t.screenId).join(',');
assert.equal(
  homeIds,
  'orders_new_order,orders_list,orders_showroom_new,orders_showroom_list,orders_floor2,orders_deliveries,orders_tracking',
  'Orders home tile sequence',
);
assert(
  fs.readFileSync(path.join(root, 'mobile-apps/orders/screens/TrackingScreen.js'), 'utf8').includes('ProductionTrackingFilterButton'),
  'TrackingScreen must use funnel filter button',
);
assert(
  fs.readFileSync(path.join(root, 'mobile-apps/shared/productionTrackingListUi.js'), 'utf8')
    === fs.readFileSync(path.join(root, 'src/utils/productionTrackingListUi.js'), 'utf8'),
  'mobile-apps/shared/productionTrackingListUi.js must match src/utils (copy after edits)',
);
for (const tile of ORDERS_APP_HOME_TILES) {
  assert(
    app.includes(`name="${tile.mobileStack}"`),
    `orders App.js missing Stack.Screen ${tile.mobileStack} for home tile ${tile.screenId}`,
  );
}

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
const ordersListSidebarSkip = new Set(HASSAN_WEB_ORDERS_SIDEBAR_SCREEN_IDS);
const ordersCreateSidebarSkip = new Set(HASSAN_WEB_ORDER_CREATE_SIDEBAR_SCREEN_IDS);
const expectedNavCount = ORDERS_APP_DASHBOARD_PARITY.length + 1
  - (ordersListSidebarSkip.size - 1)
  - (ordersCreateSidebarSkip.size - 1);
assert.equal(navItems.length, expectedNavCount, 'web nav = parity rows + Layby home − merged order links');

assert(
  navItems.some((item) => item.label === 'Orders' && item.route === HASSAN_WEB_ORDERS_PATH),
  'Hassan sidebar must include combined Orders nav',
);
assert(
  navItems.some((item) => item.label === 'New Orders' && item.route === HASSAN_WEB_ORDER_CREATE_PATH),
  'Hassan sidebar must include combined New Orders nav',
);

for (const row of ORDERS_APP_DASHBOARD_PARITY) {
  if (ordersListSidebarSkip.has(row.screenId) || ordersCreateSidebarSkip.has(row.screenId)) continue;
  const match = navItems.find(
    (item) => item.label === row.webLabel && item.route === row.webRoute
      && (item.search || '') === (row.webSearch || ''),
  );
  assert(match, `AppChrome nav missing ${row.webLabel} → ${row.webRoute}${row.webSearch || ''}`);
}

const floor2Row = ORDERS_APP_DASHBOARD_PARITY.find((r) => r.screenId === 'orders_floor2');
assert(floor2Row?.navGroup === 'warehouse' && floor2Row?.webLabel === 'Floor 2', 'Floor 2 belongs in Warehouse nav');

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
