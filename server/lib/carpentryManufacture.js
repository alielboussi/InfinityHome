import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import {
  listCarpentryCatalogProducts,
  parseCarpentryMeta,
} from './carpentryCatalog.js';
import {
  adjustAssemblyInventory,
  deductStoreroomBomMaterials,
  resolveCarpentryStoreroomLocations,
} from './storeroomBomDeduction.js';

const ASSEMBLIES = 'warehouse_assemblies';
const RUNS = 'carpentry_production_runs';
const USAGE = 'carpentry_production_material_usage';
const LOCATIONS = 'locations';

/**
 * Tap-to-manufacture: deduct BOM from Storerooms 1→2→3, credit finished product at Floor 2.
 */
export async function executeCarpentryFloorManufacture(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
}) {
  const productId = String(assemblyId || '').trim();
  const qty = Math.max(1, Number(productQty) || 1);
  if (!productId) throw new Error('assembly_id required');

  const [{ data: assemblies, error: aErr }, carpentryLocs] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata, item_kind').eq('id', productId).maybeSingle(),
    resolveCarpentryStoreroomLocations(sb),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assemblies?.id) throw new Error('Product not found');
  if (carpentryLocs.length < 1) {
    throw new Error('Carpentry warehouses not configured — run seedCarpentryWarehouseLocations.js');
  }

  const { data: locRows, error: locErr } = await sb.from(LOCATIONS).select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const outputLocationId = floor2Loc?.id
    ? String(floor2Loc.id)
    : WAREHOUSE_FACTORY_LOCATION_ID;

  const catalog = listCarpentryCatalogProducts([assemblies]);
  const product = catalog[0];
  if (!product) throw new Error('Product is not in the Carpentry catalog');
  const materials = product.materials || [];
  if (!materials.length) throw new Error('No materials defined for this product');

  const usageRows = await deductStoreroomBomMaterials(sb, materials, qty, carpentryLocs);

  await adjustAssemblyInventory(sb, productId, outputLocationId, qty);

  const now = new Date().toISOString();
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'carpentry_floor',
    quote_id: null,
    assembly_id: productId,
    product_qty: qty,
    started_at: now,
    completed_at: now,
    accepted_by: userId,
    metadata: { channel: 'carpentry_workshop_app' },
    created_at: now,
  });
  if (runErr) throw new Error(runErr.message || 'Failed to save production run');

  for (const row of usageRows) {
    const { error: uErr } = await sb.from(USAGE).insert({
      id: newUuid(),
      run_id: runId,
      material_assembly_id: row.material_assembly_id,
      warehouse_location_id: row.warehouse_location_id,
      quantity: row.quantity,
      uom: row.uom,
      created_at: now,
    });
    if (uErr) throw new Error(uErr.message || 'Failed to save material usage');
  }

  for (const loc of carpentryLocs) {
    await recomputeWarehouseLocationStockServer(sb, loc.id);
  }
  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  return {
    run_id: runId,
    assembly_id: productId,
    product_qty: qty,
    material_lines: usageRows.length,
  };
}

export async function listCarpentryFloorRunsEnriched(sb, { limit = 200 } = {}) {
  const { data: locRows } = await sb.from(LOCATIONS).select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2LocationId = floor2Loc?.id ? String(floor2Loc.id) : '';

  const [{ data: runs, error }, { data: floor2InvRows }] = await Promise.all([
    sb
      .from(RUNS)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 200))),
    floor2LocationId
      ? sb.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity').eq('location_id', floor2LocationId)
      : Promise.resolve({ data: [] }),
  ]);
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) {
      return { rows: [], floor2Stock: [], tableMissing: true };
    }
    throw new Error(error.message || 'Failed to load runs');
  }
  const runIds = (runs || []).map((r) => r.id).filter(Boolean);
  let usage = [];
  if (runIds.length) {
    const { data: usageRows, error: uErr } = await sb.from(USAGE).select('*').in('run_id', runIds);
    if (!uErr) usage = usageRows || [];
  }
  const usageByRun = new Map();
  usage.forEach((row) => {
    const key = String(row.run_id);
    if (!usageByRun.has(key)) usageByRun.set(key, []);
    usageByRun.get(key).push(row);
  });
  const floor2Stock = (floor2InvRows || [])
    .filter((r) => Number(r.quantity) > 0)
    .map((r) => ({
      assembly_id: String(r.assembly_id),
      quantity: Number(r.quantity) || 0,
    }));
  return {
    tableMissing: false,
    floor2_location_id: floor2LocationId || null,
    floor2Stock,
    rows: (runs || []).map((run) => ({
      ...run,
      materials: usageByRun.get(String(run.id)) || [],
    })),
  };
}

/**
 * Manually add a Warehouse Floor 1 product to Warehouse Floor 2 from the web portal.
 * Ensures the product is enabled on the Carpentry catalog so Finishing & Upholstery can use it.
 */
export async function addFloor1ProductToFloor2(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
}) {
  const productId = String(assemblyId || '').trim();
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  if (!productId) throw new Error('assembly_id required');

  const [{ data: assembly, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata, item_kind').eq('id', productId).maybeSingle(),
    sb.from(LOCATIONS).select('id, name'),
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
    await sb.from(ASSEMBLIES).update({
      metadata: {
        ...(assembly.metadata || {}),
        carpentry: {
          ...prevMeta,
          selected: true,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', productId);
  }

  await adjustAssemblyInventory(sb, productId, outputLocationId, qty);

  const now = new Date().toISOString();
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'manual_floor1',
    quote_id: null,
    assembly_id: productId,
    product_qty: qty,
    started_at: now,
    completed_at: now,
    accepted_by: userId,
    metadata: { channel: 'warehouse_floor2_portal', manual_from_floor1: true },
    created_at: now,
  });
  if (runErr) throw new Error(runErr.message || 'Failed to save Floor 2 entry');

  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  return {
    run_id: runId,
    assembly_id: productId,
    product_qty: qty,
    floor2_location_id: outputLocationId,
  };
}

export async function setFloor2ProductStockQty(sb, {
  assemblyId,
  quantity,
}) {
  const productId = String(assemblyId || '').trim();
  const nextQty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!productId) throw new Error('assembly_id required');

  const [{ data: assembly, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata, item_kind').eq('id', productId).maybeSingle(),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');

  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const outputLocationId = floor2Loc?.id
    ? String(floor2Loc.id)
    : WAREHOUSE_FACTORY_LOCATION_ID;

  const prevMeta = parseCarpentryMeta(assembly);
  if (!prevMeta.selected && nextQty > 0) {
    await sb.from(ASSEMBLIES).update({
      metadata: {
        ...(assembly.metadata || {}),
        carpentry: {
          ...prevMeta,
          selected: true,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', productId);
  }

  const now = new Date().toISOString();
  const { error: invErr } = await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: productId,
    location_id: outputLocationId,
    quantity: nextQty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (invErr) throw new Error(invErr.message || 'Failed to update Floor 2 quantity');

  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  return {
    assembly_id: productId,
    quantity: nextQty,
    floor2_location_id: outputLocationId,
  };
}
