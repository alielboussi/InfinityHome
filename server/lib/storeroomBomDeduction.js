import { CARPENTRY_WAREHOUSE_NAMES } from '../../src/constants/carpentryWarehouses.js';
import { normalizeCarpentryUom } from '../../src/constants/carpentryUom.js';
import { loadMaterialUomAllowedSet } from '../../src/utils/materialUomMutations.js';

const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const LOCATIONS = 'locations';

async function loadAssemblyInventoryQty(sb, assemblyId, locationId) {
  const { data } = await sb
    .from(ASSEMBLY_INVENTORY)
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Number(data?.quantity) || 0;
}

async function adjustAssemblyInventory(sb, assemblyId, locationId, delta) {
  const aid = String(assemblyId || '').trim();
  const loc = String(locationId || '').trim();
  const d = Number(delta) || 0;
  if (!aid || !loc || !d) return;
  const current = await loadAssemblyInventoryQty(sb, aid, loc);
  const next = Math.max(0, current + d);
  const now = new Date().toISOString();
  await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: aid,
    location_id: loc,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
}

export async function resolveCarpentryStoreroomLocations(sb) {
  const { data, error } = await sb.from(LOCATIONS).select('id, name').order('name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const byName = new Map((data || []).map((r) => [String(r.name || '').trim(), r]));
  return CARPENTRY_WAREHOUSE_NAMES.map((name) => byName.get(name)).filter(Boolean);
}

function warehousePickOrder(carpentryLocs, preferredLocationId) {
  const ids = carpentryLocs.map((l) => String(l.id));
  const pref = String(preferredLocationId || '').trim();
  if (pref && ids.includes(pref)) {
    return [pref, ...ids.filter((id) => id !== pref)];
  }
  return ids;
}

function allocateAcrossWarehouses(needQty, qtyByLocationId, locationOrder) {
  const moves = [];
  let remaining = needQty;
  for (const locId of locationOrder) {
    if (remaining <= 0) break;
    const have = Number(qtyByLocationId.get(locId) ?? 0);
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    moves.push({ warehouse_location_id: locId, quantity: take });
    remaining -= take;
  }
  if (remaining > 0.000001) {
    throw new Error(`Insufficient material stock (short ${remaining})`);
  }
  return moves;
}

/**
 * Deduct BOM lines from Storerooms 1–3 (carpentry + upholstery manufacture).
 * @returns {Promise<Array<{ material_assembly_id, warehouse_location_id, quantity, uom }>>}
 */
export async function deductStoreroomBomMaterials(sb, materials, productQty, storeroomLocs) {
  const qty = Math.max(1, Number(productQty) || 1);
  const lines = materials || [];
  if (!lines.length) return [];
  if (!storeroomLocs?.length) {
    throw new Error('Storerooms not configured — run seedCarpentryWarehouseLocations.js');
  }

  const uomAllowed = await loadMaterialUomAllowedSet(sb);

  const materialIds = [...new Set(lines.map((m) => String(m.material_assembly_id)))];
  const qtyMap = new Map();
  await Promise.all(
    storeroomLocs.flatMap((loc) =>
      materialIds.map(async (mid) => {
        const q = await loadAssemblyInventoryQty(sb, mid, loc.id);
        qtyMap.set(`${mid}:${loc.id}`, q);
      }),
    ),
  );

  const usageRows = [];
  for (const line of lines) {
    const mid = String(line.material_assembly_id);
    const need = (Number(line.quantity) || 0) * qty;
    if (need <= 0) continue;
    const order = warehousePickOrder(storeroomLocs, line.warehouse_location_id);
    const byLoc = new Map(order.map((locId) => [locId, qtyMap.get(`${mid}:${locId}`) ?? 0]));
    const moves = allocateAcrossWarehouses(need, byLoc, order);
    for (const move of moves) {
      await adjustAssemblyInventory(sb, mid, move.warehouse_location_id, -move.quantity);
      qtyMap.set(
        `${mid}:${move.warehouse_location_id}`,
        Math.max(0, (qtyMap.get(`${mid}:${move.warehouse_location_id}`) ?? 0) - move.quantity),
      );
      usageRows.push({
        material_assembly_id: mid,
        warehouse_location_id: move.warehouse_location_id,
        quantity: move.quantity,
        uom: normalizeCarpentryUom(line.uom, uomAllowed.size ? uomAllowed : undefined),
      });
    }
  }
  return usageRows;
}

export { adjustAssemblyInventory, loadAssemblyInventoryQty };
