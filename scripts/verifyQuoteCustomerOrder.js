/**
 * Customer Order quotes → Hassan accept must not mirror Kitwe /kitwe-products retail rows.
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

assert(fs.existsSync(path.join(root, 'src/utils/quoteCustomerOrder.js')), 'quoteCustomerOrder.js required');
assert(read('src/utils/warehouseDelivery.js').includes('deliveryEntrySkipKitweRetailCatalog'), 'warehouseDelivery must export skip Kitwe catalog helper');
assert(read('server/lib/kitweDeliveryCatalogSync.js').includes('deliveryEntrySkipKitweRetailCatalog'), 'Kitwe catalog sync must skip customer orders');
assert(read('server/lib/warehouseDeliveryAccept.js').includes('deliveryEntrySkipKitweRetailCatalog'), 'delivery accept finalize must skip customer order assemblies');
assert(read('server/lib/warehouseDeliveryAdminQueue.js').includes('deliveryEntrySkipKitweRetailCatalog'), 'admin queue Kitwe move must skip customer orders');
assert(read('server/lib/quoteProductionRouting.js').includes('customer_order:'), 'send to production must flag customer_order when named customer');
assert(read('src/utils/buildDeliveryNotePrintHtml.js').includes('Customer Order Delivery Note'), 'A4 HTML must title customer order deliveries');
assert(read('src/utils/warehouseDeliveryNotePrint.js').includes('order_delivery'), 'Hassan delivery note builder must pass order_delivery metadata');
assert(read('src/Quotationer.js').includes('quotation-customer-order-badge'), 'Quotationer list must show Customer Order badge');
assert(read('src/utils/hassanQuoteUnits.js').includes("label: 'm²'"), 'Hassan quote UOM catalog must include m² label');
assert(read('src/utils/hassanQuoteUnits.js').includes("label: 'Pc(s)'"), 'Hassan quote UOM catalog must include Pc(s) label');
assert(!read('src/Quotationer.js').includes('Manage Units'), 'Quote Products must not expose unit admin UI');
assert(
  read('src/Quotationer.js').includes('hassanAddSearchFloor2Results'),
  'Hassan customer create must search Floor 2 WIP alongside quote products',
);
assert(
  read('src/Quotationer.js').includes('addItemFromFloor2(g)'),
  'Hassan customer create must add Floor 2 lines from unified search',
);
assert(
  read('src/services/sendQuoteOrderFlow.js').includes('assertQuoteReadyForSendOrder'),
  'Send Order must block quotes with no product lines',
);
assert(
  read('server/handlers/quote-production.js').includes('sendOrResendQuoteToProduction'),
  'web send-to-production must allow resend notify',
);
assert(
  !read('server/lib/quoteProductionRouting.js').includes('firstProduct?.id) return firstProduct.id'),
  'send to production must not attach random warehouse assembly when lines missing',
);
assert(read('src/Quotationer.js').includes('filterHassanQuoteUnits'), 'Quotationer must filter units to hardcoded Hassan UOMs');
assert(read('src/Quotationer.js').includes('loadHassanQuoteUnitCatalog'), 'Quotationer must ensure m² and Pc(s) units exist');
assert(read('src/utils/hassanQuoteUnits.js').includes('hassanQuoteUnitMatchesSpec'), 'Hassan quote units must fuzzy-match MetersSquared');
assert(read('src/utils/quoteCustomerOrder.js').includes('resolveDeliverySessionOrderBadges'), 'delivery badges must merge session + entry metadata');
assert(read('src/utils/quoteCustomerOrder.js').includes('isHassanOrderDeliverySession'), 'delivery badges must distinguish Hassan orders from catalog WHD');
assert(read('src/WarehouseDeliveries.js').includes('quote_production_routing'), 'warehouse deliveries must load quote routing for order badges');
assert(read('src/WarehouseDeliveries.js').includes('orderBadgesFromQuoteRoutingMetadata')
  || read('src/WarehouseDeliveries.js').includes('resolveDeliverySessionOrderBadges(session, entries, quoteRoutingMeta)'),
  'warehouse deliveries must pass quote routing into badge resolver');

const {
  filterHassanQuoteUnits,
  hassanQuoteUnitDisplayLabel,
} = require(path.join(root, 'src/utils/hassanQuoteUnits.js'));
const sqUnits = filterHassanQuoteUnits([
  { id: '1', name: 'Meters Squared', abbreviation: 'm²' },
  { id: '2', name: 'Pieces', abbreviation: 'Pc(s)' },
]);
assert(sqUnits.length === 2, 'filter must match spaced Meters Squared and Pieces');
assert(hassanQuoteUnitDisplayLabel(sqUnits[0]) === 'Pc(s)', 'pieces unit must list before m²');
assert(hassanQuoteUnitDisplayLabel(sqUnits[1]) === 'm²', 'area unit must display as m²');
assert(read('src/BackToDashboard.js').includes('enterprise-theme'), 'BackToDashboard must hide on portal chrome');
assert(!read('src/AppChrome.js').includes('ent-back-btn'), 'AppChrome must not show banner back button');

const { resolveDeliverySessionOrderBadges } = require(path.join(root, 'src/utils/quoteCustomerOrder.js'));
const catalog = resolveDeliverySessionOrderBadges(
  { metadata: { document_kind: 'delivery', driver_name: 'Edward' } },
  [{ kind: 'assembly', metadata: { finished_unit: true } }],
);
assert(!catalog.showroomOrder && !catalog.customerOrder, 'plain WHD kitwe catalog must not show Customer/Showroom badges');
const customer = resolveDeliverySessionOrderBadges(
  { metadata: { document_kind: 'order_delivery', customer_order: true, quote_number: 'QT#1' } },
  [],
);
assert(customer.customerOrder && !customer.showroomOrder, 'order_delivery customer must show Customer badge');
const showroom = resolveDeliverySessionOrderBadges(
  { metadata: { document_kind: 'order_delivery', quote_id: 'q1', quote_number: 'QT#2' } },
  [],
  { showroom_order: true, customer_order: false, quote_number: 'QT#2' },
);
assert(showroom.showroomOrder && !showroom.customerOrder, 'showroom routing must show Showroom badge');

if (!process.exitCode) console.log('verifyQuoteCustomerOrder: ok');