/**
 * Delete path must drop carpentry usage before runs (Floor 2 history blocks run delete).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/utils/warehouseAssemblyDelete.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[verifyWarehouseAssemblyDelete] ${msg}`);
    process.exit(1);
  }
}

assert(src.includes("from(USAGE).delete().in('run_id'"), 'must delete material usage by run_id before runs');
assert(src.includes("from(RUNS).delete().eq('assembly_id'"), 'must delete carpentry runs for assembly');
assert(src.includes('upholstery_production_jobs'), 'must clear upholstery jobs referencing assembly');

const catalog = fs.readFileSync(path.join(root, 'src/services/warehouseCatalog.js'), 'utf8');
assert(catalog.includes('from(ASSEMBLIES).delete().eq('), 'must delete warehouse_assemblies row');
assert(catalog.includes('invalidateProductionPortalSnapshotCache'), 'must bust portal snapshot after delete');

console.log('[verifyWarehouseAssemblyDelete] ok');
