import { WAREHOUSE_FACTORY_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../_repoConstants/warehouseFloorLocations.js';
import { buildCarpentryFinishingCandidates } from './carpentryFinishingView.js';
import { listCarpentryCatalogProducts } from './carpentryCatalogView.js';
import { newUuid } from './uuid.js';

const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const RUNS = 'carpentry_production_runs';
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

async function resolveFloor2Id(sb) {
  const { data: locRows, error } = await sb.from(LOCATIONS).select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : '';
  if (!floor2Id) {
    throw new Error('Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  }
  return floor2Id;
}

export async function listCarpentryFinishingCandidatesLocal(sb) {
  const floor2LocationId = await resolveFloor2Id(sb);
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

export async function executeCarpentryFinishingLocal(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
  channel = 'carpentry_portal',
}) {
  const productId = String(assemblyId || '').trim();
  const qty = Math.max(1, Number(productQty) || 1);
  if (!productId) throw new Error('assembly_id required');

  const floor2LocationId = await resolveFloor2Id(sb);
  const floor1LocationId = WAREHOUSE_FACTORY_LOCATION_ID;

  const { data: assembly, error: aErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata, item_kind')
    .eq('id', productId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');
  if (!listCarpentryCatalogProducts([assembly])[0]) {
    throw new Error('Product is not on the Carpentry catalog');
  }

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

  const floor1After = await loadAssemblyInventoryQty(sb, productId, floor1LocationId);
  return {
    run_id: runId,
    assembly_id: productId,
    product_qty: qty,
    floor1_qty_after: floor1After,
  };
}
