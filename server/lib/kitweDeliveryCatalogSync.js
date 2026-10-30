import { normalizeWarehouseProductSku } from '../../src/utils/warehouseScanResolver.js';
import { WAREHOUSE_TO_LOCATION_ID } from '../../src/utils/warehouseDelivery.js';
import { newUuid } from './uuid.js';

function entryReceived(entry) {
  return Boolean(entry?.metadata?.received_at);
}

export function entryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

export function resolveKitweRetailSku(assembly) {
  let sku = normalizeWarehouseProductSku(assembly?.family_sku || '');
  if (!sku) sku = normalizeWarehouseProductSku(assembly?.name || '');
  if (!sku && assembly?.id) {
    sku = `WH${String(assembly.id).replace(/-/g, '').slice(0, 14).toUpperCase()}`;
  }
  return sku;
}

async function linkAssemblyRetailProduct(sb, assemblyId, productId) {
  if (!assemblyId || !productId) return;
  const { data: asm } = await sb
    .from('warehouse_assemblies')
    .select('retail_product_id')
    .eq('id', assemblyId)
    .maybeSingle();
  if (asm?.retail_product_id) return;
  await sb.from('warehouse_assemblies').update({
    retail_product_id: productId,
    updated_at: new Date().toISOString(),
  }).eq('id', assemblyId);
}

/**
 * Match Products list row by family SKU (same SKU → add stock on next delivery).
 */
export async function findOrCreateKitweProduct(sb, assembly) {
  const existingRetailId = String(assembly?.retail_product_id || '').trim();
  if (existingRetailId) {
    const { data: linked } = await sb
      .from('products')
      .select('id, name, sku')
      .eq('id', existingRetailId)
      .maybeSingle();
    if (linked) return linked;
  }

  const sku = resolveKitweRetailSku(assembly);
  if (!sku) throw new Error(`Kitwe product SKU could not be resolved for assembly ${assembly?.id || '?'}`);

  const variants = [sku, sku.toUpperCase(), sku.toLowerCase()];
  for (const candidate of variants) {
    const { data: rows } = await sb.from('products').select('id, name, sku').eq('sku', candidate).limit(1);
    if (rows?.[0]) {
      await linkAssemblyRetailProduct(sb, assembly.id, rows[0].id);
      return rows[0];
    }
  }

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    name: String(assembly.name || sku).trim(),
    sku,
    category_id: assembly.category_id || null,
    currency: 'K',
    created_at: now,
    updated_at: now,
    metadata: { source: 'kitwe_delivery_accept', assembly_id: assembly.id },
  };
  const { error } = await sb.from('products').insert(row);
  if (error) throw new Error(error.message || 'Failed to create Kitwe product');
  await linkAssemblyRetailProduct(sb, assembly.id, id);
  return row;
}

export async function addProductInventoryAtKitwe(sb, productId, delta) {
  const d = Math.max(0, Number(delta) || 0);
  if (!productId || d < 1) return;
  const loc = WAREHOUSE_TO_LOCATION_ID;
  const { data: rows } = await sb
    .from('inventory')
    .select('id, quantity')
    .eq('product_id', productId)
    .eq('location', loc);
  const current = Number(rows?.[0]?.quantity) || 0;
  const now = new Date().toISOString();
  if (rows?.[0]?.id) {
    await sb.from('inventory').update({
      quantity: current + d,
      updated_at: now,
    }).eq('id', rows[0].id);
  } else {
    await sb.from('inventory').insert({
      id: newUuid(),
      product_id: productId,
      location: loc,
      quantity: d,
      updated_at: now,
    });
  }
  await sb.from('product_locations').upsert({
    product_id: productId,
    location_id: loc,
    updated_at: now,
  }, { onConflict: 'product_id,location_id' });
}

/** List assembly on Kitwe showroom (packets already in warehouse_packet_inventory from accept). */
export async function ensureAssemblyListedAtKitwe(sb, assemblyId) {
  if (!assemblyId) return;
  await sb.from('warehouse_assembly_locations').upsert({
    assembly_id: assemblyId,
    location_id: WAREHOUSE_TO_LOCATION_ID,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'assembly_id,location_id' });
}

