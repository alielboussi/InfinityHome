import { normalizeWarehouseProductSku } from '../../src/utils/warehouseScanResolver.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { adjustPacketStock } from './warehouseDeliveryStock.js';
import { newUuid } from './uuid.js';

function entryReceiverChecked(entry) {
  return Boolean(entry?.metadata?.receiver_checked_at);
}

function entryReceived(entry) {
  return Boolean(entry?.metadata?.received_at);
}

function entryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

async function findOrCreateKitweProduct(sb, assembly) {
  const sku = normalizeWarehouseProductSku(assembly.family_sku || assembly.name);
  if (!sku) return null;

  const variants = [sku, sku.toUpperCase(), sku.toLowerCase()];
  for (const candidate of variants) {
    const { data: rows } = await sb.from('products').select('id, name, sku').eq('sku', candidate).limit(1);
    if (rows?.[0]) return rows[0];
  }

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    name: String(assembly.name || sku).trim(),
    sku,
    created_at: now,
    updated_at: now,
    metadata: { source: 'kitwe_delivery_accept', assembly_id: assembly.id },
  };
  const { error } = await sb.from('products').insert(row);
  if (error) throw new Error(error.message || 'Failed to create Kitwe product');
  return row;
}

async function addProductInventoryAtKitwe(sb, productId, delta) {
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

/** Mirror legacy products inventory only when every packet line for the assembly is received. */
function assemblyUnitsFullyReceived(sessionLines) {
  const units = new Map();
  const byAssembly = new Map();
  for (const line of sessionLines || []) {
    const aid = String(line.metadata?.assembly_id || '');
    if (!aid || !entryPacketId(line)) continue;
    if (!byAssembly.has(aid)) byAssembly.set(aid, []);
    byAssembly.get(aid).push(line);
  }
  for (const [aid, asmLines] of byAssembly.entries()) {
    if (!asmLines.every(entryReceived)) continue;
    units.set(aid, Math.max(1, Number(asmLines[0]?.metadata?.units) || 1));
  }
  return units;
}

/**
 * Accept checked packets (partial receive OK). Stock moves only for confirmed, not-yet-received lines.
 */
export async function acceptWarehouseDeliveryServer(sb, sessionId, { acceptedBy, acceptedByEmail } = {}) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('session_id is required');

  const { data: session } = await sb.from('warehouse_delivery_sessions').select('*').eq('id', sid).maybeSingle();
  if (!session) throw new Error('Delivery session not found.');
  const status = String(session.status || '').toLowerCase();
  if (status !== 'submitted' && status !== 'pending' && status !== 'partially_received') {
    throw new Error('Delivery is not awaiting acceptance.');
  }

  const { data: entries, error: entErr } = await sb
    .from('warehouse_delivery_entries')
    .select('*')
    .eq('session_id', sid);
  if (entErr) throw new Error(entErr.message || 'Failed to load delivery lines');
  const lines = entries || [];
  if (!lines.length) throw new Error('Delivery has no lines.');

  const toReceive = lines.filter(
    (e) => entryPacketId(e) && entryReceiverChecked(e) && !entryReceived(e),
  );
  if (!toReceive.length) {
    throw new Error('Tick at least one packet to receive, then accept.');
  }

  const now = new Date().toISOString();
  for (const line of toReceive) {
    const pid = entryPacketId(line);
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!pid || qty < 1) continue;
    await adjustPacketStock(sb, pid, WAREHOUSE_FROM_LOCATION_ID, -qty);
    await adjustPacketStock(sb, pid, WAREHOUSE_TO_LOCATION_ID, qty);
    const metadata = {
      ...(line.metadata || {}),
      received_at: now,
      received_by_email: acceptedByEmail || null,
    };
    await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', line.id);
  }

  const { data: refreshedLines } = await sb.from('warehouse_delivery_entries').select('*').eq('session_id', sid);
  const assemblyUnits = assemblyUnitsFullyReceived(refreshedLines || []);
  const mirroredBefore = { ...(session.metadata?.mirrored_assembly_units || {}) };
  const mirroredAfter = { ...mirroredBefore };
  if (assemblyUnits.size) {
    const { data: assemblies } = await sb
      .from('warehouse_assemblies')
      .select('id, name, family_sku')
      .in('id', [...assemblyUnits.keys()]);
    for (const assembly of assemblies || []) {
      const aid = String(assembly.id);
      const units = assemblyUnits.get(aid) || 0;
      const already = Number(mirroredBefore[aid]) || 0;
      const delta = units - already;
      if (delta < 1) continue;
      const product = await findOrCreateKitweProduct(sb, assembly);
      if (product?.id) await addProductInventoryAtKitwe(sb, product.id, delta);
      mirroredAfter[aid] = units;
    }
  }

  await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_FROM_LOCATION_ID);
  await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_TO_LOCATION_ID);

  const openAfter = (refreshedLines || []).some((e) => entryPacketId(e) && !entryReceived(e));

  const allDone = !openAfter;
  const meta = {
    ...(session.metadata || {}),
    hassan_alert_pending: !allDone,
    accepted_by_email: acceptedByEmail || null,
    last_partial_receive_at: now,
    mirrored_assembly_units: mirroredAfter,
  };
  const sessionUpdate = {
    status: allDone ? 'completed' : 'partially_received',
    accepted_at: session.accepted_at || now,
    completed_at: allDone ? now : (session.completed_at || null),
    accepted_by: acceptedBy || session.accepted_by || null,
    metadata: meta,
  };
  await sb.from('warehouse_delivery_sessions').update(sessionUpdate).eq('id', sid);

  await sb.from('warehouse_delivery_events').insert({
    id: newUuid(),
    session_id: sid,
    event_type: allDone ? 'completed' : 'partially_received',
    actor_id: acceptedBy || null,
    actor_email: acceptedByEmail || null,
    detail: { received_lines: toReceive.length, remaining: openAfter },
    created_at: now,
  });

  return {
    ok: true,
    session_id: sid,
    partial: !allDone,
    received_count: toReceive.length,
    session: { ...session, ...sessionUpdate, metadata: meta },
  };
}

export function deliveryEntryProgress(entries) {
  const list = entries || [];
  const total = list.filter((e) => entryPacketId(e)).length;
  const confirmed = list.filter((e) => entryReceiverChecked(e)).length;
  return { total, confirmed };
}
