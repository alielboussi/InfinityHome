/**
 * Storeroom SKU reuse must win over production-catalog metadata on the same assembly.
 */
import assert from 'node:assert/strict';

function isProductionCatalogAssembly(assembly) {
  const m = assembly?.metadata || {};
  return m.carpentry?.selected === true
    || m.upholstery?.selected === true
    || m.painting?.selected === true;
}

function isStoreroomMaterialRow(assembly) {
  return assembly?.metadata?.storeroom?.is_storeroom_material === true;
}

function storeroomEligibleSync(assembly) {
  if (!assembly?.id) return false;
  if (isStoreroomMaterialRow(assembly)) return true;
  if (isProductionCatalogAssembly(assembly)) return false;
  return false;
}

const dualRow = {
  id: 'a1',
  metadata: {
    storeroom: { is_storeroom_material: true, default_uom: 'ea' },
    upholstery: { selected: true },
  },
};

assert.equal(storeroomEligibleSync(dualRow), true, 'storeroom flag must allow SKU link even if upholstery selected');

const floorProduct = {
  id: 'b1',
  metadata: { upholstery: { selected: true } },
};
assert.equal(storeroomEligibleSync(floorProduct), false);

console.log('verifyStoreroomSkuReuseEligibility: ok');
