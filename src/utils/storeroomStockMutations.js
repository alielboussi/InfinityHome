import { normalizeCarpentryUom } from '../constants/carpentryUom';
import { loadMaterialUomAllowedSet } from './materialUomMutations';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  normalizeWarehouseSkuKey,
} from './warehouseScanResolver';
import { generateRandomWarehouseSku16 } from './warehouseRandomSku';
import { parseStoreroomMaterialMeta } from './productionPortalCatalog.js';

const ASSEMBLIES = 'warehouse_assemblies';
const INVENTORY = 'warehouse_assembly_inventory';

async function assertUniqueWarehouseSkuOnSb(sb, sku, { excludeAssemblyId } = {}) {
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) throw new Error('SKU is required');
  const familySku = normalizeWarehouseProductSku(sku);
  const packetSku = normalizeWarehousePacketScan(sku);
  const [{ data: assemblies, error: aErr }, { data: packets, error: pErr }, { data: legacyProducts, error: lErr }] = await Promise.all([
    familySku
      ? sb.from(ASSEMBLIES).select('id, name, family_sku').eq('family_sku', familySku)
      : Promise.resolve({ data: [], error: null }),
    packetSku
      ? sb.from('warehouse_packets').select('id, name, sku').eq('sku', packetSku)
      : Promise.resolve({ data: [], error: null }),
    familySku
      ? sb.from('products').select('id, name, sku').eq('sku', familySku)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to validate SKU');
  if (pErr) throw new Error(pErr.message || 'Failed to validate SKU');
  if (lErr) throw new Error(lErr.message || 'Failed to validate SKU');
  const productClash = (assemblies || []).find(
    (row) => normalizeWarehouseSkuKey(row.family_sku) === key
      && String(row.id) !== String(excludeAssemblyId || ''),
  );
  if (productClash) {
    throw new Error(`SKU already used by warehouse product "${productClash.name || productClash.family_sku}".`);
  }
  const packetClash = (packets || []).find(
    (row) => normalizeWarehouseSkuKey(row.sku) === key,
  );
  if (packetClash) {
    throw new Error(`SKU already used by warehouse packet "${packetClash.name || packetClash.sku}".`);
  }
  const legacyClash = (legacyProducts || []).find(
    (row) => normalizeWarehouseSkuKey(row.sku) === key,
  );
  if (legacyClash) {
    throw new Error(`SKU already used by catalog product "${legacyClash.name || legacyClash.sku}".`);
  }
}

async function generateUniqueWarehouseSkuOnSb(sb) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const sku = generateRandomWarehouseSku16();
    try {
      await assertUniqueWarehouseSkuOnSb(sb, sku);
      return sku;
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.toLowerCase().includes('already used')) {
        throw err;
      }
    }
  }
  throw new Error('Could not generate a unique SKU. Try again.');
}

