/**
 * KITWE_PRODUCTS_SET_DISPLAY_LOCKED — regression for /kitwe-products set rows.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const stock = fs.readFileSync(path.join(root, 'src/utils/kitweSetStock.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/KitweProductsPage.js'), 'utf8');

assert(stock.includes('KITWE_PRODUCTS_SET_DISPLAY_LOCKED'), 'kitweSetStock must carry lock marker');
assert(stock.includes('isKitweCatalogSetAssembly'), 'Kitwe sets must use isKitweCatalogSetAssembly');
assert(stock.includes('assemblyHasKitweSetRecipe'), 'Kitwe sets must detect Kitwe recipe rows');
assert(
  stock.includes('filter((a) => isKitweCatalogSetAssembly(a, setItems))'),
  'listKitweWarehouseSets must filter with isKitweCatalogSetAssembly',
);
assert(page.includes('kitwe-expand-btn'), 'Kitwe page must render set expand control');
assert(page.includes('kitwe-set-panel'), 'Kitwe page must render set component inlay panel');
assert(page.includes('KITWE_PRODUCTS_SET_DISPLAY_LOCKED'), 'KitweProductsPage must reference lock marker');

console.log('verifyKitweProductsSetDisplay: ok');