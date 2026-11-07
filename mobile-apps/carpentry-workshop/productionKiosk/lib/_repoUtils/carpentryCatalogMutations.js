import { normalizeCarpentryUom } from '../_repoConstants/carpentryUom';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations';
import { resolveWarehouseFloor2Location } from '../_repoConstants/warehouseFloorLocations';
import { loadMaterialUomAllowedSet } from './materialUomMutations';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import { parseCarpentryMeta } from './carpentryCatalogView';
import { buildFloor2StockRows } from './carpentryFinishingView';
import { newUuid } from './uuid';

const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const LOCATIONS = 'locations';
const RUNS = 'carpentry_production_runs';

export async function saveCarpentryProductSelection(sb, assemblyId, selected) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata, item_kind')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  if (isWarehouseSetAssembly(row)) throw new Error('Sets cannot be added to Carpentry catalog');
  const prev = parseCarpentryMeta(row);
  const metadata = {
    ...(row.metadata || {}),
    carpentry: {
      ...prev,
      selected: Boolean(selected),
      materials: selected ? prev.materials : [],
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to save carpentry selection');
}

export async function saveCarpentryProductMaterials(sb, assemblyId, materials) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb.from(ASSEMBLIES).select('id, metadata').eq('id', id).maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  const prev = parseCarpentryMeta(row);
  if (!prev.selected) throw new Error('Add product to Carpentry catalog first');
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const normalized = (materials || []).map((m) => ({
    material_assembly_id: String(m.material_assembly_id || '').trim(),
    quantity: Math.max(0, Number(m.quantity) || 0),
    uom: normalizeCarpentryUom(m.uom, uomAllowed.size ? uomAllowed : undefined),
    warehouse_location_id: m.warehouse_location_id ? String(m.warehouse_location_id) : null,
  })).filter((m) => m.material_assembly_id && m.quantity > 0);
  const metadata = {
    ...(row.metadata || {}),
    carpentry: {
      selected: true,
      materials: normalized,
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to save materials');
}

export async function listCarpentryFloorRuns(sb, { limit = 200 } = {}) {
  const { data: locRows } = await sb.from(LOCATIONS).select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2LocationId = floor2Loc?.id ? String(floor2Loc.id) : '';

  const [{ data, error }, { data: floor2InvRows }, { data: assemblies, error: asmErr }] = await Promise.all([
    sb
      .from(RUNS)
      .select('id, assembly_id, product_qty, started_at, completed_at, source, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 200))),
    floor2LocationId
      ? sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity').eq('location_id', floor2LocationId)
      : Promise.resolve({ data: [] }),
    sb.from(ASSEMBLIES).select('id, name, family_sku, item_kind, metadata'),
  ]);
  if (error) {
    if (/relation .* does not exist|not found/i.test(String(error.message || ''))) {
      return { rows: [], floor2Stock: [], tableMissing: true };
    }
    throw new Error(error.message || 'Failed to load floor runs');
  }
  if (asmErr) throw new Error(asmErr.message || 'Failed to load assemblies');
  const floor2Stock = floor2LocationId
    ? buildFloor2StockRows(assemblies || [], floor2InvRows || [], floor2LocationId)
    : [];
  return {
    rows: data || [],
    floor2_location_id: floor2LocationId || null,
    floor2Stock,
    tableMissing: false,
  };
}

export async function addFloor1ProductToFloor2Local(sb, {
  assemblyId,
  productQty = 1,
  userId = null,
}) {
  const productId = String(assemblyId || '').trim();
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  if (!productId) throw new Error('assembly_id required');

  const [{ data: row, error: readErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata, item_kind').eq('id', productId).maybeSingle(),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (readErr) throw new Error(readErr.message || 'Failed to read product');
  if (!row?.id) throw new Error('Product not found');
  if (isWarehouseSetAssembly(row)) throw new Error('Sets cannot be added directly — add individual components');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');

  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const outputLocationId = floor2Loc?.id
    ? String(floor2Loc.id)
    : WAREHOUSE_FACTORY_LOCATION_ID;

  const prev = parseCarpentryMeta(row);
  if (!prev.selected) {
    await sb.from(ASSEMBLIES).update({
      metadata: {
        ...(row.metadata || {}),
        carpentry: {
          ...prev,
          selected: true,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', productId);
  }

  const { data: invRow } = await sb
    .from(ASSEMBLY_INVENTORY)
    .select('quantity')
    .eq('assembly_id', productId)
    .eq('location_id', outputLocationId)
    .maybeSingle();
  const current = Number(invRow?.quantity) || 0;
  const next = Math.max(0, current + qty);
  const now = new Date().toISOString();

  await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: productId,
    location_id: outputLocationId,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });

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
  if (runErr) throw new Error(runErr.message || 'Failed to save Floor 2 run');

  return {
    run_id: runId,
    assembly_id: productId,
    product_qty: qty,
    floor2_location_id: outputLocationId,
  };
}

export async function setFloor2ProductStockQtyLocal(sb, {
  assemblyId,
  quantity,
}) {
  const productId = String(assemblyId || '').trim();
  const nextQty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!productId) throw new Error('assembly_id required');

  const [{ data: row, error: readErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, metadata, item_kind').eq('id', productId).maybeSingle(),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (readErr) throw new Error(readErr.message || 'Failed to read product');
  if (!row?.id) throw new Error('Product not found');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');

  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const outputLocationId = floor2Loc?.id
    ? String(floor2Loc.id)
    : WAREHOUSE_FACTORY_LOCATION_ID;

  const prev = parseCarpentryMeta(row);
  if (!prev.selected && nextQty > 0) {
    await sb.from(ASSEMBLIES).update({
      metadata: {
        ...(row.metadata || {}),
        carpentry: {
          ...prev,
          selected: true,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', productId);
  }

  const now = new Date().toISOString();
  const { error: invErr } = await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: productId,
    location_id: outputLocationId,
    quantity: nextQty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (invErr) throw new Error(invErr.message || 'Failed to update Floor 2 quantity');

  return {
    assembly_id: productId,
    quantity: nextQty,
    floor2_location_id: outputLocationId,
  };
}
