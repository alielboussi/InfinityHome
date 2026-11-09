import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { findUpholsteryFinishedForRawAssembly } from '../../src/utils/upholsteryCatalogView.js';
import {
  adjustAssemblyInventory,
  loadAssemblyInventoryQty,
} from './storeroomBomDeduction.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';

const LOCATIONS = 'locations';
const JOBS_UPHOLSTERY = 'upholstery_production_jobs';
const JOBS_CARPENTRY = 'carpentry_production_jobs';

function stripUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    out[key] = stripUndefinedDeep(val);
  }
  return out;
}

function normalizeChannel(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'carpentry' || v === 'upholstery') return v;
  return null;
}

async function resolveFloor2Id(sb) {
  const { data: locRows, error } = await sb.from(LOCATIONS).select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  if (!floor2Id) throw new Error('Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  return floor2Id;
}

/**
 * Open a production job from Floor 2 WIP (no automatic storeroom BOM).
 * Neither channel touches Warehouse Floor 1 on job open (see productionFloor1StockPolicy.js).
 * Carpentry: may deduct Floor 2 when the job opens (floor2_push). Upholstery: Floor 2 unchanged until job finish.
 */
export async function pushFloor2ToProductionJob(sb, {
  assemblyId,
  productQty = 1,
  channel,
  userId = null,
}) {
  const route = normalizeChannel(channel);
  if (!route) throw new Error('channel must be upholstery or carpentry');
  const aid = String(assemblyId || '').trim();
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  if (!aid) throw new Error('assembly_id required');

  const floor2Id = await resolveFloor2Id(sb);
  const have = await loadAssemblyInventoryQty(sb, aid, floor2Id);
  if (have < qty) {
    throw new Error(`Insufficient Floor 2 stock (have ${have}, need ${qty})`);
  }

  const { data: assembly, error: aErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, metadata, item_kind')
    .eq('id', aid)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');

  // Carpentry: WIP leaves Floor 2 when the job opens. Upholstery: raw stays on Floor 2 in the
  // portal until the job is finished (deduct raw + credit finished on finishUpholsteryProductionJob).
  if (route === 'carpentry') {
    await adjustAssemblyInventory(sb, aid, floor2Id, -qty);
    await recomputeWarehouseLocationStockServer(sb, floor2Id);
  }

  const now = new Date().toISOString();
  const jobId = newUuid();
  const productName = String(assembly.name || aid).trim();
  const productSku = String(assembly.family_sku || '').trim();

  if (route === 'carpentry') {
    const row = stripUndefinedDeep({
      id: jobId,
      assembly_id: aid,
      product_name: productName,
      product_sku: productSku,
      product_qty: qty,
      status: 'ready',
      accumulated_ms: 0,
      timer_started_at: null,
      started_at: now,
      completed_at: null,
      accepted_by: userId || null,
      metadata: {
        channel: 'carpentry_workshop_app',
        floor2_push: true,
        material_usage_rows: [],
        manual_material_lines: [],
        storeroom_location_ids: [],
      },
      created_at: now,
      updated_at: now,
    });
    const { data: inserted, error: insErr } = await sb.from(JOBS_CARPENTRY).insert(row).select('*').single();
    if (insErr) throw new Error(insErr.message || 'Failed to create carpentry job');
    return {
      job: {
        job_id: inserted.id,
        id: inserted.id,
        assembly_id: aid,
        product_name: productName,
        product_sku: productSku,
        product_qty: qty,
        status: inserted.status,
      },
    };
  }

  const { data: allAssemblies } = await sb.from('warehouse_assemblies').select('id, name, family_sku, metadata');
  const finished = findUpholsteryFinishedForRawAssembly(allAssemblies || [], aid);
  const finishedId = finished?.id ? String(finished.id) : aid;
  const finishedName = finished?.name ? String(finished.name) : productName;
  const finishedSku = finished?.family_sku ? String(finished.family_sku) : productSku;

  const row = stripUndefinedDeep({
    id: jobId,
    raw_assembly_id: aid,
    finished_assembly_id: finishedId,
    raw_name: productName,
    finished_name: finishedName,
    finished_sku: finishedSku,
    product_qty: qty,
    status: 'ready',
    accumulated_ms: 0,
    timer_started_at: null,
    started_at: now,
    completed_at: null,
    accepted_by: userId || null,
    metadata: {
      channel: 'warehouse_production_app',
      floor2_push: true,
      floor2_deduct_on_finish: true,
      material_usage_rows: [],
      manual_material_lines: [],
      storeroom_location_ids: [],
    },
    created_at: now,
    updated_at: now,
  });
  const { data: inserted, error: insErr } = await sb.from(JOBS_UPHOLSTERY).insert(row).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create upholstery job');
  return {
    job: {
      job_id: inserted.id,
      id: inserted.id,
      raw_assembly_id: aid,
      finished_assembly_id: finishedId,
      raw_name: productName,
      finished_name: finishedName,
      product_qty: qty,
      status: inserted.status,
    },
  };
}
