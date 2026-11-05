import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { normalizeWarehouseProductSku, normalizeWarehouseSkuKey } from '../../src/utils/warehouseScanResolver.js';
import { parseCarpentryMeta } from '../../src/utils/carpentryCatalogView.js';
import {
  findUpholsteryFinishedForRawAssembly,
  listUpholsteryCatalogProducts,
  parseUpholsteryMeta,
} from '../../src/utils/upholsteryCatalogView.js';
import {
  deductStoreroomBomMaterials,
  resolveCarpentryStoreroomLocations,
} from './storeroomBomDeduction.js';
import { newUuid } from './uuid.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { saveAssemblyForMobile } from './warehouseCatalogMobile.js';

const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const RUNS = 'carpentry_production_runs';
const USAGE = 'carpentry_production_material_usage';
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

async function sumRawQtyOnWarehouseFloor2(sb, rawAssemblyId, floor2LocationId) {
  if (!floor2LocationId) return 0;
  return loadAssemblyInventoryQty(sb, rawAssemblyId, floor2LocationId);
}

async function deductRawFromWarehouseFloor2(sb, rawAssemblyId, qty, floor2LocationId) {
  const loc = String(floor2LocationId || '').trim();
  if (!loc) throw new Error('Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  const have = await loadAssemblyInventoryQty(sb, rawAssemblyId, loc);
  if (have < qty) {
    throw new Error(`Insufficient raw stock on Warehouse Floor 2 (have ${have}, need ${qty})`);
  }
  await adjustAssemblyInventory(sb, rawAssemblyId, loc, -qty);
}

async function findWarehouseAssemblyBySku(sb, sku) {
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) return null;
  const { data, error } = await sb.from(ASSEMBLIES).select('*');
  if (error) throw new Error(error.message || 'Failed to load warehouse catalog');
  return (data || []).find((row) => normalizeWarehouseSkuKey(row.family_sku) === key) || null;
}

async function resolveOrCreateFinishedAtFactory(sb, templateAssembly, qty) {
  const sku = normalizeWarehouseProductSku(templateAssembly.family_sku);
  const name = String(templateAssembly.name || '').trim();
  if (!sku || !name) throw new Error('Finished product template is missing SKU or name');

  let output = await findWarehouseAssemblyBySku(sb, sku);
  let created = false;
  if (!output) {
    output = await saveAssemblyForMobile(sb, {
      name,
      family_sku: sku,
      category_id: templateAssembly.category_id || null,
      warehouse_location_id: WAREHOUSE_FACTORY_LOCATION_ID,
      inventory_mode: 'finished',
      packet_count: null,
      packet_links: [],
      location_ids: [],
      units_per_carton: templateAssembly.units_per_carton ?? 1,
      dim_length: templateAssembly.dim_length,
      dim_width: templateAssembly.dim_width,
      dim_height: templateAssembly.dim_height,
      turkish_name: templateAssembly.turkish_name,
      has_color_variants: templateAssembly.has_color_variants,
    });
    created = true;
  }

  const outputId = String(output.id || '');
  if (!outputId) throw new Error('Failed to resolve warehouse output product');

  const qtyBefore = await loadAssemblyInventoryQty(sb, outputId, WAREHOUSE_FACTORY_LOCATION_ID);
  const qtyAfter = qtyBefore + qty;
  await adjustAssemblyInventory(sb, outputId, WAREHOUSE_FACTORY_LOCATION_ID, qty);

  return {
    outputAssembly: output,
    output_assembly_id: outputId,
    sku,
    name,
    qty_before: qtyBefore,
    qty_after: qtyAfter,
    created,
  };
}

function listCarpentryRawAssemblyIds(assemblies) {
  const ids = new Set();
  for (const a of assemblies || []) {
    if (!parseCarpentryMeta(a).selected) continue;
    ids.add(String(a.id));
  }
  return ids;
}

/**
 * Raw carpentry stock on Warehouse Floor 2 with an upholstery finished mapping on the web portal.
 */
