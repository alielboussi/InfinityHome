const assert = require('assert');
const path = require('path');

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
