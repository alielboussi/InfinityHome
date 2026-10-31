/**
 * Warehouse Storage / Sold flow static checks.
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
[
  'storage-pos-sales-list',
  'storage-pos-sale-detail',
  'storage-send-submit',
  'storage-send-list',
  'storage-deliver-submit',
  'production-push-register',
].forEach((op) => assert(mobile.includes(`'${op}'`), `warehouse-mobile must handle ${op}`));

assert(fs.existsSync(path.join(root, 'src/WarehouseStorage.js')), 'Hassan Warehouse Storage page must exist');
assert(read('src/AppChrome.js').includes('/warehouse-storage'), 'nav must include Warehouse Storage');
assert(read('src/AppChrome.js').includes('/warehouse-repairs-admin'), 'nav must include Repairs admin');
assert(read('src/AppChrome.js').includes('/warehouse-sales-storage-admin'), 'nav must include Sales Storage admin');
assert(read('server/lib/warehouseStorageSends.js').includes('kitwe_deducted_at'), 'storage send must deduct Kitwe stock');
assert(read('server/lib/warehouseStorageSends.js').includes('KITWE_LOCATION_ID'), 'storage send must adjust Kitwe location');
assert(read('mobile-apps/warehouse-production/screens/SoldOrdersScreen.js').includes('storage-send-list'), 'Sold screen must list storage sends');

assert(read('src/utils/warehouseReturnReasons.js').includes('returnReasonShowsLeatherCode'), 'leather code must be gated by reason');
assert(read('src/WarehouseReturns.js').includes('returnReasonShowsLeatherCode'), 'returns UI must gate leather code');
assert(read('src/Quotationer.js').includes("from('quote_customers')"), 'quotationer customers must load from quote_customers');
assert(read('server/lib/warehouseStorageSends.js').includes('canWarehouseKitweStorageCreator'), 'storage API must allow login-access admin');
assert(read('src/utils/warehouseStoragePosSales.js').includes('loadKitwePosSaleDetailForStoragePage'), 'storage page must load receipt lines from client');
assert(read('server/lib/warehouseStorageSends.js').includes('saleIdEqVariants'), 'storage sale detail must coerce numeric sale_id for Firestore');

console.log('verifyWarehouseStorageFlow: OK');
