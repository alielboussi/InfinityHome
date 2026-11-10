/**
 * Workshop apps: repairs complete → Delivery app queue (no workshop shipping on carpentry/painting).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const deliveryOnlyWorkshops = new Set(['upholstery', 'carpentry', 'painting']);

const apps = [
  {
    id: 'upholstery',
    repairs: 'mobile-apps/warehouse-upholstery/screens/WarehouseRepairsScreen.js',
    appJs: 'mobile-apps/warehouse-upholstery/App.js',
    pkg: 'mobile-apps/warehouse-upholstery/package.json',
  },
  {
    id: 'carpentry',
    repairs: 'mobile-apps/carpentry-workshop/screens/WarehouseRepairsScreen.js',
    appJs: 'mobile-apps/carpentry-workshop/App.js',
    pkg: 'mobile-apps/carpentry-workshop/package.json',
  },
  {
    id: 'painting',
    repairs: 'mobile-apps/painting-workshop/screens/WarehouseRepairsScreen.js',
    appJs: 'mobile-apps/painting-workshop/App.js',
    pkg: 'mobile-apps/painting-workshop/package.json',
  },
];

for (const app of apps) {
  assert(fs.existsSync(path.join(root, app.repairs)), `${app.id}: WarehouseRepairsScreen missing`);

  const repairs = read(app.repairs);
  const appJs = read(app.appJs);
  const pkg = JSON.parse(read(app.pkg));

  assert(repairs.includes('repairCompleteFloor2Hint'), `${app.id}: repairs must explain delivery queue on complete`);
  assert(!repairs.includes('return-order-customer-delivery-prepare'), `${app.id}: repairs must not ship from workshop app`);
  assert(!repairs.includes('RepairReturnSignature'), `${app.id}: repairs must not navigate to signature from stop`);
  assert(repairs.includes('repair_department'), `${app.id}: repairs list must filter by department`);
  assert(!repairs.includes('hassan_only: true'), `${app.id}: repairs queue must list all department jobs, not Hassan creator-only`);
  assert(repairs.includes('../shared/lib/repairReturnQueueUi'), `${app.id}: repairs must import timer helper from app shared/`);
  const appRoot = path.dirname(path.dirname(app.repairs));
  assert(
    fs.existsSync(path.join(root, appRoot, 'shared/lib/repairReturnQueueUi.js')),
    `${app.id}: shared/lib/repairReturnQueueUi.js required for Metro (materialized shared)`,
  );
  assert(repairs.includes('background: true'), `${app.id}: repairs must refresh list in background after timer ops`);
  assert(!repairs.includes('return-order-customer-label-print'), `${app.id}: repairs must not shortcut customer label without delivery app`);

  if (deliveryOnlyWorkshops.has(app.id)) {
    assert(!appJs.includes('RepairReturnSignature'), `${app.id}: App must not register delivery signature screens`);
    assert(!appJs.includes('RepairReturnDone'), `${app.id}: App must not register delivery done screens`);
    assert(
      !fs.existsSync(path.join(root, appRoot, 'screens', 'RepairReturnSignatureScreen.js')),
      `${app.id}: RepairReturnSignatureScreen must be removed — use Delivery app`,
    );
    assert(
      !fs.existsSync(path.join(root, appRoot, 'screens', 'RepairReturnDoneScreen.js')),
      `${app.id}: RepairReturnDoneScreen must be removed — use Delivery app`,
    );
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert(deps['react-native-view-shot'], `${app.id}: package.json needs react-native-view-shot for signature pad`);
  assert(deps['expo-print'], `${app.id}: package.json needs expo-print for A4 print/PDF`);
  assert(deps['expo-file-system'], `${app.id}: package.json needs expo-file-system for note PDF share`);
}

const api = read('mobile-apps/warehouse-upholstery/shared/warehouseMobileApi.js');
assert(api.includes('/api/warehouse-mobile'), 'workshop apps must call production portal warehouse-mobile API');

const deliveryApp = read('mobile-apps/warehouse-delivery/App.js');
assert(deliveryApp.includes('DeliveryRepairQueue'), 'Delivery app must own repairs queue screen');
assert(deliveryApp.includes('DeliveryOrderQueue'), 'Delivery app must own orders queue screen');

console.log('verifyWorkshopRepairReturnFlow: OK');
