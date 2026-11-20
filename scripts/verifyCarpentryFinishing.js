/**
 * Floor 2 WIP list helpers (no direct Carpentry → Floor 1; use Painting or Upholstery).
 */
import assert from 'node:assert/strict';
import { buildCarpentryFinishingCandidates } from '../src/utils/carpentryFinishingView.js';

const floor2 = 'floor2-loc';
const products = buildCarpentryFinishingCandidates(
  [
    { id: 'a1', name: 'Chair', family_sku: 'SKU1', metadata: { carpentry: { selected: true, materials: [] } } },
    { id: 'a2', name: 'Other', family_sku: 'SKU2', metadata: {} },
  ],
  [
    { assembly_id: 'a1', location_id: floor2, quantity: 3 },
    { assembly_id: 'a2', location_id: floor2, quantity: 0 },
  ],
  floor2,
);

assert.equal(products.length, 2, 'carpentry catalog + any assembly with a Floor 2 inventory row (qty may be 0)');
const byId = Object.fromEntries(products.map((p) => [p.id, p]));
assert.equal(byId.a1?.floor2_qty, 3);
assert.equal(byId.a2?.floor2_qty, 0);

console.log('verifyCarpentryFinishing: ok');
