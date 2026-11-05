/**
 * Carpentry finishing: Floor 2 unfinished → Floor 1 same SKU.
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
    { assembly_id: 'a2', location_id: floor2, quantity: 5 },
  ],
  floor2,
);

assert.equal(products.length, 1, 'only carpentry-selected catalog rows with Floor 2 qty');
assert.equal(products[0].id, 'a1');
assert.equal(products[0].floor2_qty, 3);

console.log('verifyCarpentryFinishing: ok');
