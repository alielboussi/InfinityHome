/**
 * Smoke: Floor 2 quote flow + customer/showroom badges across workshop + delivery + orders + web.
 * Usage: node scripts/verifyWorkshopCrossAppSmoke.js
 */
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

const canonicalUi = read('mobile-apps/shared/quoteProductionOrderUi.js');
const canonicalShortfall = read('mobile-apps/shared/floor2QuoteShortfall.js');

const materializedUiPaths = [
  'mobile-apps/carpentry-workshop/shared/quoteProductionOrderUi.js',
  'mobile-apps/warehouse-upholstery/shared/quoteProductionOrderUi.js',
  'mobile-apps/painting-workshop/shared/quoteProductionOrderUi.js',
  'mobile-apps/orders/shared/quoteProductionOrderUi.js',
  'mobile-apps/warehouse-delivery/shared/quoteProductionOrderUi.js',
  'mobile-apps/warehouse-delivery/deliveryKit/shared/quoteProductionOrderUi.js',
];

for (const rel of materializedUiPaths) {
  const body = read(rel);
  assert(body === canonicalUi, `${rel} must match mobile-apps/shared/quoteProductionOrderUi.js — run materialize in each app`);
  assert(body.includes('QuoteProductionFloor2ShortfallBanner'), `${rel} missing Floor 2 shortfall banner`);
  assert(body.includes('QuoteProductionOrderBadges'), `${rel} missing order badges`);
}

const shortfallPaths = [
  'mobile-apps/carpentry-workshop/shared/floor2QuoteShortfall.js',
  'mobile-apps/warehouse-upholstery/shared/floor2QuoteShortfall.js',
  'mobile-apps/orders/shared/floor2QuoteShortfall.js',
];
for (const rel of shortfallPaths) {
  assert(read(rel) === canonicalShortfall, `${rel} must match mobile-apps/shared/floor2QuoteShortfall.js`);
}

const i18nPaths = [
  'mobile-apps/carpentry-workshop/lib/productionKioskI18n.js',
  'mobile-apps/warehouse-upholstery/lib/productionKioskI18n.js',
];
for (const rel of i18nPaths) {
  const body = read(rel);
  assert(body.includes('quoteFloor2ShortfallTitle'), `${rel} missing Floor 2 shortfall i18n`);
  assert(body.includes('badgeShowroomOrder') && body.includes('badgeCustomerOrder'), `${rel} missing order badge i18n`);
}

const showroomForm = ['src/components/HassanShowroomOrderForm.js', 'src/ShowroomOrderCreate.js']
  .map((rel) => ({ rel, body: read(rel) }))
  .find((f) => f.body.includes("if (!q) return []"));
assert(showroomForm, 'showroom create must stay search-only (HassanShowroomOrderForm or ShowroomOrderCreate)');
assert(read('src/Quotationer.js').includes('addItemFromFloor2'), 'web quotationer Floor 2 picker');
assert(read('server/lib/quoteProductionRouting.js').includes('floor2_shortfalls'), 'API must expose Floor 2 shortfalls on quote list');
assert(read('server/lib/showroomQuoteOrder.js').includes('computeFloor2ShortfallForQuoteLines'), 'showroomQuoteOrder shortfall helper');
assert(read('server/lib/paintingProductionJobs.js').includes('Showroom order requires Floor 2 WIP before painting'), 'showroom painting Floor 2 gate');

assert(read('mobile-apps/carpentry-workshop/screens/QuotesScreen.js').includes('QuoteProductionFloor2ShortfallBanner'), 'carpentry quotes list shortfall');
assert(read('mobile-apps/warehouse-upholstery/screens/UpholsteryQuotesScreen.js').includes('QuoteProductionFloor2ShortfallBanner'), 'upholstery quotes list shortfall');
assert(read('mobile-apps/carpentry-workshop/screens/QuoteDetailScreen.js').includes('quoteOpenManufacture'), 'carpentry accept → manufacture');

const pushApps = [
  'mobile-apps/carpentry-workshop/shared/screens/ProductionPushSettingsScreen.js',
  'mobile-apps/warehouse-upholstery/shared/screens/ProductionPushSettingsScreen.js',
  'mobile-apps/painting-workshop/shared/screens/ProductionPushSettingsScreen.js',
];
for (const rel of pushApps) {
  assert(fs.existsSync(path.join(root, rel)), `${rel} required — run npm run materialize in that app`);
}
assert(read('mobile-apps/warehouse-upholstery/screens/UpholsteryQuoteDetailScreen.js').includes('quoteOpenManufacture'), 'upholstery accept → manufacture');

const fields = read('src/utils/quoteProductionItemFields.js');
assert(fields.includes('floor2_assembly_id'), 'quoteProductionItemFields must persist floor2_assembly_id');

if (!process.exitCode) console.log('verifyWorkshopCrossAppSmoke: ok');