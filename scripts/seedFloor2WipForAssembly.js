/**
 * Enable carpentry catalog + add Warehouse Floor 2 WIP qty for an assembly.
 * Optional: --upholstery links raw WIP to the same assembly (upholstery manufacture list).
 *
 * Usage:
 *   node scripts/seedFloor2WipForAssembly.js <assembly_id> [qty]
 *   node scripts/seedFloor2WipForAssembly.js <assembly_id> [qty] --upholstery
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });

async function main() {
  const argv = process.argv.slice(2);
  const enableUpholstery = argv.includes('--upholstery');
  const posArgs = argv.filter((a) => !a.startsWith('--'));
  const assemblyId = String(posArgs[0] || '').trim();
  const productQty = Math.max(1, Math.floor(Number(posArgs[1]) || 10));
  if (!assemblyId) {
    console.error('Usage: node scripts/seedFloor2WipForAssembly.js <assembly_id> [qty] [--upholstery]');
    process.exit(1);
  }

  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { adjustAssemblyInventory } = await import('../server/lib/storeroomBomDeduction.js');
  const { recomputeWarehouseLocationStockServer } = await import('../server/lib/warehouseLocationStockRecompute.js');
  const { resolveWarehouseFloor2Location } = await import('../src/constants/warehouseFloorLocations.js');
  const { WAREHOUSE_FACTORY_LOCATION_ID } = await import('../src/constants/warehouseShowroomLocations.js');
  const { parseCarpentryMeta } = await import('../src/utils/carpentryCatalogView.js');
  const { newUuid } = await import('../server/lib/uuid.js');

  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured — check .env.local');

  const [{ data: assembly, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, metadata, item_kind').eq('id', assemblyId).maybeSingle(),
    sb.from('locations').select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');

  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const outputLocationId = floor2Loc?.id
    ? String(floor2Loc.id)
    : WAREHOUSE_FACTORY_LOCATION_ID;

  const prevMeta = parseCarpentryMeta(assembly);
  if (!prevMeta.selected) {
    await sb.from('warehouse_assemblies').update({
      metadata: {
        ...(assembly.metadata || {}),
        carpentry: {
          ...prevMeta,
          selected: true,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', assemblyId);
  }

  await adjustAssemblyInventory(sb, assemblyId, outputLocationId, productQty);

  const now = new Date().toISOString();
  const runId = newUuid();
  await sb.from('carpentry_production_runs').insert({
    id: runId,
    source: 'manual_floor1',
    quote_id: null,
    assembly_id: assemblyId,
    product_qty: productQty,
    started_at: now,
    completed_at: now,
    accepted_by: 'seedFloor2WipForAssembly',
    metadata: { channel: 'warehouse_floor2_portal', manual_from_floor1: true },
    created_at: now,
  });

  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  let upholstery_enabled = false;
  if (enableUpholstery) {
    const { data: uphRow } = await sb.from('warehouse_assemblies').select('id, metadata').eq('id', assemblyId).maybeSingle();
    const prevUph = uphRow?.metadata?.upholstery && typeof uphRow.metadata.upholstery === 'object'
      ? uphRow.metadata.upholstery
      : {};
    await sb.from('warehouse_assemblies').update({
      metadata: {
        ...(uphRow?.metadata || {}),
        upholstery: {
          ...prevUph,
          selected: true,
          raw_assembly_id: assemblyId,
          materials: Array.isArray(prevUph.materials) ? prevUph.materials : [],
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', assemblyId);
    upholstery_enabled = true;
  }

  const { data: inv } = await sb.from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', outputLocationId)
    .maybeSingle();

  console.log(JSON.stringify({
    ok: true,
    assembly_id: assemblyId,
    name: assembly.name,
    sku: assembly.family_sku,
    carpentry_selected: true,
    floor2_location_id: outputLocationId,
    floor2_qty: Number(inv?.quantity) || 0,
    added_qty: productQty,
    run_id: runId,
    upholstery_enabled,
  }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
