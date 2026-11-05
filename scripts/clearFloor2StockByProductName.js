/**
 * Clear Floor 2 WIP stock (and runs) for products matching a name fragment.
 *
 * Usage:
 *   node scripts/clearFloor2StockByProductName.js "test puff"
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });

async function main() {
  const needle = String(process.argv.slice(2).join(' ') || '').trim();
  if (!needle) {
    console.error('Usage: node scripts/clearFloor2StockByProductName.js "<name fragment>"');
    process.exit(1);
  }

  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { resolveWarehouseFloor2Location } = await import('../src/constants/warehouseFloorLocations.js');
  const { recomputeWarehouseLocationStockServer } = await import('../server/lib/warehouseLocationStockRecompute.js');

  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured — check .env.local');

  const { data: locRows } = await sb.from('locations').select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  if (!floor2Id) throw new Error('Warehouse Floor 2 location not found');

  async function zeroFloor2Stock(assemblyId) {
    const id = String(assemblyId || '').trim();
    if (!id) return;
    const now = new Date().toISOString();
    const { error: invErr } = await sb.from('warehouse_assembly_inventory').upsert({
      assembly_id: id,
      location_id: floor2Id,
      quantity: 0,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    if (invErr) throw new Error(invErr.message || 'Failed to zero Floor 2 inventory');
    await sb.from('carpentry_production_runs').delete().eq('assembly_id', id);
    await recomputeWarehouseLocationStockServer(sb, floor2Id);
  }

  const pattern = needle.toLowerCase();
  const { data: assemblies, error: aErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku')
    .ilike('name', `%${needle.replace(/[%_]/g, '')}%`);
  if (aErr) throw new Error(aErr.message || 'Failed to search products');

  const matched = (assemblies || []).filter(
    (row) => String(row.name || '').toLowerCase().includes(pattern),
  );

  const results = [];

  for (const row of matched) {
    const id = String(row.id);
    try {
      await zeroFloor2Stock(id);
      results.push({ id, name: row.name, action: 'floor2_qty_zeroed' });
    } catch (err) {
      results.push({ id, name: row.name, action: 'floor2_zero_failed', error: err?.message || String(err) });
    }
  }

  const { data: floor2Inv } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, quantity')
    .eq('location_id', floor2Id)
    .gt('quantity', 0);

  const assemblyIds = new Set(matched.map((r) => String(r.id)));
  for (const inv of floor2Inv || []) {
    const aid = String(inv.assembly_id || '');
    if (!aid || assemblyIds.has(aid)) continue;
    const { data: asm } = await sb
      .from('warehouse_assemblies')
      .select('id, name')
      .eq('id', aid)
      .maybeSingle();
    const name = String(asm?.name || '');
    if (!name.toLowerCase().includes(pattern)) continue;
    try {
      if (asm?.id) {
        await zeroFloor2Stock(aid);
        results.push({ id: aid, name, action: 'floor2_qty_zeroed' });
      } else {
        await sb.from('warehouse_assembly_inventory').delete()
          .eq('assembly_id', aid)
          .eq('location_id', floor2Id);
        await sb.from('carpentry_production_runs').delete().eq('assembly_id', aid);
        await recomputeWarehouseLocationStockServer(sb, floor2Id);
        results.push({ id: aid, name: name || '(orphan inventory)', action: 'orphan_floor2_cleared' });
      }
    } catch (err) {
      results.push({ id: aid, name, action: 'orphan_clear_failed', error: err?.message || String(err) });
    }
  }

  if (!results.length) {
    console.log(`No Floor 2 stock matched "${needle}".`);
    return;
  }
  console.log(JSON.stringify({ needle, floor2_location_id: floor2Id, results }, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
