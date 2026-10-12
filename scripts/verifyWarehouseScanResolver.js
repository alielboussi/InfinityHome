const assert = require('assert');
const {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  normalizeWarehouseScan,
  resolvePacketFromScan,
} = require('../src/utils/warehouseScanResolver.js');

const venonPackets = [
  { id: '1', sku: '12VEM3300P01COCZ', name: 'Pk1' },
  { id: '2', sku: '12VEM3300P02COCZ', name: 'Pk2' },
];

assert.strictEqual(
  normalizeWarehousePacketScan('X112VEM3300P01COCZ-222816011492'),
  '12VEM3300P01COCZ',
);
assert.strictEqual(
  resolvePacketFromScan('X112VEM3300P01COCZ-222816011492', venonPackets)?.id,
  '1',
);

assert.strictEqual(
  normalizeWarehousePacketScan('X220AHEGEV100000002-242725011313'),
  '20AHEGEV100000002',
);
assert.strictEqual(
  normalizeWarehousePacketScan('X330EXAMPLECODE000-999999999999'),
  '30EXAMPLECODE000',
);

const heraPackets = [
  { id: 'h', sku: 'TU20AHEGEV100000002', name: 'Hera pkt' },
];
assert.strictEqual(
  resolvePacketFromScan('X220AHEGEV100000002-242725011313', heraPackets)?.id,
  'h',
);
assert.strictEqual(
  resolvePacketFromScan('TU20AHEGEV100000002', heraPackets)?.id,
  'h',
);

assert.strictEqual(
  resolvePacketFromScan('YY00103320549622VEM3300COCZ', [{ id: 'x', sku: '22VEM3300COCZ' }])?.id,
  'x',
);

assert.strictEqual(
  normalizeWarehousePacketScan('X112VEM3300P01COCZ-222816011492'),
  '12VEM3300P01COCZ',
);
assert.strictEqual(
  normalizeWarehousePacketScan('12VEM3300P01COCZ-222816011492'),
  '12VEM3300P01COCZ',
);
assert.strictEqual(normalizeWarehousePacketScan('22VEM3300COCZ'), '22VEM3300COCZ');
assert.strictEqual(
  normalizeWarehousePacketScan('XX23TAI62610120001-242813004516'),
  '23TAI62610120001',
);
assert.strictEqual(
  normalizeWarehousePacketScan('X213TAI62610P1120001-242813004516'),
  '13TAI62610P1120001',
);
assert.strictEqual(
  normalizeWarehousePacketScan('yy99999999999923tai62610120001'),
  '23TAI62610120001',
);

assert.strictEqual(
  normalizeWarehousePacketScan('X23A9SEIY7601000036-242710023086'),
  '23A9SEIY7601000036',
);
assert.strictEqual(
  resolvePacketFromScan(
    'X23A9SEIY7601000036-242710023086',
    [{ id: 'serra', sku: '23A9SEIY7601000036' }],
  )?.id,
  'serra',
);

assert.strictEqual(
  normalizeWarehouseProductSku('0024281300451623TAI62610120001'),
  '23TAI62610120001',
);
assert.strictEqual(
  normalizeWarehouseProductSku('22TAI3150UJ0B'),
  '22TAI3150UJ0B',
);
assert.strictEqual(
  normalizeWarehouseProductSku('0024281300451623TAI62610120001-242813004516'),
  '23TAI62610120001',
);
assert.strictEqual(
  normalizeWarehouseProductSku('X112VEM3300P01COCZ'),
  'X112VEM3300P01COCZ',
);

assert.strictEqual(normalizeWarehouseScan('X112VEM3300P01COCZ'), '12VEM3300P01COCZ');

console.log('verifyWarehouseScanResolver: ok');
