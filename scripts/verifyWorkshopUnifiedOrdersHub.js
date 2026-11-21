const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

assert(read('mobile-apps/carpentry-workshop/screens/DashboardScreen.js').includes('dashUnifiedOrders'), 'Carpentry dashboard must expose unified Orders tile');
assert(read('mobile-apps/carpentry-workshop/screens/DashboardScreen.js').includes("justifyContent: 'flex-start'"), 'Carpentry dashboard tiles must anchor to top (not vertically centered)');
assert(!read('mobile-apps/carpentry-workshop/screens/DashboardScreen.js').includes("navigate('Quotes')"), 'Carpentry dashboard must not link separate Quotes tile');
assert(read('mobile-apps/carpentry-workshop/screens/JobsScreen.js').includes("item._kind === 'repair'"), 'Carpentry Jobs screen must list repairs in unified inbox');
assert(read('mobile-apps/warehouse-upholstery/screens/DashboardScreen.js').includes('dashUnifiedOrders'), 'Upholstery dashboard must expose unified Orders tile');
assert(read('mobile-apps/warehouse-delivery/screens/DashboardScreen.js').includes('DeliveryUnifiedQueue'), 'Delivery dashboard must open unified delivery queue');
assert(read('mobile-apps/warehouse-delivery/deliveryKit/screens/DeliveryUnifiedQueueScreen.js').includes("_kind: 'repair'"), 'Delivery unified queue must merge repairs');
assert(read('mobile-apps/shared/lib/workshopOrdersHubAccess.js').includes('isWorkshopOrdersHubAllowed'), 'Shared workshop orders hub access helper required');
assert(read('src/mobile/mobileAccessManifest.js').includes('carpentry_orders'), 'User access manifest must list carpentry_orders');
assert(read('src/mobile/mobileAccessManifest.js').includes('upholstery_orders'), 'User access manifest must list upholstery_orders');
assert(read('src/mobile/mobileAccessManifest.js').includes('delivery_production_orders'), 'User access manifest must list delivery_production_orders');
assert(read('src/components/UpholsteryUserAccessEditor.js').includes('UPHOLSTERY_ORDERS_LEGACY_SCREEN_IDS'), 'User access editor must sync legacy orders screens');

if (process.exitCode) {
  console.error('verifyWorkshopUnifiedOrdersHub: failed');
} else {
  console.log('verifyWorkshopUnifiedOrdersHub: ok');
}