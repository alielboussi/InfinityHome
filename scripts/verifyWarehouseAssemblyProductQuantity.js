const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalog = fs.readFileSync(path.join(root, 'src/services/warehouseCatalog.js'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'server/lib/warehouseCatalogMobile.js'), 'utf8');
const portalPage = fs.readFileSync(path.join(root, 'src/WarehouseProductsPage.js'), 'utf8');
assert(catalog.includes('portalStockCorrection'), 'web catalog must gate decreases with portalStockCorrection');
assert(!portalPage.includes('incrementOnly'), 'portal uses portalStockCorrection not raw incrementOnly');
assert(portalPage.includes('portalStockCorrection'), 'WarehouseProductsPage must pass portalStockCorrection');
assert(mobile.includes('assertWarehouseProductQtyIncrementOnly(current, target)'), 'mobile API must stay increment-only');

const {
  assertWarehouseProductQtyIncrementOnly,
  packetCartonsForAssemblyTargetUnits,
} = require(path.join(__dirname, '../src/utils/warehouseAssemblyProductQuantity.js'));

assert.throws(
  () => assertWarehouseProductQtyIncrementOnly(5, 3),
  /cannot decrease/i,
);
assertWarehouseProductQtyIncrementOnly(2, 3);

const packets = [
  { id: 'a', qty_per_unit: 4 },
  { id: 'b', qty_per_unit: 5 },
];
const scaled = packetCartonsForAssemblyTargetUnits(packets, 3);
assert.deepStrictEqual(scaled, [
  { packetId: 'a', quantity: 12 },
  { packetId: 'b', quantity: 15 },
]);

console.log('verifyWarehouseAssemblyProductQuantity: ok');
