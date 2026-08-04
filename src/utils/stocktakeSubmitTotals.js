/**
 * Stocktake submit helpers — inventory is stored on components only.
 * Set rows are derived for display; submit expands sets into component qtys.
 */

export function isComponentRow(row) {
  return row && row.row_type !== 'set' && row.product_id && !String(row.product_id).startsWith('set:');
}

/**
 * Build component-level totals for inventory submit / admin overrides.
 * - Set rows → sum(need_per_set × set qty) per component
 * - Product rows → leftover component qty (after set deduction in live totals)
 */
export function buildFinalTotals(consolidated, qtyDraft = {}) {
  const totals = new Map();
  (consolidated || []).forEach((row) => {
    if (row.row_type === 'set') {
      const setQty = Number(row.qty) || 0;
      (row.components || []).forEach((comp) => {
        const pid = String(comp.product_id || '');
        if (!pid) return;
        const need = Number(comp.need_per_set ?? comp.quantity) || 0;
        if (need <= 0) return;
        totals.set(pid, (totals.get(pid) || 0) + need * setQty);
      });
      return;
    }
    if (!isComponentRow(row)) return;
    const pid = String(row.product_id);
    const draftQty = Object.prototype.hasOwnProperty.call(qtyDraft, pid) ? qtyDraft[pid] : row.qty;
    totals.set(pid, Number(draftQty) || 0);
  });
  return Array.from(totals.entries()).map(([product_id, qty]) => ({ product_id, qty }));
}

/**
 * PDF / export rows: set header + indented component lines (inventory is on components).
 */
export function buildPdfRows(consolidated, qtyDraft = {}) {
  const out = [];
  (consolidated || []).forEach((row) => {
    if (row.row_type === 'set') {
      const setQty = Number(row.qty) || 0;
      out.push({
        row_type: 'set',
        sku: row.sku || '',
        name: row.name || '',
        qty: setQty,
      });
      (row.components || []).forEach((comp) => {
        const need = Number(comp.need_per_set ?? comp.quantity) || 0;
        out.push({
          row_type: 'component',
          sku: comp.sku || '',
          name: `  ↳ ${comp.name || comp.product_id}`,
          qty: need * setQty,
          parent_set: row.name,
        });
      });
      return;
    }
    if (!isComponentRow(row)) return;
    const pid = String(row.product_id);
    const draftQty = Object.prototype.hasOwnProperty.call(qtyDraft, pid) ? qtyDraft[pid] : null;
    const qty = draftQty === null || draftQty === '' ? Number(row.qty) || 0 : Number(draftQty) || 0;
    if (qty <= 0 && Number(row.used_in_sets) <= 0) return;
    out.push({
      row_type: 'product',
      sku: row.sku || '',
      name: row.name || pid,
      qty,
      used_in_sets: Number(row.used_in_sets) || 0,
    });
  });
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
}

export function isSetProductId(productId) {
  return String(productId || '').startsWith('set:');
}
