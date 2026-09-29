const assert = require('assert');
const {
  analyzeAssemblyPacketBom,
  assemblableUnits,
} = require('../src/utils/warehouseAssemblyMath.js');

const classic = [
  { id: 'a', packet_number: 1, qty_per_unit: 1 },
  { id: 'b', packet_number: 2, qty_per_unit: 1 },
  { id: 'c', packet_number: 3, qty_per_unit: 1 },
  { id: 'd', packet_number: 4, qty_per_unit: 1 },
];
assert.strictEqual(analyzeAssemblyPacketBom(4, classic).isComplete, true);

const taliaStyle = [
  { id: '1', packet_number: 1, qty_per_unit: 1 },
  { id: '3', packet_number: 3, qty_per_unit: 2 },
  { id: '4', packet_number: 4, qty_per_unit: 1 },
  { id: '5', packet_number: 5, qty_per_unit: 1 },
  { id: '6', packet_number: 6, qty_per_unit: 1 },
];
const taliaBom = analyzeAssemblyPacketBom(6, taliaStyle);
assert.strictEqual(taliaBom.isComplete, true);
assert.strictEqual(taliaBom.cartonsPerUnit, 6);

const inv = new Map([
  ['1', 10],
  ['3', 20],
  ['4', 10],
  ['5', 10],
  ['6', 10],
]);
assert.strictEqual(assemblableUnits(taliaStyle, inv, 6), 10);

assert.strictEqual(analyzeAssemblyPacketBom(6, taliaStyle.slice(0, 4)).isComplete, false);

const {
  effectivePacketOnHandForAssembly,
  normalizeAssemblyPacketRows,
  communalPacketPoolStats,
} = require('../src/utils/warehouseAssemblyPacketPool.js');

const twoProductLinks = [
  { assembly_id: 'nightstand', packet_id: 'cartonA', qty_per_unit: 1 },
  { assembly_id: 'chiffonier', packet_id: 'cartonA', qty_per_unit: 1 },
];
assert.strictEqual(
  effectivePacketOnHandForAssembly('cartonA', 'nightstand', 2, twoProductLinks),
  1,
);
assert.strictEqual(
  effectivePacketOnHandForAssembly('cartonA', 'chiffonier', 2, twoProductLinks),
  1,
);

const pktList = [{ id: 'cartonA', qty_per_unit: 1 }];
const poolInv = new Map([['cartonA', 2]]);
assert.strictEqual(
  assemblableUnits(pktList, poolInv, 1, { assemblyId: 'chiffonier', assemblyPacketRows: twoProductLinks }),
  1,
);

const threeProducts = [
  { assembly_id: 'a', packet_id: 'shared', qty_per_unit: 1 },
  { assembly_id: 'b', packet_id: 'shared', qty_per_unit: 1 },
  { assembly_id: 'c', packet_id: 'shared', qty_per_unit: 1 },
];
const communal = communalPacketPoolStats('shared', 10, threeProducts);
assert.strictEqual(communal.completeRounds, 3);
assert.strictEqual(communal.excessCartons, 1);
assert.strictEqual(
  assemblableUnits(
    [{ id: 'shared', qty_per_unit: 1 }],
    new Map([['shared', 10]]),
    1,
    { assemblyId: 'b', assemblyPacketRows: threeProducts },
  ),
  3,
);

const mixedQty = [
  { assembly_id: 'a', packet_id: 'shared', qty_per_unit: 2 },
  { assembly_id: 'b', packet_id: 'shared', qty_per_unit: 1 },
  { assembly_id: 'c', packet_id: 'shared', qty_per_unit: 1 },
];
assert.strictEqual(communalPacketPoolStats('shared', 10, mixedQty).excessCartons, 2);
assert.strictEqual(
  assemblableUnits(
    [{ id: 'shared', qty_per_unit: 2 }],
    new Map([['shared', 10]]),
    2,
    { assemblyId: 'a', assemblyPacketRows: mixedQty },
  ),
  2,
);

const legacyPackets = [
  { id: 'taliaPkt', assembly_id: 'taliaTv', qty_per_unit: 1 },
];
const partialJunction = [
  { assembly_id: 'other', packet_id: 'shared', qty_per_unit: 1 },
];
normalizeAssemblyPacketRows(partialJunction, legacyPackets);
assert.strictEqual(
  assemblableUnits(
    [{ id: 'taliaPkt', qty_per_unit: 1 }],
    new Map([['taliaPkt', 5]]),
    1,
    { assemblyId: 'taliaTv', assemblyPacketRows: partialJunction, catalogPackets: legacyPackets },
  ),
  5,
);

console.log('verifyWarehouseAssemblyMath: ok');