export async function saveStoreroomMaterialDefaultUom(sb, assemblyId, uom) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id required');
  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');
  const prev = parseStoreroomMaterialMeta(row);
  const allowed = await loadMaterialUomAllowedSet(sb);
  const metadata = {
    ...(row.metadata || {}),
    storeroom: {
      ...(row.metadata?.storeroom && typeof row.metadata.storeroom === 'object' ? row.metadata.storeroom : {}),
      default_uom: normalizeCarpentryUom(uom || prev.default_uom, allowed.size ? allowed : undefined),
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to save storeroom UOM');
}

/**
 * Create a new storeroom material (warehouse assembly + qty at storeroom location).
 * SKU: pass family_sku for manual entry, or omit / generate_sku for random 16-char SKU.
 */
export async function createStoreroomMaterial(sb, {
  name,
  family_sku: familySkuInput,
  location_id: locationId,
  quantity,
  default_uom: defaultUom,
  generate_sku: generateSku,
}) {
  const materialName = String(name || '').trim();
  const locId = String(locationId || '').trim();
  const qty = Math.max(0, Number(quantity) || 0);
  if (!materialName) throw new Error('Material name is required');
  if (!locId) throw new Error('location_id is required');
  if (qty <= 0) throw new Error('quantity must be greater than zero');

  let familySku = String(familySkuInput || '').trim();
  if (generateSku || !familySku) {
    familySku = await generateUniqueWarehouseSkuOnSb(sb);
  } else {
    familySku = normalizeWarehouseProductSku(familySku);
    if (!familySku) throw new Error('SKU is required');
    await assertUniqueWarehouseSkuOnSb(sb, familySku);
  }

  const uom = normalizeCarpentryUom(defaultUom, await loadMaterialUomAllowedSet(sb));
  if (!uom) throw new Error('Choose a unit of measure (create UOMs under Materials first)');
  const now = new Date().toISOString();
  const metadata = {
    storeroom: {
      default_uom: uom,
      is_storeroom_material: true,
    },
  };

  const { data: created, error: insErr } = await sb.from(ASSEMBLIES).insert({
    name: materialName,
    family_sku: familySku,
    category_id: null,
    inventory_mode: 'finished',
    item_kind: 'product',
    metadata,
    created_at: now,
    updated_at: now,
  }).select('id, name, family_sku').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create material');

  const assemblyId = String(created.id);
  const { error: upsertErr } = await sb.from(INVENTORY).upsert({
    assembly_id: assemblyId,
    location_id: locId,
    quantity: qty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (upsertErr) throw new Error(upsertErr.message || 'Failed to set storeroom stock');

  return {
    assembly_id: assemblyId,
    name: created.name,
    family_sku: created.family_sku,
    location_id: locId,
    quantity: qty,
    default_uom: uom,
  };
}

/** Set on-hand qty for a material at a storeroom location (absolute, not delta). */
export async function setStoreroomMaterialStockQty(sb, {
  assembly_id: assemblyId,
  location_id: locationId,
  quantity,
}) {
  const aid = String(assemblyId || '').trim();
  const locId = String(locationId || '').trim();
  const qty = Math.max(0, Number(quantity) || 0);
  if (!aid) throw new Error('assembly_id required');
  if (!locId) throw new Error('location_id required');

  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata')
    .eq('id', aid)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Material not found');

  const now = new Date().toISOString();
  const { error: upsertErr } = await sb.from(INVENTORY).upsert({
    assembly_id: aid,
    location_id: locId,
    quantity: qty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (upsertErr) throw new Error(upsertErr.message || 'Failed to update storeroom stock');
  return { assembly_id: aid, location_id: locId, quantity: qty };
}

/** @deprecated Use createStoreroomMaterial — adds qty to an existing assembly at a storeroom. */
export async function receiveStoreroomMaterial(sb, body) {
  const aid = String(body.assembly_id || '').trim();
  const locId = String(body.location_id || '').trim();
  const delta = Math.max(0, Number(body.quantity) || 0);
  if (!aid) throw new Error('assembly_id required');
  if (!locId) throw new Error('location_id required');
  if (delta <= 0) throw new Error('quantity must be greater than zero');

  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id')
    .eq('id', aid)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Product not found');

  if (body.default_uom) {
    await saveStoreroomMaterialDefaultUom(sb, aid, body.default_uom);
  }

  const { data: existing, error: invReadErr } = await sb
    .from(INVENTORY)
    .select('quantity')
    .eq('assembly_id', aid)
    .eq('location_id', locId)
    .maybeSingle();
  if (invReadErr) throw new Error(invReadErr.message || 'Failed to read storeroom stock');
  const prev = Math.max(0, Number(existing?.quantity) || 0);
  const next = prev + delta;
  const { error: upsertErr } = await sb.from(INVENTORY).upsert({
    assembly_id: aid,
    location_id: locId,
    quantity: next,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'assembly_id,location_id' });
  if (upsertErr) throw new Error(upsertErr.message || 'Failed to update storeroom stock');
  return { assembly_id: aid, location_id: locId, quantity: next, received: delta };
}
