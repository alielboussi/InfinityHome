/**
 * Production portal scope + mobile auto-select routing.
 */
import assert from 'node:assert/strict';
import { productionPortalProductIdSet } from '../src/utils/productionPortalCatalog.js';

function resolvePortalChannel(clientSource, explicit) {
  const fromBody = String(explicit || '').trim().toLowerCase();
  if (fromBody === 'carpentry' || fromBody === 'upholstery') return fromBody;
  const src = String(clientSource || '').trim();
  if (src === 'carpentry_workshop_app') return 'carpentry';
  if (src === 'warehouse_production_app' || src === 'upholstery_production_app') return 'upholstery';
  return '';
}

function resolveFloor2SeedQuantity(body, initialQty = 0) {
  const raw = body?.floor2_quantity
    ?? body?.floor2_product_qty
    ?? body?.raw_wip_qty
    ?? body?.initial_quantity
    ?? body?.initialQuantity
    ?? initialQty;
  return Math.max(1, Math.floor(Number(raw) || 0));
}

function testPortalProductScope() {
  const wipOnlyIncomplete = 'wip-incomplete';
  const floor1Id = 'floor1-product';
  const ctx = {
    assemblies: [
      {
        id: wipOnlyIncomplete,
        name: 'WIP shell',
        item_kind: 'product',
        packet_count: 3,
        inventory_mode: 'packets',
      },
      {
        id: floor1Id,
        name: 'Chair',
        item_kind: 'product',
        inventory_mode: 'finished',
      },
    ],
    assemblyPackets: [],
    packets: [],
    floor2LocationId: 'floor2-loc',
    inventory: [{ assembly_id: wipOnlyIncomplete, location_id: 'floor2-loc', quantity: 5 }],
  };
  const allowed = productionPortalProductIdSet(ctx);
  assert.equal(
    allowed.has(wipOnlyIncomplete),
    false,
    'Floor 2 qty must not bypass incomplete catalog / warehouse-products rules',
  );
  assert.equal(allowed.has(floor1Id), true, 'Floor 1 catalog product must be addable');

  const storeroomMaterialId = 'storeroom-nails';
  const storeroomCtx = {
    assemblies: [
      {
        id: storeroomMaterialId,
        name: 'Storeroom nails',
        item_kind: 'product',
        inventory_mode: 'finished',
        metadata: { storeroom: { is_storeroom_material: true, default_uom: 'pcs' } },
      },
      { id: floor1Id, name: 'Chair', item_kind: 'product', inventory_mode: 'finished' },
    ],
    assemblyPackets: [],
    packets: [],
  };
  const storeroomAllowed = productionPortalProductIdSet(storeroomCtx);
  assert.equal(
    storeroomAllowed.has(storeroomMaterialId),
    false,
    'Storeroom materials must not appear as Floor 1 portal products',
  );
}

function testClientSourceRouting() {
  assert.equal(resolvePortalChannel('carpentry_workshop_app', ''), 'carpentry');
  assert.equal(resolvePortalChannel('warehouse_production_app', ''), 'upholstery');
  assert.equal(resolvePortalChannel('', 'carpentry'), 'carpentry');
  assert.equal(resolvePortalChannel('other', ''), '');
}

function testFloor2SeedQty() {
  assert.equal(resolveFloor2SeedQuantity({ initial_quantity: 12 }, 0), 12);
  assert.equal(resolveFloor2SeedQuantity({ floor2_quantity: 7 }, 3), 7);
  assert.equal(resolveFloor2SeedQuantity({}, 4), 4);
  assert.equal(resolveFloor2SeedQuantity({}, 0), 1);
}

testPortalProductScope();
testClientSourceRouting();
testFloor2SeedQty();
console.log('verifyProductionPortalCatalog: ok');
