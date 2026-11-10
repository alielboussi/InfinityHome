import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';

function assemblyStockLocationLabel(locationId) {
  const id = String(locationId || '').trim();
  if (id === WAREHOUSE_FROM_LOCATION_ID) return 'Factory Warehouse';
  if (id === WAREHOUSE_TO_LOCATION_ID) return 'Kitwe';
  return id || 'warehouse';
}

export async function getAssemblyStockQty(sb, assemblyId, locationId) {
  const { data } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Math.max(0, Number(data?.quantity) || 0);
}

export async function adjustAssemblyStock(sb, assemblyId, locationId, delta) {
  const aid = String(assemblyId || '').trim();
  const loc = String(locationId || '').trim();
  const d = Number(delta) || 0;
  if (!aid || !loc || !d) return;
  const current = await getAssemblyStockQty(sb, aid, loc);
  const next = current + d;
  if (next < 0) {
    const need = Math.abs(d);
    throw new Error(
      `Not enough finished product stock at ${assemblyStockLocationLabel(loc)} (have ${current}, need ${need} more to complete this move).`,
    );
  }
  const { upsertFinishedAssemblyInventoryQuantity } = await import('./warehouseCatalogMobile.js');
  await upsertFinishedAssemblyInventoryQuantity(sb, {
    assemblyId: aid,
    locationId: loc,
    quantity: next,
  });
  return next;
}
