import { createFirestoreServerClient } from '../lib/firestoreServerClient.js';
import { allocateWarehouseDeliveryNumber } from '../lib/warehouseDeliveryNumber.js';
import { validateAssemblyShipmentBom } from '../lib/warehouseMobileBom.js';
import { newUuid } from '../lib/uuid.js';
import {
  normalizeWarehouseSku,
  normalizeWarehouseSkuKey,
} from '../../src/utils/warehouseAssemblyMath.js';
import { resolvePacketFromScan } from '../../src/utils/warehouseScanResolver.js';
import { buildPacketsByAssembly } from '../../src/utils/warehouseAssemblyPacketPool.js';
import {
  createCategoryForMobile,
  fetchCatalogForMobile,
  findOrCreateWarehouseColorServer,
  saveAssemblyForMobile,
} from '../lib/warehouseCatalogMobile.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';

function getService() {
  const client = createFirestoreServerClient();
  if (!client) throw new Error('Firebase admin not configured');
  return client;
}

async function requireUser(req) {
  const { verifyBearerUser } = await import('../lib/verifyBearerUser.js');
  return verifyBearerUser(req);
}

async function assertUniqueSku(sb, sku, { excludeAssemblyId, excludePacketId } = {}) {
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) throw new Error('SKU is required');

  const [{ data: assemblies }, { data: packets }, { data: products }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku'),
    sb.from('warehouse_packets').select('id, name, sku'),
    sb.from('products').select('id, name, sku'),
  ]);

  const productClash = (assemblies || []).find(
    (r) => normalizeWarehouseSkuKey(r.family_sku) === key
      && String(r.id) !== String(excludeAssemblyId || ''),
  );
  if (productClash) {
    throw new Error(`SKU already used by warehouse product "${productClash.name}".`);
  }
  const packetClash = (packets || []).find(
    (r) => normalizeWarehouseSkuKey(r.sku) === key
      && String(r.id) !== String(excludePacketId || ''),
  );
  if (packetClash) {
    throw new Error(`SKU already used by warehouse packet "${packetClash.name}".`);
  }
  const legacyClash = (products || []).find(
    (r) => normalizeWarehouseSkuKey(r.sku) === key,
  );
  if (legacyClash) {
    throw new Error(`SKU already used by catalog product "${legacyClash.name}".`);
  }
}

async function opScanResolve(body) {
  const scan = String(body.scan || '').trim();
  if (!scan) throw new Error('Scan value is required.');
  const sb = getService();
  const assemblyFields = 'id, name, family_sku, packet_count, image_url, dim_length, dim_width, dim_height, category_id, inventory_mode';
  const [{ data: packets }, { data: assemblies }] = await Promise.all([
    sb.from('warehouse_packets').select('id, sku, name, packet_number, assembly_id, qty_per_unit'),
    sb.from('warehouse_assemblies').select(assemblyFields),
  ]);
  const packet = resolvePacketFromScan(scan, packets || []);
  if (packet) {
    const assembly = packet.assembly_id
      ? (assemblies || []).find((a) => String(a.id) === String(packet.assembly_id))
      : null;
    return { kind: 'packet', packet, assembly };
  }
  const key = normalizeWarehouseSkuKey(normalizeWarehouseSku(scan));
  const assembly = (assemblies || []).find(
    (a) => normalizeWarehouseSkuKey(a.family_sku) === key,
  );
  if (assembly) {
    return { kind: 'assembly', assembly };
  }
  return { kind: 'unknown', scan };
}

async function opPacketCreate(body, user) {
  const sb = getService();
  const sku = normalizeWarehouseSku(body.sku);
  const name = String(body.name || '').trim();
  const packetNumber = Number(body.packet_number);
  const qtyPerUnit = 1;
  const warehouseLocationId = body.warehouse_location_id;
  const initialQty = Math.max(0, Number(body.initial_quantity) || 0);
  if (!sku || !name) throw new Error('SKU and name are required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (!Number.isFinite(packetNumber) || packetNumber < 1) {
    throw new Error('packet_number must be at least 1.');
  }
  await assertUniqueSku(sb, sku, { excludePacketId: body.id });

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    assembly_id: null,
    sku,
    name,
    category_id: null,
    location_id: warehouseLocationId,
    packet_number: packetNumber,
    qty_per_unit: qtyPerUnit,
    item_kind: 'packet',
    created_at: now,
    updated_at: now,
  };
  const { error } = await sb.from('warehouse_packets').insert(row);
  if (error) throw new Error(error.message || 'Failed to create packet');

  await sb.from('warehouse_packet_inventory').upsert({
    packet_id: id,
    location_id: warehouseLocationId,
    quantity: initialQty,
    updated_at: now,
  }, { onConflict: 'packet_id,location_id' });

  return { packet: row, created_by: user?.email || null };
}

