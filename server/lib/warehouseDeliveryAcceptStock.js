import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  deliveryEntrySentToCustomer,
} from '../../src/utils/warehouseDelivery.js';
import { adjustPacketStock } from './warehouseDeliveryStock.js';
import { adjustAssemblyStock } from './warehouseReturnStock.js';
import {
  recomputeWarehouseLocationStockServer,
  recomputeWarehouseStockForPacketTouch,
} from './warehouseLocationStockRecompute.js';

export function deliveryEntryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

export function deliveryEntryFinishedUnit(entry) {
  return entry?.metadata?.finished_unit === true
    && !deliveryEntryPacketId(entry);
}

export function deliverySourceStockDeducted(entry) {
  return Boolean(entry?.metadata?.source_stock_deducted_at);
}

async function applyAssemblySourceDeduct(sb, assemblyId, fromLoc, qty, { allowAlreadyGone = false } = {}) {
  try {
    await adjustAssemblyStock(sb, assemblyId, fromLoc, -qty);
    return { deducted: true, skipped: false };
  } catch (err) {
    if (allowAlreadyGone && /Not enough finished product stock/i.test(String(err?.message || ''))) {
      return { deducted: false, skipped: true };
    }
    throw err;
  }
}

async function applyPacketSourceDeduct(sb, packetId, fromLoc, qty, { allowAlreadyGone = false } = {}) {
  try {
    await adjustPacketStock(sb, packetId, fromLoc, -qty);
    return { deducted: true, skipped: false };
  } catch (err) {
    if (allowAlreadyGone && /Not enough packet stock/i.test(String(err?.message || ''))) {
      return { deducted: false, skipped: true };
    }
    throw err;
  }
}

/**
 * Driver submit — stock leaves the send location (in transit). Kitwe receives on accept.
 */
export async function deductSourceStockOnDeliverySubmit(sb, entries, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
  now = new Date().toISOString(),
} = {}) {
  const touchedPackets = new Set();
  const locations = new Set();
  for (const line of entries || []) {
    const meta = { ...(line.metadata || {}) };
    if (deliverySourceStockDeducted(line)) continue;

    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty < 1) continue;

    if (meta.admin_queue_delivery === true) {
      line.metadata = {
        ...meta,
        delivery_admin_hold: true,
        source_stock_deducted_at: now,
        virtual_hold_released_at: now,
      };
      continue;
    }

    const pid = deliveryEntryPacketId(line);
    const fromLoc = String(meta.stock_deduct_location_id || fromLocationId).trim() || fromLocationId;

    if (pid) {
      await adjustPacketStock(sb, pid, fromLoc, -qty);
      touchedPackets.add(pid);
      locations.add(fromLoc);
      line.metadata = {
        ...meta,
        source_stock_deducted_at: now,
        stock_deduct_location_id: fromLoc,
      };
      continue;
    }

    if (deliveryEntryFinishedUnit(line)) {
      const aid = String(meta.assembly_id || '').trim();
      if (!aid) continue;
      await adjustAssemblyStock(sb, aid, fromLoc, -qty);
      locations.add(fromLoc);
      line.metadata = {
        ...meta,
        source_stock_deducted_at: now,
        stock_deduct_location_id: fromLoc,
      };
    }
  }

  for (const pid of touchedPackets) {
    for (const loc of locations) {
      await recomputeWarehouseStockForPacketTouch(sb, pid, loc);
    }
  }
  for (const loc of locations) {
    await recomputeWarehouseLocationStockServer(sb, loc);
  }
}

/** Cancel before Kitwe accept — put in-transit stock back on the send location. */
export async function restoreSourceStockOnDeliveryCancel(sb, entries, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
} = {}) {
  const touchedPackets = new Set();
  const locations = new Set();
  for (const line of entries || []) {
    if (!deliverySourceStockDeducted(line)) continue;
    if (line?.metadata?.received_at) continue;
    if (line?.metadata?.delivery_admin_hold === true || line?.metadata?.admin_queue_delivery === true) {
      continue;
    }

    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty < 1) continue;

    const meta = line.metadata || {};
    const fromLoc = String(meta.stock_deduct_location_id || fromLocationId).trim() || fromLocationId;
    const pid = deliveryEntryPacketId(line);

    if (pid) {
      await adjustPacketStock(sb, pid, fromLoc, qty);
      touchedPackets.add(pid);
      locations.add(fromLoc);
      continue;
    }

    if (deliveryEntryFinishedUnit(line)) {
      const aid = String(meta.assembly_id || '').trim();
      if (!aid) continue;
      await adjustAssemblyStock(sb, aid, fromLoc, qty);
      locations.add(fromLoc);
    }
  }

  for (const pid of touchedPackets) {
    for (const loc of locations) {
      await recomputeWarehouseStockForPacketTouch(sb, pid, loc);
    }
  }
  for (const loc of locations) {
    await recomputeWarehouseLocationStockServer(sb, loc);
  }
}

