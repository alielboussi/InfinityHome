/**
 * Delivery note + WhatsApp product lines include variant color as "Name - Color".
 */
const assert = require('assert');
const {
  formatWarehouseDeliveryDisplayName,
  createWarehouseDeliveryNameFormatter,
} = require('../src/utils/warehouseDeliveryDisplayName.js');
const { buildDeliveryPrintGroupsFromEntries } = require('../src/utils/warehouseDeliveryPrintGroups.js');
const { buildWarehouseDeliveryWhatsAppMessage } = require('../src/utils/buildWarehouseDeliveryWhatsAppMessage.js');

assert.strictEqual(
  formatWarehouseDeliveryDisplayName('3 Seater Recliner', 'Cream White'),
  '3 Seater Recliner - Cream White',
);

const formatter = createWarehouseDeliveryNameFormatter({
  assemblies: [{ id: 'set1', name: 'Recliner 3+2 Set', has_color_variants: true }],
  assemblyColors: [{ assembly_id: 'set1', color_id: 'c1' }],
  colors: [{ id: 'c1', name: 'Cream White' }],
});

const groups = buildDeliveryPrintGroupsFromEntries([{
  kind: 'assembly',
  name: 'Recliner 3+2 Set',
  quantity: 1,
  metadata: { assembly_id: 'set1', assembly_name: 'Recliner 3+2 Set', finished_unit: true, units: 1 },
}], formatter);

assert.strictEqual(
  groups[0].assembly_name,
  'Recliner 3+2 Set - Cream White',
  'print group title must include color',
);

const waMessage = buildWarehouseDeliveryWhatsAppMessage({
  userAlias: 'Test',
  driverName: 'Driver',
  productGroups: [{
    assemblyName: groups[0].assembly_name,
    packetLines: [],
  }],
  totalPackets: 1,
  totalProducts: 1,
});
assert(
  waMessage.includes('Recliner 3+2 Set - Cream White'),
  'WhatsApp message must include colored product name',
);

const repairWa = buildWarehouseDeliveryWhatsAppMessage({
  title: 'Repair delivery',
  extraLines: ['Repair: RT-1', 'Driver: Test Driver'],
  fromName: 'Warehouse',
  toName: 'Customer',
  userAlias: 'Test',
  productGroups: [{ assemblyName: 'Chair', units: 1, packetLines: [] }],
  totalProducts: 1,
});
assert(repairWa.includes('Repair delivery'), 'repair WhatsApp must include Repair delivery title');
assert(repairWa.includes('Repair: RT-1'), 'repair WhatsApp must include return number');
assert(repairWa.startsWith('Repair delivery'), 'repair title must lead the WhatsApp message');

console.log('verifyWarehouseDeliveryDisplayName: ok');
