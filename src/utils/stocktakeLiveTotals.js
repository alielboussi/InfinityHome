/**
 * Build /stocktake Live totals rows:
 * - Complete sets derived from component counts (min BOM floor)
 * - Leftover components as separate product rows
 * - Preserve per-user attribution (set scans + component counts)
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function consolidateCountRows(rows) {
  const byProduct = new Map();
  (rows || []).forEach((row) => {
    const pid = row.product_id;
    if (!pid) return;
    if (!byProduct.has(pid)) {
      byProduct.set(pid, {
        product_id: pid,
        qty: 0,
        byUser: [],
        name: row.products?.name || row.name || null,
        sku: row.products?.sku || row.sku || null,
      });
    }
    const entry = byProduct.get(pid);
    const qty = num(row.qty);
    entry.qty += qty;
    if (!entry.name && (row.products?.name || row.name)) {
      entry.name = row.products?.name || row.name;
    }
    if (!entry.sku && (row.products?.sku || row.sku)) {
      entry.sku = row.products?.sku || row.sku;
    }
    entry.byUser.push({
      user_email: row.user_email,
      qty,
      updated_at: row.updated_at,
    });
  });
  return byProduct;
}

/**
 * @param {object} args
 * @param {Array} args.counts - raw stocktake_counts rows
 * @param {Array} args.combos - { id, combo_name, sku }
 * @param {Array} args.comboItems - { combo_id, product_id, quantity }
 * @param {Array} [args.setScans] - { combo_id, user_email, set_qty, updated_at }
 */
function setPoolQtyFromRow(row) {
  const total = num(row?.qty);
  const standalone = num(row?.standalone_qty);
  return Math.max(0, total - standalone);
}

export function buildLiveConsolidatedWithSets({
  counts = [],
  combos = [],
  comboItems = [],
  setScans = [],
} = {}) {
  const productMap = consolidateCountRows(counts);
  const standaloneByProduct = new Map();
  const remaining = new Map();
  (counts || []).forEach((row) => {
    const pid = row?.product_id;
    if (!pid) return;
    const stand = num(row.standalone_qty);
    if (stand > 0) {
      standaloneByProduct.set(pid, (standaloneByProduct.get(pid) || 0) + stand);
    }
    const pool = setPoolQtyFromRow(row);
    if (pool > 0) {
      remaining.set(pid, (remaining.get(pid) || 0) + pool);
    }
  });

  const itemsByCombo = new Map();
  (comboItems || []).forEach((row) => {
    const comboId = row.combo_id;
    if (comboId == null) return;
    if (!itemsByCombo.has(comboId)) itemsByCombo.set(comboId, []);
    itemsByCombo.get(comboId).push({
      product_id: row.product_id,
      quantity: num(row.quantity),
    });
  });

  const scansByCombo = new Map();
  (setScans || []).forEach((row) => {
    const comboId = row.combo_id;
    if (comboId == null) return;
    if (!scansByCombo.has(comboId)) scansByCombo.set(comboId, []);
    scansByCombo.get(comboId).push({
      user_email: row.user_email,
      qty: num(row.set_qty),
      updated_at: row.updated_at,
    });
  });

  // If a set was scanned but component lines were only partially saved, top up pools from BOM × set scans.
  (combos || []).forEach((combo) => {
    const scanRows = scansByCombo.get(combo.id) || [];
    const scanTotal = scanRows.reduce((sum, u) => sum + num(u.qty), 0);
    if (scanTotal <= 0) return;
    const comps = (comboItems || []).filter((i) => i.combo_id === combo.id);
    comps.forEach((comp) => {
      const pid = comp.product_id;
      if (!pid) return;
      const need = num(comp.quantity);
      if (need <= 0) return;
      const required = scanTotal * need;
      const have = remaining.get(pid) || 0;
      if (have >= required) return;
      const delta = required - have;
      remaining.set(pid, have + delta);
      if (!productMap.has(pid)) {
        productMap.set(pid, {
          product_id: pid,
          qty: 0,
          byUser: [],
          name: null,
          sku: null,
        });
      }
      const entry = productMap.get(pid);
      entry.qty += delta;
    });
  });

  const sortedCombos = (combos || []).slice().sort((a, b) =>
    String(a.combo_name || a.name || '').localeCompare(String(b.combo_name || b.name || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  );

  const setRows = [];
  for (const combo of sortedCombos) {
    const comps = itemsByCombo.get(combo.id) || [];
    if (!comps.length) continue;

    let maxSets = Infinity;
    for (const comp of comps) {
      const need = num(comp.quantity);
      if (need <= 0) continue;
      const have = remaining.get(comp.product_id) || 0;
      maxSets = Math.min(maxSets, Math.floor(have / need));
    }
    if (!Number.isFinite(maxSets) || maxSets <= 0) continue;

    const components = comps.map((comp) => {
      const need = num(comp.quantity);
      const used = need * maxSets;
      remaining.set(comp.product_id, (remaining.get(comp.product_id) || 0) - used);
      const meta = productMap.get(comp.product_id) || {};
      return {
        product_id: comp.product_id,
        name: meta.name || comp.product_id,
        sku: meta.sku || null,
        qty: used,
        need_per_set: need,
        byUser: meta.byUser || [],
      };
    });

    const byUser = scansByCombo.get(combo.id) || [];
    const scanTotal = byUser.reduce((sum, u) => sum + num(u.qty), 0);

    setRows.push({
      key: `set:${combo.id}`,
      row_type: 'set',
      combo_id: combo.id,
      product_id: `set:${combo.id}`,
      name: combo.combo_name || combo.name || `Set ${combo.id}`,
      sku: combo.sku || null,
      qty: maxSets,
      byUser,
      components,
      source: scanTotal > 0 ? 'scanned' : 'derived',
    });
  }

  const productRows = [];
  productMap.forEach((entry, productId) => {
    const stand = standaloneByProduct.get(productId) || 0;
    const left = remaining.get(productId) || 0;
    const displayQty = left + stand;
    if (displayQty <= 1e-9) return;
    const poolTotal = Math.max(0, entry.qty - stand);
    const usedInSets = Math.max(0, poolTotal - left);
    productRows.push({
      key: `product:${productId}`,
      row_type: 'product',
      product_id: productId,
      name: entry.name || productId,
      sku: entry.sku || null,
      qty: displayQty,
      byUser: entry.byUser || [],
      total_counted: entry.qty,
      used_in_sets: usedInSets,
      standalone_qty: stand,
      source: stand > 0 && left <= 1e-9 ? 'aggregation_manual' : 'product',
    });
  });

  return [...setRows, ...productRows].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  );
}
