/**
 * List warehouse assemblies / Floor 2 stock matching a name fragment.
 * Usage: node scripts/listWarehouseProductsByName.js puff
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });

async function main() {
  const needle = String(process.argv.slice(2).join(' ') || '').trim().toLowerCase();
  if (!needle) {
    console.error('Usage: node scripts/listWarehouseProductsByName.js <fragment>');
    process.exit(1);
  }
  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { resolveWarehouseFloor2Location } = await import('../src/constants/warehouseFloorLocations.js');
  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured');

  const { data: locRows } = await sb.from('locations').select('id, name');
  const floor2Id = resolveWarehouseFloor2Location(locRows || [])?.id;

  const { data: assemblies } = await sb.from('warehouse_assemblies').select('id, name, family_sku');
  const hits = (assemblies || []).filter((a) => String(a.name || '').toLowerCase().includes(needle));

  const { data: inv } = floor2Id
    ? await sb.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity').eq('location_id', String(floor2Id))
    : { data: [] };
  const f2ByAsm = new Map((inv || []).map((r) => [String(r.assembly_id), Number(r.quantity) || 0]));

  console.log(JSON.stringify({
    needle,
    floor2_location_id: floor2Id,
    matches: hits.map((a) => ({
      id: a.id,
      name: a.name,
      sku: a.family_sku,
      floor2_qty: f2ByAsm.get(String(a.id)) ?? 0,
    })),
  }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
