const assert = require('assert');
const path = require('path');

const {
  isCompleteCatalogProduct,
  isIncompletePacketBomProduct,
  isStoreroomMaterialAssembly,
  WAREHOUSE_INVENTORY_MODE,
} = require(path.join(__dirname, '../mobile-apps/shared/warehouseCatalogProductCompleteness.js'));

const finishedOnly = {
  id: '1',
  item_kind: 'product',
  inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
  packet_count: 14,
  units_per_carton: 2,
};
const stalePacketLinks = [{ id: 'p1', qty_per_unit: 2 }];

assert.strictEqual(isIncompletePacketBomProduct(finishedOnly, stalePacketLinks), false);
assert.strictEqual(isCompleteCatalogProduct(finishedOnly, stalePacketLinks), true);

const packetBom = {
  id: '2',
  item_kind: 'product',
  inventory_mode: WAREHOUSE_INVENTORY_MODE.PACKETS,
  packet_count: 14,
};
const badLinks = [{ id: 'a', qty_per_unit: 4 }, { id: 'b', qty_per_unit: 4 }];
assert.strictEqual(isIncompletePacketBomProduct(packetBom, badLinks), true);
assert.strictEqual(isCompleteCatalogProduct(packetBom, badLinks), false);

const goodLinks = [{ id: 'a', qty_per_unit: 7 }, { id: 'b', qty_per_unit: 7 }];
assert.strictEqual(isIncompletePacketBomProduct(packetBom, goodLinks), false);
assert.strictEqual(isCompleteCatalogProduct(packetBom, goodLinks), true);

assert.strictEqual(isIncompletePacketBomProduct(packetBom, []), true);
assert.strictEqual(isCompleteCatalogProduct(packetBom, []), false);

const storeroomMaterial = {
  id: 'sr',
  item_kind: 'product',
  inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
  metadata: { storeroom: { is_storeroom_material: true } },
};
assert.strictEqual(isStoreroomMaterialAssembly(storeroomMaterial), true);
assert.strictEqual(isCompleteCatalogProduct(storeroomMaterial, []), false);

console.log('verifyWarehouseCatalogProductCompleteness: ok');
