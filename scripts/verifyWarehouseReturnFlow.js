/**
 * Static checks for Kitwe return orders (Hassan → factory → production → ship).
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

const mobile = read('server/handlers/warehouse-mobile.js');
const reasons = read('src/utils/warehouseReturnReasons.js');
const returns = read('server/lib/warehouseReturnOrders.js');
const chrome = read('src/AppChrome.js');

[
  'return-order-create',
  'return-order-list',
  'return-order-accept',
  'return-order-pause',
  'return-order-resume',
  'return-order-complete',
  'return-order-customer-delivery-prepare',
  'return-order-customer-delivery-submit',
  'return-order-ship-submit',
  'return-order-customer-label-print',
  'return-kitwe-products-list',
  'return-quote-customers-list',
].forEach((op) => assert(mobile.includes(`'${op}'`), `warehouse-mobile must handle ${op}`));

assert(returns.includes('quote_customers'), 'returns must load quote customers for Hassan');

assert(fs.existsSync(path.join(root, 'server/lib/zebraReturnCustomerLabelZpl.js')), 'return customer ZPL builder must exist');
const zpl = read('server/lib/zebraReturnCustomerLabelZpl.js');
assert(!zpl.includes('^BQN') || zpl.includes('returnNotePdfUrl'), 'return customer label QR only when PDF URL provided');
assert(zpl.includes('Customer Name:'), 'return customer label must include Customer Name');
assert(zpl.includes('Customer #:'), 'return customer label must include Customer #');
assert(zpl.includes('Product Name:'), 'return customer label must use Product Name');

assert(reasons.includes('Upholstery'), 'return reasons must include Upholstery group');
assert(reasons.includes('Legs'), 'return reasons must include Legs');
assert(returns.includes('RO'), 'return numbers must use RO prefix');
assert(returns.includes('factory_stock_added_at'), 'complete must add factory warehouse stock');
assert(returns.includes('buildKitweReturnProductOptions'), 'returns must list Kitwe catalog products with stock');
assert(returns.includes('canWarehouseKitweReturnCreator'), 'returns API must allow login-access admin like deliveries');
assert(returns.includes('allocateWarehouseReturnDeliveryNumber'), 'return shipments must use WHR/CR note numbers');
assert(returns.includes('repair_department'), 'returns list must filter repair_department');
assert(fs.existsSync(path.join(root, 'src/utils/warehouseReturnRepairDepartment.js')), 'repair department helper must exist');
assert(returns.includes('CUSTOMER_DELIVERED'), 'customer fulfillment status must exist');
assert(returns.includes('pos_sale_id: saleId'), 'receipt returns must set pos_sale_id column');
assert(returns.includes('uploadWarehouseReturnDeliveryNotePdf'), 'CR submit must host delivery note PDF for label QR');
assert(returns.includes('AWAITING_KITWE_ACCEPT'), 'WHR ship must await Hassan Kitwe accept');
assert(returns.includes('floor1_awaiting_hassan'), 'no-customer complete must flag Floor 1 lifecycle');
assert(fs.existsSync(path.join(root, 'docs/sql/warehouse_return_orders_pos_sale.sql')), 'pos_sale migration SQL must be documented');
assert(read('src/utils/warehouseReturnOrder.js').includes('returnOrderLifecycleBadge'), 'lifecycle badge helper required');
assert(returns.includes('finalizeReturnShipmentOnKitweAccept'), 'Hassan accept must finalize WHR return order');
assert(read('server/lib/warehouseDeliveryAccept.js').includes('moveReturnShipmentAssembliesToKitwe'), 'WHR accept must add Kitwe stock only');
assert(returns.includes('kitwe_restored_at'), 'ship back must restore Kitwe stock per unit on accept');
assert(returns.includes('factory_stock_removed_at'), 'customer label must deduct factory stock');
assert(read('src/WarehouseReturns.js').includes('loadReturnQuoteCustomers'), 'returns must fallback to quote_customers catalog');
assert(read('src/utils/warehouseReturnReasons.js').includes('returnReasonShowsLeatherCode'), 'leather code reasons helper required');
assert(chrome.includes('/warehouse-returns'), 'Hassan nav must link Returns');
assert(chrome.includes('/warehouse-repairs-admin'), 'catalog nav must link Repairs admin');
assert(chrome.includes('Returns Trackage'), 'Hassan nav must link Returns Trackage');
assert(
  read('src/WarehouseReturnsTrackage.js').includes('REPAIR_DEPARTMENTS'),
  'returns trackage must group by repair department',
);
assert(
  !read('server/lib/warehouseReturnOrders.js').includes('trackageOnly) {\n    query = query.in'),
  'trackage must not filter to completed-only statuses',
);

assert(
  !fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/delivery-screens/ReturnOrdersScreen.js')),
  'warehouse-delivery must not ship ReturnOrdersScreen — repairs use workshop apps only',
);
assert(
  !fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/screens/ReturnOrdersScreen.js')),
  'warehouse-delivery deliveryKit must not ship ReturnOrdersScreen',
);

const returnScreenRel = [
  'mobile-apps/warehouse-upholstery/screens/WarehouseRepairsScreen.js',
  'mobile-apps/warehouse-production/screens/ReturnOrdersScreen.js',
].find((rel) => fs.existsSync(path.join(root, rel)));
assert(returnScreenRel, 'Workshop WarehouseRepairsScreen (or legacy production ReturnOrders) must exist');
const returnScreen = read(returnScreenRel);
assert(returnScreen.includes('onToggleLocale={toggleLocale}') || returnScreen.includes('toggleLocale'), 'returns must use kiosk locale toggle');
assert(!returnScreen.includes("mode: 'complete'"), 'complete must not open signature screen without prepare');
assert(returnScreen.includes("tUi('returnAccept'") || returnScreen.includes('returnAccept'), 'returns actions must use i18n');
assert(!returnScreen.includes('forceArabic: true'), 'returns must not lock locale to Arabic');
assert(returnScreen.includes('repairDispositionFloor1'), 'workshop repairs must offer Floor 1 vs delivery on stop');
assert(returnScreen.includes('RepairReturnSignature'), 'workshop repairs must navigate to RepairReturnSignature');
assert(!returns.includes('await adjustAssemblyStock(sb, row.assembly_id, KITWE_LOCATION_ID, qty);\n\n  await sb.from(\'warehouse_delivery_sessions\')'), 'WHR submit must not restore Kitwe before Hassan accept');

const noteHtml = read('src/utils/buildDeliveryNotePrintHtml.js');
assert(noteHtml.includes("'Return Note'"), 'return A4 header must say Return Note');
assert(noteHtml.includes('return_customer_delivery'), 'delivery note HTML must support return customer delivery kind');

console.log('verifyWarehouseReturnFlow: OK');