async function opAssemblyCreate(body, user) {
  const sb = getService();
  const familySku = normalizeWarehouseSku(body.family_sku);
  const name = String(body.name || '').trim();
  const packetCount = Number(body.packet_count);
  const warehouseLocationId = body.warehouse_location_id;
  if (!familySku || !name) throw new Error('SKU and name are required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (!Number.isFinite(packetCount) || packetCount < 1) {
    throw new Error('packet_count is required.');
  }
  await assertUniqueSku(sb, familySku);

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    name,
    family_sku: familySku,
    packet_count: packetCount,
    category_id: body.category_id || null,
    inventory_mode: 'packets',
    has_color_variants: false,
    created_at: now,
    updated_at: now,
  };
  const { error } = await sb.from('warehouse_assemblies').insert(row);
  if (error) throw new Error(error.message || 'Failed to create product');

  return { assembly: row, created_by: user?.email || null };
}

async function opBomValidate(body) {
  const assemblyId = String(body.assembly_id || '');
  const units = Math.max(1, Number(body.units) || 1);
  const scans = Array.isArray(body.scans) ? body.scans : [];
  if (!assemblyId) throw new Error('assembly_id is required.');

  const sb = getService();
  const [{ data: assembly }, { data: packets }, { data: links }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, packet_count').eq('id', assemblyId).maybeSingle(),
    sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from('warehouse_assembly_packets').select('*'),
  ]);
  if (!assembly) throw new Error('Product not found.');

  const byAssembly = buildPacketsByAssembly(links || [], packets || []);
  const packetRows = byAssembly.get(assemblyId) || [];
  const scanned = new Map();
  scans.forEach((line) => {
    const pid = String(line.packet_id || '');
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!pid || qty < 1) return;
    scanned.set(pid, (scanned.get(pid) || 0) + qty);
  });

  return validateAssemblyShipmentBom(assembly, packetRows, scanned, units);
}

async function opDeliverySessionOpen(user) {
  const deliveryNumber = await allocateWarehouseDeliveryNumber();
  const sb = getService();
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const row = {
    id: sessionId,
    delivery_number: deliveryNumber,
    from_location: WAREHOUSE_FROM_LOCATION_ID,
    to_location: WAREHOUSE_TO_LOCATION_ID,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: 0,
    created_by_email: user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || null,
    metadata: {
      source: 'warehouse_catalog_mobile',
      hassan_alert_pending: false,
    },
  };
  const { error } = await sb.from('warehouse_delivery_sessions').insert(row);
  if (error) throw new Error(error.message || 'Failed to open delivery session');
  return { session_id: sessionId, delivery_number: deliveryNumber };
}

async function deductPacketStock(sb, packetId, locationId, delta) {
  const { data: rows } = await sb
    .from('warehouse_packet_inventory')
    .select('quantity')
    .eq('packet_id', packetId)
    .eq('location_id', locationId);
  const current = Number(rows?.[0]?.quantity) || 0;
  const next = current - delta;
  if (next < 0) {
    throw new Error('Not enough packet stock at warehouse.');
  }
  const now = new Date().toISOString();
  await sb.from('warehouse_packet_inventory').upsert({
    packet_id: packetId,
    location_id: locationId,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'packet_id,location_id' });
}

