import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { resolveFarmWarehouse1Location } from '../../src/constants/farmWarehouseLocations.js';
import { requireWarehouseFloor2Location } from './productionFloor1StockPolicy.js';
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
 * Apply storeroom BOM and credit WIP on Floor 2 — only when a catalog manufacture **job** is finished.
 * (Floor 1 finished stock is never touched here.)
 */
export async function completeCarpentryCatalogManufacture(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
  carpentryJobId = null,
  preferredStoreroomLocationId = null,
}) {
  const productId = String(assemblyId || '').trim();
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  if (!productId) throw new Error('assembly_id required');

  const { data: assemblies, error: aErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata, item_kind')
    .eq('id', productId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assemblies?.id) throw new Error('Product not found');

  const { data: locRows, error: locErr } = await sb.from(LOCATIONS).select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const outputLocationId = requireWarehouseFloor2Location(locRows);

  const catalog = listCarpentryCatalogProducts([assemblies]);
  const product = catalog[0];
  if (!product) throw new Error('Product is not in the Carpentry catalog');

  const storeroomLocs = await resolveCarpentryStoreroomLocations(sb);
  const bomMaterials = Array.isArray(product.materials) ? product.materials : [];
  let materialUsageRows = [];
  if (bomMaterials.length) {
    if (!storeroomLocs.length) {
      throw new Error('Storerooms not configured — run seedCarpentryWarehouseLocations.js');
    }
    materialUsageRows = await deductStoreroomBomMaterials(sb, bomMaterials, qty, storeroomLocs, {
      preferredStoreroomLocationId,
    });
  }

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
    metadata: {
      channel: 'carpentry_workshop_app',
      floor2_wip_only: true,
      carpentry_job_id: carpentryJobId || null,
    },
    created_at: now,
  });
  if (runErr) throw new Error(runErr.message || 'Failed to save production run');

  if (materialUsageRows.length) {
    for (const row of materialUsageRows) {
      const { error: uErr } = await sb.from(USAGE).insert({
        id: newUuid(),
        run_id: runId,
        material_assembly_id: row.material_assembly_id,
        warehouse_location_id: row.warehouse_location_id,
        quantity: row.quantity,
        uom: row.uom,
        created_at: now,
      });
      if (uErr && !/not found|does not exist/i.test(String(uErr.message || ''))) {
        throw new Error(uErr.message || 'Failed to save material usage');
      }
    }
  }

  for (const loc of storeroomLocs) {
    if (loc?.id) await recomputeWarehouseLocationStockServer(sb, loc.id);
  }
  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  return {
    run_id: runId,
    assembly_id: productId,
    product_qty: qty,
    material_lines: materialUsageRows.length,
    floor2_location_id: outputLocationId,
  };
}

/**
 * Workshop manufacture: open a carpentry job only — no Floor 1 / Floor 2 stock changes until job finish.
 */
export async function executeCarpentryFloorManufacture(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
}) {
  const { startCarpentryCatalogManufactureJob } = await import('./carpentryProductionJobs.js');
  return startCarpentryCatalogManufactureJob(sb, { assemblyId, productQty, userId });
}

export async function listCarpentryFloorRunsEnriched(sb, { limit = 200 } = {}) {
  const { data: locRows } = await sb.from(LOCATIONS).select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2LocationId = floor2Loc?.id ? String(floor2Loc.id) : '';

  const { buildFloor2StockRows } = await import('../../src/utils/carpentryFinishingView.js');
  const [{ data: runs, error }, { data: floor2InvRows }, { data: assemblies, error: asmErr }] = await Promise.all([
    sb
      .from(RUNS)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 200))),
    floor2LocationId
      ? sb.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity').eq('location_id', floor2LocationId)
      : Promise.resolve({ data: [] }),
    sb.from(ASSEMBLIES).select('id, name, family_sku, item_kind, metadata'),
  ]);
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) {
      return { rows: [], floor2Stock: [], tableMissing: true };
    }
    throw new Error(error.message || 'Failed to load runs');
  }
  if (asmErr) throw new Error(asmErr.message || 'Failed to load assemblies');
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
  const floor2Stock = floor2LocationId
    ? buildFloor2StockRows(assemblies || [], floor2InvRows || [], floor2LocationId)
    : [];
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
 * Mirror a Floor 2 WIP product onto Warehouse Floor 1 (finished catalog row).
 * Used when creating on Floor 2 and when batch-adding from Floor 2 on the web portal.
 */
export async function addFloor2ProductToFloor1(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
  ensureInventoryRow = false,
} = {}) {
  const productId = String(assemblyId || '').trim();
  const qtyDelta = Math.max(0, Math.floor(Number(productQty) || 0));
  if (!productId) throw new Error('assembly_id required');

  const { data: assembly, error: aErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata, item_kind')
    .eq('id', productId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');

  const floor1LocationId = String(WAREHOUSE_FACTORY_LOCATION_ID);

  const { data: invRow, error: invReadErr } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', productId)
    .eq('location_id', floor1LocationId)
    .maybeSingle();
  if (invReadErr) throw new Error(invReadErr.message || 'Failed to read Floor 1 stock');

  const current = Math.max(0, Math.floor(Number(invRow?.quantity) || 0));
  let nextQty = current;
  if (qtyDelta > 0) {
    nextQty = current + qtyDelta;
  } else if (ensureInventoryRow || !invRow) {
    nextQty = current;
  }

  const now = new Date().toISOString();
  await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: productId,
    location_id: floor1LocationId,
    quantity: nextQty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });

  if (qtyDelta > 0) {
    const runId = newUuid();
    const { error: runErr } = await sb.from(RUNS).insert({
      id: runId,
      source: 'manual_floor2',
      quote_id: null,
      assembly_id: productId,
      product_qty: qtyDelta,
      started_at: now,
      completed_at: now,
      accepted_by: userId,
      metadata: { channel: 'warehouse_floor1_portal', manual_from_floor2: true },
      created_at: now,
    });
    if (runErr) throw new Error(runErr.message || 'Failed to save Floor 1 entry');
  }

  await recomputeWarehouseLocationStockServer(sb, floor1LocationId);

  return {
    assembly_id: productId,
    product_qty: qtyDelta,
    floor1_location_id: floor1LocationId,
    quantity: nextQty,
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

export async function setFarmProductStockQty(sb, {
  assemblyId,
  quantity,
}) {
  const productId = String(assemblyId || '').trim();
  const nextQty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!productId) throw new Error('assembly_id required');

  const [{ data: assembly, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id').eq('id', productId).maybeSingle(),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');

  const farmLoc = resolveFarmWarehouse1Location(locRows || []);
  if (!farmLoc?.id) {
    throw new Error('Farm Warehouse 1 location is not configured. Run node scripts/ensureFarmWarehouseLocation.js');
  }
  const outputLocationId = String(farmLoc.id);

  const now = new Date().toISOString();
  const { error: invErr } = await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: productId,
    location_id: outputLocationId,
    quantity: nextQty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (invErr) throw new Error(invErr.message || 'Failed to update Farm warehouse quantity');

  await recomputeWarehouseLocationStockServer(sb, outputLocationId);

  return {
    assembly_id: productId,
    quantity: nextQty,
    farm_location_id: outputLocationId,
  };
}
