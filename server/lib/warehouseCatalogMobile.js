import { newUuid } from './uuid.js';
import { attachWarehouseStockTotals } from '../../src/utils/warehouseCatalogStock.js';
import {
  analyzeAssemblyPacketBom,
  normalizeWarehouseColorKey,
  normalizeWarehouseSku,
  normalizeWarehouseSkuKey,
  WAREHOUSE_INVENTORY_MODE,
} from '../../src/utils/warehouseAssemblyMath.js';
import { resolveWarehouseLocation } from '../../src/utils/resolveWarehouseLocation.js';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from '../../src/utils/warehouseScanResolver.js';
import { buildPacketsByAssembly } from '../../src/utils/warehouseAssemblyPacketPool.js';
import {
  assertWarehouseProductQtyIncrementOnly,
  currentAssemblyWarehouseUnits,
  packetUpdatesForAssemblyTargetUnits,
} from '../../src/utils/warehouseAssemblyProductQuantity.js';
import { assemblyDerivesWarehouseStockFromPackets } from '../../src/utils/warehouseAssemblyMath.js';
import { setWarehousePacketQuantityServer } from './warehouseLocationStockRecompute.js';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const ASSEMBLY_LOCATIONS = 'warehouse_assembly_locations';
const COLORS = 'warehouse_colors';
const ASSEMBLY_COLORS = 'warehouse_assembly_colors';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';
const PACKET_INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';

const WAREHOUSE_ITEM_KIND = Object.freeze({ PRODUCT: 'product', PACKET: 'packet' });

const MOBILE_ASSEMBLY_FIELDS = [
  'id',
  'name',
  'family_sku',
  'packet_count',
  'image_url',
  'thumbnail_url',
  'cover_image_url',
  'photo_url',
  'dim_length',
  'dim_width',
  'dim_height',
  'category_id',
  'inventory_mode',
  'item_kind',
].join(', ');

const MOBILE_PACKET_FIELDS = [
  'id',
  'sku',
  'name',
  'packet_number',
  'assembly_id',
  'qty_per_unit',
].join(', ');

const MOBILE_INVENTORY_FIELDS = 'id, packet_id, location_id, quantity';
const MOBILE_ASSEMBLY_INVENTORY_FIELDS = 'id, assembly_id, location_id, quantity';

