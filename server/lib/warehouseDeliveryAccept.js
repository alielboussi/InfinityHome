import {
  movePacketsForDeliveryReceive,
  moveAssembliesForDeliveryReceive,
  moveReturnShipmentAssembliesToKitwe,
  syncWarehouseStockAfterDeliveryReceive,
  deliveryEntryFinishedUnit,
} from './warehouseDeliveryAcceptStock.js';
import { finalizeReturnShipmentOnKitweAccept } from './warehouseReturnOrders.js';
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

function entryReceivable(entry) {
  return Boolean(entryPacketId(entry) || deliveryEntryFinishedUnit(entry));
}

async function markKitweFactoryDeliveryFlags(sb, assemblyIds, now) {
  for (const rawId of assemblyIds || []) {
    const aid = String(rawId || '').trim();
    if (!aid) continue;
    const { data: asmRow } = await sb
      .from('warehouse_assemblies')
      .select('metadata')
      .eq('id', aid)
      .maybeSingle();
    const prevMeta = asmRow?.metadata || {};
    if (prevMeta.kitwe_from_factory_delivery === true) continue;
    await sb.from('warehouse_assemblies').update({
      metadata: {
        ...prevMeta,
        kitwe_from_factory_delivery: true,
        kitwe_factory_delivery_at: prevMeta.kitwe_factory_delivery_at || now,
      },
      updated_at: now,
    }).eq('id', aid);
  }
}

/**
 * Idempotent: Kitwe catalog mirror + session status after lines are received (or re-run after partial failure).
 */
