import db from '../dataClient';
import {
  analyzeAssemblyPacketBom,
  normalizeWarehouseColorKey,
  normalizeWarehouseSkuKey,
  WAREHOUSE_INVENTORY_MODE,
} from '../utils/warehouseAssemblyMath';
import {
  isWarehouseKitShowroomLocation,
  warehouseCatalogAllowsSetCreate,
} from '../constants/warehouseShowroomLocations';
import { validateSetComponentAssembly } from '../utils/warehouseCatalogHierarchy';
import { expandWarehouseSetItemsRows } from '../utils/warehouseSetItems';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  resolvePacketFromScan,
} from '../utils/warehouseScanResolver';
import { titleCaseWords } from '../utils/titleCaseWords';
import { resolveWarehouseLocation } from '../utils/resolveWarehouseLocation.js';
import {
  assertWarehouseProductQtyIncrementOnly,
  currentAssemblyWarehouseUnits,
  packetUpdatesForAssemblyTargetUnits,
} from '../utils/warehouseAssemblyProductQuantity.js';
import { assemblyDerivesWarehouseStockFromPackets } from '../utils/warehouseAssemblyMath';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_LOCATIONS = 'warehouse_assembly_locations';
const COLORS = 'warehouse_colors';
const ASSEMBLY_COLORS = 'warehouse_assembly_colors';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';
const SET_ITEMS = 'warehouse_set_items';

export { WAREHOUSE_INVENTORY_MODE };

export const WAREHOUSE_ITEM_KIND = Object.freeze({
  PRODUCT: 'product',
  PACKET: 'packet',
  SET: 'set',
});

export { resolveWarehouseLocation };

export function showroomLocations(locations, warehouseLocationId) {
  return (locations || []).filter(
    (loc) => warehouseLocationId == null || String(loc.id) !== String(warehouseLocationId),
  );
}

export async function fetchWarehouseCatalog() {
  const [
    { data: assemblies, error: assembliesErr },
    { data: packets, error: packetsErr },
    { data: inventory, error: inventoryErr },
    { data: assemblyLocations, error: assemblyLocErr },
    { data: assemblyInventory, error: assemblyInvErr },
    { data: assemblyColors, error: assemblyColorsErr },
    { data: assemblyPackets, error: assemblyPacketsErr },
    { data: setItems, error: setItemsErr },
    { data: colors, error: colorsErr },
    { data: categories, error: categoriesErr },
    { data: locations, error: locationsErr },
  ] = await Promise.all([
    db.from(ASSEMBLIES).select('*').order('name', { ascending: true }),
    db.from(PACKETS).select('*').order('packet_number', { ascending: true }),
    db.from(INVENTORY).select('*'),
    db.from(ASSEMBLY_LOCATIONS).select('*'),
    db.from(ASSEMBLY_INVENTORY).select('*'),
    db.from(ASSEMBLY_COLORS).select('*'),
    db.from(ASSEMBLY_PACKETS).select('*'),
    db.from(SET_ITEMS).select('*'),
    db.from(COLORS).select('*').order('name', { ascending: true }),
    db.from('categories').select('id, name').order('name', { ascending: true }),
    db.from('locations').select('id, name').order('name', { ascending: true }),
  ]);

  if (assembliesErr) throw new Error(assembliesErr.message || 'Failed to load warehouse products');
  if (packetsErr) throw new Error(packetsErr.message || 'Failed to load warehouse packets');
  if (inventoryErr) throw new Error(inventoryErr.message || 'Failed to load warehouse inventory');
  if (assemblyLocErr) throw new Error(assemblyLocErr.message || 'Failed to load product locations');
  if (assemblyColorsErr) throw new Error(assemblyColorsErr.message || 'Failed to load product colors');
  if (assemblyPacketsErr) throw new Error(assemblyPacketsErr.message || 'Failed to load product packet links');
  if (setItemsErr) throw new Error(setItemsErr.message || 'Failed to load warehouse set lines');
  if (colorsErr) throw new Error(colorsErr.message || 'Failed to load variant colors');
  if (assemblyInvErr) throw new Error(assemblyInvErr.message || 'Failed to load finished stock');
  if (categoriesErr) throw new Error(categoriesErr.message || 'Failed to load categories');
  if (locationsErr) throw new Error(locationsErr.message || 'Failed to load locations');

  const warehouseLocation = resolveWarehouseLocation(locations, { packets });

  return {
    assemblies: assemblies || [],
    packets: packets || [],
    inventory: inventory || [],
    assemblyLocations: assemblyLocations || [],
    assemblyColors: assemblyColors || [],
    assemblyPackets: assemblyPackets || [],
    setItems: expandWarehouseSetItemsRows(setItems || []),
    assemblyInventory: assemblyInventory || [],
    colors: colors || [],
    categories: categories || [],
    locations: locations || [],
    warehouseLocationId: warehouseLocation?.id ?? null,
    warehouseLocationName: warehouseLocation?.name ?? 'Warehouse',
  };
}

