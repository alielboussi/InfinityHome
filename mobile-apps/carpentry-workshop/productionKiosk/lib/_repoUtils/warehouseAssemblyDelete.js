import { resolveWarehouseFloor2Location } from '../_repoConstants/warehouseFloorLocations.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations.js';

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

  const [{ data: runs, error: listErr }, { error: usageMatErr }, { error: runErr }] = await Promise.all([
    sb.from(RUNS).select('id').eq('assembly_id', id),
    sb.from(USAGE).delete().eq('material_assembly_id', id),
    sb.from(RUNS).delete().eq('assembly_id', id),
  ]);
  if (listErr && !isMissingTableError(listErr)) {
    throw new Error(listErr.message || 'Failed to list Floor 2 production runs');
  }
  if (usageMatErr && !isMissingTableError(usageMatErr)) {
    throw new Error(usageMatErr.message || 'Failed to clear material usage for product');
  }
  if (runErr && !isMissingTableError(runErr)) {
    throw new Error(runErr.message || 'Failed to clear Floor 2 production runs');
  }

  const runIds = (runs || []).map((row) => String(row.id || '').trim()).filter(Boolean);
  if (runIds.length) {
    const { error: usageByRunErr } = await sb.from(USAGE).delete().in('run_id', runIds);
    if (usageByRunErr && !isMissingTableError(usageByRunErr)) {
      throw new Error(usageByRunErr.message || 'Failed to clear production material usage');
    }
  }
}

async function deleteUpholsteryJobsForAssembly(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return;

  const results = await Promise.all([
    sb.from(JOBS).delete().eq('raw_assembly_id', id),
    sb.from(JOBS).delete().eq('finished_assembly_id', id),
    sb.from(CARPENTRY_JOBS).delete().eq('assembly_id', id),
    sb.from(PAINTING_JOBS).delete().eq('assembly_id', id),
  ]);

  for (const { error } of results) {
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || 'Failed to clear production jobs');
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

  const [, , { error: invErr }] = await Promise.all([
    deleteCarpentryRunsForAssembly(sb, id),
    deleteUpholsteryJobsForAssembly(sb, id),
    sb.from(ASSEMBLY_INVENTORY).delete().eq('assembly_id', id),
  ]);
  if (invErr) throw new Error(invErr.message || 'Failed to clear warehouse inventory');

  let floor2Id = '';
  if (!skipRecompute) {
    const { data: locRows } = await sb.from(LOCATIONS).select('id, name');
    const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
    floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
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
