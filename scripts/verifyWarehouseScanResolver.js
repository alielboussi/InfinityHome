const assert = require('assert');
const {
  normalizeWarehouseScan,
  resolvePacketFromScan,
} = require('../src/utils/warehouseScanResolver.js');

const venonPackets = [
  { id: '1', sku: '12VEM3300P01COCZ', name: 'Pk1' },
  { id: '2', sku: '12VEM3300P02COCZ', name: 'Pk2' },
];

assert.strictEqual(
  normalizeWarehouseScan('X112VEM3300P01COCZ-222816011492'),
  '12VEM3300P01COCZ',
);
assert.strictEqual(
  resolvePacketFromScan('X112VEM3300P01COCZ-222816011492', venonPackets)?.id,
  '1',
);

assert.strictEqual(
  normalizeWarehouseScan('X220AHEGEV100000002-242725011313'),
  '20AHEGEV100000002',
);
assert.strictEqual(
  normalizeWarehouseScan('X330EXAMPLECODE000-999999999999'),
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

console.log('verifyWarehouseScanResolver: ok');
