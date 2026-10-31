/**
 * Bulk warehouse label print jobs (copies = complete units at warehouse).
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '../src/utils/warehouseBulkLabelPrint.js')).href;
  const {
    buildWarehouseBulkLabelPrintJobs,
    warehouseProductLabelCopiesAtLocation,
  } = await import(modUrl);

  const loc = 'wh-1';
  const stock = new Map([
    ['a1', new Map([[loc, 5]])],
    ['a2', new Map([[loc, 0]])],
  ]);

  assert.strictEqual(
    warehouseProductLabelCopiesAtLocation({ id: 'a1' }, loc, stock),
    5,
  );

  const jobs = buildWarehouseBulkLabelPrintJobs(
    [
      { id: 'a1', name: 'Sofa', family_sku: 'SKU1', has_color_variants: false },
      { id: 'a2', name: 'Chair', family_sku: 'SKU2' },
    ],
    {
      warehouseLocationId: loc,
      finishedStockByAssembly: stock,
      colorsByAssembly: new Map(),
      selectedIds: new Set(['a1', 'a2']),
    },
  );

  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].copies, 5);

  const boxAssembly = {
    id: 'box1',
    name: 'Vanessa Dining Chair',
    family_sku: 'SKU3',
    inventory_mode: 'finished',
    units_per_carton: 2,
  };
  const boxPacket = [{ id: 'p1', qty_per_unit: 1 }];
  const boxStock = new Map([['box1', new Map([[loc, 6]])]]);
  const boxJobs = buildWarehouseBulkLabelPrintJobs([boxAssembly], {
    warehouseLocationId: loc,
    finishedStockByAssembly: boxStock,
    colorsByAssembly: new Map(),
    packetsByAssembly: new Map([['box1', boxPacket]]),
  });
  assert.strictEqual(boxJobs.length, 1);
  assert.strictEqual(boxJobs[0].copies, 3);
  assert.strictEqual(boxJobs[0].boxUnitsPerCarton, 2);

  const finishedNoPacket = {
    id: 'box2',
    name: 'Alya Dining Chair',
    family_sku: '3002791082000020',
    inventory_mode: 'finished',
    units_per_carton: 2,
  };
  const finishedNoPacketStock = new Map([['box2', new Map([[loc, 4]])]]);
  const noPktJobs = buildWarehouseBulkLabelPrintJobs([finishedNoPacket], {
    warehouseLocationId: loc,
    finishedStockByAssembly: finishedNoPacketStock,
    colorsByAssembly: new Map(),
    packetsByAssembly: new Map([['box2', []]]),
  });
  assert.strictEqual(noPktJobs.length, 1);
  assert.strictEqual(noPktJobs[0].copies, 2);
  assert.strictEqual(noPktJobs[0].boxUnitsPerCarton, 2);

  const page = require('fs').readFileSync(
    path.join(__dirname, '../src/WarehouseProductsPage.js'),
    'utf8',
  );
  assert(page.includes('WarehouseCatalogBulkLabelToolbar'), 'bulk label toolbar required');

  console.log('verifyWarehouseBulkLabelPrint: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
