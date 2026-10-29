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
  'return-order-complete',
  'return-order-ship-prepare',
  'return-order-ship-submit',
  'return-order-customer-label-print',
  'return-kitwe-products-list',
  'return-quote-customers-list',
].forEach((op) => assert(mobile.includes(`'${op}'`), `warehouse-mobile must handle ${op}`));

assert(returns.includes('quote_customers'), 'returns must load quote customers for Hassan');

assert(fs.existsSync(path.join(root, 'server/lib/zebraReturnCustomerLabelZpl.js')), 'return customer ZPL builder must exist');
const zpl = read('server/lib/zebraReturnCustomerLabelZpl.js');
assert(!zpl.includes('^BQN'), 'return customer label must not include QR');
assert(zpl.includes('Customer Name:'), 'return customer label must include Customer Name');
assert(zpl.includes('Customer #:'), 'return customer label must include Customer #');
assert(zpl.includes('Product Name:'), 'return customer label must use Product Name');

assert(reasons.includes('Upholstery'), 'return reasons must include Upholstery group');
assert(reasons.includes('Legs'), 'return reasons must include Legs');
assert(returns.includes('RO'), 'return numbers must use RO prefix');
assert(returns.includes('factory_stock_added_at'), 'complete must add factory warehouse stock');
assert(returns.includes('kitwe_deducted_at'), 'create must deduct Kitwe only until complete');
assert(chrome.includes('/warehouse-returns'), 'Hassan nav must link Returns');
assert(chrome.includes('Returns Trackage'), 'Hassan nav must link Returns Trackage');

const returnScreen = read('mobile-apps/warehouse-production/screens/ReturnOrdersScreen.js');
assert(returnScreen.includes('onToggleLocale={toggleLocale}'), 'returns must use kiosk locale toggle');
assert(!returnScreen.includes("mode: 'complete'"), 'complete must not open signature screen');
assert(returnScreen.includes("tUi('returnAccept'"), 'returns actions must use i18n');
assert(!returnScreen.includes('forceArabic: true'), 'returns must not lock locale to Arabic');

const noteHtml = read('src/utils/buildDeliveryNotePrintHtml.js');
assert(noteHtml.includes("'Return Note'"), 'return A4 header must say Return Note');
assert(!noteHtml.includes('Return Delivery'), 'return A4 must not use Return Delivery title');

console.log('verifyWarehouseReturnFlow: OK');
