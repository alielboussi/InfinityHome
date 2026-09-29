import { newUuid } from './uuid.js';
import {
  analyzeAssemblyPacketBom,
  normalizeWarehouseColorKey,
  normalizeWarehouseSku,
  normalizeWarehouseSkuKey,
  WAREHOUSE_INVENTORY_MODE,
} from '../../src/utils/warehouseAssemblyMath.js';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const ASSEMBLY_LOCATIONS = 'warehouse_assembly_locations';
const COLORS = 'warehouse_colors';
const ASSEMBLY_COLORS = 'warehouse_assembly_colors';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';

const WAREHOUSE_ITEM_KIND = Object.freeze({ PRODUCT: 'product', PACKET: 'packet' });

export function resolveWarehouseLocation(locations) {
  const rows = locations || [];
  const exact = rows.find((l) => String(l.name || '').trim().toLowerCase() === 'warehouse');
  if (exact) return exact;
  return rows.find((l) => String(l.name || '').toLowerCase().includes('warehouse')) || null;
}

export async function fetchCatalogForMobile(sb) {
  const [
    { data: assemblies, error: assembliesErr },
    { data: packets, error: packetsErr },
    { data: assemblyLocations, error: assemblyLocErr },
    { data: assemblyColors, error: assemblyColorsErr },
    { data: assemblyPackets, error: assemblyPacketsErr },
    { data: colors, error: colorsErr },
    { data: categories, error: categoriesErr },
    { data: locations, error: locationsErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES).select('*').order('name', { ascending: true }),
    sb.from(PACKETS).select('*').order('packet_number', { ascending: true }),
    sb.from(ASSEMBLY_LOCATIONS).select('*'),
    sb.from(ASSEMBLY_COLORS).select('*'),
    sb.from(ASSEMBLY_PACKETS).select('*'),
    sb.from(COLORS).select('*').order('name', { ascending: true }),
    sb.from('categories').select('id, name').order('name', { ascending: true }),
    sb.from('locations').select('id, name').order('name', { ascending: true }),
  ]);

  if (assembliesErr) throw new Error(assembliesErr.message || 'Failed to load products');
  if (packetsErr) throw new Error(packetsErr.message || 'Failed to load packets');
  if (assemblyLocErr) throw new Error(assemblyLocErr.message || 'Failed to load locations');
  if (assemblyColorsErr) throw new Error(assemblyColorsErr.message || 'Failed to load colors');
  if (assemblyPacketsErr) throw new Error(assemblyPacketsErr.message || 'Failed to load packet links');
  if (colorsErr) throw new Error(colorsErr.message || 'Failed to load variant colors');
  if (categoriesErr) throw new Error(categoriesErr.message || 'Failed to load categories');
  if (locationsErr) throw new Error(locationsErr.message || 'Failed to load locations');

  const warehouseLocation = resolveWarehouseLocation(locations);

  return {
    assemblies: assemblies || [],
    packets: packets || [],
    assemblyLocations: assemblyLocations || [],
    assemblyColors: assemblyColors || [],
    assemblyPackets: assemblyPackets || [],
    colors: colors || [],
    categories: categories || [],
    locations: locations || [],
    warehouseLocationId: warehouseLocation?.id ?? null,
    warehouseLocationName: warehouseLocation?.name ?? 'Warehouse',
  };
}

