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
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { saveAssemblyForMobile } from './warehouseCatalogMobile.js';
import {
  readWarehouseFloor2WipFamilyImageUrl,
  readWarehouseFloor2WipImageUrl,
} from '../../src/utils/warehouseFloor2WipImage.js';

const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
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

/** One query (chunked) instead of per-assembly round trips for manufacture list. */
async function loadFloor2QtyByAssemblyId(sb, assemblyIds, floor2LocationId) {
  const loc = String(floor2LocationId || '').trim();
  const ids = [...new Set((assemblyIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const out = new Map();
  if (!loc || !ids.length) return out;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from(ASSEMBLY_INVENTORY)
      .select('assembly_id, quantity')
      .eq('location_id', loc)
      .in('assembly_id', slice);
    if (error) throw new Error(error.message || 'Failed to load Floor 2 stock');
    (data || []).forEach((row) => {
      out.set(String(row.assembly_id), Number(row.quantity) || 0);
    });
  }
  return out;
}

/** All Floor 2 on-hand rows (authoritative for manufacture picker). */
async function loadAllFloor2QtyByAssemblyId(sb, floor2LocationId) {
  const loc = String(floor2LocationId || '').trim();
  const out = new Map();
  if (!loc) return out;
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(ASSEMBLY_INVENTORY)
      .select('assembly_id, quantity')
      .eq('location_id', loc)
      .gt('quantity', 0)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || 'Failed to load Floor 2 stock');
    const rows = data || [];
    rows.forEach((row) => {
      const id = String(row.assembly_id || '').trim();
      if (!id) return;
      const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
      if (qty > 0) out.set(id, qty);
    });
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
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

/**
 * Load catalog context for upholstery manufacture / WIP jobs (web /upholstery catalog only).
 */
export async function loadUpholsteryManufactureContext(sb, rawAssemblyId) {
  const rawId = String(rawAssemblyId || '').trim();
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
  if (!rawRow) throw new Error('Raw product not found');
  if (!parseCarpentryMeta(rawRow).selected) {
    throw new Error('Raw product is not in the Carpentry catalog');
  }

  const finishedTemplate = findUpholsteryFinishedForRawAssembly(assemblies || [], rawId);
  if (!finishedTemplate || !parseUpholsteryMeta(finishedTemplate).selected) {
    throw new Error('Add and link this product on the web Upholstery page first');
  }

  const finishedCatalog = listUpholsteryCatalogProducts([finishedTemplate]);
  const upholsteryMaterials = finishedCatalog[0]?.materials || [];

  return {
    assemblies,
    floor2Loc,
    rawId,
    rawRow,
    finishedTemplate,
    upholsteryMaterials,
  };
}

/** Deduct Floor 2 raw; optional storeroom BOM (BOM is job/order wrench only — not manufacture). */
export async function consumeUpholsteryRawAndMaterials(sb, ctx, productQty, {
  deductStoreroomBom = false,
} = {}) {
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  const { rawId, floor2Loc, upholsteryMaterials } = ctx;

  const available = await sumRawQtyOnWarehouseFloor2(sb, rawId, floor2Loc.id);
  if (available < qty) {
    throw new Error(`Insufficient raw stock on Warehouse Floor 2 (have ${available}, need ${qty})`);
  }

  await deductRawFromWarehouseFloor2(sb, rawId, qty, floor2Loc.id);

  let materialUsageRows = [];
  let storeroomLocsForRecompute = [];
  if (deductStoreroomBom && upholsteryMaterials.length) {
    storeroomLocsForRecompute = await resolveCarpentryStoreroomLocations(sb);
    materialUsageRows = await deductStoreroomBomMaterials(
      sb,
      upholsteryMaterials,
      qty,
      storeroomLocsForRecompute,
    );
  }

  return { qty, materialUsageRows, storeroomLocsForRecompute };
}

/** Resolve finished SKU row — no stock movement (Delivery app stages Floor 2 on job finish). */
export async function resolveFinishedOutputAssemblyOnly(sb, ctx) {
  const templateAssembly = ctx.finishedTemplate;
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
  return {
    outputAssembly: output,
    output_assembly_id: outputId,
    sku,
    name,
    qty_before: 0,
    qty_after: 0,
    created,
  };
}

/** @deprecated Floor 1 credit — use resolveFinishedOutputAssemblyOnly + Floor 2 staging for delivery app. */
export async function creditUpholsteryFinishedOutput(sb, ctx, productQty) {
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  return resolveOrCreateFinishedAtFactory(sb, ctx.finishedTemplate, qty);
}

export async function recomputeUpholsteryManufactureLocations(
  sb,
  ctx,
  storeroomLocsForRecompute = [],
  { includeFactory = true } = {},
) {
  const locIds = new Set();
  (storeroomLocsForRecompute || []).forEach((loc) => {
    if (loc?.id) locIds.add(String(loc.id));
  });
  if (ctx?.floor2Loc?.id) {
    locIds.add(String(ctx.floor2Loc.id));
  }
  if (includeFactory) {
    locIds.add(String(WAREHOUSE_FACTORY_LOCATION_ID));
  }
  await Promise.all(
    [...locIds].map((id) => recomputeWarehouseLocationStockServer(sb, id)),
  );
}

/**
 * Raw on Warehouse Floor 2 — only rows selected on web /upholstery with a raw link.
 */
export async function listUpholsteryManufactureCandidates(sb) {
  const [{ data: assemblies, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku, item_kind, metadata, category_id, image_url'),
    sb.from(LOCATIONS).select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  if (!floor2Loc?.id) {
    return { products: [], floor2Missing: true };
  }

  const rows = assemblies || [];
  const assemblyById = new Map(rows.map((row) => [String(row.id), row]));
  const upholsteryRows = listUpholsteryCatalogProducts(rows);
  const floor2QtyByAssembly = await loadAllFloor2QtyByAssemblyId(sb, floor2Loc.id);

  const products = [];
  for (const u of upholsteryRows) {
    const rawId = String(u.raw_assembly_id || '').trim();
    if (!rawId) continue;
    const finishedAsm = findUpholsteryFinishedForRawAssembly(rows, rawId)
      || assemblyById.get(String(u.id || ''));
    if (!finishedAsm) continue;
    const rawAsm = assemblyById.get(rawId) || {};
    if (!parseCarpentryMeta(rawAsm).selected) continue;
    const rawQty = floor2QtyByAssembly.get(rawId) || 0;
    if (rawQty < 1) continue;
    const rawWip = readWarehouseFloor2WipImageUrl(rawAsm);
    const finishedWip = readWarehouseFloor2WipImageUrl(finishedAsm);
    const familyWip = readWarehouseFloor2WipFamilyImageUrl(finishedAsm);
    products.push({
      id: rawId,
      raw_assembly_id: rawId,
      raw_name: rawAsm?.name || rawId,
      raw_sku: rawAsm?.family_sku || '',
      image_url: '',
      floor2_image_url: rawWip || finishedWip || familyWip || '',
      finished_assembly_id: finishedAsm.id,
      finished_name: finishedAsm.name,
      finished_sku: finishedAsm.family_sku,
      floor2_qty: rawQty,
      carpentry_qty: rawQty,
      metadata: rawAsm?.metadata && typeof rawAsm.metadata === 'object' ? rawAsm.metadata : {},
    });
  }

  products.sort((a, b) => String(a.raw_name).localeCompare(String(b.raw_name)));
  return { products, floor2Missing: false, carpentryWarehousesMissing: false };
}

/**
 * Workshop manufacture: open an upholstery production job and deduct Floor 2 raw immediately
 * (WIP taken to the bench). On job finish: virtual delivery hold (no Floor 1 credit).
 */
export async function executeUpholsteryManufacture(sb, {
  rawAssemblyId,
  productQty = 1,
  userId = null,
}) {
  const ctx = await loadUpholsteryManufactureContext(sb, rawAssemblyId);
  const qty = Math.max(1, Math.floor(Number(productQty) || 1));
  const { rawId, finishedTemplate } = ctx;

  const { pushFloor2ToProductionJob } = await import('./productionManufactureFloor2.js');
  const result = await pushFloor2ToProductionJob(sb, {
    assemblyId: rawId,
    productQty: qty,
    channel: 'upholstery',
    userId,
  });

  return {
    job: result.job,
    job_id: result.job?.job_id || result.job?.id || null,
    raw_assembly_id: rawId,
    finished_assembly_id: finishedTemplate.id,
    product_qty: qty,
  };
}
