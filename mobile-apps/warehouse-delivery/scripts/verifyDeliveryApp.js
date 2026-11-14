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
  assert(
    fs.existsSync(path.join(appRoot, 'shared', 'expoApplicationSafeShim.js')),
    'shared/expoApplicationSafeShim.js required (Expo Go missing ExpoApplication)',
  );
  assert(fs.existsSync(path.join(appRoot, 'babel.config.js')), 'babel.config.js required (babel-preset-expo / RN codegen)');
  const metro = fs.readFileSync(path.join(appRoot, 'metro.config.js'), 'utf8');
  assert(
    metro.includes('expoApplicationSafeShim') && metro.includes('expo-application'),
    'metro must alias expo-application to expoApplicationSafeShim',
  );
  assert(
    metro.includes('deliveryKit') && metro.includes('node_modules'),
    'metro must block deliveryKit/warehouse-production node_modules (duplicate RNCSafeAreaProvider)',
  );
  assert(
    metro.includes('shouldResolvePeerFromApp') || metro.includes('deliveryKitPeerSet'),
    'metro must pin deliveryKit peer deps to this app node_modules (duplicate RNCSafeAreaProvider)',
  );
  const kitDir = path.join(appRoot, 'deliveryKit');
  const kitMaterialized = fs.existsSync(path.join(kitDir, '.standalone-materialized'));
  const kitHasScreens = fs.existsSync(path.join(kitDir, 'screens', 'KitweSendHomeScreen.js'));
  assert(kitMaterialized || kitHasScreens, 'deliveryKit missing — run npm run materialize in warehouse-delivery');
  if (kitMaterialized) {
    assert(
      !fs.lstatSync(kitDir).isSymbolicLink(),
      'deliveryKit must be a real folder, not a symlink to production',
    );
  }

  const sharedDir = path.join(appRoot, 'shared');
  const sharedMaterialized = fs.existsSync(path.join(sharedDir, '.standalone-shared'));
  assert(fs.existsSync(path.join(sharedDir, 'MobileScreenGate.js')), 'shared/MobileScreenGate.js required');
  if (sharedMaterialized) {
    try {
      const sh = fs.lstatSync(sharedDir);
      assert(!sh.isSymbolicLink(), 'shared/ must not be a junction to mobile-apps/shared');
    } catch (e) {
      assert(false, `shared/ check failed: ${e.message}`);
    }
  }

  const appJs = fs.readFileSync(path.join(appRoot, 'App.js'), 'utf8');
  assert(appJs.includes('./deliveryKit/components/ProductionAppAuthGate'), 'App.js must import auth gate from ./deliveryKit');
  assert(appJs.includes('./shared/MobileScreenGate'), 'App.js must import MobileScreenGate from ./shared');
  assert(!appJs.includes('ReturnOrders'), 'Delivery app must not register return/repair routes — use workshop apps');
  assert(
    !fs.existsSync(path.join(appRoot, 'deliveryKit', 'screens', 'ReturnOrdersScreen.js')),
    'deliveryKit/screens must not include ReturnOrdersScreen — repairs belong in upholstery/carpentry/painting apps',
  );

  const appConfig = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
  assert(
    appConfig.includes('com.bestrest.warehousedelivery'),
    'Delivery app must use com.bestrest.warehousedelivery Firebase Android package',
  );
  assert(
    !appConfig.includes('9cb085a252a1f4939049f3'),
    'Delivery app must not default to Warehouse Production Firebase appId',
  );

  assert(fs.existsSync(path.join(appRoot, 'config', 'deliveryAppUi.js')), 'config/deliveryAppUi.js required');
  const deliveryUi = fs.readFileSync(path.join(appRoot, 'config', 'deliveryAppUi.js'), 'utf8');
  assert(
    /showKitweSendScopeHints\s*=\s*false/.test(deliveryUi),
    'Delivery app config must hide Kitwe Send scope hints (number only)',
  );

  const deliveryCatalog = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'lib', 'deliveryWarehouseCatalog.js'),
    'utf8',
  );
  assert(
    deliveryCatalog.includes('filterAssembliesForDeliveryFloor1Only'),
    'deliveryWarehouseCatalog must export filterAssembliesForDeliveryFloor1Only for Kitwe Send',
  );

  const kitweHome = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendHomeScreen.js'),
    'utf8',
  );
  assert(kitweHome.includes('ProductionQrScanModal'), 'Kitwe send must support barcode/QR scan');
  assert(kitweHome.includes('buildDeliveryPacketChecks'), 'Kitwe send must use packet checklist before cart');
  assert(kitweHome.includes('validateCartForSubmit'), 'Kitwe send must validate cart checklist before signature');
  assert(
    kitweHome.includes('toggleLocale') && kitweHome.includes('useProductionKioskLocale'),
    'Kitwe send must support EN/AR locale toggle',
  );
  assert(
    kitweHome.includes('deliverySetPartialHint') && kitweHome.includes('kioskRowDirection'),
    'Kitwe partial set UI must respect locale row direction and i18n',
  );
  assert(kitweHome.includes("'delivery-session-open'"), 'Kitwe send must open delivery session');
  assert(
    !/if\s*\(\s*sid0\s*&&\s*dnum0\s*\)\s*return/.test(kitweHome),
    'Kitwe send must always validate delivery-session-open on mount (no stale session skip)',
  );
  assert(kitweHome.includes('replaced_stale_session'), 'Kitwe send must handle stale delivery sessions');
  assert(kitweHome.includes('KitweSendSignature'), 'Kitwe send must navigate to driver signature');

  assert(fs.existsSync(path.join(appRoot, 'lib', 'deliveryDriversStore.js')), 'lib/deliveryDriversStore.js required (outside deliveryKit)');

  const deliveryScreensHome = path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendHomeScreen.js');
  const kitScreensHome = path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendHomeScreen.js');
  assert(
    fs.existsSync(deliveryScreensHome) || fs.existsSync(kitScreensHome),
    'KitweSendHomeScreen.js required under deliveryKit/screens/',
  );

  const sig = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'KitweSendSignatureScreen.js'),
    'utf8',
  );
  assert(
    sig.includes("'delivery-drivers-list'")
      || sig.includes('useDeliveryDrivers')
      || sig.includes('fetchDeliveryDriversCached'),
    'Signature screen must load drivers',
  );
  assert(sig.includes("'delivery-submit'"), 'Signature screen must submit delivery');
  assert(sig.includes('DeliverySignaturePad'), 'Signature screen must capture driver signature');
  assert(sig.includes('DeliveryCustomerDriverSection'), 'Kitwe signature must support customer driver +');

  assert(appJs.includes('DeliveryRepairQueue'), 'App must register DeliveryRepairQueue');
  assert(appJs.includes('DeliveryOrderQueue'), 'App must register DeliveryOrderQueue');
  assert(!appJs.includes('DeliverySendHub'), 'Delivery hub tabs removed — queues are dashboard tiles');
  const dashboard = fs.readFileSync(path.join(appRoot, 'screens', 'DashboardScreen.js'), 'utf8');
  assert(dashboard.includes('dashFloor1Deliveries'), 'Dashboard must label Floor 1 Deliveries');
  assert(dashboard.includes("navigate('KitweSendHome')"), 'Floor 1 tile must open KitweSendHome');
  assert(dashboard.includes("navigate('DeliveryRepairQueue')"), 'Dashboard must open Repairs queue');
  assert(dashboard.includes("navigate('DeliveryOrderQueue')"), 'Dashboard must open Orders queue');
  const hubI18n = fs.readFileSync(path.join(appRoot, 'deliveryKit', 'lib', 'productionKioskI18n.js'), 'utf8');
  assert(hubI18n.includes('dashFloor1Deliveries'), 'Delivery i18n must label Floor 1 Deliveries tile');
  const repairQueue = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'DeliveryRepairQueueScreen.js'),
    'utf8',
  );
  assert(repairQueue.includes('delivery-production-queue-list'), 'Repair queue must call delivery-production-queue-list');
  const orderQueue = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'DeliveryOrderQueueScreen.js'),
    'utf8',
  );
  assert(orderQueue.includes('delivery-production-queue-list'), 'Order queue must call delivery-production-queue-list');
  assert(orderQueue.includes('production_job_id'), 'Order queue groups must pin production_job_id for virtual holds');
  assert(
    orderQueue.includes('../lib/warehouseOrderPrintGroups.js'),
    'Order queue must use deliveryKit quote print groups (standalone)',
  );
  assert(
    !orderQueue.includes('src/utils/warehouseDeliveryPrintGroups'),
    'Order queue must not import monorepo src path',
  );
  const sentList = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'KitweSentDeliveriesScreen.js'),
    'utf8',
  );
  assert(sentList.includes('sentDeliveriesSearchPlaceholder'), 'Sent deliveries must include search field');
  assert(sentList.includes('matchesSentDeliverySearch'), 'Sent deliveries must filter by #, customer, and type');

  const soldSig = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'SoldDeliverSignatureScreen.js'),
    'utf8',
  );
  assert(soldSig.includes('DeliveryCustomerDriverSection'), 'Sold deliver signature must support customer driver +');
  assert(soldSig.includes('customer_driver_name'), 'Sold deliver submit must send customer driver fields');

  const zambia = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'lib', 'zambiaDateTime.js'),
    'utf8',
  );
  assert(
    !/from ['"]\.\.\/\.\.\/\.\.\/src\//.test(zambia),
    'deliveryKit/lib/zambiaDateTime.js must not use production ../../../src paths — run npm run materialize',
  );
  assert(
    zambia.includes('formatZambiaDate') && zambia.includes('formatZambiaTime'),
    'deliveryKit/lib/zambiaDateTime.js must export Zambia formatters locally',
  );

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

  const deliveryOnlyI18nKeys = [
    'dashFloor1Deliveries',
    'dashDeliveryRepairs',
    'dashDeliveryOrders',
    'deliveryRepairQueueEmpty',
    'deliveryOrderQueueEmpty',
    'deliveryRepairKindLabel',
    'deliveryRepairDeliverBtn',
    'deliveryOrderDeliverBtn',
    'deliveryCustomerDriver',
    'deliveryCustomerAddBtn',
    'deliveryCustomerDriverHint',
    'deliveryDriverEitherOr',
    'customerDriverSave',
    'sentDeliveriesSearchPlaceholder',
    'sentDeliveryKindFloor1',
    'sentDeliveryKindRepair',
    'sentDeliveryKindOrder',
    'sentDeliveryKindSold',
  ];
  for (const key of deliveryOnlyI18nKeys) {
    const re = new RegExp(`${key}:\\s*\\{[\\s\\S]*?\\bar:\\s*'`, 'm');
    assert(re.test(hubI18n), `delivery i18n key ${key} must include Arabic (ar)`);
  }
  assert(sig.includes('customerLabels') && sig.includes('deliveryCustomerDriver'), 'Kitwe signature must localize customer driver section');
  assert(
    !fs.readFileSync(path.join(appRoot, 'screens', 'DashboardScreen.js'), 'utf8').includes('forceArabic'),
    'Delivery dashboard must allow locale toggle (not forceArabic)',
  );

  if (!process.exitCode) console.log('verifyDeliveryApp: ok');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
}
