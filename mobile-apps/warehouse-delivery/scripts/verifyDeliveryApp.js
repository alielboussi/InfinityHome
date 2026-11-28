/**
 * Warehouse Delivery app — links, metro peers, Kitwe dependency parity with warehouse-production.
 * Usage: node scripts/verifyDeliveryApp.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
  assert(
    appJs.includes('DeliverySafeFrame') && appJs.includes('kioskAndroidNavReserve'),
    'App.js must lift all screens above the Android nav bar (DeliverySafeFrame)',
  );
  const kioskLayout = fs.readFileSync(path.join(appRoot, 'deliveryKit', 'lib', 'kioskLayout.js'), 'utf8');
  assert(
    kioskLayout.includes('kioskAndroidNavReserve') && kioskLayout.includes('kioskModalBottomPad'),
    'deliveryKit kioskLayout must reserve Android nav space and pad modals',
  );
  assert(
    kioskLayout.includes('export function kioskRowDirection'),
    'kioskLayout must export kioskRowDirection for Floor 1 set component rows',
  );
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
  assert(
    appConfig.includes('edgeToEdgeEnabled: false'),
    'Delivery Android config must disable edge-to-edge so system buttons do not overlay flow actions',
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
  assert(
    deliveryCatalog.includes('filterAssembliesForDeliveryFloor2Farm'),
    'deliveryWarehouseCatalog must export filterAssembliesForDeliveryFloor2Farm for Farm send',
  );
  const kitMobileApi = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'shared', 'warehouseMobileApi.js'),
    'utf8',
  );
  assert(
    kitMobileApi.includes('export function mapFarmWarehouseSetupError'),
    'warehouseMobileApi must map farm setup errors (otherwise Floor 1/farm session errors crash)',
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
  assert(
    kitweHome.includes('filterAssembliesForDeliveryFloor2Farm'),
    'Farm send (same screen as Floor 1) must filter Floor 2 catalog',
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
  assert(dashboard.includes('dashFarmDeliveries'), 'Dashboard must label Farm Deliveries');
  assert(
    dashboard.includes("replace('WarehouseFromFarmHome'"),
    'Farm-only Delivery users must land on Farm Deliveries (no dashboard)',
  );
  assert(
    dashboard.includes('tiles.length === 1')
      && dashboard.includes("tiles[0]?.key === 'farm'"),
    'Dashboard must stay visible when more than Farm Deliveries is enabled',
  );
  assert(dashboard.includes("navigate('KitweSendHome')"), 'Floor 1 tile must open KitweSendHome');
  assert(
    dashboard.includes("navigate('DeliveryUnifiedQueue')"),
    'Dashboard must open unified production Orders queue (repairs + factory orders)',
  );
  const hubI18nPath = path.join(appRoot, 'deliveryKit', 'lib', 'productionKioskI18n.js');
  const hubI18n = fs.readFileSync(hubI18nPath, 'utf8');
  assert(hubI18n.includes('dashFloor1Deliveries'), 'Delivery i18n must label Floor 1 Deliveries tile');
  const afterTranslate = hubI18n.split('export async function translateEnToAr')[1] || '';
  assert(
    !afterTranslate.includes('deliveryFarmContinue'),
    'deliveryFarmContinue must live inside UI_STRINGS, not after translateEnToAr',
  );
  try {
    execFileSync(process.execPath, ['--check', hubI18nPath], { stdio: 'pipe' });
  } catch (err) {
    assert(false, `productionKioskI18n.js syntax error: ${err.stderr || err.message}`);
  }
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

  const unified = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'DeliveryUnifiedQueueScreen.js'),
    'utf8',
  );
  assert(unified.includes('cardSource'), 'Orders queue cards must show source');
  assert(unified.includes('cardCustomer'), 'Orders queue cards must show customer');
  assert(unified.includes('cardDepartment'), 'Orders queue cards must show department');
  assert(unified.includes('cardQuoteNo'), 'Orders queue cards must show quote #');
  assert(unified.includes('KitweSendSignature'), 'Deliver order must open driver + signature screen');
  assert(!unified.includes('DeliveryDestinationBadges'), 'Orders badges must be department name only');
  assert(
    fs.existsSync(path.join(appRoot, 'deliveryKit', 'lib', 'goDashboardThenOpenNote.js')),
    'goDashboardThenOpenNote.js required so submit opens the delivery note from Dashboard',
  );
  const overlayPrint = path.join(appRoot, 'delivery-overlays', 'lib', 'printDeliveryNoteHtml.js');
  assert(
    fs.existsSync(overlayPrint) && fs.readFileSync(overlayPrint, 'utf8').includes('delivery-note-cloud-print'),
    'delivery-overlays must keep Epson Email Print so materialize cannot restore the printer picker',
  );
  const printHtml = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'lib', 'printDeliveryNoteHtml.js'),
    'utf8',
  );
  assert(printHtml.includes('delivery-note-cloud-print'), 'Floor 1 / orders print must use Epson Email Print');
  assert(!printHtml.includes('Print.printAsync'), 'must not open the Android printer picker');
  assert(
    !printHtml.includes('readAsStringAsync'),
    'Epson print must not use deprecated FileSystem.readAsStringAsync (it throws and blocks cloud print)',
  );
  assert(
    printHtml.includes('new File') && printHtml.includes("from 'expo-file-system'"),
    'Epson print must read the PDF with the Expo File API',
  );
  const overlayPrintSrc = fs.readFileSync(overlayPrint, 'utf8');
  assert(!overlayPrintSrc.includes('readAsStringAsync'), 'delivery-overlays print must not use readAsStringAsync');
  const noteOut = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'lib', 'deliveryNoteOutput.js'),
    'utf8',
  );
  assert(noteOut.includes('isFarmDeliveryDocumentKind'), 'farm notes must stay on share/send');
  const farmDone = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'WarehouseFromFarmDoneScreen.js'),
    'utf8',
  );
  assert(farmDone.includes('openDeliveryNotePdf'), 'farm return done must share/send the PDF');
  assert(farmDone.includes('forceShare: true'), 'farm return must not use Epson print');
  const dash = fs.readFileSync(path.join(appRoot, 'screens', 'DashboardScreen.js'), 'utf8');
  assert(dash.includes('outputDeliveryNote'), 'dashboard pending notes must dispatch Epson vs farm share');

  const farmHome = fs.readFileSync(
    path.join(appRoot, 'deliveryKit', 'screens', 'WarehouseFromFarmHomeScreen.js'),
    'utf8',
  );
  assert(farmHome.includes('deliveryFarmContinue'), 'Farm home Continue button must be labeled Continue');
  assert(farmHome.includes('deliveryFarmDestFloor2'), 'Farm destination must be Floor 2');
  assert(farmHome.includes('deliveryFarmDestKitwe'), 'Farm destination must be Kitwe');

  const deliveryOnlyI18nKeys = [
    'dashFloor1Deliveries',
    'dashFarmDeliveries',
    'deliveryFarmContinue',
    'deliveryFarmSend',
    'deliveryFarmDestFloor2',
    'filterCarpentry',
    'filterUpholstery',
    'filterPainting',
    'cardSource',
    'cardQuoteNo',
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
  const definedUiKeys = new Set();
  const uiClose = hubI18n.indexOf('\nconst PRESET_I18N');
  const uiBlock = uiClose === -1 ? hubI18n : hubI18n.slice(0, uiClose);
  for (const m of uiBlock.matchAll(/\n  ([A-Za-z0-9_]+):\s*\{/g)) definedUiKeys.add(m[1]);
  const usedUiKeys = new Set(['filterAll']);
  const kitRoot = path.join(appRoot, 'deliveryKit');
  function walkJs(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && ent.name !== 'node_modules') walkJs(p, acc);
      else if (/\.js$/.test(ent.name)) acc.push(p);
    }
    return acc;
  }
  const scanFiles = [
    ...walkJs(kitRoot),
    ...walkJs(path.join(appRoot, 'screens')),
  ];
  const appJsPath = path.join(appRoot, 'App.js');
  if (fs.existsSync(appJsPath)) scanFiles.push(appJsPath);
  for (const file of scanFiles) {
    const body = fs.readFileSync(file, 'utf8');
    for (const m of body.matchAll(/tUi\(\s*['"]([^'"]+)['"]/g)) usedUiKeys.add(m[1]);
  }
  const missingUi = [...usedUiKeys].filter((k) => !definedUiKeys.has(k)).sort();
  assert(
    missingUi.length === 0,
    `tUi keys missing from UI_STRINGS (raw keys on device): ${missingUi.join(', ')}`,
  );
  assert(sig.includes('customerLabels') && sig.includes('deliveryCustomerDriver'), 'Kitwe signature must localize customer driver section');
  assert(
    !fs.readFileSync(path.join(appRoot, 'screens', 'DashboardScreen.js'), 'utf8').includes('forceArabic'),
    'Delivery dashboard must allow locale toggle (not forceArabic)',
  );
  const overlayComponents = [
    'DeliveryFarmQtyAddModal.js',
    'DeliveryWarehouseProductGrid.js',
    'DeliveryKioskVirtualList.js',
  ];
  for (const file of overlayComponents) {
    assert(
      fs.existsSync(path.join(appRoot, 'delivery-overlays', 'components', file)),
      `delivery-overlays/components/${file} required`,
    );
  }
  assert(
    fs.existsSync(path.join(appRoot, 'delivery-overlays', 'lib', 'shareFarmTransferReceipt.js')),
    'delivery-overlays/lib/shareFarmTransferReceipt.js required',
  );

  const mobileSharedRoot = path.resolve(appRoot, '..', 'shared');
  const canonicalQuoteUi = fs.readFileSync(path.join(mobileSharedRoot, 'quoteProductionOrderUi.js'), 'utf8');
  const canonicalArabic = fs.readFileSync(path.join(mobileSharedRoot, 'quoteArabicTranslate.js'), 'utf8');
  const quoteOrderUi = fs.readFileSync(path.join(appRoot, 'shared', 'quoteProductionOrderUi.js'), 'utf8');
  const quoteArabic = fs.readFileSync(path.join(appRoot, 'shared', 'quoteArabicTranslate.js'), 'utf8');
  assert(
    fs.existsSync(path.join(appRoot, 'deliveryKit', 'lib', 'warehouseAccessoryCatalog.js')),
    'deliveryKit warehouseAccessoryCatalog.js required — run ensureDeliveryQuotePrintUtils',
  );
  assert(
    fs.existsSync(path.join(appRoot, 'delivery-overlays', 'lib', 'warehouseAccessoryCatalog.js')),
    'delivery-overlays warehouseAccessoryCatalog.js required — run ensureDeliveryQuotePrintUtils',
  );
  const quoteFields = fs.readFileSync(path.join(appRoot, 'deliveryKit', 'lib', 'quoteProductionItemFields.js'), 'utf8');
  const dimSetsMarker = 'dimension_sets: Array.isArray(line.dimension_sets)';
  const perPieceMarker = 'Supports per-piece `dimension_sets`';
  assert(
    canonicalQuoteUi.includes(dimSetsMarker),
    'mobile-apps/shared quoteProductionOrderUi must merge dimension_sets',
  );
  assert(
    canonicalArabic.includes(perPieceMarker),
    'mobile-apps/shared quoteArabicTranslate must format per-piece dimensions',
  );
  if (!quoteOrderUi.includes(dimSetsMarker)) {
    console.warn('WARN: warehouse-delivery/shared quoteProductionOrderUi stale — run npm run materialize before EAS');
  }
  if (!quoteArabic.includes(perPieceMarker)) {
    console.warn('WARN: warehouse-delivery/shared quoteArabicTranslate stale — run npm run materialize before EAS');
  }
  assert(
    quoteFields.includes('export function readQuoteDimensionSets'),
    'deliveryKit quoteProductionItemFields must match src — run materialize / ensureDeliveryQuotePrintUtils',
  );
  if (!fs.existsSync(path.join(sharedDir, '.standalone-shared'))) {
    console.warn('WARN: warehouse-delivery/shared not materialized — run npm run materialize before EAS build');
  }

  if (!process.exitCode) console.log('verifyDeliveryApp: ok');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
}
