/**
 * Kitwe set components hidden from catalog; POS restock marks loose.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const visibility = fs.readFileSync(path.join(root, 'src/utils/kitweCatalogComponentVisibility.js'), 'utf8');
const kitwePage = fs.readFileSync(path.join(root, 'src/KitweProductsPage.js'), 'utf8');
const posCatalog = fs.readFileSync(path.join(root, 'src/utils/posKitweCatalog.js'), 'utf8');
const saleDeduction = fs.readFileSync(path.join(root, 'server/lib/kitweWarehouseSaleDeduction.js'), 'utf8');

assert(
  fs.readFileSync(path.join(root, 'src/utils/kitweSetStock.js'), 'utf8').includes('buildKitweCatalogSetComponentIds'),
  'Kitwe set stock must hide set components from product list',
);
assert(visibility.includes('kitwe_catalog_loose'), 'loose metadata key must exist');
assert(kitwePage.includes('kitwe-set-component-link'), 'Kitwe page must link set components');
assert(kitwePage.includes('openEditSet'), 'Kitwe page must allow set edit');
assert(posCatalog.includes('shouldShowKitweCatalogProductRow'), 'POS Kitwe catalog must hide set components');
assert(saleDeduction.includes('markKitweCatalogLooseServer'), 'POS restock must mark catalog loose');

console.log('verifyKitweSetComponentVisibility: ok');
