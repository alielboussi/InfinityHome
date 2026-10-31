import {
  deliveryFinishedUnitsFromEntryMetadata,
  formatDeliveryPackSummary,
} from './warehouseDeliveryBoxUnits.js';
import { deliverySessionSubmittedByName } from './warehouseMobileDisplayName.js';

export const WAREHOUSE_FROM_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';
export const WAREHOUSE_TO_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
export const WAREHOUSE_ACCEPT_USER_ID = '6b992ac8-8e39-4f31-a323-2271a974da8c';

export const WAREHOUSE_PENDING_STATUSES = ['pending', 'submitted', 'partially_received'];
export const WAREHOUSE_COMPLETED_STATUSES = ['completed', 'accepted'];

/** Hassan receiver page: pending + history for review/PDF. */
export const WAREHOUSE_RECEIVER_LIST_STATUSES = [
  ...WAREHOUSE_PENDING_STATUSES,
  ...WAREHOUSE_COMPLETED_STATUSES,
];

export function isWarehousePending(status) {
  return WAREHOUSE_PENDING_STATUSES.includes(String(status || '').toLowerCase());
}

export function isWarehouseCompleted(status) {
  return WAREHOUSE_COMPLETED_STATUSES.includes(String(status || '').toLowerCase());
}

export function deliveryLineQty(line) {
  const q = Number(line?.edited_quantity ?? line?.quantity ?? 0);
  return Number.isFinite(q) ? q : 0;
}

/** App / display name for PDFs and UI — not email when metadata has dispatched or stored name. */
export function deliverySenderName(session, usersById = null) {
  return deliverySessionSubmittedByName(session, usersById);
}

export function deliveryEntryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

/** Factory → Kitwe line Hassan can tick and accept (packet cartons or finished units). */
export function deliveryEntryFinishedUnit(entry) {
  return entry?.metadata?.finished_unit === true && !deliveryEntryPacketId(entry);
}

export function deliveryEntryReceivable(entry) {
  return Boolean(deliveryEntryPacketId(entry) || deliveryEntryFinishedUnit(entry));
}

export function deliveryEntryReceiverProgress(entries) {
  const lines = (entries || []).filter((e) => deliveryEntryReceivable(e));
  const total = lines.length;
  const confirmed = lines.filter((e) => Boolean(e?.metadata?.receiver_checked_at)).length;
  return { total, confirmed };
}

export function allDeliveryPacketsReceiverConfirmed(entries) {
  const { total, confirmed } = deliveryEntryReceiverProgress(entries);
  return total > 0 && confirmed === total;
}

export function anyDeliveryPacketsReceiverConfirmed(entries) {
  const { confirmed } = deliveryEntryReceiverProgress(entries);
  return confirmed > 0;
}

export function deliveryEntryReceived(entry) {
  return Boolean(entry?.metadata?.received_at);
}

export function deliveryEntryPendingReceive(entry) {
  return deliveryEntryReceivable(entry) && !deliveryEntryReceived(entry);
}

/** Finished product name stored on packet lines at submit. */
export function warehousePacketProductName(line) {
  return String(line?.metadata?.assembly_name || '').trim();
}

/** Hassan UI: always show product + packet name. */
export function warehousePacketDisplayLabel(line) {
  const product = warehousePacketProductName(line);
  const packet = String(line?.name || 'Packet').trim();
  const qty = deliveryLineQty(line);
  const per = Math.max(0, Math.floor(Number(line?.metadata?.units_per_carton) || 0));
  const trucks = Math.max(0, Math.floor(Number(line?.metadata?.truck_boxes) || 0));
  const assemblyStub = per > 1 ? { units_per_carton: per, inventory_mode: 'finished' } : null;
  const packSummary = assemblyStub && (trucks > 0 || qty > 0)
    ? formatDeliveryPackSummary(assemblyStub, [], qty, trucks)
    : '';

  if (deliveryEntryFinishedUnit(line)) {
    const label = product || packet;
    const finished = deliveryFinishedUnitsFromEntryMetadata(line, [], null) || qty;
    if (packSummary) return `${label} — ${packSummary}`;
    return `${label} × ${finished} (finished units)`;
  }
  if (packSummary && product) {
    return `${product} — ${packet} × ${qty} carton${qty === 1 ? '' : 's'} · ${packSummary}`;
  }
  if (product && product.toLowerCase() !== packet.toLowerCase()) {
    return `${product} — ${packet} × ${qty}`;
  }
  if (product) return `${product} × ${qty}`;
  return `${packet} × ${qty}`;
}

/** Detail panel: packet rows and finished-unit assembly rows get checkboxes. */
export function warehouseDeliveryReceiverLineKind(line) {
  if (line?.kind === 'assembly-header') return 'assembly-header';
  if (line?.kind === 'packet-line') return 'receiver-line';
  if (line?.kind === 'set-parent' || line?.kind === 'set-component') return 'skip';
  if (deliveryEntryReceivable(line)) return 'receiver-line';
  return 'skip';
}

export function groupWarehouseDisplayLines(entries) {
  const parents = (entries || []).filter((e) => e.kind === 'set-parent');
  const components = (entries || []).filter((e) => e.kind === 'set-component');
  const packets = (entries || []).filter((e) => e.kind === 'packet');
  const products = (entries || []).filter(
    (e) => e.kind !== 'set-parent' && e.kind !== 'set-component' && e.kind !== 'packet',
  );
  const output = [];
  parents.forEach((parent) => {
    output.push(parent);
    output.push(...components.filter((c) => String(c.combo_id) === String(parent.combo_id)));
  });
  output.push(...groupWarehousePacketLinesByAssembly(packets));
  output.push(...products);
  return output;
}

/** Mobile deliveries: bold group headers per finished product (metadata.assembly_name). */
export function groupWarehousePacketLinesByAssembly(packetEntries) {
  const list = packetEntries || [];
  if (!list.length) return [];
  const order = [];
  const byKey = new Map();
  list.forEach((line) => {
    const key = String(line?.metadata?.assembly_name || line?.metadata?.assembly_id || '_packets');
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key).push(line);
  });
  const out = [];
  order.forEach((key) => {
    const rows = byKey.get(key) || [];
    const label = key === '_packets' ? 'Packets' : key;
    out.push({
      id: `asm-header-${key}`,
      kind: 'assembly-header',
      name: label,
    });
    rows.forEach((row) => {
      out.push({ ...row, kind: 'packet-line' });
    });
  });
  return out;
}
