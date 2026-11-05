import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { buildCarpentryFinishingCandidates } from '../../src/utils/carpentryFinishingView.js';
import { listCarpentryCatalogProducts } from './carpentryCatalog.js';
import {
  adjustAssemblyInventory,
  loadAssemblyInventoryQty,
} from './storeroomBomDeduction.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';

const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const RUNS = 'carpentry_production_runs';
const LOCATIONS = 'locations';

async function resolveFloor2AndFactoryIds(sb) {
  const { data: locRows, error: locErr } = await sb.from(LOCATIONS).select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  if (!floor2Id) {
    throw new Error('Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  }
  return {
    floor2LocationId: floor2Id,
    floor1LocationId: WAREHOUSE_FACTORY_LOCATION_ID,
  };
}

export async function listCarpentryFinishingCandidates(sb) {
  const { floor2LocationId } = await resolveFloor2AndFactoryIds(sb);
  const [{ data: assemblies, error: aErr }, { data: inv, error: invErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, item_kind, metadata'),
    sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity').eq('location_id', floor2LocationId),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load products');
  if (invErr) throw new Error(invErr.message || 'Failed to load Floor 2 stock');
  return {
    products: buildCarpentryFinishingCandidates(assemblies || [], inv || [], floor2LocationId),
    floor2_location_id: floor2LocationId,
  };
}

/**
 * Move finished carpentry units: deduct unfinished qty on Floor 2, credit same SKU on Floor 1.
 */
export async function executeCarpentryFinishing(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
  channel = 'carpentry_workshop_app',
}) {
  const productId = String(assemblyId || '').trim();
  const qty = Math.max(1, Number(productQty) || 1);
  if (!productId) throw new Error('assembly_id required');

  const { floor2LocationId, floor1LocationId } = await resolveFloor2AndFactoryIds(sb);

  const { data: assembly, error: aErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata, item_kind')
    .eq('id', productId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');

  const catalog = listCarpentryCatalogProducts([assembly]);
  if (!catalog[0]) throw new Error('Product is not on the Carpentry catalog');

  const have = await loadAssemblyInventoryQty(sb, productId, floor2LocationId);
  if (have < qty) {
    throw new Error(`Insufficient unfinished stock on Floor 2 (have ${have}, need ${qty})`);
  }

  await adjustAssemblyInventory(sb, productId, floor2LocationId, -qty);
  await adjustAssemblyInventory(sb, productId, floor1LocationId, qty);

  const now = new Date().toISOString();
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'carpentry_finishing',
    quote_id: null,
    assembly_id: productId,
    product_qty: qty,
    started_at: now,
    completed_at: now,
    accepted_by: userId,
    metadata: { channel, unfinished_floor2: true },
    created_at: now,
  });
  if (runErr) throw new Error(runErr.message || 'Failed to save finishing run');

  await recomputeWarehouseLocationStockServer(sb, floor2LocationId);
  await recomputeWarehouseLocationStockServer(sb, floor1LocationId);

  const floor1After = await loadAssemblyInventoryQty(sb, productId, floor1LocationId);

  return {
    run_id: runId,
    assembly_id: productId,
    product_qty: qty,
    floor2_location_id: floor2LocationId,
    floor1_location_id: floor1LocationId,
    floor1_qty_after: floor1After,
  };
}
