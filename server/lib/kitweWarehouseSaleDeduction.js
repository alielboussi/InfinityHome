import { KITWE_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { isWarehouseSetAssembly } from '../../src/utils/warehouseSetMath.js';
import { expandWarehouseSetItemsRows } from '../../src/utils/warehouseSetItems.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';

const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const SET_ITEMS = 'warehouse_set_items';
const ASSEMBLIES = 'warehouse_assemblies';

async function loadAssemblyInventory(sb, assemblyId, locationId) {
  const { data: row } = await sb
    .from(ASSEMBLY_INVENTORY)
    .select('assembly_id, location_id, quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Number(row?.quantity) || 0;
}

async function adjustAssemblyInventory(sb, assemblyId, locationId, delta) {
  const aid = String(assemblyId || '');
  const loc = String(locationId || '');
  const d = Number(delta) || 0;
  if (!aid || !loc || !d) return;
  const current = await loadAssemblyInventory(sb, aid, loc);
  const next = Math.max(0, current + d);
  const now = new Date().toISOString();
  await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: aid,
    location_id: loc,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ locationId: string, lines: Array<{ assembly_id: string, quantity: number, kind?: string }> }} input
 */
export async function applyKitweWarehouseSaleDeduction(sb, { locationId, lines = [] }) {
  const locId = String(locationId || '');
  if (locId !== KITWE_LOCATION_ID) return 0;
  const normalized = (lines || [])
    .map((line) => ({
      assembly_id: String(line?.assembly_id || '').trim(),
      quantity: Math.max(0, Number(line?.quantity) || 0),
      kind: String(line?.kind || 'product').toLowerCase(),
    }))
    .filter((line) => line.assembly_id && line.quantity > 0);
  if (!normalized.length) return 0;

  const assemblyIds = [...new Set(normalized.map((l) => l.assembly_id))];
  const [{ data: assemblies }, { data: setItems }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, item_kind').in('id', assemblyIds),
    sb.from(SET_ITEMS).select('*'),
  ]);
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const expandedSetItems = expandWarehouseSetItemsRows(setItems || []);

  let adjusted = 0;
  for (const line of normalized) {
    const assembly = assemblyById.get(line.assembly_id);
    const isSet = line.kind === 'set' || isWarehouseSetAssembly(assembly);
    if (isSet) {
      const components = expandedSetItems.filter(
        (row) => String(row.set_assembly_id) === line.assembly_id
          && String(row.location_id) === locId,
      );
      for (const comp of components) {
        const need = Math.max(1, Number(comp.quantity) || 1) * line.quantity;
        await adjustAssemblyInventory(sb, comp.component_assembly_id, locId, -need);
        adjusted += 1;
      }
    } else {
      await adjustAssemblyInventory(sb, line.assembly_id, locId, -line.quantity);
      adjusted += 1;
    }
  }

  await recomputeWarehouseLocationStockServer(sb, locId);
  return adjusted;
}