/**
 * One SKU namespace: warehouse products, warehouse packets, and legacy products.
 */
async function assertUniqueWarehouseSku(sku, {
  excludeAssemblyId,
  excludePacketId,
  linkedAssemblyId,
  linkedPacketIds,
} = {}) {
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) throw new Error('SKU is required');

  const familySku = normalizeWarehouseProductSku(sku);
  const packetSku = normalizeWarehousePacketScan(sku);
  const [
    { data: assemblies, error: aErr },
    { data: packets, error: pErr },
    { data: legacyProducts, error: lErr },
  ] = await Promise.all([
    familySku
      ? db.from(ASSEMBLIES).select('id, name, family_sku').eq('family_sku', familySku)
      : Promise.resolve({ data: [], error: null }),
    packetSku
      ? db.from(PACKETS).select('id, name, sku').eq('sku', packetSku)
      : Promise.resolve({ data: [], error: null }),
    familySku
      ? db.from('products').select('id, name, sku').eq('sku', familySku)
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
    const linkedOk = linkedAssemblyId
      && String(productClash.id) === String(linkedAssemblyId)
      && normalizeWarehouseSkuKey(productClash.family_sku) === key;
    if (!linkedOk) {
      throw new Error(`SKU already used by warehouse product "${productClash.name || productClash.family_sku}".`);
    }
  }

  const excludedPacketIds = new Set(
    [excludePacketId, ...(linkedPacketIds || [])]
      .filter(Boolean)
      .map(String),
  );
  const packetClash = (packets || []).find(
    (row) => normalizeWarehouseSkuKey(row.sku) === key
      && !excludedPacketIds.has(String(row.id)),
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

export async function findOrCreateWarehouseColor(displayName) {
  const name = String(displayName || '').trim();
  if (!name) throw new Error('Color name is required');
  const nameKey = normalizeWarehouseColorKey(name);
  const { data, error } = await db.from(COLORS).select('*');
  if (error) throw new Error(error.message || 'Failed to load colors');
  const match = (data || []).find((row) => {
    const key = row.name_key || normalizeWarehouseColorKey(row.name);
    return key === nameKey;
  });
  if (match) return match;

  const now = new Date().toISOString();
  const { data: created, error: insErr } = await db.from(COLORS).insert({
    name,
    name_key: nameKey,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create color');
  return created;
}

async function syncAssemblyColors(assemblyId, colorIds) {
  const id = String(assemblyId || '');
  if (!id) return;
  await db.from(ASSEMBLY_COLORS).delete().eq('assembly_id', id);
  const rows = (colorIds || [])
    .filter(Boolean)
    .map((colorId) => ({ assembly_id: id, color_id: colorId }));
  if (!rows.length) return;
  const { error } = await db.from(ASSEMBLY_COLORS).upsert(rows, {
    onConflict: 'assembly_id,color_id',
  });
  if (error) throw new Error(error.message || 'Failed to save product colors');
}

async function syncAssemblyLocations(assemblyId, locationIds) {
  const id = String(assemblyId || '');
  if (!id) return;
  await db.from(ASSEMBLY_LOCATIONS).delete().eq('assembly_id', id);
  const rows = (locationIds || [])
    .filter(Boolean)
    .map((locationId) => ({ assembly_id: id, location_id: locationId }));
  if (rows.length) {
    const { error } = await db.from(ASSEMBLY_LOCATIONS).upsert(rows, {
      onConflict: 'assembly_id,location_id',
    });
    if (error) throw new Error(error.message || 'Failed to save product locations');
  }
}

async function validateAssemblyPacketNumbers(assemblyId, packetCount) {
  const required = Number(packetCount);
  if (!Number.isFinite(required) || required < 1) {
    throw new Error('Set total packets on the product first.');
  }
  const { data: links, error: linkErr } = await db
    .from(ASSEMBLY_PACKETS)
    .select('packet_id, qty_per_unit')
    .eq('assembly_id', assemblyId);
  if (linkErr) throw linkErr;
  const packetIds = (links || []).map((l) => l.packet_id).filter(Boolean);
  if (!packetIds.length) {
    return analyzeAssemblyPacketBom(required, []);
  }
  const { data: packets, error } = await db
    .from(PACKETS)
    .select('id, packet_number, qty_per_unit')
    .in('id', packetIds);
  if (error) throw error;
  const qtyByPacket = new Map(
    (links || []).map((l) => [String(l.packet_id), Math.max(1, Number(l.qty_per_unit) || 1)]),
  );
  const rows = (packets || []).map((p) => ({
    ...p,
    qty_per_unit: qtyByPacket.get(String(p.id)) ?? p.qty_per_unit,
  }));
  return analyzeAssemblyPacketBom(required, rows);
}

function normalizePacketLinks(packetLinks, legacyPacketIds) {
  if (Array.isArray(packetLinks) && packetLinks.length) {
    return packetLinks
      .map((link) => ({
        packet_id: String(link.packet_id || link.id || ''),
        qty_per_unit: Math.max(1, Number(link.qty_per_unit) || 1),
      }))
      .filter((link) => link.packet_id);
  }
  return (legacyPacketIds || []).map((pid) => ({
    packet_id: String(pid),
    qty_per_unit: 1,
  })).filter((link) => link.packet_id);
}

/** Remove a duplicate packet (same SKU + name) when saving a finished product; returns its inventory rows. */
async function detachPacketInventoryForFinishedProduct({ familySku, name, assemblyId }) {
  const key = normalizeWarehouseSkuKey(familySku);
  if (!key) return [];
  const { data: packets, error: pErr } = await db.from(PACKETS).select('id, name, sku');
  if (pErr) throw new Error(pErr.message || 'Failed to load packets');
  const nameNorm = String(name || '').trim().toLowerCase();
  const match = (packets || []).find(
    (p) => normalizeWarehouseSkuKey(p.sku) === key
      && String(p.name || '').trim().toLowerCase() === nameNorm,
  );
  if (!match) return [];
  const { data: links, error: lErr } = await db
    .from(ASSEMBLY_PACKETS)
    .select('assembly_id')
    .eq('packet_id', match.id);
  if (lErr) throw new Error(lErr.message || 'Failed to read packet links');
  const foreign = (links || []).filter(
    (row) => assemblyId && String(row.assembly_id) !== String(assemblyId),
  );
  if (foreign.length > 0) return [];
  if (!assemblyId && (links || []).length > 0) return [];
  const { data: invRows, error: invErr } = await db.from(INVENTORY).select('*').eq('packet_id', match.id);
  if (invErr) throw new Error(invErr.message || 'Failed to read packet stock');
  await deleteWarehousePacket(match.id);
  return invRows || [];
}

async function mergePacketInventoryIntoAssembly(assemblyId, inventoryRows) {
  const aid = String(assemblyId || '');
  if (!aid) return;
  for (const row of inventoryRows || []) {
    const locId = row?.location_id;
    if (!locId) continue;
    const add = Math.max(0, Number(row.quantity) || 0);
    if (add <= 0) continue;
    const { data: existing } = await db.from(ASSEMBLY_INVENTORY)
      .select('quantity')
      .eq('assembly_id', aid)
      .eq('location_id', locId)
      .maybeSingle();
    const prev = Math.max(0, Number(existing?.quantity) || 0);
    await setWarehouseAssemblyQuantity(aid, locId, prev + add);
  }
}

async function refreshPacketPrimaryAssemblyId(packetId) {
  const pid = String(packetId || '');
  if (!pid) return;
  const { data: rows, error } = await db
    .from(ASSEMBLY_PACKETS)
    .select('assembly_id')
    .eq('packet_id', pid);
  if (error) throw new Error(error.message || 'Failed to read packet assignments');
  const primary = rows?.[0]?.assembly_id ?? null;
  const { error: updErr } = await db.from(PACKETS).update({
    assembly_id: primary,
    updated_at: new Date().toISOString(),
  }).eq('id', pid);
  if (updErr) throw new Error(updErr.message || 'Failed to update packet assignment');
}

async function syncAssemblyPackets(assemblyId, packetLinks, warehouseLocationId, legacyPacketIds) {
  const id = String(assemblyId || '');
  if (!id) throw new Error('Product id is required to link packets');
  const links = normalizePacketLinks(packetLinks, legacyPacketIds);
  const now = new Date().toISOString();

  const { data: prevLinks, error: prevErr } = await db
    .from(ASSEMBLY_PACKETS)
    .select('packet_id')
    .eq('assembly_id', id);
  if (prevErr) throw new Error(prevErr.message || 'Failed to read packet links');

  const { error: delErr } = await db.from(ASSEMBLY_PACKETS).delete().eq('assembly_id', id);
  if (delErr) throw new Error(delErr.message || 'Failed to update packet links');

  for (const link of links) {
    const { error } = await db.from(ASSEMBLY_PACKETS).upsert({
      assembly_id: id,
      packet_id: link.packet_id,
      qty_per_unit: link.qty_per_unit,
      max_cartons: null,
      updated_at: now,
    }, { onConflict: 'assembly_id,packet_id' });
    if (error) throw new Error(error.message || 'Failed to link packet');
    const { error: pktErr } = await db.from(PACKETS).update({
      location_id: warehouseLocationId,
      qty_per_unit: link.qty_per_unit,
      updated_at: now,
    }).eq('id', link.packet_id);
    if (pktErr) throw new Error(pktErr.message || 'Failed to update packet');
    await refreshPacketPrimaryAssemblyId(link.packet_id);
  }

  const touched = new Set([
    ...links.map((l) => String(l.packet_id)),
    ...(prevLinks || []).map((r) => String(r.packet_id)),
  ]);
  for (const pid of touched) {
    if (!links.some((l) => String(l.packet_id) === pid)) {
      await refreshPacketPrimaryAssemblyId(pid);
    }
  }
}

async function syncAssemblySetItems(setAssemblyId, setLocationId, setComponents, assembliesById) {
  const setId = String(setAssemblyId || '');
  const locationId = String(setLocationId || '');
  if (!setId) return;
  if (!isWarehouseKitShowroomLocation(locationId)) {
    throw new Error('Set kitting location must be Kitwe or Lusaka.');
  }
  await db.from(SET_ITEMS).delete().eq('set_assembly_id', setId).eq('location_id', locationId);
  const now = new Date().toISOString();
  const rows = [];
  const seen = new Set();
  (setComponents || []).forEach((line) => {
    const componentId = String(line?.component_assembly_id || '').trim();
    const lineKey = `${componentId}`;
    if (!componentId || componentId === setId || seen.has(lineKey)) return;
    const component = assembliesById?.get(componentId);
    validateSetComponentAssembly(component, { setAssemblyId: setId });
    seen.add(lineKey);
    rows.push({
      location_id: locationId,
      set_assembly_id: setId,
      component_assembly_id: componentId,
      quantity: Math.max(1, Number(line?.quantity) || 1),
      updated_at: now,
    });
  });
  if (!rows.length) {
    throw new Error('Add at least one product to this set.');
  }
  const { error } = await db.from(SET_ITEMS).upsert(rows, {
    onConflict: 'location_id,set_assembly_id,component_assembly_id',
  });
  if (error) throw new Error(error.message || 'Failed to save set components');
}

export async function saveWarehouseAssembly(payload, { id, excludePacketId } = {}) {
  const name = titleCaseWords(String(payload?.name || '').trim());
  const familySku = normalizeWarehouseProductSku(payload?.family_sku);
  const categoryId = payload?.category_id || null;
  const retailProductId = payload?.retail_product_id || null;
  const locationIds = payload?.location_ids || [];
  const packetLinks = payload?.packet_links;
  const packetIds = payload?.packet_ids || [];
  const warehouseLocationId = payload?.warehouse_location_id;
  const isSet = payload?.catalog_kind === 'set'
    || String(payload?.item_kind || '').toLowerCase() === WAREHOUSE_ITEM_KIND.SET;
  const setComponents = payload?.set_components || [];
  const setLocationId = payload?.set_location_id || null;
  const inventoryMode = isSet
    ? WAREHOUSE_INVENTORY_MODE.FINISHED
    : (payload?.inventory_mode === WAREHOUSE_INVENTORY_MODE.FINISHED
      ? WAREHOUSE_INVENTORY_MODE.FINISHED
      : WAREHOUSE_INVENTORY_MODE.PACKETS);
  const packetCountRaw = payload?.packet_count;
  const packetCount = packetCountRaw === '' || packetCountRaw == null
    ? null
    : Number(packetCountRaw);
  const hasColorVariants = Boolean(payload?.has_color_variants);
  const colorIds = hasColorVariants ? (payload?.color_ids || []) : [];
  const unitsPerCartonRaw = payload?.units_per_carton;
  let unitsPerCarton = unitsPerCartonRaw === '' || unitsPerCartonRaw == null
    ? 1
    : Math.max(1, Math.floor(Number(unitsPerCartonRaw) || 1));
  if (!isSet && inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS) {
    unitsPerCarton = 1;
  }

  if (!name) throw new Error('Name is required');
  if (!familySku) throw new Error('Product SKU is required');
  if (isSet && !isWarehouseKitShowroomLocation(setLocationId)) {
    throw new Error('Choose Kitwe or Lusaka for this set recipe.');
  }
  if (isSet && !id && !warehouseCatalogAllowsSetCreate()) {
    throw new Error('Sets are built at showroom locations from products — not created in Warehouse.');
  }
  if (isSet) {
    const strayPackets = normalizePacketLinks(packetLinks, packetIds);
    if (strayPackets.length > 0 || (packetCount != null && Number(packetCount) > 0)) {
      throw new Error('Sets are built from products only — packets belong on products.');
    }
  }
  if (!isSet && (setComponents || []).some((line) => String(line?.component_assembly_id || '').trim())) {
    throw new Error('Only sets combine products — add packets to build a product.');
  }

  const packetLinkRows = isSet ? [] : normalizePacketLinks(packetLinks, packetIds);
  const linkedPacketIds = packetLinkRows.map((link) => link.packet_id);

  let absorbedPacketInventory = [];
  if (!isSet && inventoryMode === WAREHOUSE_INVENTORY_MODE.FINISHED && packetLinkRows.length === 0) {
    absorbedPacketInventory = await detachPacketInventoryForFinishedProduct({
      familySku,
      name,
      assemblyId: id,
    });
  }

  let existingLinkedPacketIds = [];
  if (id) {
    const { data: existingLinks, error: linkErr } = await db
      .from(ASSEMBLY_PACKETS)
      .select('packet_id')
      .eq('assembly_id', id);
    if (linkErr) throw new Error(linkErr.message || 'Failed to read packet links');
    existingLinkedPacketIds = (existingLinks || []).map((row) => row.packet_id);
  }

  await assertUniqueWarehouseSku(familySku, {
    excludeAssemblyId: id,
    linkedPacketIds: [...linkedPacketIds, ...existingLinkedPacketIds],
    excludePacketId,
  });

  if (!isSet) {
    if (inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS) {
      if (!Number.isFinite(packetCount) || packetCount < 1) {
        throw new Error('Total packets is required when tracking stock by cartons.');
      }
    } else if (packetCount != null && (!Number.isFinite(packetCount) || packetCount < 1)) {
      throw new Error('Total packets must be at least 1 when set.');
    }
  }

  const row = {
    name,
    family_sku: familySku,
    category_id: categoryId,
    retail_product_id: retailProductId,
    packet_count: isSet ? null : (packetCount == null ? null : packetCount),
    inventory_mode: inventoryMode,
    has_color_variants: hasColorVariants,
    item_kind: isSet ? WAREHOUSE_ITEM_KIND.SET : WAREHOUSE_ITEM_KIND.PRODUCT,
    units_per_carton: isSet ? null : unitsPerCarton,
    updated_at: new Date().toISOString(),
  };

  let assemblyId = id;
  if (id) {
    const { error } = await db.from(ASSEMBLIES).update(row).eq('id', id);
    if (error) throw new Error(error.message || 'Failed to update product');
  } else {
    const { data, error } = await db.from(ASSEMBLIES).insert({
      ...row,
      created_at: row.updated_at,
    }).select('*').single();
    if (error) throw new Error(error.message || 'Failed to create product');
    assemblyId = data.id;
  }

  await syncAssemblyLocations(assemblyId, locationIds);
  await syncAssemblyColors(assemblyId, colorIds);

  if (isSet) {
    const { data: allAssemblies } = await db.from(ASSEMBLIES).select('id, item_kind');
    const assembliesById = new Map((allAssemblies || []).map((a) => [String(a.id), a]));
    await db.from(ASSEMBLY_PACKETS).delete().eq('assembly_id', assemblyId);
    await syncAssemblySetItems(assemblyId, setLocationId, setComponents, assembliesById);
  } else if (warehouseLocationId) {
    await syncAssemblyPackets(assemblyId, packetLinks, warehouseLocationId, packetIds);
    if (inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS && packetCount != null) {
      await validateAssemblyPacketNumbers(assemblyId, packetCount);
    }
  }

  if (absorbedPacketInventory.length) {
    await mergePacketInventoryIntoAssembly(assemblyId, absorbedPacketInventory);
  }

  if (warehouseLocationId && !isSet) {
    const needsStockSync = inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS
      || packetLinkRows.length > 0
      || absorbedPacketInventory.length > 0;
    if (needsStockSync) {
      const { recomputeWarehouseAssemblyStockAtLocation } = await import('./warehouseTransfer');
      await recomputeWarehouseAssemblyStockAtLocation(assemblyId, warehouseLocationId);
    }
  }

  return { ...row, id: assemblyId };
}

export async function setWarehouseAssemblyQuantity(assemblyId, locationId, quantity) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (!assemblyId || !locationId) throw new Error('Product and location are required');
  const { error } = await db.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: assemblyId,
    location_id: locationId,
    quantity: qty,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'assembly_id,location_id' });
  if (error) throw new Error(error.message || 'Failed to update finished quantity');
}

/**
 * Set warehouse finished product qty (increments only). For packet-BOM products,
 * sets each linked packet to qty_per_product × target units.
 */
export async function setWarehouseAssemblyProductQuantity(
  assemblyId,
  locationId,
  targetUnits,
  { incrementOnly = true } = {},
) {
  const aid = String(assemblyId || '');
  const locId = String(locationId || '');
  const target = Math.max(0, Math.floor(Number(targetUnits) || 0));
  if (!aid || !locId) throw new Error('Product and location are required');

  const [
    { data: assembly, error: aErr },
    { data: allPackets, error: pErr },
    { data: assemblyPacketRows, error: apErr },
    { data: inventoryRows, error: iErr },
    { data: assemblyInvRows, error: aiErr },
  ] = await Promise.all([
    db.from(ASSEMBLIES).select('*').eq('id', aid).maybeSingle(),
    db.from(PACKETS).select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    db.from(ASSEMBLY_PACKETS).select('*'),
    db.from(INVENTORY).select('packet_id, quantity').eq('location_id', locId),
    db.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity').eq('location_id', locId),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (pErr) throw new Error(pErr.message || 'Failed to load packets');
  if (apErr) throw new Error(apErr.message || 'Failed to load packet links');
  if (iErr) throw new Error(iErr.message || 'Failed to load packet stock');
  if (aiErr) throw new Error(aiErr.message || 'Failed to load product stock');
  if (!assembly) throw new Error('Product not found');

  const { buildPacketsByAssembly } = await import('../utils/warehouseAssemblyPacketPool');
  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows || [], allPackets || []);
  const pktList = packetsByAssembly.get(aid) || [];

  const inventoryByPacketId = new Map();
  (inventoryRows || []).forEach((row) => {
    inventoryByPacketId.set(String(row.packet_id), Number(row.quantity) || 0);
  });
  pktList.forEach((p) => {
    if (!inventoryByPacketId.has(String(p.id))) inventoryByPacketId.set(String(p.id), 0);
  });

  const assemblyInventoryByLoc = new Map();
  const locMap = new Map();
  (assemblyInvRows || []).forEach((row) => {
    if (String(row.assembly_id) !== aid) return;
    locMap.set(String(row.location_id), Number(row.quantity) || 0);
  });
  assemblyInventoryByLoc.set(aid, locMap);

  const poolOpts = {
    assemblyId: aid,
    assemblyPacketRows: assemblyPacketRows || [],
    catalogPackets: allPackets || [],
  };

  const current = currentAssemblyWarehouseUnits(assembly, pktList, locId, {
    inventoryByPacketId,
    assemblyInventoryByLoc,
    poolOpts,
  });
  if (incrementOnly) assertWarehouseProductQtyIncrementOnly(current, target);

  const packetUpdates = packetUpdatesForAssemblyTargetUnits(assembly, pktList, target);
  if (packetUpdates?.length) {
    for (const row of packetUpdates) {
      await setWarehousePacketQuantity(row.packetId, locId, row.quantity);
    }
    return { assembly_id: aid, quantity: target, previous: current, scaled_packets: packetUpdates.length };
  }

  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
    throw new Error('Complete the packet BOM before setting product quantity.');
  }

  await setWarehouseAssemblyQuantity(aid, locId, target);
  const { recomputeWarehouseLocationStock } = await import('./warehouseTransfer');
  await recomputeWarehouseLocationStock(locId);
  return { assembly_id: aid, quantity: target, previous: current };
}

export async function deleteWarehouseAssembly(assemblyId) {
  const id = String(assemblyId || '');
  if (!id) return;
  await db.from(SET_ITEMS).delete().eq('set_assembly_id', id);
  await db.from(SET_ITEMS).delete().eq('component_assembly_id', id);
  const { data: links } = await db.from(ASSEMBLY_PACKETS).select('packet_id').eq('assembly_id', id);
  await db.from(ASSEMBLY_PACKETS).delete().eq('assembly_id', id);
  for (const row of links || []) {
    await refreshPacketPrimaryAssemblyId(row.packet_id);
  }
  await db.from(ASSEMBLY_LOCATIONS).delete().eq('assembly_id', id);
  await db.from(ASSEMBLY_COLORS).delete().eq('assembly_id', id);
  const { error } = await db.from(ASSEMBLIES).delete().eq('id', id);
  if (error) throw new Error(error.message || 'Failed to delete product');
}

export async function saveWarehousePacket(payload, { id } = {}) {
  const assemblyId = payload?.assembly_id || null;
  const sku = normalizeWarehousePacketScan(payload?.sku);
  const name = titleCaseWords(String(payload?.name || '').trim());
  const warehouseLocationId = payload?.warehouse_location_id;
  const packetNumber = Number(payload?.packet_number);
  const qtyPerUnit = Math.max(1, Number(payload?.qty_per_unit) || 1);

  if (!sku) throw new Error('Packet SKU is required');
  if (!name) throw new Error('Name is required');
  if (!warehouseLocationId) throw new Error('Warehouse location is not configured');
  if (!Number.isFinite(packetNumber) || packetNumber < 1) throw new Error('Packet number must be at least 1');
  await assertUniqueWarehouseSku(sku, {
    excludePacketId: id,
    linkedAssemblyId: assemblyId,
  });

  if (assemblyId) {
    const { data: assembly, error: aErr } = await db
      .from(ASSEMBLIES)
      .select('packet_count')
      .eq('id', assemblyId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message || 'Failed to load product');
    const required = Number(assembly?.packet_count);
    if (!Number.isFinite(required) || required < 1) {
      throw new Error('Set total packets on the product before linking packets.');
    }
    if (packetNumber > required) {
      throw new Error(`Packet # must be between 1 and ${required} for this product.`);
    }
    const { data: linkRows } = await db
      .from(ASSEMBLY_PACKETS)
      .select('packet_id')
      .eq('assembly_id', assemblyId);
    const siblingIds = (linkRows || []).map((r) => r.packet_id).filter(Boolean);
    if (siblingIds.length) {
      const { data: siblings } = await db
        .from(PACKETS)
        .select('id, packet_number')
        .in('id', siblingIds);
      const clash = (siblings || []).find(
        (p) => String(p.id) !== String(id || '')
          && Number(p.packet_number) === packetNumber,
      );
      if (clash) throw new Error(`Packet #${packetNumber} is already used on this product.`);
    }
  }

  const categoryId = payload?.category_id || null;

  const row = {
    assembly_id: assemblyId,
    sku,
    name,
    category_id: categoryId,
    location_id: warehouseLocationId,
    packet_number: packetNumber,
    qty_per_unit: qtyPerUnit,
    item_kind: WAREHOUSE_ITEM_KIND.PACKET,
    updated_at: new Date().toISOString(),
  };

  const syncPacketAssemblyLink = async (packetId) => {
    if (!assemblyId) return;
    const now = row.updated_at;
    await db.from(ASSEMBLY_PACKETS).upsert({
      assembly_id: assemblyId,
      packet_id: packetId,
      qty_per_unit: qtyPerUnit,
      max_cartons: null,
      updated_at: now,
    }, { onConflict: 'assembly_id,packet_id' });
    await refreshPacketPrimaryAssemblyId(packetId);
  };

  if (id) {
    const { error } = await db.from(PACKETS).update(row).eq('id', id);
    if (error) throw new Error(error.message || 'Failed to update packet');
    await syncPacketAssemblyLink(id);
    return { ...row, id };
  }

  const { data, error } = await db.from(PACKETS).insert({
    ...row,
    created_at: row.updated_at,
  }).select('*').single();
  if (error) throw new Error(error.message || 'Failed to create packet');

  const startingQty = Math.max(0, Number(payload?.initial_quantity) || 0);
  await db.from(INVENTORY).upsert({
    packet_id: data.id,
    location_id: warehouseLocationId,
    quantity: startingQty,
  }, { onConflict: 'packet_id,location_id' });

  await syncPacketAssemblyLink(data.id);
  return data;
}

/** Replace a packet with a finished warehouse product (same SKU/name); packet row is removed. */
export async function convertWarehousePacketToProduct(packetId, {
  warehouseLocationId,
  locationIds = [],
} = {}) {
  const pid = String(packetId || '');
  if (!pid) throw new Error('Packet is required');
  if (!warehouseLocationId) throw new Error('Warehouse location is not configured');

  const { data: packet, error: pErr } = await db.from(PACKETS).select('*').eq('id', pid).maybeSingle();
  if (pErr) throw new Error(pErr.message || 'Failed to load packet');
  if (!packet) throw new Error('Packet not found');

  const { data: inventoryRows, error: invErr } = await db.from(INVENTORY).select('*').eq('packet_id', pid);
  if (invErr) throw new Error(invErr.message || 'Failed to read packet stock');

  await deleteWarehousePacket(pid);

  const result = await saveWarehouseAssembly({
    name: packet.name,
    family_sku: packet.sku,
    category_id: packet.category_id || null,
    inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
    catalog_kind: 'product',
    packet_links: [],
    location_ids: locationIds,
    warehouse_location_id: warehouseLocationId,
  }, { id: null });

  await mergePacketInventoryIntoAssembly(result.id, inventoryRows);

  return { assemblyId: result.id };
}

export async function deleteWarehousePacket(packetId) {
  const id = String(packetId || '');
  if (!id) return;
  await db.from(ASSEMBLY_PACKETS).delete().eq('packet_id', id);
  await db.from(INVENTORY).delete().eq('packet_id', id);
  const { error } = await db.from(PACKETS).delete().eq('id', id);
  if (error) throw new Error(error.message || 'Failed to delete packet');
}

export async function incrementWarehousePacketByScan(scan, warehouseLocationId, delta = 1) {
  const { data: packets, error } = await db.from(PACKETS).select('*');
  if (error) throw new Error(error.message || 'Failed to load packets');
  const packet = resolvePacketFromScan(scan, packets || []);
  if (!packet) throw new Error(`No packet matches scan: ${String(scan || '').slice(0, 40)}`);

  const { data: packetInventory } = await db.from(INVENTORY)
    .select('quantity')
    .eq('packet_id', packet.id)
    .eq('location_id', warehouseLocationId)
    .maybeSingle();
  const prevQty = Math.max(0, Number(packetInventory?.quantity) || 0);
  const next = Math.max(0, prevQty + Number(delta || 0));
  await setWarehousePacketQuantity(packet.id, warehouseLocationId, next);
  return { packet, quantity: next };
}

export async function setWarehousePacketQuantity(packetId, locationId, quantity) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (!packetId || !locationId) throw new Error('Packet and location are required');
  const { error } = await db.from(INVENTORY).upsert({
    packet_id: packetId,
    location_id: locationId,
    quantity: qty,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'packet_id,location_id' });
  if (error) throw new Error(error.message || 'Failed to update quantity');
  const { recomputeWarehouseLocationStock } = await import('./warehouseTransfer');
  await recomputeWarehouseLocationStock(locationId);
}

