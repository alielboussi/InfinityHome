/**
 * Quote-order partial completion: one row per product, qty on the row.
 * Progress lives on quote_production_routing.metadata.line_progress[itemId].
 */

function trimId(value) {
  return String(value ?? '').trim();
}

export function quoteLineOrderedQty(line) {
  const fromProgress = Number(line?.ordered_qty);
  if (Number.isFinite(fromProgress) && fromProgress > 0) return fromProgress;
  const q = Number(line?.quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

export function lineProgressEntry(meta, itemId) {
  const map = meta?.line_progress && typeof meta.line_progress === 'object' ? meta.line_progress : {};
  const row = map[trimId(itemId)];
  return row && typeof row === 'object' ? row : null;
}

export function lineCompletedQty(line, routingMeta = null) {
  const embedded = Number(line?.production_completed_qty);
  if (Number.isFinite(embedded) && embedded >= 0) return embedded;
  const id = trimId(line?.id);
  if (!id || !routingMeta) return 0;
  const entry = lineProgressEntry(routingMeta, id);
  return Math.max(0, Number(entry?.completed_qty) || 0);
}

export function lineRemainingQty(line, routingMeta = null) {
  const ordered = quoteLineOrderedQty(line);
  const done = lineCompletedQty(line, routingMeta);
  return Math.max(0, ordered - done);
}

export function enrichProductionLineWithProgress(line, routingMeta = null) {
  const ordered = quoteLineOrderedQty(line);
  const completed = lineCompletedQty(line, routingMeta);
  const remaining = Math.max(0, ordered - completed);
  return {
    ...line,
    ordered_qty: ordered,
    production_completed_qty: completed,
    production_remaining_qty: remaining,
    quantity: remaining > 0 ? remaining : ordered,
  };
}

export function allQuoteLinesFullyCompleted(lines, routingMeta = null) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return false;
  return list.every((line) => lineRemainingQty(line, routingMeta) <= 0);
}

export function applyPartialLineProgressPatch(meta, itemId, readyQty, { userId = null, at = null } = {}) {
  const id = trimId(itemId);
  if (!id) throw new Error('item_id required');
  const add = Math.max(1, Math.floor(Number(readyQty) || 0));
  const base = meta && typeof meta === 'object' ? { ...meta } : {};
  const map = { ...(base.line_progress || {}) };
  const prev = map[id] && typeof map[id] === 'object' ? { ...map[id] } : {};
  const ordered = Math.max(
    add + Math.max(0, Number(prev.completed_qty) || 0),
    Number(prev.ordered_qty) || 0,
  );
  const priorDone = Math.max(0, Number(prev.completed_qty) || 0);
  const cap = Number(prev.ordered_qty) > 0 ? Number(prev.ordered_qty) : ordered;
  if (priorDone + add > cap) {
    throw new Error(`Cannot mark ${add} ready (only ${cap - priorDone} remaining).`);
  }
  const orderedFinal = Math.max(cap, priorDone + add);
  const now = at || new Date().toISOString();
  const slices = Array.isArray(prev.slices) ? [...prev.slices] : [];
  slices.push({
    qty: add,
    completed_at: now,
    by: userId || null,
  });
  map[id] = {
    ...prev,
    ordered_qty: orderedFinal,
    completed_qty: priorDone + add,
    slices,
    updated_at: now,
  };
  return { ...base, line_progress: map };
}