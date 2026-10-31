import { normalizeWarehouseReturnReason } from './warehouseReturnReasons';

export const WAREHOUSE_RETURN_STATUSES = Object.freeze({
  SUBMITTED: 'submitted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SHIPPED: 'shipped',
  CUSTOMER_DELIVERED: 'customer_delivered',
});

/** Terminal — no further factory/Kitwe moves on this line. */
export const WAREHOUSE_RETURN_TERMINAL_STATUSES = Object.freeze([
  WAREHOUSE_RETURN_STATUSES.SHIPPED,
  WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED,
]);

/**
 * Hassan create payload → one row per production card (qty 1 each), shared return note # applied server-side.
 * @returns {{ assemblyId: string, lines: Array<{ reason: string, leather_code: string|null, quantity: number }>, totalQty: number }}
 */
export function parseReturnCreateLines(body, { maxQty = 999 } = {}) {
  const assemblyId = String(body?.assembly_id || '').trim();
  if (!assemblyId) throw new Error('Product is required.');

  const cap = Math.max(1, Math.floor(Number(maxQty) || 999));

  if (Array.isArray(body?.lines) && body.lines.length) {
    const lines = body.lines.map((raw, index) => {
      const reason = normalizeWarehouseReturnReason(raw?.reason);
      if (!reason) throw new Error(`Reason required for unit ${index + 1}.`);
      const quantity = Math.max(1, Math.floor(Number(raw?.quantity) || 1));
      return {
        reason,
        leather_code: String(raw?.leather_code || '').trim() || null,
        quantity,
      };
    });
    const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (totalQty < 1) throw new Error('Return quantity must be at least 1.');
    if (totalQty > cap) {
      throw new Error(`Insufficient Kitwe stock (need ${totalQty}, have ${cap}).`);
    }
    return { assemblyId, lines, totalQty };
  }

  const totalQty = Math.max(1, Math.floor(Number(body?.quantity) || 1));
  if (totalQty > cap) {
    throw new Error(`Insufficient Kitwe stock (need ${totalQty}, have ${cap}).`);
  }
  const reason = normalizeWarehouseReturnReason(body?.reason);
  if (!reason) throw new Error('Return reason is required.');
  const leather_code = String(body?.leather_code || '').trim() || null;
  const lines = Array.from({ length: totalQty }, () => ({
    reason,
    leather_code,
    quantity: 1,
  }));
  return { assemblyId, lines, totalQty };
}

export function returnOrderUnitLabel(row) {
  const meta = row?.metadata || {};
  const total = Number(meta.batch_line_count) || 0;
  const index = Number(meta.batch_line_index) || 0;
  if (total > 1 && index > 0) {
    return `${row?.return_number || 'RO'} · unit ${index}/${total}`;
  }
  return String(row?.return_number || 'RO');
}

export function formatReturnElapsedDuration(startIso, endIso = null) {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  if (!Number.isFinite(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (!Number.isFinite(end) || end < start) return '—';
  const totalSec = Math.floor((end - start) / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

export function returnOrderElapsedSeconds(row, nowMs = Date.now()) {
  const started = row?.work_started_at || row?.accepted_at;
  if (!started) return null;
  const end = row?.work_completed_at
    ? new Date(row.work_completed_at).getTime()
    : nowMs;
  const startMs = new Date(started).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - startMs) / 1000));
}

export function buildReturnPrintGroupsFromOrder(row) {
  const qty = Math.max(1, Number(row?.quantity) || 1);
  const elapsed = formatReturnElapsedDuration(
    row?.work_started_at || row?.accepted_at,
    row?.work_completed_at,
  );
  return [{
    assembly_name: row?.assembly_name || 'Product',
    units: qty,
    elapsed_display: elapsed,
    lines: [],
  }];
}
