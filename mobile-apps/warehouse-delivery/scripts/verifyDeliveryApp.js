/**
 * Warehouse Delivery app — links, metro peers, Kitwe dependency parity with warehouse-production.
 * Usage: node scripts/verifyDeliveryApp.js
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const peerList = require('./deliveryKitPeerDependencies');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const missing = peerList.filter((name) => !deps[name]);
  assert(missing.length === 0, `package.json missing deliveryKit peers: ${missing.join(', ')}`);

  assert(fs.existsSync(path.join(appRoot, 'metro.config.js')), 'metro.config.js required for shared/ + deliveryKit');
  assert(fs.existsSync(path.join(appRoot, 'babel.config.js')), 'babel.config.js required (babel-preset-expo / RN codegen)');
  const metro = fs.readFileSync(path.join(appRoot, 'metro.config.js'), 'utf8');
  assert(
    metro.includes('deliveryKit') && metro.includes('node_modules'),
    'metro must block deliveryKit/warehouse-production node_modules (duplicate RNCSafeAreaProvider)',
  );
  assert(
    metro.includes('shouldResolvePeerFromApp') || metro.includes('deliveryKitPeerSet'),
    'metro must pin deliveryKit peer deps to this app node_modules (duplicate RNCSafeAreaProvider)',
  );
  assert(fs.existsSync(path.join(appRoot, 'shared', 'MobileScreenGate.js')), 'shared/ junction missing — run npm install');
  assert(
    fs.existsSync(path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendHomeScreen.js')),
    'deliveryKit/ junction missing — run npm install',
  );

  const appJs = fs.readFileSync(path.join(appRoot, 'App.js'), 'utf8');
  assert(appJs.includes('./deliveryKit/components/ProductionAppAuthGate'), 'App.js must import auth gate from ./deliveryKit');
  assert(appJs.includes('./shared/MobileScreenGate'), 'App.js must import MobileScreenGate from ./shared');

  const appConfig = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
  assert(
    appConfig.includes('com.bestrest.warehousedelivery'),
    'Delivery app must use com.bestrest.warehousedelivery Firebase Android package',
  );
  assert(
    !appConfig.includes('9cb085a252a1f4939049f3'),
    'Delivery app must not default to Warehouse Production Firebase appId',
  );

  const kitweHome = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendHomeScreen.js'),
    'utf8',
  );
  assert(kitweHome.includes('ProductionQrScanModal'), 'Kitwe send must support barcode/QR scan');
  assert(kitweHome.includes('buildDeliveryPacketChecks'), 'Kitwe send must use packet checklist before cart');
  assert(kitweHome.includes('validateCartForSubmit'), 'Kitwe send must validate cart checklist before signature');
  assert(kitweHome.includes("'delivery-session-open'"), 'Kitwe send must open delivery session');
  assert(kitweHome.includes('KitweSendSignature'), 'Kitwe send must navigate to driver signature');

  const sig = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendSignatureScreen.js'),
    'utf8',
  );
  assert(sig.includes("'delivery-drivers-list'"), 'Signature screen must load drivers');
  assert(sig.includes("'delivery-submit'"), 'Signature screen must submit delivery');
  assert(sig.includes('DeliverySignaturePad'), 'Signature screen must capture driver signature');

  const manifest = fs.readFileSync(path.join(appRoot, 'shared', 'mobileAccessManifest.js'), 'utf8');
  assert(
    manifest.includes('evaluateWarehouseDeliveryDriverAppAccess'),
    'shared/mobileAccessManifest must export evaluateWarehouseDeliveryDriverAppAccess',
  );
  assert(
    manifest.includes("screenId === 'kitwe_send_delivery'"),
    'canMobileScreenView must allow kitwe via warehouse_production_kitwe flag',
  );

  const gate = fs.readFileSync(path.join(appRoot, 'shared', 'MobileScreenGate.js'), 'utf8');
  assert(
    gate.includes('isWarehouseProductionKitweDeliveryAllowed'),
    'MobileScreenGate must use Kitwe delivery flag (not screen row only)',
  );

  const cameraPerm = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'lib', 'productionCameraPermission.js'),
    'utf8',
  );
  assert(
    cameraPerm.includes('Camera.getCameraPermissionsAsync'),
    'productionCameraPermission must use expo-camera Camera.* APIs (SDK 58)',
  );

  const scanResolver = fs.readFileSync(
    path.join(appRoot, 'shared', 'warehouseScanResolver.js'),
    'utf8',
  );
  assert(
    scanResolver.includes('export function sanitizeWarehouseScannerInput'),
    'shared/warehouseScanResolver must export sanitizeWarehouseScannerInput for QR modal',
  );
  const prodScanResolver = path.join(appRoot, 'deliveryKit', 'shared', 'warehouseScanResolver.js');
  if (fs.existsSync(prodScanResolver)) {
    const prodScan = fs.readFileSync(prodScanResolver, 'utf8');
    assert(
    prodScan.includes('export function sanitizeWarehouseScannerInput'),
    'deliveryKit/shared warehouseScanResolver must export sanitizeWarehouseScannerInput',
  );
  }

  const firebaseShared = fs.readFileSync(path.join(appRoot, 'shared', 'firebase.js'), 'utf8');
  assert(
    firebaseShared.includes('AUTH_GLOBAL_KEY'),
    'shared/firebase.js must use global auth singleton (deliveryKit duplicate modules)',
  );

  for (const name of peerList) {
    const inApp = path.join(appRoot, 'node_modules', name, 'package.json');
    if (!fs.existsSync(inApp)) {
      console.warn('WARN: not installed yet (run npm install):', name);
    }
  }

  if (!process.exitCode) console.log('verifyDeliveryApp: ok');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
}
