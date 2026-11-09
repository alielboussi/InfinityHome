/**
 * Job material line keys must use assembly id + storeroom, not composite ids as assembly id.
 */
import assert from 'node:assert/strict';

function assemblyIdFromLineKey(key) {
  const s = String(key || '');
  const i = s.indexOf('#');
  return i >= 0 ? s.slice(0, i) : s;
}

function storeroomLocFromLineKey(key) {
  const s = String(key || '');
  const i = s.indexOf('#');
  return i >= 0 ? s.slice(i + 1) : '';
}

function materialAssemblyIdFromStoredRow(row) {
  const raw = String(row?.material_assembly_id || row?.assembly_id || '').trim();
  return assemblyIdFromLineKey(raw);
}

function warehouseLocationIdFromStoredRow(row) {
  const explicit = String(row?.warehouse_location_id || row?.warehouseLocationId || '').trim();
  if (explicit) return explicit;
  return storeroomLocFromLineKey(String(row?.material_assembly_id || row?.assembly_id || ''));
}

const legacy = {
  material_assembly_id: '73110612-47e5-46cd-9655-ad99884e378f#a9ffb610-d1a9-47c4-ae5b-10e3b4d59528',
  warehouse_location_id: 'a9ffb610-d1a9-47c4-ae5b-10e3b4d59528',
  quantity: 2,
  uom: 'box_es',
};

assert.equal(
  materialAssemblyIdFromStoredRow(legacy),
  '73110612-47e5-46cd-9655-ad99884e378f',
);
assert.equal(
  warehouseLocationIdFromStoredRow(legacy),
  'a9ffb610-d1a9-47c4-ae5b-10e3b4d59528',
);

console.log('verifyProductionJobMaterialLines: ok');