export async function addKitweAssemblyInventoryDelta(sb, assemblyId, deltaUnits) {
  const d = Math.max(0, Math.floor(Number(deltaUnits) || 0));
  if (!assemblyId || d < 1) return 0;
  const loc = WAREHOUSE_TO_LOCATION_ID;
  const { data: row } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', loc)
    .maybeSingle();
  const current = Number(row?.quantity) || 0;
  const next = current + d;
  const now = new Date().toISOString();
  await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: assemblyId,
    location_id: loc,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  return next;
}

/** Kitwe finished-product qty for one assembly (after packet/BOM recompute). */
export async function readKitweAssemblyInventoryQty(sb, assemblyId) {
  const aid = String(assemblyId || '').trim();
  if (!aid) return 0;
  const { data: row } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', aid)
    .eq('location_id', WAREHOUSE_TO_LOCATION_ID)
    .maybeSingle();
  return Math.max(0, Number(row?.quantity) || 0);
}

export async function readKitweAssemblyInventoryQtyMap(sb, assemblyIds) {
  const map = new Map();
  for (const raw of assemblyIds || []) {
    const aid = String(raw || '').trim();
    if (!aid) continue;
    map.set(aid, await readKitweAssemblyInventoryQty(sb, aid));
  }
  return map;
}

export async function markAssemblyKitweFactoryDelivery(sb, assemblyId, addUnits, now) {
  const { data: asmRow } = await sb
    .from('warehouse_assemblies')
    .select('metadata')
    .eq('id', assemblyId)
    .maybeSingle();
  const prevMeta = asmRow?.metadata || {};
  const prevUnits = Number(prevMeta.kitwe_factory_delivery_units) || 0;
  const add = Math.max(0, Number(addUnits) || 0);
  await sb.from('warehouse_assemblies').update({
    metadata: {
      ...prevMeta,
      kitwe_from_factory_delivery: true,
      kitwe_factory_delivery_units: prevUnits + add,
      kitwe_factory_delivery_at: now,
    },
    updated_at: now,
  }).eq('id', assemblyId);
}

export function assemblyUnitsFullyReceived(sessionLines) {
  const units = new Map();
  const byAssembly = new Map();
  const finishedByAssembly = new Map();
  for (const line of sessionLines || []) {
    const aid = String(line.metadata?.assembly_id || '');
    if (!aid) continue;
    if (line.metadata?.finished_unit === true && !entryPacketId(line)) {
      if (!finishedByAssembly.has(aid)) finishedByAssembly.set(aid, []);
      finishedByAssembly.get(aid).push(line);
      continue;
    }
    if (!entryPacketId(line)) continue;
    if (!byAssembly.has(aid)) byAssembly.set(aid, []);
    byAssembly.get(aid).push(line);
  }
  for (const [aid, asmLines] of finishedByAssembly.entries()) {
    if (!asmLines.every(entryReceived)) continue;
    const qty = asmLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
    units.set(aid, Math.max(1, qty));
  }
  for (const [aid, asmLines] of byAssembly.entries()) {
    if (units.has(aid)) continue;
    if (!asmLines.every(entryReceived)) continue;
    units.set(aid, Math.max(1, Number(asmLines[0]?.metadata?.units) || 1));
  }
  return units;
}

export function assemblyUnitsReadyForKitweCatalog(sessionLines, movedAssemblyIds) {
  const units = assemblyUnitsFullyReceived(sessionLines);
  for (const aid of movedAssemblyIds || []) {
    if (units.has(aid)) continue;
    const asmLines = (sessionLines || []).filter(
      (line) => String(line.metadata?.assembly_id || '') === String(aid) && entryPacketId(line),
    );
    if (!asmLines.length || !asmLines.every(entryReceived)) continue;
    units.set(
      String(aid),
      Math.max(1, Number(asmLines[0]?.metadata?.units) || 1),
    );
  }
  return units;
}

/**
 * After packets moved to Kitwe: bump assembly + POS stock, link SKU, list on Kitwe.
 * @returns {Record<string, number>} updated mirrored_assembly_units map
 */
