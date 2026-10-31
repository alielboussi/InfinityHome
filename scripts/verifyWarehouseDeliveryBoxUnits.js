/**
 * Factory → Kitwe: product labels = boxes; Hassan accept credits finished units at Kitwe.
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '../src/utils/warehouseDeliveryBoxUnits.js')).href;
  const {
    assemblyUsesWarehouseBoxLabels,
    deliveryTruckBoxesToFinishedUnits,
    deliveryFinishedUnitsFromEntryMetadata,
  } = await import(modUrl);

  const chair = { inventory_mode: 'finished', units_per_carton: 2 };
  const noPackets = [];

  assert(assemblyUsesWarehouseBoxLabels(chair, noPackets));
  assert.strictEqual(deliveryTruckBoxesToFinishedUnits(chair, noPackets, 1), 2);
  assert.strictEqual(deliveryTruckBoxesToFinishedUnits(chair, noPackets, 3), 6);

  const finishedLine = {
    quantity: 2,
    metadata: {
      finished_unit: true,
      units: 2,
      truck_boxes: 1,
      units_per_carton: 2,
    },
  };
  assert.strictEqual(deliveryFinishedUnitsFromEntryMetadata(finishedLine, [], null), 2);

  const packetLine = {
    quantity: 1,
    metadata: {
      packet_id: 'p1',
      units: 2,
      truck_boxes: 1,
      units_per_carton: 2,
    },
  };
  assert.strictEqual(deliveryFinishedUnitsFromEntryMetadata(packetLine, [{ id: 'p1' }], chair), 2);

  const mobile = require('fs').readFileSync(
    path.join(__dirname, '../server/handlers/warehouse-mobile.js'),
    'utf8',
  );
  assert(mobile.includes('stripUndefinedMetadata') || mobile.includes('deliveryEntryBoxMetadata'), 'delivery submit must omit undefined Firestore metadata');
  assert(mobile.includes('units_per_carton'), 'delivery submit must load units_per_carton');

  const kitwe = require('fs').readFileSync(
    path.join(__dirname, '../server/lib/kitweDeliveryCatalogSync.js'),
    'utf8',
  );
  assert(kitwe.includes('deliveryFinishedUnitsFromEntryMetadata'), 'Kitwe catalog must mirror finished units');

  const hassan = require('fs').readFileSync(
    path.join(__dirname, '../src/utils/warehouseDelivery.js'),
    'utf8',
  );
  assert(hassan.includes('formatDeliveryPackSummary'), 'Hassan UI must show pack summary');

  console.log('verifyWarehouseDeliveryBoxUnits: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
