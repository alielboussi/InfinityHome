/**
 * Label color line when variant colors exist on the product.
 */
const assert = require('assert');
const {
  formatWarehouseProductionLabelColor,
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

console.log('verifyWarehouseProductionLabelColor: ok');
