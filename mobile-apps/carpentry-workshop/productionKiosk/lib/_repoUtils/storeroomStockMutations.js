import { normalizeCarpentryUom } from '../_repoConstants/carpentryUom.js';
import { loadMaterialUomAllowedSet } from './materialUomMutations.js';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  normalizeWarehouseSkuKey,
} from './warehouseScanResolver.js';
import { generateRandomWarehouseSku16 } from './warehouseRandomSku.js';
import { parseStoreroomMaterialMeta } from './productionPortalCatalog.js';
import { CARPENTRY_WAREHOUSE_NAMES } from '../_repoConstants/carpentryWarehouses.js';

const ASSEMBLIES = 'warehouse_assemblies';
const INVENTORY = 'warehouse_assembly_inventory';

async function assertUniqueWarehouseSkuOnSb(sb, sku, { excludeAssemblyId, excludeAssemblyIds } = {}) {
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
  const excludeIds = new Set(
    [excludeAssemblyId, ...(excludeAssemblyIds || [])]
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const productClash = (assemblies || []).find(
    (row) => normalizeWarehouseSkuKey(row.family_sku) === key
      && !excludeIds.has(String(row.id)),
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

function isStoreroomMaterialRow(assembly) {
  return assembly?.metadata?.storeroom?.is_storeroom_material === true;
}

function hasStoreroomMetadataBlock(assembly) {
  const block = assembly?.metadata?.storeroom;
  return Boolean(block && typeof block === 'object');
}

function isProductionCatalogAssembly(assembly) {
  const m = assembly?.metadata || {};
  return m.carpentry?.selected === true
    || m.upholstery?.selected === true
    || m.painting?.selected === true;
}

async function loadCarpentryStoreroomLocationIds(sb) {
  const { data: locs, error } = await sb.from('locations').select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations');
  const names = new Set(CARPENTRY_WAREHOUSE_NAMES);
  return (locs || [])
    .filter((row) => names.has(String(row.name || '').trim()))
    .map((row) => String(row.id));
}

async function assemblyHasInventoryAtLocations(sb, assemblyId, locationIds) {
  const ids = (locationIds || []).filter(Boolean);
  if (!ids.length) return false;
  const { data, error } = await sb
    .from(INVENTORY)
    .select('location_id')
    .eq('assembly_id', String(assemblyId))
    .in('location_id', ids)
    .limit(1);
  if (error) throw new Error(error.message || 'Failed to read storeroom stock');
  return Boolean((data || []).length);
}

async function isAssemblyEligibleForStoreroomSkuReuse(sb, assembly, storeroomLocIds) {
  if (!assembly?.id) return false;
  if (isStoreroomMaterialRow(assembly) || hasStoreroomMetadataBlock(assembly)) return true;
  if (await assemblyHasInventoryAtLocations(sb, assembly.id, storeroomLocIds)) return true;
  if (isProductionCatalogAssembly(assembly)) return false;
  return false;
}

async function findAssemblyByFamilySku(sb, familySku) {
  const sku = normalizeWarehouseProductSku(familySku);
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) return null;
  const { data, error } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata')
    .eq('family_sku', sku);
  if (error) throw new Error(error.message || 'Failed to look up SKU');
  const rows = data || [];
  if (!rows.length) return null;
  return rows.find((row) => normalizeWarehouseSkuKey(row.family_sku) === key) || rows[0];
}

/** One SKU = one storeroom material record; qty is per storeroom location. */
async function resolveStoreroomSkuReuseAssembly(sb, familySku) {
  const assembly = await findAssemblyByFamilySku(sb, familySku);
  if (!assembly) return null;
  const storeroomLocIds = await loadCarpentryStoreroomLocationIds(sb);
  if (!(await isAssemblyEligibleForStoreroomSkuReuse(sb, assembly, storeroomLocIds))) {
    return null;
  }
  return assembly;
}

/** Storeroom create form: existing material with this SKU in another storeroom (same name / UOM). */
export async function lookupStoreroomMaterialBySku(sb, familySkuInput) {
  const familySku = normalizeWarehouseProductSku(familySkuInput);
  if (!familySku) {
    return { ok: true, found: false };
  }
  const assembly = await findAssemblyByFamilySku(sb, familySku);
  if (!assembly) {
    return { ok: true, found: false, family_sku: familySku };
  }
  const storeroomLocIds = await loadCarpentryStoreroomLocationIds(sb);
  const eligible = await isAssemblyEligibleForStoreroomSkuReuse(sb, assembly, storeroomLocIds);
  const meta = parseStoreroomMaterialMeta(assembly);
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const defaultUom = normalizeCarpentryUom(meta.default_uom, uomAllowed.size ? uomAllowed : undefined);
  if (!eligible) {
    return {
      ok: true,
      found: true,
      eligible: false,
      assembly_id: String(assembly.id),
      name: String(assembly.name || '').trim(),
      family_sku: String(assembly.family_sku || familySku).trim(),
      default_uom: defaultUom || '',
      reason: isProductionCatalogAssembly(assembly)
        ? 'warehouse_product'
        : 'not_storeroom',
    };
  }
  return {
    ok: true,
    found: true,
    eligible: true,
    assembly_id: String(assembly.id),
    name: String(assembly.name || '').trim(),
    family_sku: String(assembly.family_sku || familySku).trim(),
    default_uom: defaultUom || '',
    link_existing: true,
  };
}

async function ensureStoreroomMaterialFlags(sb, assemblyId, uom) {
  const id = String(assemblyId || '').trim();
  if (!id) return;
  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Material not found');
  const allowed = await loadMaterialUomAllowedSet(sb);
  const metadata = {
    ...(row.metadata || {}),
    storeroom: {
      ...(row.metadata?.storeroom && typeof row.metadata.storeroom === 'object' ? row.metadata.storeroom : {}),
      default_uom: normalizeCarpentryUom(uom, allowed.size ? allowed : undefined),
      is_storeroom_material: true,
    },
  };
  const { error } = await sb.from(ASSEMBLIES).update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to mark storeroom material');
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
      is_storeroom_material: true,
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
  const locId = String(locationId || '').trim();
  const qty = Math.max(0, Number(quantity) || 0);
  if (!locId) throw new Error('location_id is required');
  if (qty <= 0) throw new Error('quantity must be greater than zero');

  let familySku = String(familySkuInput || '').trim();
  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const uomInput = normalizeCarpentryUom(defaultUom, uomAllowed.size ? uomAllowed : undefined);
  const now = new Date().toISOString();

  if (generateSku || !familySku) {
    familySku = await generateUniqueWarehouseSkuOnSb(sb);
  } else {
    familySku = normalizeWarehouseProductSku(familySku);
    if (!familySku) throw new Error('SKU is required');
    const existing = await resolveStoreroomSkuReuseAssembly(sb, familySku);
    if (existing) {
      const linkedName = String(name || '').trim() || String(existing.name || '').trim();
      if (!linkedName) throw new Error('Material name is required');
      const meta = parseStoreroomMaterialMeta(existing);
      const uom = uomInput
        || normalizeCarpentryUom(meta.default_uom, uomAllowed.size ? uomAllowed : undefined);
      if (!uom) throw new Error('Choose a unit of measure (create UOMs under Materials first)');
      await ensureStoreroomMaterialFlags(sb, existing.id, uom);
      const assemblyId = String(existing.id);
      const { error: upsertErr } = await sb.from(INVENTORY).upsert({
        assembly_id: assemblyId,
        location_id: locId,
        quantity: qty,
        updated_at: now,
      }, { onConflict: 'assembly_id,location_id' });
      if (upsertErr) throw new Error(upsertErr.message || 'Failed to set storeroom stock');
      return {
        assembly_id: assemblyId,
        name: existing.name,
        family_sku: existing.family_sku,
        location_id: locId,
        quantity: qty,
        default_uom: uom,
        linked_existing_storeroom_material: true,
      };
    }
    const clash = await findAssemblyByFamilySku(sb, familySku);
    if (clash) {
      throw new Error(
        `SKU already used by warehouse product "${clash.name || clash.family_sku}". `
        + 'Use “Stock at this storeroom” to add qty for storeroom materials, or choose another SKU.',
      );
    }
    await assertUniqueWarehouseSkuOnSb(sb, familySku);
  }

  const materialName = String(name || '').trim();
  if (!materialName) throw new Error('Material name is required');
  const uom = uomInput;
  if (!uom) throw new Error('Choose a unit of measure (create UOMs under Materials first)');

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

async function listStoreroomMaterialsWithSameSku(sb, assemblyRow) {
  const key = normalizeWarehouseSkuKey(assemblyRow?.family_sku);
  if (!key) return assemblyRow?.id ? [assemblyRow] : [];
  const sku = normalizeWarehouseProductSku(assemblyRow.family_sku);
  const { data, error } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata')
    .eq('family_sku', sku);
  if (error) throw new Error(error.message || 'Failed to look up materials by SKU');
  const exact = (data || []).filter((row) => isStoreroomMaterialRow(row));
  if (exact.length) return exact;
  const { data: broad, error: broadErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata')
    .ilike('family_sku', sku);
  if (broadErr) throw new Error(broadErr.message || 'Failed to look up materials by SKU');
  return (broad || []).filter(
    (row) => isStoreroomMaterialRow(row)
      && normalizeWarehouseSkuKey(row.family_sku) === key,
  );
}

/**
 * Update storeroom material fields; when apply_to_same_sku (default), name/SKU/UOM apply
 * to every storeroom material assembly sharing the same SKU. Qty applies only to this row.
 */
export async function updateStoreroomMaterial(sb, {
  assembly_id: assemblyId,
  location_id: locationId,
  name,
  family_sku: familySkuInput,
  default_uom: defaultUom,
  quantity,
  apply_to_same_sku: applyToSameSku = true,
}) {
  const aid = String(assemblyId || '').trim();
  const locId = String(locationId || '').trim();
  if (!aid) throw new Error('assembly_id required');
  if (!locId) throw new Error('location_id required');

  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, name, family_sku, metadata')
    .eq('id', aid)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Material not found');
  if (!isStoreroomMaterialRow(row)) throw new Error('Not a storeroom material');

  const materialName = String(name ?? row.name ?? '').trim();
  if (!materialName) throw new Error('Material name is required');

  const oldSkuKey = normalizeWarehouseSkuKey(row.family_sku);
  let newSku = normalizeWarehouseProductSku(
    familySkuInput !== undefined && familySkuInput !== null
      ? familySkuInput
      : row.family_sku,
  );
  if (!newSku) throw new Error('SKU is required');

  const uomAllowed = await loadMaterialUomAllowedSet(sb);
  const prevMeta = parseStoreroomMaterialMeta(row);
  const uom = normalizeCarpentryUom(
    defaultUom !== undefined && defaultUom !== null ? defaultUom : prevMeta.default_uom,
    uomAllowed.size ? uomAllowed : undefined,
  );
  if (!uom) throw new Error('Choose a unit of measure');

  const targets = applyToSameSku
    ? await listStoreroomMaterialsWithSameSku(sb, row)
    : [row];
  const targetIds = targets.map((t) => String(t.id)).filter(Boolean);
  if (!targetIds.length) throw new Error('Material not found');

  const newSkuKey = normalizeWarehouseSkuKey(newSku);
  if (newSkuKey !== oldSkuKey) {
    await assertUniqueWarehouseSkuOnSb(sb, newSku, { excludeAssemblyIds: targetIds });
  }

  const now = new Date().toISOString();
  for (const target of targets) {
    const metadata = {
      ...(target.metadata || {}),
      storeroom: {
        ...(target.metadata?.storeroom && typeof target.metadata.storeroom === 'object'
          ? target.metadata.storeroom
          : {}),
        default_uom: uom,
        is_storeroom_material: true,
      },
    };
    const { error: updErr } = await sb.from(ASSEMBLIES).update({
      name: materialName,
      family_sku: newSku,
      metadata,
      updated_at: now,
    }).eq('id', String(target.id));
    if (updErr) throw new Error(updErr.message || 'Failed to update material');
  }

  const qty = Math.max(0, Number(quantity) || 0);
  const stockResult = await setStoreroomMaterialStockQty(sb, {
    assembly_id: aid,
    location_id: locId,
    quantity: qty,
  });

  return {
    assembly_id: aid,
    updated_assembly_ids: targetIds,
    family_sku: newSku,
    name: materialName,
    default_uom: uom,
    ...stockResult,
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

/** Remove a material’s on-hand row at one storeroom (does not delete the material assembly). */
export async function removeStoreroomMaterialStockAtLocation(sb, {
  assembly_id: assemblyId,
  location_id: locationId,
}) {
  const aid = String(assemblyId || '').trim();
  const locId = String(locationId || '').trim();
  if (!aid) throw new Error('assembly_id required');
  if (!locId) throw new Error('location_id required');

  const { data: row, error: readErr } = await sb
    .from(ASSEMBLIES)
    .select('id, metadata')
    .eq('id', aid)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly');
  if (!row?.id) throw new Error('Material not found');
  if (row.metadata?.storeroom?.is_storeroom_material !== true) {
    throw new Error('Not a storeroom material');
  }

  const { error: delErr } = await sb
    .from(INVENTORY)
    .delete()
    .eq('assembly_id', aid)
    .eq('location_id', locId);
  if (delErr) throw new Error(delErr.message || 'Failed to remove storeroom stock');
  return { assembly_id: aid, location_id: locId, removed: true };
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
