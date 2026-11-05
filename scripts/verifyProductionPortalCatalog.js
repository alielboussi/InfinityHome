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
}

function testClientSourceRouting() {
  assert.equal(resolvePortalChannel('carpentry_workshop_app', ''), 'carpentry');
  assert.equal(resolvePortalChannel('warehouse_production_app', ''), 'upholstery');
  assert.equal(resolvePortalChannel('', 'carpentry'), 'carpentry');
  assert.equal(resolvePortalChannel('other', ''), '');
}

testPortalProductScope();
testClientSourceRouting();
console.log('verifyProductionPortalCatalog: ok');
