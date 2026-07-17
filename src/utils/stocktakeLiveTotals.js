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
export function buildLiveConsolidatedWithSets({
  counts = [],
  combos = [],
  comboItems = [],
  setScans = [],
} = {}) {
  const productMap = consolidateCountRows(counts);
  const remaining = new Map();
  productMap.forEach((entry, productId) => {
    remaining.set(productId, entry.qty);
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
    const left = remaining.get(productId) || 0;
    if (left <= 1e-9) return;
    const total = entry.qty;
    const usedInSets = Math.max(0, total - left);
    productRows.push({
      key: `product:${productId}`,
      row_type: 'product',
      product_id: productId,
      name: entry.name || productId,
      sku: entry.sku || null,
      qty: left,
      byUser: entry.byUser || [],
      total_counted: total,
      used_in_sets: usedInSets,
      source: 'product',
    });
  });

  return [...setRows, ...productRows].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  );
}
