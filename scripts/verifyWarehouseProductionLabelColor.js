/**
 * Label color line when variant colors exist on the product.
 */
const assert = require('assert');
const {
  formatWarehouseProductionLabelColor,
  formatWarehouseAssemblySelectLabel,
} = require('../src/utils/warehouseProductionLabelColor.js');

assert.strictEqual(
  formatWarehouseProductionLabelColor(
    { has_color_variants: false },
    [{ name: 'Grey' }, { name: 'Beige' }],
  ),
  'Grey, Beige',
  'must show linked colors even when has_color_variants is false',
);

assert.strictEqual(
  formatWarehouseProductionLabelColor({ has_color_variants: true }, []),
  '',
  'empty color list stays empty',
);

assert.strictEqual(
  formatWarehouseAssemblySelectLabel(
    { name: '2 Seater Recliner', family_sku: 'ABC123' },
    [{ name: 'Mavi' }],
  ),
  '2 Seater Recliner — Mavi (ABC123)',
  'select label includes color before SKU',
);

assert.strictEqual(
  formatWarehouseAssemblySelectLabel(
    { name: 'Coffee Table', family_sku: 'XYZ' },
    [],
  ),
  'Coffee Table (XYZ)',
  'select label without colors unchanged',
);

console.log('verifyWarehouseProductionLabelColor: ok');