/**
 * Move confirmed delivery lines: Factory packet −, Kitwe packet +.
 * @returns {Promise<Array<{ lineId: string, packetId: string, qty: number, assemblyId: string }>>}
 */
export async function movePacketsForDeliveryReceive(sb, lines, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
} = {}) {
  const moved = [];
  for (const line of lines || []) {
    const pid = deliveryEntryPacketId(line);
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!pid || qty < 1) continue;
    const fromLoc = String(line.metadata?.stock_deduct_location_id || fromLocationId).trim() || fromLocationId;
    if (!deliverySourceStockDeducted(line)) {
      await applyPacketSourceDeduct(sb, pid, fromLoc, qty, { allowAlreadyGone: true });
    }
    if (deliveryEntrySentToCustomer(line)) continue;
    await adjustPacketStock(sb, pid, toLocationId, qty);
    moved.push({
      lineId: String(line.id),
      packetId: pid,
      qty,
      assemblyId: String(line.metadata?.assembly_id || '').trim(),
    });
  }
  return moved;
}

/**
 * Finished-unit lines (no carton BOM): Factory assembly −, Kitwe assembly +.
 * @returns {Promise<Array<{ lineId: string, assemblyId: string, qty: number }>>}
 */
export async function moveAssembliesForDeliveryReceive(sb, lines, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
} = {}) {
  const moved = [];
  for (const line of lines || []) {
    if (!deliveryEntryFinishedUnit(line)) continue;
    const aid = String(line.metadata?.assembly_id || '').trim();
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!aid || qty < 1) continue;
    if (line.metadata?.admin_queue_delivery === true) {
      continue;
    }
    const fromLoc = String(line.metadata?.stock_deduct_location_id || fromLocationId).trim() || fromLocationId;
    if (!deliverySourceStockDeducted(line)) {
      await applyAssemblySourceDeduct(sb, aid, fromLoc, qty, { allowAlreadyGone: true });
    }
    const skipKitweAdd = line.metadata?.return_has_customer === true
      || deliveryEntrySentToCustomer(line);
    if (!skipKitweAdd) {
      await adjustAssemblyStock(sb, aid, toLocationId, qty);
    }
    moved.push({
      lineId: String(line.id),
      assemblyId: aid,
      qty,
    });
  }
  return moved;
}

/**
 * Return WHR: Floor 1 was deducted on ship submit — Kitwe + only when Hassan accepts.
 */
export async function moveReturnShipmentAssembliesToKitwe(sb, lines, {
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
} = {}) {
  const moved = [];
  for (const line of lines || []) {
    if (!deliveryEntryFinishedUnit(line)) continue;
    const aid = String(line.metadata?.assembly_id || '').trim();
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!aid || qty < 1) continue;
    await adjustAssemblyStock(sb, aid, toLocationId, qty);
    moved.push({
      lineId: String(line.id),
      assemblyId: aid,
      qty,
    });
  }
  return moved;
}

/**
 * After packet moves: refresh derived finished-product qty at both locations, then full location recompute (sets at Kitwe).
 */
export async function syncWarehouseStockAfterDeliveryReceive(sb, moved, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
} = {}) {
  const packetIds = [...new Set((moved || []).map((m) => m.packetId).filter(Boolean))];
  for (const pid of packetIds) {
    await recomputeWarehouseStockForPacketTouch(sb, pid, fromLocationId);
    await recomputeWarehouseStockForPacketTouch(sb, pid, toLocationId);
  }
  await recomputeWarehouseLocationStockServer(sb, fromLocationId);
  await recomputeWarehouseLocationStockServer(sb, toLocationId);
}
