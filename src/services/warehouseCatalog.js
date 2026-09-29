import db from '../dataClient';
import {
  analyzeAssemblyPacketBom,
  normalizeWarehouseColorKey,
  normalizeWarehouseSku,
  normalizeWarehouseSkuKey,
  WAREHOUSE_INVENTORY_MODE,
} from '../utils/warehouseAssemblyMath';
import { resolvePacketFromScan } from '../utils/warehouseScanResolver';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_LOCATIONS = 'warehouse_assembly_locations';
const COLORS = 'warehouse_colors';
const ASSEMBLY_COLORS = 'warehouse_assembly_colors';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';

export { WAREHOUSE_INVENTORY_MODE };

export const WAREHOUSE_ITEM_KIND = Object.freeze({
  PRODUCT: 'product',
  PACKET: 'packet',
});

export function resolveWarehouseLocation(locations) {
  const rows = locations || [];
  const exact = rows.find((l) => String(l.name || '').trim().toLowerCase() === 'warehouse');
  if (exact) return exact;
  return rows.find((l) => String(l.name || '').toLowerCase().includes('warehouse')) || null;
}

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
  if (colorsErr) throw new Error(colorsErr.message || 'Failed to load variant colors');
  if (assemblyInvErr) throw new Error(assemblyInvErr.message || 'Failed to load finished stock');
  if (categoriesErr) throw new Error(categoriesErr.message || 'Failed to load categories');
  if (locationsErr) throw new Error(locationsErr.message || 'Failed to load locations');

  const warehouseLocation = resolveWarehouseLocation(locations);

  return {
    assemblies: assemblies || [],
    packets: packets || [],
    inventory: inventory || [],
    assemblyLocations: assemblyLocations || [],
    assemblyColors: assemblyColors || [],
    assemblyPackets: assemblyPackets || [],
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

  const [
    { data: assemblies, error: aErr },
    { data: packets, error: pErr },
    { data: legacyProducts, error: lErr },
  ] = await Promise.all([
    db.from(ASSEMBLIES).select('id, name, family_sku'),
    db.from(PACKETS).select('id, name, sku'),
    db.from('products').select('id, name, sku'),
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

  const packetClash = (packets || []).find(
    (row) => normalizeWarehouseSkuKey(row.sku) === key
      && String(row.id) !== String(excludePacketId || ''),
  );
  if (packetClash) {
    const linkedPacketOk = (linkedPacketIds || []).some(
      (pid) => String(pid) === String(packetClash.id),
    );
    if (!linkedPacketOk) {
      throw new Error(`SKU already used by warehouse packet "${packetClash.name || packetClash.sku}".`);
    }
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

export async function saveWarehouseAssembly(payload, { id } = {}) {
  const name = String(payload?.name || '').trim();
  const familySku = normalizeWarehouseSku(payload?.family_sku);
  const categoryId = payload?.category_id || null;
  const retailProductId = payload?.retail_product_id || null;
  const locationIds = payload?.location_ids || [];
  const packetLinks = payload?.packet_links;
  const packetIds = payload?.packet_ids || [];
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
  if (inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS) {
    if (!Number.isFinite(packetCount) || packetCount < 1) {
      throw new Error('Total packets is required when tracking stock by cartons.');
    }
  } else if (packetCount != null && (!Number.isFinite(packetCount) || packetCount < 1)) {
    throw new Error('Total packets must be at least 1 when set.');
  }
  const packetLinkRows = normalizePacketLinks(packetLinks, packetIds);
  const linkedPacketIds = packetLinkRows.map((link) => link.packet_id);
  await assertUniqueWarehouseSku(familySku, {
    excludeAssemblyId: id,
    linkedPacketIds,
  });

  const row = {
    name,
    family_sku: familySku,
    category_id: categoryId,
    retail_product_id: retailProductId,
    packet_count: packetCount == null ? null : packetCount,
    inventory_mode: inventoryMode,
    has_color_variants: hasColorVariants,
    item_kind: WAREHOUSE_ITEM_KIND.PRODUCT,
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
  if (warehouseLocationId) {
    await syncAssemblyPackets(assemblyId, packetLinks, warehouseLocationId, packetIds);
    if (inventoryMode === WAREHOUSE_INVENTORY_MODE.PACKETS && packetCount != null) {
      await validateAssemblyPacketNumbers(assemblyId, packetCount);
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

export async function deleteWarehouseAssembly(assemblyId) {
  const id = String(assemblyId || '');
  if (!id) return;
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
  const sku = normalizeWarehouseSku(payload?.sku);
  const name = String(payload?.name || '').trim();
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

  const row = {
    assembly_id: assemblyId,
    sku,
    name,
    category_id: null,
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

  const { data: inv } = await db.from(INVENTORY)
    .select('quantity')
    .eq('packet_id', packet.id)
    .eq('location_id', warehouseLocationId)
    .maybeSingle();
  const next = Math.max(0, (Number(inv?.quantity) || 0) + Number(delta || 0));
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
}
