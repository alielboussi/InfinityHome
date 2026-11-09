/**
 * Raw Floor 2 + finished factory qty for an upholstery-linked product.
 * Usage: node scripts/inspectUpholsteryProductStock.js [rawAssemblyIdOrNameFragment]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });

async function main() {
  const arg = String(process.argv[2] || 'test frame').trim();
  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { resolveWarehouseFloor2Location } = await import('../src/constants/warehouseFloorLocations.js');
  const { WAREHOUSE_FACTORY_LOCATION_ID } = await import('../src/constants/warehouseShowroomLocations.js');
  const { findUpholsteryFinishedForRawAssembly, parseUpholsteryMeta } = await import('../src/utils/upholsteryCatalogView.js');

  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured');

  const { data: locRows } = await sb.from('locations').select('id, name');
  const floor2Id = resolveWarehouseFloor2Location(locRows || [])?.id;

  const { data: assemblies } = await sb.from('warehouse_assemblies').select('id, name, family_sku, metadata');
  let raw = (assemblies || []).find((a) => String(a.id) === arg);
  if (!raw) {
    const needle = arg.toLowerCase();
    raw = (assemblies || []).find((a) => String(a.name || '').toLowerCase().includes(needle));
  }
  if (!raw) throw new Error(`No assembly matching: ${arg}`);

  const rawId = String(raw.id);
  const finished = findUpholsteryFinishedForRawAssembly(assemblies || [], rawId);

  const ids = [rawId];
  if (finished?.id) ids.push(String(finished.id));

  const { data: inv } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, location_id, quantity')
    .in('assembly_id', ids);

  const byKey = (aid, loc) => {
    const row = (inv || []).find(
      (r) => String(r.assembly_id) === String(aid) && String(r.location_id) === String(loc),
    );
    return row ? Number(row.quantity) || 0 : 0;
  };

  const { data: jobs } = await sb
    .from('upholstery_production_jobs')
    .select('id, product_qty, status, metadata, started_at')
    .eq('raw_assembly_id', rawId)
    .order('started_at', { ascending: false })
    .limit(10);

  console.log(JSON.stringify({
    raw: { id: rawId, name: raw.name, sku: raw.family_sku },
    finished: finished
      ? { id: finished.id, name: finished.name, sku: finished.family_sku, upholstery: parseUpholsteryMeta(finished) }
      : null,
    floor2_location_id: floor2Id,
    factory_location_id: WAREHOUSE_FACTORY_LOCATION_ID,
    raw_floor2_qty: byKey(rawId, floor2Id),
    finished_factory_qty: finished ? byKey(finished.id, WAREHOUSE_FACTORY_LOCATION_ID) : null,
    recent_jobs: (jobs || []).map((j) => ({
      id: j.id,
      status: j.status,
      product_qty: j.product_qty,
      floor2_push: j.metadata?.floor2_push,
      floor2_deduct_on_finish: j.metadata?.floor2_deduct_on_finish,
      started_at: j.started_at,
    })),
  }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
