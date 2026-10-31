/**
 * Warehouse Products page must filter /warehouse-products/uncategorized.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'src/WarehouseProductsPage.js'), 'utf8');

assert(page.includes('isUncategorizedView'), 'WarehouseProductsPage must detect uncategorized route');
assert(
  page.includes('isUncategorizedWarehouseProduct'),
  'WarehouseProductsPage must filter with isUncategorizedWarehouseProduct',
);

const {
  isUncategorizedWarehouseProduct,
} = require(path.join(root, 'src/utils/warehouseCatalogProductCompleteness.js'));

const categories = [{ id: 'cat-1', name: 'Sofas' }];
assert.strictEqual(
  isUncategorizedWarehouseProduct({ item_kind: 'product', category_id: null }, categories),
  true,
);
assert.strictEqual(
  isUncategorizedWarehouseProduct({ item_kind: 'product', category_id: 'cat-1' }, categories),
  false,
);
assert.strictEqual(
  isUncategorizedWarehouseProduct({ item_kind: 'product', category_id: 'missing' }, categories),
  true,
);

console.log('verifyWarehouseUncategorizedView: ok');
