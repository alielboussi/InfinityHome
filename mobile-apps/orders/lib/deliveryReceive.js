const PENDING = ['pending', 'submitted', 'partially_received'];
const COMPLETED = ['completed', 'accepted'];

export function isWarehousePending(status) {
  return PENDING.includes(String(status || '').toLowerCase());
}

export function isWarehouseCompleted(status) {
  return COMPLETED.includes(String(status || '').toLowerCase());
}

export function deliveryEntryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

export function deliveryEntryFinishedUnit(entry) {
  return entry?.metadata?.finished_unit === true && !deliveryEntryPacketId(entry);
}

export function deliveryEntryReceivable(entry) {
  return Boolean(deliveryEntryPacketId(entry) || deliveryEntryFinishedUnit(entry));
}

export function deliveryEntryReceived(entry) {
  return Boolean(entry?.metadata?.received_at);
}

export function deliveryEntrySentToCustomer(entry) {
  const meta = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  return meta.sent_to_customer === true || Boolean(meta.sent_to_customer_at);
}

export function warehouseDeliverySessionKind(session) {
  const src = String(session?.metadata?.source || '').trim();
  if (src === 'warehouse_return_shipment') return 'return_shipment';
  if (src === 'warehouse_return_customer_delivery') return 'return_customer';
  return 'factory_transfer';
}

export function warehouseDeliverySessionRouteLabel(session) {
  const kind = warehouseDeliverySessionKind(session);
  const note = String(session?.delivery_number || '').trim();
  if (kind === 'return_shipment') {
    const ret = String(session?.metadata?.return_number || '').trim();
    return `Return to Kitwe (WHR)${ret ? ` · ${ret}` : ''}${note ? ` · ${note}` : ''}`;
  }
  if (kind === 'return_customer') {
    const customer = String(session?.metadata?.customer_name || '').trim();
    return `Customer return delivery (CR)${customer ? ` · ${customer}` : ''}${note ? ` · ${note}` : ''}`;
  }
  return 'Factory → Kitwe';
}

export function warehousePacketDisplayLabel(line) {
  const product = String(line?.metadata?.assembly_name || '').trim();
  const packet = String(line?.name || 'Packet').trim();
  const qty = Number(line?.edited_quantity ?? line?.quantity ?? 0) || 0;
  if (deliveryEntryFinishedUnit(line)) {
    return `${product || packet} × ${qty} (finished units)`;
  }
  if (product && product.toLowerCase() !== packet.toLowerCase()) {
    return `${product} — ${packet} × ${qty}`;
  }
  if (product) return `${product} × ${qty}`;
  return `${packet} × ${qty}`;
}

function groupWarehousePacketLinesByAssembly(packetEntries) {
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
    out.push({
      id: `asm-header-${key}`,
      kind: 'assembly-header',
      name: key === '_packets' ? 'Packets' : key,
    });
    rows.forEach((row) => out.push({ ...row, kind: 'packet-line' }));
  });
  return out;
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

export function warehouseDeliveryReceiverLineKind(line) {
  if (line?.kind === 'assembly-header') return 'assembly-header';
  if (line?.kind === 'packet-line') return 'receiver-line';
  if (line?.kind === 'set-parent') return 'assembly-header';
  if (line?.kind === 'set-component') {
    return deliveryEntryReceivable(line) ? 'receiver-line' : 'skip';
  }
  if (deliveryEntryReceivable(line)) return 'receiver-line';
  return 'skip';
}

export function warehouseDeliveryReceiverProductHeader(line) {
  return line?.kind === 'set-parent' || line?.kind === 'assembly-header';
}

export function warehouseDeliveryReceiverNested(line) {
  return line?.kind === 'packet-line' || line?.kind === 'set-component';
}

export function allDeliveryPacketsReceiverConfirmed(entries) {
  const { total, confirmed } = deliveryEntryReceiverProgress(entries);
  return total > 0 && confirmed === total;
}

export function warehouseDeliveryReceiverTickRows(entries) {
  return groupWarehouseDisplayLines(entries).filter(
    (line) => warehouseDeliveryReceiverLineKind(line) === 'receiver-line',
  );
}

export function deliveryEntryReceiverProgress(entries) {
  const lines = warehouseDeliveryReceiverTickRows(entries);
  return {
    total: lines.length,
    confirmed: lines.filter((e) => Boolean(e?.metadata?.receiver_checked_at)).length,
  };
}

export function anyDeliveryPacketsReceiverConfirmed(entries) {
  return deliveryEntryReceiverProgress(entries).confirmed > 0;
}

export function deliveryEntryPendingAcceptCount(entries) {
  return (entries || []).filter(
    (e) => deliveryEntryReceivable(e)
      && Boolean(e?.metadata?.receiver_checked_at)
      && !deliveryEntryReceived(e),
  ).length;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}