export async function listUpholsteryManufactureCandidates(sb) {
  const [{ data: assemblies, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, item_kind, metadata, category_id'),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  if (!floor2Loc?.id) {
    return { products: [], floor2Missing: true };
  }

  const rows = assemblies || [];
  const carpentryIds = listCarpentryRawAssemblyIds(rows);
  const upholsteryRows = listUpholsteryCatalogProducts(rows);
  const rawToFinished = new Map();
  upholsteryRows.forEach((u) => {
    const rawId = String(u.raw_assembly_id || '').trim();
    if (rawId) rawToFinished.set(rawId, u);
  });

  const products = [];
  for (const rawId of carpentryIds) {
    const finishedMeta = rawToFinished.get(rawId);
    if (!finishedMeta) continue;
    const finishedAsm = findUpholsteryFinishedForRawAssembly(rows, rawId);
    if (!finishedAsm) continue;
    const rawAsm = rows.find((r) => String(r.id) === rawId);
    const rawQty = await sumRawQtyOnWarehouseFloor2(sb, rawId, floor2Loc.id);
    if (rawQty < 1) continue;
    products.push({
      id: rawId,
      raw_assembly_id: rawId,
      raw_name: rawAsm?.name || rawId,
      raw_sku: rawAsm?.family_sku || '',
      finished_assembly_id: finishedAsm.id,
      finished_name: finishedAsm.name,
      finished_sku: finishedAsm.family_sku,
      floor2_qty: rawQty,
      carpentry_qty: rawQty,
    });
  }

  products.sort((a, b) => String(a.raw_name).localeCompare(String(b.raw_name)));
  return { products, floor2Missing: false, carpentryWarehousesMissing: false };
}

export async function executeUpholsteryManufacture(sb, {
  rawAssemblyId,
  productQty = 1,
  userId = null,
}) {
  const rawId = String(rawAssemblyId || '').trim();
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  if (!rawId) throw new Error('raw_assembly_id required');

  const [{ data: assemblies, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('*'),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  if (!floor2Loc?.id) {
    throw new Error('Warehouse Floor 2 location not configured — run seedWarehouseFloor2Location.js');
  }

  const rawRow = (assemblies || []).find((a) => String(a.id) === rawId);
  if (!rawRow || !parseCarpentryMeta(rawRow).selected) {
    throw new Error('Raw product is not in the Carpentry catalog');
  }

  const finishedTemplate = findUpholsteryFinishedForRawAssembly(assemblies || [], rawId);
  if (!finishedTemplate) {
    throw new Error('Link this raw product to a finished Upholstery catalog row on the web portal first');
  }

  const available = await sumRawQtyOnWarehouseFloor2(sb, rawId, floor2Loc.id);
  if (available < qty) {
    throw new Error(`Insufficient raw stock on Warehouse Floor 2 (have ${available}, need ${qty})`);
  }

  await deductRawFromWarehouseFloor2(sb, rawId, qty, floor2Loc.id);

  const finishedCatalog = listUpholsteryCatalogProducts([finishedTemplate]);
  const upholsteryMaterials = finishedCatalog[0]?.materials || [];
  let materialUsageRows = [];
  let storeroomLocsForRecompute = [];
  if (upholsteryMaterials.length) {
    storeroomLocsForRecompute = await resolveCarpentryStoreroomLocations(sb);
    materialUsageRows = await deductStoreroomBomMaterials(
      sb,
      upholsteryMaterials,
      qty,
      storeroomLocsForRecompute,
    );
  }

  const output = await resolveOrCreateFinishedAtFactory(sb, finishedTemplate, qty);

  const now = new Date().toISOString();
  const runId = newUuid();
  const { error: runErr } = await sb.from(RUNS).insert({
    id: runId,
    source: 'upholstery_floor',
    quote_id: null,
    assembly_id: output.output_assembly_id,
    product_qty: qty,
    started_at: now,
    completed_at: now,
    accepted_by: userId,
    metadata: {
      channel: 'warehouse_production_app',
      raw_assembly_id: rawId,
      finished_template_id: finishedTemplate.id,
      output_created: output.created,
    },
    created_at: now,
  });
  if (runErr && !/not found|does not exist/i.test(String(runErr.message || ''))) {
    throw new Error(runErr.message || 'Failed to save production run');
  }

  const runIdForUsage = runErr ? null : runId;
  if (runIdForUsage && materialUsageRows.length) {
    for (const row of materialUsageRows) {
      const { error: uErr } = await sb.from(USAGE).insert({
        id: newUuid(),
        run_id: runIdForUsage,
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

  for (const loc of storeroomLocsForRecompute) {
    await recomputeWarehouseLocationStockServer(sb, loc.id);
  }
  for (const loc of [floor2Loc]) {
    await recomputeWarehouseLocationStockServer(sb, loc.id);
  }
  await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_FACTORY_LOCATION_ID);

  return {
    run_id: runErr ? null : runId,
    raw_assembly_id: rawId,
    output_assembly_id: output.output_assembly_id,
    product_qty: qty,
    output_sku: output.sku,
    output_name: output.name,
    output_created: output.created,
    factory_qty_before: output.qty_before,
    factory_qty_after: output.qty_after,
  };
}
