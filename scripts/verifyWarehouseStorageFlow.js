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
].forEach((op) => assert(mobile.includes(`'${op}'`), `warehouse-mobile must handle ${op}`));

assert(fs.existsSync(path.join(root, 'src/WarehouseStorage.js')), 'Hassan Warehouse Storage page must exist');
assert(read('src/AppChrome.js').includes('/warehouse-storage'), 'nav must include Warehouse Storage');
assert(read('mobile-apps/warehouse-production/screens/SoldOrdersScreen.js').includes('storage-send-list'), 'Sold screen must list storage sends');

console.log('verifyWarehouseStorageFlow: OK');