async function opDeliverySubmit(body, user) {
  const sessionId = String(body.session_id || '');
  const groups = Array.isArray(body.groups) ? body.groups : [];
  if (!sessionId) throw new Error('session_id is required.');
  if (!groups.length) throw new Error('Add at least one product group.');

  const sb = getService();
  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) throw new Error('Delivery session not found.');
  if (String(session.status) !== 'draft') {
    throw new Error('Delivery session is not open for editing.');
  }

  const [{ data: packets }, { data: links }, { data: assemblies }] = await Promise.all([
    sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from('warehouse_assembly_packets').select('*'),
    sb.from('warehouse_assemblies').select('id, name, family_sku, packet_count'),
  ]);
  const byAssembly = buildPacketsByAssembly(links || [], packets || []);
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));

  const entries = [];
  let totalCartons = 0;

  for (const group of groups) {
    const assemblyId = String(group.assembly_id || '');
    const units = Math.max(1, Number(group.units) || 1);
    const assembly = assemblyById.get(assemblyId);
    if (!assembly) throw new Error('Unknown product in shipment.');

    const packetRows = byAssembly.get(assemblyId) || [];
    const scanned = new Map();
    (group.scans || []).forEach((line) => {
      const pid = String(line.packet_id || '');
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (!pid || qty < 1) return;
      scanned.set(pid, (scanned.get(pid) || 0) + qty);
    });

    const validation = validateAssemblyShipmentBom(assembly, packetRows, scanned, units);
    if (!validation.ok) {
      const err = new Error(validation.message || 'BOM incomplete');
      err.details = validation;
      throw err;
    }

    for (const packet of packetRows) {
      const moveQty = units * Math.max(1, Number(packet.qty_per_unit) || 1);
      const have = scanned.get(String(packet.id)) || 0;
      if (have < moveQty) continue;
      await deductPacketStock(sb, packet.id, WAREHOUSE_FROM_LOCATION_ID, moveQty);
      totalCartons += moveQty;
      entries.push({
        id: newUuid(),
        session_id: sessionId,
        kind: 'packet',
        name: packet.name,
        sku: packet.sku,
        quantity: moveQty,
        metadata: {
          packet_id: packet.id,
          assembly_id: assemblyId,
          assembly_name: assembly.name,
          packet_number: packet.packet_number,
          units,
        },
      });
    }
  }

  const now = new Date().toISOString();
  for (const entry of entries) {
    const { error } = await sb.from('warehouse_delivery_entries').insert({
      ...entry,
      created_at: now,
    });
    if (error) throw new Error(error.message || 'Failed to save delivery lines');
  }

  const { error: updErr } = await sb.from('warehouse_delivery_sessions').update({
    status: 'submitted',
    submitted_at: now,
    total_qty: totalCartons,
    metadata: {
      ...(session.metadata || {}),
      source: 'warehouse_catalog_mobile',
      hassan_alert_pending: true,
      hassan_alert_at: now,
      submitted_by_email: user?.email || null,
    },
  }).eq('id', sessionId);
  if (updErr) throw new Error(updErr.message || 'Failed to submit delivery');

  return {
    session_id: sessionId,
    delivery_number: session.delivery_number,
    total_cartons: totalCartons,
    entry_count: entries.length,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const op = String(body.op || body.operation || '').trim();

    let result;
    switch (op) {
      case 'scan-resolve':
        result = await opScanResolve(body);
        break;
      case 'packet-create':
        result = await opPacketCreate(body, user);
        break;
      case 'assembly-create':
        result = await opAssemblyCreate(body, user);
        break;
      case 'catalog-list':
        result = await fetchCatalogForMobile(getService());
        break;
      case 'category-create':
        result = { category: await createCategoryForMobile(getService(), body.name) };
        break;
      case 'color-find-or-create':
        result = { color: await findOrCreateWarehouseColorServer(getService(), body.name) };
        break;
      case 'assembly-save':
        result = {
          assembly: await saveAssemblyForMobile(getService(), body),
          created_by: user?.email || null,
        };
        break;
      case 'bom-validate':
        result = await opBomValidate(body);
        break;
      case 'delivery-session-open':
        result = await opDeliverySessionOpen(user);
        break;
      case 'delivery-submit':
        result = await opDeliverySubmit(body, user);
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Unknown op' });
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err?.status || (err?.details ? 400 : 500);
    return res.status(status).json({
      ok: false,
      error: err?.message || 'Warehouse mobile request failed',
      details: err?.details || null,
    });
  }
}