const WAREHOUSE_IMAGE_BUCKET = 'productimages';

function warehouseAssemblyImageFolder(assemblyId) {
  return `warehouse-assemblies/${String(assemblyId)}`;
}

async function purgeWarehouseAssemblyImages(assemblyId) {
  const folderPath = warehouseAssemblyImageFolder(assemblyId);
  try {
    const bucket = db.storage.from(WAREHOUSE_IMAGE_BUCKET);
    const { data: entries, error } = await bucket.list(folderPath, { limit: 100 });
    if (error || !Array.isArray(entries) || !entries.length) return;
    const targets = entries.map((entry) => `${folderPath}/${entry.name}`);
    await bucket.remove(targets);
  } catch (err) {
    console.warn('Failed to purge warehouse assembly images', err);
  }
}

/** Upload product photo; stored on warehouse_assemblies.image_url (syncs to mobile catalog). */
export async function uploadWarehouseAssemblyImage(assemblyId, file) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('Product id is required');
  if (!file) throw new Error('No image file selected');

  await purgeWarehouseAssemblyImages(id);
  const fallbackExt = 'jpg';
  const rawExt = (file.name || '').split('.').pop();
  const ext = (rawExt || fallbackExt).replace(/[^0-9a-z]/gi, '').toLowerCase() || fallbackExt;
  const filePath = `${warehouseAssemblyImageFolder(id)}/main-${Date.now()}.${ext}`;

  const bucket = db.storage.from(WAREHOUSE_IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(filePath, file, { upsert: true });
  if (uploadError) throw new Error(uploadError.message || 'Image upload failed');

  const { data: publicUrlData } = bucket.getPublicUrl(filePath);
  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl) throw new Error('Failed to get public URL for image.');

  const now = new Date().toISOString();
  const { error: updErr } = await db.from(ASSEMBLIES).update({
    image_url: publicUrl,
    updated_at: now,
  }).eq('id', id);
  if (updErr) throw new Error(updErr.message || 'Failed to save image on product');

  return publicUrl;
}

