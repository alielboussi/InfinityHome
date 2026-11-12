const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const manifest = fs.readFileSync(path.join(root, 'src/mobile/mobileAccessManifest.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'mobile-apps/shared/mobileAccessManifest.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
const dash = fs.readFileSync(path.join(root, 'mobile-apps/orders/screens/DashboardScreen.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mobile-apps/orders/App.js'), 'utf8');
const accessUi = fs.readFileSync(path.join(root, 'src/UserAccessManagement.js'), 'utf8');

assert(manifest.includes("ORDERS_APP_OWNER_EMAIL = 'hassanawad18@gmail.com'"));
assert(manifest.includes('evaluateOrdersAppAccess'));
assert(shared.includes('evaluateOrdersAppAccess'));
assert(manifest.includes("id: 'orders_customers'"));
assert(manifest.includes("id: 'orders_tracking'"));
assert(mobile.includes("'orders-access-self'"));
assert(mobile.includes("'orders-quote-save'"));
assert(app.includes("signInMethods=\"both\""));
assert(app.includes('titleKey="dashTitle"'));
assert(accessUi.includes('<option value="orders">Orders</option>'));

const tileOrder = [
  'tileCustomers',
  'tileProducts',
  'tileNewOrder',
  'tileOrders',
  'tileDeliveries',
  'tileRepairs',
  'tileStorage',
  'tileTracking',
];
let last = -1;
for (const key of tileOrder) {
  const idx = dash.indexOf(key);
  assert(idx > last, `dashboard tile ${key} must keep Hassan sidebar order`);
  last = idx;
}

assert(fs.existsSync(path.join(root, 'mobile-apps/orders/app.config.js')));
assert(fs.existsSync(path.join(root, 'mobile-apps/orders/eas.json')));
const ordersConfig = fs.readFileSync(path.join(root, 'mobile-apps/orders/app.config.js'), 'utf8');
assert(ordersConfig.includes("expoProjectFullName: '@alielboussi/infinity-orders'"), 'Orders must set Expo Go OAuth project name');
assert(ordersConfig.includes('googleServicesFile'), 'Orders must wire google-services.json for native Google Sign-In');
assert(fs.existsSync(path.join(root, 'scripts/setupOrdersGoogleSignIn.mjs')), 'Orders Google setup script must exist');
const gs = fs.readFileSync(path.join(root, 'mobile-apps/orders/google-services.json'), 'utf8');
assert(gs.includes('online.infinityhome.orders'), 'orders google-services.json must include Orders package');
console.log('verifyOrdersApp: ok');