export async function finalizeWarehouseDeliverySession(sb, session, {
  acceptedBy,
  acceptedByEmail,
  now = new Date().toISOString(),
  receivedLineCount = 0,
  finalizedOnly = false,
  kitweQtyBeforeStockAccept = null,
  kitweQtyAfterStockAccept = null,
} = {}) {
  const sid = String(session?.id || '').trim();
  if (!sid) throw new Error('session_id is required');

  const { data: refreshedLines, error: lineErr } = await sb
    .from('warehouse_delivery_entries')
    .select('*')
    .eq('session_id', sid);
  if (lineErr) throw new Error(lineErr.message || 'Failed to load delivery lines');
  const lines = refreshedLines || [];

  const receivedAssemblyIds = [...new Set(
    lines
      .filter(entryReceived)
      .map((line) => String(line.metadata?.assembly_id || '').trim())
      .filter(Boolean),
  )];

  const kitweQtyBefore = kitweQtyBeforeStockAccept instanceof Map
    ? kitweQtyBeforeStockAccept
    : await readKitweAssemblyInventoryQtyMap(sb, receivedAssemblyIds);

  await markKitweFactoryDeliveryFlags(sb, receivedAssemblyIds, now);

  const assemblyUnits = assemblyUnitsReadyForKitweCatalog(lines, receivedAssemblyIds);
  const mirroredBefore = { ...(session.metadata?.mirrored_assembly_units || {}) };
  let mirroredAfter = mirroredBefore;
  let catalogSyncError = null;

  try {
    const kitweQtyAfter = kitweQtyAfterStockAccept instanceof Map
      ? kitweQtyAfterStockAccept
      : await readKitweAssemblyInventoryQtyMap(sb, receivedAssemblyIds);
    mirroredAfter = await syncKitweCatalogForDeliveryAssemblies(sb, {
      assemblyUnits,
      mirroredBefore,
      kitweQtyBefore,
      kitweQtyAfter,
      skipAssemblyInventoryDelta: finalizedOnly,
      now,
    });
  } catch (err) {
    catalogSyncError = String(err?.message || err);
    console.error('[delivery-accept] Kitwe catalog sync failed:', catalogSyncError);
  }

  const openAfter = lines.some((e) => entryReceivable(e) && !entryReceived(e));
  const allDone = !openAfter;

  const meta = {
    ...(session.metadata || {}),
    hassan_alert_pending: false,
    accepted_by_email: acceptedByEmail || session.metadata?.accepted_by_email || null,
    last_partial_receive_at: now,
    mirrored_assembly_units: mirroredAfter,
  };
  if (catalogSyncError) {
    meta.kitwe_catalog_sync_error = catalogSyncError;
    meta.kitwe_catalog_sync_error_at = now;
  } else {
    delete meta.kitwe_catalog_sync_error;
    delete meta.kitwe_catalog_sync_error_at;
  }

  const sessionUpdate = {
    status: allDone ? 'completed' : 'partially_received',
    accepted_at: session.accepted_at || now,
    completed_at: allDone ? (session.completed_at || now) : (session.completed_at || null),
    accepted_by: acceptedBy || session.accepted_by || null,
    metadata: meta,
  };
  await sb.from('warehouse_delivery_sessions').update(sessionUpdate).eq('id', sid);

  await sb.from('warehouse_delivery_events').insert({
    id: newUuid(),
    session_id: sid,
    event_type: finalizedOnly
      ? (allDone ? 'completed_finalize' : 'partial_finalize')
      : (allDone ? 'completed' : 'partially_received'),
    actor_id: acceptedBy || null,
    actor_email: acceptedByEmail || null,
    detail: {
      received_lines: receivedLineCount,
      remaining: openAfter,
      catalog_sync_error: catalogSyncError,
    },
    created_at: now,
  });

  return {
    ok: true,
    session_id: sid,
    partial: !allDone,
    received_count: receivedLineCount,
    catalog_sync_error: catalogSyncError,
    session: { ...session, ...sessionUpdate, metadata: meta },
  };
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

  const receivable = lines.filter(entryReceivable);
  const toReceive = receivable.filter(
    (e) => entryReceiverChecked(e) && !entryReceived(e),
  );

  const now = new Date().toISOString();

  const assemblyIdsTouchedThisAccept = () => [...new Set(
    toReceive
      .map((line) => String(line.metadata?.assembly_id || '').trim())
      .filter(Boolean),
  )];

  if (!toReceive.length) {
    const allReceivableReceived = receivable.length > 0 && receivable.every(entryReceived);
    if (allReceivableReceived) {
      return finalizeWarehouseDeliverySession(sb, session, {
        acceptedBy,
        acceptedByEmail,
        now,
        receivedLineCount: 0,
        finalizedOnly: true,
      });
    }
    throw new Error('Tick at least one packet to receive, then accept.');
  }

  const touchedAssemblyIds = assemblyIdsTouchedThisAccept();
  const kitweQtyBeforeStockAccept = touchedAssemblyIds.length
    ? await readKitweAssemblyInventoryQtyMap(sb, touchedAssemblyIds)
    : null;

  const isReturnShipment = session.metadata?.is_return_shipment === true;
  let moved;
  if (isReturnShipment) {
    moved = await moveReturnShipmentAssembliesToKitwe(sb, toReceive);
  } else {
    moved = await movePacketsForDeliveryReceive(sb, toReceive);
    await moveAssembliesForDeliveryReceive(sb, toReceive);
  }
  for (const line of toReceive) {
    const metadata = {
      ...(line.metadata || {}),
      received_at: now,
      received_by_email: acceptedByEmail || null,
    };
    await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', line.id);
  }
  await syncWarehouseStockAfterDeliveryReceive(sb, moved);

  const kitweQtyAfterStockAccept = touchedAssemblyIds.length
    ? await readKitweAssemblyInventoryQtyMap(sb, touchedAssemblyIds)
    : null;

  const finalizeResult = await finalizeWarehouseDeliverySession(sb, session, {
    acceptedBy,
    acceptedByEmail,
    now,
    receivedLineCount: toReceive.length,
    finalizedOnly: false,
    kitweQtyBeforeStockAccept,
    kitweQtyAfterStockAccept,
  });

  if (isReturnShipment) {
    await finalizeReturnShipmentOnKitweAccept(sb, session, { acceptedAt: now });
  }

  return finalizeResult;
}

export function deliveryEntryProgress(entries) {
  const list = entries || [];
  const receivable = list.filter(entryReceivable);
  const total = receivable.length;
  const confirmed = receivable.filter((e) => entryReceiverChecked(e)).length;
  return { total, confirmed };
}

export { assemblyUnitsFullyReceived } from './kitweDeliveryCatalogSync.js';
