/**
 * Showroom orders — Kitwe accept mirrors /kitwe-products; factory list excludes them.
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

assert(fs.existsSync(path.join(root, 'server/lib/showroomQuoteOrder.js')), 'showroomQuoteOrder.js required');
assert(read('server/handlers/quote-production.js').includes('create-showroom-order'), 'quote-production must expose create-showroom-order');
assert(read('src/utils/quoteCustomerOrder.js').includes('showroom_order'), 'Kitwe skip must allow showroom orders');
assert(read('src/QuotesBoard.js').includes('boardMode'), 'QuotesBoard must filter factory vs showroom');
const showroomCreateSrc = [
  read('src/components/HassanShowroomOrderForm.js'),
  read('src/ShowroomOrderCreate.js'),
].join('\n');
assert(showroomCreateSrc.includes('createShowroomQuoteAndSend'), 'Showroom create must call API');
assert(showroomCreateSrc.includes('if (!q) return []'), 'Showroom create must hide products until search');
assert(!read('server/lib/showroomQuoteOrder.js').includes('Insufficient Floor 2 stock for'), 'Showroom create must allow Floor 2 qty 0 at order time');
assert(read('server/lib/showroomQuoteOrder.js').includes('assertFloor2StockForQuoteItems'), 'Floor 2 stock gate required before workshop start');
assert(read('server/lib/showroomQuoteOrder.js').includes('computeFloor2ShortfallForQuoteLines'), 'quote list must compute Floor 2 shortfall');
assert(read('server/lib/paintingProductionJobs.js').includes('Showroom order requires Floor 2 WIP before painting'), 'showroom painting must require Floor 2');
assert(read('mobile-apps/shared/quoteProductionOrderUi.js').includes('QuoteProductionFloor2ShortfallBanner'), 'workshop cards must show Floor 2 shortfall');
assert(read('src/Quotationer.js').includes('addItemFromFloor2'), 'Quotationer must add Floor 2 WIP lines');
assert(read('src/utils/quoteShowroomOrder.js').includes('buildHassanCustomerQuoteRoutingMetadata'), 'Mixed customer + Floor 2 uses customer badge metadata');
assert(
  read('src/mobile/ordersAppDashboardParity.js').includes('orders_showroom_new')
    && read('src/mobile/ordersAppDashboardParity.js').includes('ShowroomOrderCreate'),
  'Hassan parity must include showroom create stack',
);
assert(read('mobile-apps/shared/quoteProductionOrderUi.js').includes('QuoteProductionOrderBadges'), 'workshop shared UI must expose order badges');
assert(read('mobile-apps/shared/quoteProductionOrderUi.js').includes('orderBadgeTextStyle'), 'badge UI must support Arabic layout');
const badgeApps = [
  'mobile-apps/orders/lib/productionKioskI18n.js',
  'mobile-apps/warehouse-upholstery/lib/productionKioskI18n.js',
  'mobile-apps/carpentry-workshop/lib/productionKioskI18n.js',
  'mobile-apps/carpentry-workshop/productionKiosk/lib/productionKioskI18n.js',
  'mobile-apps/warehouse-delivery/deliveryKit/lib/productionKioskI18n.js',
  'mobile-apps/painting-workshop/lib/productionKioskI18n.js',
];
for (const rel of badgeApps) {
  const body = read(rel);
  assert(body.includes('badgeShowroomOrder') && body.includes("ar: 'طلب صالة'"), `${rel} must define Arabic showroom badge`);
  assert(body.includes('badgeCustomerOrder') && body.includes("ar: 'طلب عميل'"), `${rel} must define Arabic customer badge`);
}
assert(read('server/lib/quoteProductionRouting.js').includes('showroom_order:'), 'production quote list must include showroom_order flag');
assert(read('src/utils/quoteProductionItemFields.js').includes('floor2_image_url'), 'production lines must surface Floor 2 images');
assert(read('server/lib/ordersAppMobile.js').includes('opOrdersShowroomFloor2List'), 'Orders app must load Floor 2 for showroom');
assert(read('server/handlers/warehouse-mobile.js').includes('orders-showroom-create'), 'warehouse-mobile must expose orders showroom create');
assert(read('mobile-apps/orders/screens/ShowroomOrderCreateScreen.js').includes('createOrdersShowroomQuote'), 'Orders app native showroom create');
const hassanF2 = read('src/HassanFloor2Page.js');
const floor2Page = read('src/WarehouseFloor2Page.js');
assert(hassanF2.includes('loadFreshOnMount'), 'Hassan Floor 2 must refresh catalog on open');
assert(floor2Page.includes('kitwe-catalog-product-row--floor2-readonly'), 'Hassan Floor 2 read-only table layout');
assert(read('src/utils/carpentryFinishingView.js').includes('hasFloor2InventoryRow'), 'Floor 2 list must include inventoried products');
assert(!fs.existsSync(path.join(root, 'mobile-apps/orders/screens/OrdersWebOnlyScreen.js')), 'remove Orders web-only placeholder');

if (!process.exitCode) console.log('verifyQuoteShowroomOrder: ok');