export async function syncKitweCatalogForDeliveryAssemblies(sb, {
  assemblyUnits,
  mirroredBefore = {},
  kitweQtyBefore = null,
  kitweQtyAfter = null,
  now = new Date().toISOString(),
}) {
  const mirroredAfter = { ...mirroredBefore };
  if (!assemblyUnits?.size) return mirroredAfter;

  const beforeMap = kitweQtyBefore instanceof Map ? kitweQtyBefore : new Map();
  const afterMap = kitweQtyAfter instanceof Map ? kitweQtyAfter : new Map();

  const { data: assemblies } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, retail_product_id, category_id')
    .in('id', [...assemblyUnits.keys()]);

  for (const assembly of assemblies || []) {
    const aid = String(assembly.id);
    const units = assemblyUnits.get(aid) || 0;
    if (units < 1) continue;

    const already = Number(mirroredBefore[aid]) || 0;
    const catalogDelta = units - already;
    if (catalogDelta < 1) continue;

    const qtyBefore = beforeMap.has(aid) ? beforeMap.get(aid) : await readKitweAssemblyInventoryQty(sb, aid);
    const qtyAfter = afterMap.has(aid) ? afterMap.get(aid) : qtyBefore;
    const bomGain = Math.max(0, qtyAfter - qtyBefore);
    const assemblyAdd = Math.max(0, catalogDelta - bomGain);

    await ensureAssemblyListedAtKitwe(sb, aid);
    if (assemblyAdd > 0) {
      await addKitweAssemblyInventoryDelta(sb, aid, assemblyAdd);
    }
    await markAssemblyKitweFactoryDelivery(sb, aid, catalogDelta, now);

    const product = await findOrCreateKitweProduct(sb, assembly);
    if (product?.id) await addProductInventoryAtKitwe(sb, product.id, catalogDelta);
    mirroredAfter[aid] = units;
  }

  return mirroredAfter;
}

/**
 * Backfill Kitwe catalog for a completed/partial delivery (repair script + ops).
 */
export async function repairKitweCatalogForSession(sb, deliveryNumberOrSessionId) {
  const filter = String(deliveryNumberOrSessionId || '').trim();
  if (!filter) throw new Error('delivery number or session id required');

  const { data: sessions, error } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, delivery_number, status, metadata')
    .or(`delivery_number.eq.${filter},id.eq.${filter}`)
    .limit(5);
  if (error) throw error;
  const session = (sessions || [])[0];
  if (!session) throw new Error(`Delivery not found: ${filter}`);

  const { data: lines, error: lineErr } = await sb
    .from('warehouse_delivery_entries')
    .select('*')
    .eq('session_id', session.id);
  if (lineErr) throw lineErr;

  const assemblyIds = [...new Set(
    (lines || [])
      .map((l) => String(l.metadata?.assembly_id || ''))
      .filter(Boolean),
  )];
  const assemblyUnits = assemblyUnitsReadyForKitweCatalog(lines || [], assemblyIds);
  if (!assemblyUnits.size) {
    return { session_id: session.id, delivery_number: session.delivery_number, repaired: 0, message: 'No fully received assemblies in this delivery.' };
  }

  const mirroredBefore = { ...(session.metadata?.mirrored_assembly_units || {}) };
  const now = new Date().toISOString();
  const mirroredAfter = await syncKitweCatalogForDeliveryAssemblies(sb, {
    assemblyUnits,
    mirroredBefore,
    now,
  });

  const changed = Object.keys(mirroredAfter).some(
    (k) => Number(mirroredAfter[k]) !== Number(mirroredBefore[k]),
  );
  if (changed) {
    await sb.from('warehouse_delivery_sessions').update({
      metadata: {
        ...(session.metadata || {}),
        mirrored_assembly_units: mirroredAfter,
      },
      updated_at: now,
    }).eq('id', session.id);
  }

  return {
    session_id: session.id,
    delivery_number: session.delivery_number,
    repaired: assemblyUnits.size,
    mirrored_assembly_units: mirroredAfter,
  };
}
