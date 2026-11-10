/**
 * Set deliveries: card progress must match Kitwe tick rows (set-component finished units).
 * Run: node scripts/verifyWarehouseDeliveryReceiverProgress.js
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const root = path.join(__dirname, '..');
  const mod = await import(
    pathToFileURL(path.join(root, 'src/utils/warehouseDelivery.js')).href
  );

  const entries = [
    { id: 'parent', kind: 'set-parent', name: 'Johanson Set', combo_id: 'c1' },
    {
      id: 'chair',
      kind: 'set-component',
      combo_id: 'c1',
      name: 'Armchair',
      quantity: 2,
      metadata: { finished_unit: true, receiver_checked_at: '2026-01-01T00:00:00Z' },
    },
    {
      id: 'table',
      kind: 'set-component',
      combo_id: 'c1',
      name: 'Coffee Table',
      quantity: 1,
      metadata: { finished_unit: true },
    },
    {
      id: 'loose',
      kind: 'product',
      name: 'Loose item',
      quantity: 1,
      metadata: { finished_unit: true },
    },
  ];

  const ticks = mod.warehouseDeliveryReceiverTickRows(entries);
  assert.strictEqual(ticks.length, 3, 'finished set-components and loose product must be tick rows');

  const progress = mod.deliveryEntryReceiverProgress(entries);
  assert.strictEqual(progress.total, 3);
  assert.strictEqual(progress.confirmed, 1);

  const kinds = entries.map((e) => mod.warehouseDeliveryReceiverLineKind(e));
  assert(kinds[0] === 'assembly-header', 'set parent is a group header');
  assert(kinds[1] === 'receiver-line' && kinds[2] === 'receiver-line', 'set components are tickable');

  const sentLine = {
    id: 'sent',
    kind: 'product',
    name: 'Order chair',
    quantity: 1,
    metadata: {
      finished_unit: true,
      sent_to_customer: true,
      sent_to_customer_at: '2026-01-01T00:00:00Z',
      receiver_checked_at: '2026-01-01T00:00:00Z',
      received_at: '2026-01-01T00:00:00Z',
      assembly_id: 'asm-sent',
    },
  };
  assert.strictEqual(mod.deliveryEntrySentToCustomer(sentLine), true);
  assert.strictEqual(mod.deliveryCustomerSentLines([sentLine, entries[3]]).length, 1);

  const catalog = await import(
    pathToFileURL(path.join(root, 'server/lib/kitweDeliveryCatalogSync.js')).href
  );
  const kitweUnits = catalog.assemblyUnitsFullyReceived([sentLine]);
  assert.strictEqual(kitweUnits.size, 0, 'sent-to-customer units must not enter Kitwe catalog');

  const kitweLine = {
    ...sentLine,
    id: 'kitwe',
    metadata: {
      ...sentLine.metadata,
      sent_to_customer: false,
      sent_to_customer_at: null,
      assembly_id: 'asm-kitwe',
    },
  };
  const mixed = catalog.assemblyUnitsFullyReceived([kitweLine]);
  assert.strictEqual(mixed.get('asm-kitwe'), 1);

  const wdSrc = require('fs').readFileSync(path.join(root, 'src/utils/warehouseDelivery.js'), 'utf8');
  assert(
    !wdSrc.includes("set-parent' || line?.kind === 'set-component') return 'skip'"),
    'must not skip all set lines',
  );

  console.log('verifyWarehouseDeliveryReceiverProgress: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