export async function createCategoryForMobile(sb, rawName) {
  const name = String(rawName || '').trim();
  if (!name) throw new Error('Category name is required.');
  const { data: existingRows, error: fetchErr } = await sb.from('categories').select('id, name');
  if (fetchErr) throw new Error(fetchErr.message || 'Failed to load categories');
  const match = (existingRows || []).find(
    (c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase(),
  );
  if (match) return match;
  const id = newUuid();
  const now = new Date().toISOString();
  const row = { id, name, created_at: now, updated_at: now };
  const { error } = await sb.from('categories').insert(row);
  if (error) throw new Error(error.message || 'Failed to create category');
  return row;
}

export async function findOrCreateWarehouseColorServer(sb, displayName) {
  const name = String(displayName || '').trim();
  if (!name) throw new Error('Color name is required');
  const nameKey = normalizeWarehouseColorKey(name);
  const { data, error } = await sb.from(COLORS).select('*');
  if (error) throw new Error(error.message || 'Failed to load colors');
  const match = (data || []).find((row) => {
    const key = row.name_key || normalizeWarehouseColorKey(row.name);
    return key === nameKey;
  });
  if (match) return match;

  const now = new Date().toISOString();
  const id = newUuid();
  const created = {
    id,
    name,
    name_key: nameKey,
    created_at: now,
    updated_at: now,
  };
  const { error: insErr } = await sb.from(COLORS).insert(created);
  if (insErr) throw new Error(insErr.message || 'Failed to create color');
  return created;
}

async function assertUniqueWarehouseSku(sb, sku, { excludeAssemblyId, linkedPacketIds } = {}) {
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) throw new Error('SKU is required');

  const [{ data: assemblies }, { data: packets }, { data: legacyProducts }] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, name, family_sku'),
    sb.from(PACKETS).select('id, name, sku'),
    sb.from('products').select('id, name, sku'),
  ]);

  const productClash = (assemblies || []).find(
    (row) => normalizeWarehouseSkuKey(row.family_sku) === key
      && String(row.id) !== String(excludeAssemblyId || ''),
  );
  if (productClash) {
    throw new Error(`SKU already used by warehouse product "${productClash.name || productClash.family_sku}".`);
  }

  const packetClash = (packets || []).find(
    (row) => normalizeWarehouseSkuKey(row.sku) === key
      && !(linkedPacketIds || []).some((pid) => String(pid) === String(row.id)),
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

function normalizePacketLinks(packetLinks) {
  return (packetLinks || [])
    .map((link) => ({
      packet_id: String(link.packet_id || link.id || ''),
      qty_per_unit: 1,
    }))
    .filter((link) => link.packet_id);
}

async function syncAssemblyColors(sb, assemblyId, colorIds) {
  const id = String(assemblyId || '');
  if (!id) return;
  await sb.from(ASSEMBLY_COLORS).delete().eq('assembly_id', id);
  const rows = (colorIds || [])
    .filter(Boolean)
    .map((colorId) => ({ assembly_id: id, color_id: colorId }));
  if (!rows.length) return;
  const { error } = await sb.from(ASSEMBLY_COLORS).upsert(rows, {
    onConflict: 'assembly_id,color_id',
  });
  if (error) throw new Error(error.message || 'Failed to save product colors');
}

async function syncAssemblyLocations(sb, assemblyId, locationIds) {
  const id = String(assemblyId || '');
  if (!id) return;
  await sb.from(ASSEMBLY_LOCATIONS).delete().eq('assembly_id', id);
  const rows = (locationIds || [])
    .filter(Boolean)
    .map((locationId) => ({ assembly_id: id, location_id: locationId }));
  if (!rows.length) return;
  const { error } = await sb.from(ASSEMBLY_LOCATIONS).upsert(rows, {
    onConflict: 'assembly_id,location_id',
  });
  if (error) throw new Error(error.message || 'Failed to save product locations');
}

async function refreshPacketPrimaryAssemblyId(sb, packetId) {
  const pid = String(packetId || '');
  if (!pid) return;
  const { data: rows, error } = await sb
    .from(ASSEMBLY_PACKETS)
    .select('assembly_id')
    .eq('packet_id', pid);
  if (error) throw new Error(error.message || 'Failed to read packet assignments');
  const primary = rows?.[0]?.assembly_id ?? null;
  const { error: updErr } = await sb.from(PACKETS).update({
    assembly_id: primary,
    updated_at: new Date().toISOString(),
  }).eq('id', pid);
  if (updErr) throw new Error(updErr.message || 'Failed to update packet assignment');
}

async function syncAssemblyPackets(sb, assemblyId, packetLinks, warehouseLocationId) {
  const id = String(assemblyId || '');
  if (!id) throw new Error('Product id is required to link packets');
  const links = normalizePacketLinks(packetLinks);
  const now = new Date().toISOString();

  const { data: prevLinks, error: prevErr } = await sb
    .from(ASSEMBLY_PACKETS)
    .select('packet_id')
    .eq('assembly_id', id);
  if (prevErr) throw new Error(prevErr.message || 'Failed to read packet links');

  const { error: delErr } = await sb.from(ASSEMBLY_PACKETS).delete().eq('assembly_id', id);
  if (delErr) throw new Error(delErr.message || 'Failed to update packet links');

  for (const link of links) {
    const { error } = await sb.from(ASSEMBLY_PACKETS).upsert({
      assembly_id: id,
      packet_id: link.packet_id,
      qty_per_unit: 1,
      max_cartons: null,
      updated_at: now,
    }, { onConflict: 'assembly_id,packet_id' });
    if (error) throw new Error(error.message || 'Failed to link packet');
    const { error: pktErr } = await sb.from(PACKETS).update({
      location_id: warehouseLocationId,
      qty_per_unit: 1,
      updated_at: now,
    }).eq('id', link.packet_id);
    if (pktErr) throw new Error(pktErr.message || 'Failed to update packet');
    await refreshPacketPrimaryAssemblyId(sb, link.packet_id);
  }

  const touched = new Set([
    ...links.map((l) => String(l.packet_id)),
    ...(prevLinks || []).map((r) => String(r.packet_id)),
  ]);
  for (const pid of touched) {
    if (!links.some((l) => String(l.packet_id) === pid)) {
      await refreshPacketPrimaryAssemblyId(sb, pid);
    }
  }
}

async function validateAssemblyPacketNumbers(sb, assemblyId, packetCount) {
  const required = Number(packetCount);
  if (!Number.isFinite(required) || required < 1) {
    throw new Error('Set total packets on the product first.');
  }
  const { data: links, error: linkErr } = await sb
    .from(ASSEMBLY_PACKETS)
    .select('packet_id, qty_per_unit')
    .eq('assembly_id', assemblyId);
  if (linkErr) throw linkErr;
  const packetIds = (links || []).map((l) => l.packet_id).filter(Boolean);
  if (!packetIds.length) return analyzeAssemblyPacketBom(required, []);
  const { data: packets, error } = await sb
    .from(PACKETS)
    .select('id, packet_number, qty_per_unit')
    .in('id', packetIds);
  if (error) throw error;
  const qtyByPacket = new Map(
    (links || []).map((l) => [String(l.packet_id), 1]),
  );
  const rows = (packets || []).map((p) => ({
    ...p,
    qty_per_unit: qtyByPacket.get(String(p.id)) ?? 1,
  }));
  return analyzeAssemblyPacketBom(required, rows);
}

export async function saveAssemblyForMobile(sb, payload) {
  const name = String(payload?.name || '').trim();
  const familySku = normalizeWarehouseSku(payload?.family_sku);
  const categoryId = payload?.category_id || null;
  const locationIds = payload?.location_ids || [];
  const packetLinks = payload?.packet_links;
  const warehouseLocationId = payload?.warehouse_location_id;
  const inventoryMode = payload?.inventory_mode === WAREHOUSE_INVENTORY_MODE.FINISHED
    ? WAREHOUSE_INVENTORY_MODE.FINISHED
    : WAREHOUSE_INVENTORY_MODE.PACKETS;
  const packetCountRaw = payload?.packet_count;
  const packetCount = packetCountRaw === '' || packetCountRaw == null
    ? null
    : Number(packetCountRaw);
  const hasColorVariants = Boolean(payload?.has_color_variants);
  const colorIds = hasColorVariants ? (payload?.color_ids || []) : [];

  if (!name) throw new Error('Name is required');
  if (!familySku) throw new Error('Product SKU is required');
  if (!warehouseLocationId) throw new Error('Warehouse location is not configured');
  if (inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS) {
    if (!Number.isFinite(packetCount) || packetCount < 1) {
      throw new Error('Total packets is required when tracking stock by cartons.');
    }
  } else if (packetCount != null && (!Number.isFinite(packetCount) || packetCount < 1)) {
    throw new Error('Total packets must be at least 1 when set.');
  }

  const packetLinkRows = normalizePacketLinks(packetLinks);
  const linkedPacketIds = packetLinkRows.map((link) => link.packet_id);
  await assertUniqueWarehouseSku(sb, familySku, { linkedPacketIds });

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    name,
    family_sku: familySku,
    category_id: categoryId,
    retail_product_id: null,
    packet_count: packetCount == null ? null : packetCount,
    inventory_mode: inventoryMode,
    has_color_variants: hasColorVariants,
    item_kind: WAREHOUSE_ITEM_KIND.PRODUCT,
    created_at: now,
    updated_at: now,
  };
  const { error } = await sb.from(ASSEMBLIES).insert(row);
  if (error) throw new Error(error.message || 'Failed to create product');

  await syncAssemblyLocations(sb, id, locationIds);
  await syncAssemblyColors(sb, id, colorIds);
  await syncAssemblyPackets(sb, id, packetLinkRows, warehouseLocationId);
  if (inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS && packetCount != null) {
    await validateAssemblyPacketNumbers(sb, id, packetCount);
  }

  return row;
}
