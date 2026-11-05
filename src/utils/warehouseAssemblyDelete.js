import { resolveWarehouseFloor2Location } from '../constants/warehouseFloorLocations';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../constants/warehouseShowroomLocations';

const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const RUNS = 'carpentry_production_runs';
const LOCATIONS = 'locations';

/**
 * Remove Floor 2 WIP stock, all location inventory rows, and carpentry floor runs
 * before deleting a warehouse product (Floor 1 catalog delete).
 */
export async function purgeWarehouseAssemblyInventoryAndFloorRuns(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return { assembly_id: id, purged: false };

  const { data: locRows } = await sb.from(LOCATIONS).select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';

  const { error: invErr } = await sb.from(ASSEMBLY_INVENTORY).delete().eq('assembly_id', id);
  if (invErr) throw new Error(invErr.message || 'Failed to clear warehouse inventory');

  const { error: runErr } = await sb.from(RUNS).delete().eq('assembly_id', id);
  if (runErr && !/relation .* does not exist|not found/i.test(String(runErr.message || ''))) {
    throw new Error(runErr.message || 'Failed to clear Floor 2 production runs');
  }

  const { recomputeWarehouseLocationStock } = await import('../services/warehouseTransfer');
  await recomputeWarehouseLocationStock(WAREHOUSE_FACTORY_LOCATION_ID);
  if (floor2Id) {
    await recomputeWarehouseLocationStock(floor2Id);
  }

  return {
    assembly_id: id,
    purged: true,
    floor2_location_id: floor2Id || null,
  };
}
