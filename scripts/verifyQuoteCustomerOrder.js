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

if (!process.exitCode) console.log('verifyQuoteCustomerOrder: ok');