/**
 * Workshop apps (Upholstery, Carpentry, Painting): repair queue stop → driver + signature → CR/WHR submit.
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

const apps = [
  {
    id: 'upholstery',
    repairs: 'mobile-apps/warehouse-upholstery/screens/WarehouseRepairsScreen.js',
    sig: 'mobile-apps/warehouse-upholstery/screens/RepairReturnSignatureScreen.js',
    done: 'mobile-apps/warehouse-upholstery/screens/RepairReturnDoneScreen.js',
    pkg: 'mobile-apps/warehouse-upholstery/package.json',
  },
  {
    id: 'carpentry',
    repairs: 'mobile-apps/carpentry-workshop/screens/WarehouseRepairsScreen.js',
    sig: 'mobile-apps/carpentry-workshop/screens/RepairReturnSignatureScreen.js',
    done: 'mobile-apps/carpentry-workshop/screens/RepairReturnDoneScreen.js',
    pkg: 'mobile-apps/carpentry-workshop/package.json',
  },
  {
    id: 'painting',
    repairs: 'mobile-apps/painting-workshop/screens/WarehouseRepairsScreen.js',
    sig: 'mobile-apps/painting-workshop/screens/RepairReturnSignatureScreen.js',
    done: 'mobile-apps/painting-workshop/screens/RepairReturnDoneScreen.js',
    pkg: 'mobile-apps/painting-workshop/package.json',
  },
];

for (const app of apps) {
  assert(fs.existsSync(path.join(root, app.repairs)), `${app.id}: WarehouseRepairsScreen missing`);
  assert(fs.existsSync(path.join(root, app.sig)), `${app.id}: RepairReturnSignatureScreen missing`);
  assert(fs.existsSync(path.join(root, app.done)), `${app.id}: RepairReturnDoneScreen missing`);

  const repairs = read(app.repairs);
  const sig = read(app.sig);
  const done = read(app.done);
  const pkg = JSON.parse(read(app.pkg));

  assert(repairs.includes('repairDispositionFloor1'), `${app.id}: repairs must offer Floor 1 on stop`);
  assert(repairs.includes('return-order-customer-delivery-prepare'), `${app.id}: repairs must prepare CR delivery`);
  assert(repairs.includes('RepairReturnSignature'), `${app.id}: repairs must navigate to signature screen`);
  assert(repairs.includes('repair_department'), `${app.id}: repairs list must filter by department`);
  assert(!repairs.includes('hassan_only: true'), `${app.id}: repairs queue must list all department jobs, not Hassan creator-only`);

  assert(sig.includes('delivery-drivers-list'), `${app.id}: signature must load drivers from portal API`);
  assert(sig.includes('signature_png_base64'), `${app.id}: signature must submit PNG`);
  assert(sig.includes('return-order-customer-delivery-submit'), `${app.id}: signature must support CR submit`);
  assert(sig.includes('return-order-ship-submit'), `${app.id}: signature must support WHR submit`);
  assert(sig.includes('submitLock'), `${app.id}: signature must guard double submit`);

  assert(done.includes('DeliveryPrintModal'), `${app.id}: done screen must print return note`);
  assert(done.includes('documentKind'), `${app.id}: done screen must pass document kind`);

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert(deps['react-native-view-shot'], `${app.id}: package.json needs react-native-view-shot for signature pad`);
  assert(deps['expo-print'], `${app.id}: package.json needs expo-print for A4 print/PDF`);
  assert(deps['expo-file-system'], `${app.id}: package.json needs expo-file-system for note PDF share`);
  assert(!repairs.includes('return-order-customer-label-print'), `${app.id}: repairs must not shortcut customer label without signature submit`);
}

const api = read('mobile-apps/warehouse-upholstery/shared/warehouseMobileApi.js');
assert(api.includes('/api/warehouse-mobile'), 'workshop apps must call production portal warehouse-mobile API');

console.log('verifyWorkshopRepairReturnFlow: OK');
