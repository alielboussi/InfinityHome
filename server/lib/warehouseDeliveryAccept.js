import {
  movePacketsForDeliveryReceive,
  moveAssembliesForDeliveryReceive,
  syncWarehouseStockAfterDeliveryReceive,
  deliveryEntryFinishedUnit,
} from './warehouseDeliveryAcceptStock.js';
import {
  assemblyUnitsReadyForKitweCatalog,
  readKitweAssemblyInventoryQtyMap,
  syncKitweCatalogForDeliveryAssemblies,
} from './kitweDeliveryCatalogSync.js';
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
    (e) => (entryPacketId(e) || deliveryEntryFinishedUnit(e))
      && entryReceiverChecked(e)
      && !entryReceived(e),
  );
  if (!toReceive.length) {
    throw new Error('Tick at least one packet to receive, then accept.');
  }

  const now = new Date().toISOString();
  const touchedAssemblyIds = [...new Set(
    (toReceive || [])
      .map((line) => String(line.metadata?.assembly_id || '').trim())
      .filter(Boolean),
  )];
  const kitweQtyBefore = await readKitweAssemblyInventoryQtyMap(sb, touchedAssemblyIds);

  const moved = await movePacketsForDeliveryReceive(sb, toReceive);
  const movedAssemblies = await moveAssembliesForDeliveryReceive(sb, toReceive);
  for (const line of toReceive) {
    const metadata = {
      ...(line.metadata || {}),
      received_at: now,
      received_by_email: acceptedByEmail || null,
    };
    await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', line.id);
  }
  await syncWarehouseStockAfterDeliveryReceive(sb, moved);

  const movedAssemblyIds = [...new Set([
    ...(moved || []).map((m) => String(m.assemblyId || '')).filter(Boolean),
    ...(movedAssemblies || []).map((m) => String(m.assemblyId || '')).filter(Boolean),
  ])];
  const kitweQtyAfter = await readKitweAssemblyInventoryQtyMap(
    sb,
    [...new Set([...touchedAssemblyIds, ...movedAssemblyIds])],
  );

  for (const aid of movedAssemblyIds) {
    const { data: asmRow } = await sb
      .from('warehouse_assemblies')
      .select('metadata')
      .eq('id', aid)
      .maybeSingle();
    const prevMeta = asmRow?.metadata || {};
    await sb.from('warehouse_assemblies').update({
      metadata: {
        ...prevMeta,
        kitwe_from_factory_delivery: true,
        kitwe_factory_delivery_at: now,
      },
      updated_at: now,
    }).eq('id', aid);
  }

  const { data: refreshedLines } = await sb.from('warehouse_delivery_entries').select('*').eq('session_id', sid);
  const assemblyUnits = assemblyUnitsReadyForKitweCatalog(refreshedLines || [], movedAssemblyIds);
  const mirroredBefore = { ...(session.metadata?.mirrored_assembly_units || {}) };
  const mirroredAfter = await syncKitweCatalogForDeliveryAssemblies(sb, {
    assemblyUnits,
    mirroredBefore,
    kitweQtyBefore,
    kitweQtyAfter,
    now,
  });

  const openAfter = (refreshedLines || []).some((e) => entryPacketId(e) && !entryReceived(e));

  const allDone = !openAfter;
  const meta = {
    ...(session.metadata || {}),
    hassan_alert_pending: false,
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

export { assemblyUnitsFullyReceived } from './kitweDeliveryCatalogSync.js';