export async function fetchCatalogForMobile(sb) {
  const [
    { data: locations, error: locationsErr },
    { data: packets, error: packetsErr },
  ] = await Promise.all([
    sb.from('locations').select('id, name').order('name', { ascending: true }),
    sb.from(PACKETS).select(MOBILE_PACKET_FIELDS).order('packet_number', { ascending: true }),
  ]);

  if (locationsErr) throw new Error(locationsErr.message || 'Failed to load locations');
  if (packetsErr) throw new Error(packetsErr.message || 'Failed to load packets');

  const warehouseLocation = resolveWarehouseLocation(locations, { packets });
  const warehouseLocationId = warehouseLocation?.id ?? null;

  let inventoryQuery = sb.from(PACKET_INVENTORY).select(MOBILE_INVENTORY_FIELDS);
  let assemblyInvQuery = sb.from(ASSEMBLY_INVENTORY).select(MOBILE_ASSEMBLY_INVENTORY_FIELDS);
  if (warehouseLocationId) {
    inventoryQuery = inventoryQuery.eq('location_id', warehouseLocationId);
    assemblyInvQuery = assemblyInvQuery.eq('location_id', warehouseLocationId);
  }

  const [
    { data: assemblies, error: assembliesErr },
    { data: assemblyColors, error: assemblyColorsErr },
    { data: assemblyPackets, error: assemblyPacketsErr },
    { data: colors, error: colorsErr },
    { data: categories, error: categoriesErr },
    { data: inventory, error: inventoryErr },
    { data: assemblyInventory, error: assemblyInvErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES).select(MOBILE_ASSEMBLY_FIELDS).order('name', { ascending: true }),
    sb.from(ASSEMBLY_COLORS).select('assembly_id, color_id'),
    sb.from(ASSEMBLY_PACKETS).select('assembly_id, packet_id, qty_per_unit'),
    sb.from(COLORS).select('id, name, name_key').order('name', { ascending: true }),
    sb.from('categories').select('id, name').order('name', { ascending: true }),
    inventoryQuery,
    assemblyInvQuery,
  ]);

  if (assembliesErr) throw new Error(assembliesErr.message || 'Failed to load products');
  if (assemblyColorsErr) throw new Error(assemblyColorsErr.message || 'Failed to load colors');
  if (assemblyPacketsErr) throw new Error(assemblyPacketsErr.message || 'Failed to load packet links');
  if (colorsErr) throw new Error(colorsErr.message || 'Failed to load variant colors');
  if (categoriesErr) throw new Error(categoriesErr.message || 'Failed to load categories');
  if (inventoryErr) throw new Error(inventoryErr.message || 'Failed to load packet stock');
  if (assemblyInvErr) throw new Error(assemblyInvErr.message || 'Failed to load finished stock');

  return attachWarehouseStockTotals({
    assemblies: assemblies || [],
    packets: packets || [],
    inventory: inventory || [],
    assemblyInventory: assemblyInventory || [],
    assemblyColors: assemblyColors || [],
    assemblyPackets: assemblyPackets || [],
    colors: colors || [],
    categories: categories || [],
    locations: locations || [],
    warehouseLocationId,
    warehouseLocationName: warehouseLocation?.name ?? 'Warehouse',
  });
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
      qty_per_unit: Math.max(1, Math.floor(Number(link.qty_per_unit) || 1)),
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
      qty_per_unit: link.qty_per_unit,
      max_cartons: null,
      updated_at: now,
    }, { onConflict: 'assembly_id,packet_id' });
    if (error) throw new Error(error.message || 'Failed to link packet');
    const { error: pktErr } = await sb.from(PACKETS).update({
      location_id: warehouseLocationId,
      qty_per_unit: link.qty_per_unit,
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
    (links || []).map((l) => [
      String(l.packet_id),
      Math.max(1, Number(l.qty_per_unit) || 1),
    ]),
  );
  const rows = (packets || []).map((p) => ({
    ...p,
    qty_per_unit: qtyByPacket.get(String(p.id)) ?? 1,
  }));
  return analyzeAssemblyPacketBom(required, rows);
}

async function updateAssemblyPacketBomForMobile(sb, payload) {
  const assemblyId = String(payload?.id || payload?.assembly_id || '').trim();
  const warehouseLocationId = String(payload?.warehouse_location_id || '').trim();
  if (!assemblyId) throw new Error('Product id is required.');
  if (!warehouseLocationId) throw new Error('Warehouse location is not configured');

  const { data: assembly, error: aErr } = await sb
    .from(ASSEMBLIES)
    .select('*')
    .eq('id', assemblyId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly) throw new Error('Product not found.');
  if (String(assembly.inventory_mode || WAREHOUSE_INVENTORY_MODE.PACKETS) !== WAREHOUSE_INVENTORY_MODE.PACKETS) {
    throw new Error('Only packet-BOM products can be edited here.');
  }

  const packetCountRaw = payload?.packet_count ?? assembly.packet_count;
  const packetCount = packetCountRaw === '' || packetCountRaw == null
    ? null
    : Number(packetCountRaw);
  if (!Number.isFinite(packetCount) || packetCount < 1) {
    throw new Error('Total packets is required when tracking stock by cartons.');
  }

  const packetLinkRows = normalizePacketLinks(payload?.packet_links);
  const linkedPacketIds = packetLinkRows.map((link) => link.packet_id);
  await assertUniqueWarehouseSku(sb, assembly.family_sku, {
    excludeAssemblyId: assemblyId,
    linkedPacketIds,
  });

  const now = new Date().toISOString();
  const { error: updErr } = await sb.from(ASSEMBLIES).update({
    packet_count: packetCount,
    updated_at: now,
  }).eq('id', assemblyId);
  if (updErr) throw new Error(updErr.message || 'Failed to update product');

  await syncAssemblyPackets(sb, assemblyId, packetLinkRows, warehouseLocationId);
  await validateAssemblyPacketNumbers(sb, assemblyId, packetCount);

  const { recomputeWarehouseLocationStockServer } = await import('./warehouseLocationStockRecompute.js');
  await recomputeWarehouseLocationStockServer(sb, warehouseLocationId);

  const { data: refreshed, error: refErr } = await sb
    .from(ASSEMBLIES)
    .select('*')
    .eq('id', assemblyId)
    .maybeSingle();
  if (refErr) throw new Error(refErr.message || 'Failed to reload product');
  return refreshed || { ...assembly, id: assemblyId, packet_count: packetCount };
}

