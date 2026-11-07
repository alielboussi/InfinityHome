import { resolveWarehouseFloor2Location } from '../constants/warehouseFloorLocations.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../constants/warehouseShowroomLocations.js';

const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const RUNS = 'carpentry_production_runs';
const USAGE = 'carpentry_production_material_usage';
const JOBS = 'upholstery_production_jobs';
const CARPENTRY_JOBS = 'carpentry_production_jobs';
const PAINTING_JOBS = 'painting_production_jobs';
const LOCATIONS = 'locations';

function isMissingTableError(err) {
  return /relation .* does not exist|not found|does not exist/i.test(String(err?.message || ''));
}

async function deleteCarpentryRunsForAssembly(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return;

  const { data: runs, error: listErr } = await sb.from(RUNS).select('id').eq('assembly_id', id);
  if (listErr && !isMissingTableError(listErr)) {
    throw new Error(listErr.message || 'Failed to list Floor 2 production runs');
  }

  const runIds = (runs || []).map((row) => String(row.id || '').trim()).filter(Boolean);
  if (runIds.length) {
    const { error: usageByRunErr } = await sb.from(USAGE).delete().in('run_id', runIds);
    if (usageByRunErr && !isMissingTableError(usageByRunErr)) {
      throw new Error(usageByRunErr.message || 'Failed to clear production material usage');
    }
  }

  const { error: usageMatErr } = await sb.from(USAGE).delete().eq('material_assembly_id', id);
  if (usageMatErr && !isMissingTableError(usageMatErr)) {
    throw new Error(usageMatErr.message || 'Failed to clear material usage for product');
  }

  const { error: runErr } = await sb.from(RUNS).delete().eq('assembly_id', id);
  if (runErr && !isMissingTableError(runErr)) {
    throw new Error(runErr.message || 'Failed to clear Floor 2 production runs');
  }
}

async function deleteUpholsteryJobsForAssembly(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return;

  for (const column of ['raw_assembly_id', 'finished_assembly_id']) {
    const { error } = await sb.from(JOBS).delete().eq(column, id);
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || 'Failed to clear upholstery production jobs');
    }
  }

  for (const table of [CARPENTRY_JOBS, PAINTING_JOBS]) {
    const { error } = await sb.from(table).delete().eq('assembly_id', id);
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || `Failed to clear ${table}`);
    }
  }
}

/**
 * Remove Floor 2 WIP stock, all location inventory rows, carpentry runs/usage, and related jobs
 * before deleting a warehouse product (Floor 1 catalog delete).
 */
export async function purgeWarehouseAssemblyInventoryAndFloorRuns(sb, assemblyId, { skipRecompute = false } = {}) {
  const id = String(assemblyId || '').trim();
  if (!id) return { assembly_id: id, purged: false };

  const { data: locRows } = await sb.from(LOCATIONS).select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';

  await deleteCarpentryRunsForAssembly(sb, id);
  await deleteUpholsteryJobsForAssembly(sb, id);

  const { error: invErr } = await sb.from(ASSEMBLY_INVENTORY).delete().eq('assembly_id', id);
  if (invErr) throw new Error(invErr.message || 'Failed to clear warehouse inventory');

  if (!skipRecompute) {
    const { recomputeWarehouseLocationStock } = await import('../services/warehouseTransfer.js');
    await recomputeWarehouseLocationStock(WAREHOUSE_FACTORY_LOCATION_ID);
    if (floor2Id) {
      await recomputeWarehouseLocationStock(floor2Id);
    }
  }

  return {
    assembly_id: id,
    purged: true,
    floor2_location_id: floor2Id || null,
  };
}