/** Clear product photo from storage and warehouse_assemblies.image_url. */
export async function removeWarehouseAssemblyImage(assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('Product id is required');

  await purgeWarehouseAssemblyImages(id);
  const { error: updErr } = await db.from(ASSEMBLIES).update({
    image_url: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (updErr) throw new Error(updErr.message || 'Failed to remove image from product');
}

const INLINE_ASSEMBLY_NUMERIC_FIELDS = new Set([
  'dim_length',
  'dim_width',
  'dim_height',
]);

/** Partial update for inline edits on the warehouse products list. */
export async function patchWarehouseAssemblyFields(assemblyId, fields) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('Product id is required');
  const patch = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(fields || {}, 'family_sku')) {
    const familySku = normalizeWarehouseProductSku(fields.family_sku);
    if (!familySku) throw new Error('SKU is required');
    await assertUniqueWarehouseSku(familySku, { excludeAssemblyId: id });
    patch.family_sku = familySku;
  }

  if (Object.prototype.hasOwnProperty.call(fields || {}, 'name')) {
    const name = String(fields.name || '').trim();
    if (!name) throw new Error('Product name is required');
    patch.name = name;
  }

  Object.entries(fields || {}).forEach(([key, raw]) => {
    if (!INLINE_ASSEMBLY_NUMERIC_FIELDS.has(key)) return;
    if (raw === '' || raw == null) {
      patch[key] = null;
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Invalid value for ${key}`);
    }
    patch[key] = n;
  });
  if (Object.keys(patch).length <= 1) return { id };
  const { error } = await db.from(ASSEMBLIES).update(patch).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to update product');
  return { id, ...patch };
}