export async function saveAssemblyForMobile(sb, payload) {
  const updateId = String(payload?.id || payload?.assembly_id || '').trim();
  if (updateId) {
    return updateAssemblyPacketBomForMobile(sb, { ...payload, id: updateId });
  }

  const name = String(payload?.name || '').trim();
  const familySku = normalizeWarehouseProductSku(payload?.family_sku);
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

export async function savePacketForMobile(sb, body) {
  const packetId = String(body.packet_id || body.id || '');
  if (!packetId) throw new Error('packet_id is required.');

  const { data: existing, error: loadErr } = await sb
    .from(PACKETS)
    .select('*')
    .eq('id', packetId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load packet');
  if (!existing) throw new Error('Packet not found.');

  const sku = normalizeWarehousePacketScan(body.sku);
  const name = String(body.name || '').trim();
  const packetNumber = Number(body.packet_number);
  const qtyPerUnit = Math.max(1, Math.floor(Number(body.qty_per_unit) || 1));
  const warehouseLocationId = String(
    body.warehouse_location_id || existing.location_id || '',
  );
  if (!sku || !name) throw new Error('SKU and name are required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (!Number.isFinite(packetNumber) || packetNumber < 1) {
    throw new Error('packet_number must be at least 1.');
  }

  const assemblyId = existing.assembly_id || null;
  await assertUniqueWarehouseSku(sb, sku, {
    excludeAssemblyId: assemblyId,
    linkedPacketIds: [packetId],
  });

  if (assemblyId) {
    const { data: assembly, error: aErr } = await sb
      .from(ASSEMBLIES)
      .select('packet_count')
      .eq('id', assemblyId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message || 'Failed to load product');
    const required = Number(assembly?.packet_count);
    if (Number.isFinite(required) && required >= 1 && packetNumber > required) {
      throw new Error(`Packet # must be between 1 and ${required} for this product.`);
    }
    const { data: linkRows } = await sb
      .from(ASSEMBLY_PACKETS)
      .select('packet_id')
      .eq('assembly_id', assemblyId);
    const siblingIds = (linkRows || []).map((r) => r.packet_id).filter(Boolean);
    if (siblingIds.length) {
      const { data: siblings } = await sb
        .from(PACKETS)
        .select('id, packet_number')
        .in('id', siblingIds);
      const clash = (siblings || []).find(
        (p) => String(p.id) !== packetId && Number(p.packet_number) === packetNumber,
      );
      if (clash) throw new Error(`Packet #${packetNumber} is already used on this product.`);
    }
  }

  const now = new Date().toISOString();
  const row = {
    sku,
    name,
    location_id: warehouseLocationId,
    packet_number: packetNumber,
    qty_per_unit: qtyPerUnit,
    updated_at: now,
  };
  const { error: updErr } = await sb.from(PACKETS).update(row).eq('id', packetId);
  if (updErr) throw new Error(updErr.message || 'Failed to update packet');

  if (assemblyId) {
    const { error: linkErr } = await sb.from(ASSEMBLY_PACKETS).upsert({
      assembly_id: assemblyId,
      packet_id: packetId,
      qty_per_unit: qtyPerUnit,
      max_cartons: null,
      updated_at: now,
    }, { onConflict: 'assembly_id,packet_id' });
    if (linkErr) throw new Error(linkErr.message || 'Failed to update packet link');
  }

  return { packet: { ...existing, ...row, id: packetId } };
}

export async function setAssemblyProductQuantityForMobile(sb, body) {
  const assemblyId = String(body.assembly_id || '');
  const locationId = String(body.warehouse_location_id || body.location_id || '');
  const target = Math.max(0, Math.floor(Number(body.quantity) || 0));
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!locationId) throw new Error('warehouse_location_id is required.');

  const [
    { data: assembly, error: aErr },
    { data: allPackets, error: pErr },
    { data: assemblyPacketRows, error: apErr },
    { data: inventoryRows, error: iErr },
    { data: assemblyInvRows, error: aiErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES).select('*').eq('id', assemblyId).maybeSingle(),
    sb.from(PACKETS).select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from(ASSEMBLY_PACKETS).select('*'),
    sb.from(PACKET_INVENTORY).select('packet_id, quantity').eq('location_id', locationId),
    sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity').eq('location_id', locationId),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (pErr) throw new Error(pErr.message || 'Failed to load packets');
  if (apErr) throw new Error(apErr.message || 'Failed to load packet links');
  if (iErr) throw new Error(iErr.message || 'Failed to load packet stock');
  if (aiErr) throw new Error(aiErr.message || 'Failed to load product stock');
  if (!assembly) throw new Error('Product not found.');

  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows || [], allPackets || []);
  const pktList = packetsByAssembly.get(assemblyId) || [];

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
    if (String(row.assembly_id) !== assemblyId) return;
    locMap.set(String(row.location_id), Number(row.quantity) || 0);
  });
  assemblyInventoryByLoc.set(assemblyId, locMap);

  const poolOpts = {
    assemblyId,
    assemblyPacketRows: assemblyPacketRows || [],
    catalogPackets: allPackets || [],
  };

  const current = currentAssemblyWarehouseUnits(assembly, pktList, locationId, {
    inventoryByPacketId,
    assemblyInventoryByLoc,
    poolOpts,
  });
  assertWarehouseProductQtyIncrementOnly(current, target);

  const packetUpdates = packetUpdatesForAssemblyTargetUnits(assembly, pktList, target);
  if (packetUpdates?.length) {
    for (const row of packetUpdates) {
      await setWarehousePacketQuantityServer(sb, row.packetId, locationId, row.quantity, { mobileFast: true });
    }
  } else if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
    throw new Error('Complete the packet BOM before setting product quantity.');
  } else {
    const { error } = await sb.from(ASSEMBLY_INVENTORY).upsert({
      assembly_id: assemblyId,
      location_id: locationId,
      quantity: target,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assembly_id,location_id' });
    if (error) throw new Error(error.message || 'Failed to update finished quantity');
    const { recomputeWarehouseLocationStockServer } = await import('./warehouseLocationStockRecompute.js');
    await recomputeWarehouseLocationStockServer(sb, locationId);
  }

  const catalog = await fetchCatalogForMobile(sb);
  return {
    assembly_id: assemblyId,
    quantity: target,
    previous: current,
    warehouseLocationId: locationId,
    assemblyWarehouseQty: catalog.assemblyWarehouseQty || {},
    packetWarehouseQty: catalog.packetWarehouseQty || {},
  };
}

export async function setPacketQuantityForMobile(sb, body) {
  const packetId = String(body.packet_id || '');
  const locationId = String(body.warehouse_location_id || body.location_id || '');
  const quantity = body.quantity;
  if (!packetId) throw new Error('packet_id is required.');
  if (!locationId) throw new Error('warehouse_location_id is required.');

  const { data: packet, error: pErr } = await sb.from(PACKETS).select('id, sku, name').eq('id', packetId).maybeSingle();
  if (pErr) throw new Error(pErr.message || 'Failed to load packet');
  if (!packet) throw new Error('Packet not found.');

  const { quantity: nextQty, assemblyWarehouseQty } = await setWarehousePacketQuantityServer(
    sb,
    packetId,
    locationId,
    quantity,
    { mobileFast: true },
  );
  return {
    packet_id: packetId,
    quantity: nextQty,
    packet,
    warehouseLocationId: locationId,
    assemblyWarehouseQty: assemblyWarehouseQty || {},
    packetWarehouseQty: { [String(packetId)]: nextQty },
  };
}
