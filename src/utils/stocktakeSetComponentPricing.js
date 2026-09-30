import { buildComboLocationPriceMap, resolveComboLocationPricing } from './locationPricing';

function activeUnitPrice(product, atDate = new Date()) {
  const promo = Number(product?.promotional_price);
  const standard = Number(product?.price ?? product?.combo_price ?? product?.standard_price ?? 0);
  if (!Number.isFinite(promo) || promo <= 0) return standard;
  const start = product.promo_start_date ? new Date(product.promo_start_date) : null;
  const end = product.promo_end_date ? new Date(product.promo_end_date) : null;
  const t = atDate.getTime();
  if (start && t < start.getTime()) return standard;
  if (end && t > end.getTime()) return standard;
  return promo;
}

export function activeComboUnitPrice(combo, priceAt = new Date()) {
  const resolved = combo?._pricingResolved || combo;
  const promo = Number(resolved?.promotional_price);
  const standard = Number(resolved?.combo_price ?? resolved?.standard_price ?? 0);
  if (!Number.isFinite(promo) || promo <= 0) return standard;
  const start = resolved.promo_start_date ? new Date(resolved.promo_start_date) : null;
  const end = resolved.promo_end_date ? new Date(resolved.promo_end_date) : null;
  const t = priceAt.getTime();
  if (start && t < start.getTime()) return standard;
  if (end && t > end.getTime()) return standard;
  return promo;
}

export function buildComboMembershipIndex(comboItems) {
  const byProduct = new Map();
  (comboItems || []).forEach((row) => {
    const pid = String(row.product_id);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push({ comboId: row.combo_id });
  });
  return byProduct;
}

export function indexComboItems(comboItems) {
  const itemsByCombo = new Map();
  (comboItems || []).forEach((row) => {
    const comboId = row.combo_id;
    if (comboId == null) return;
    if (!itemsByCombo.has(comboId)) itemsByCombo.set(comboId, []);
    itemsByCombo.get(comboId).push({
      product_id: row.product_id,
      quantity: Number(row.quantity) || 0,
    });
  });
  return itemsByCombo;
}

function pickComboForProduct(productId, memberships, itemsByCombo, includedProductIds, comboMap) {
  const options = memberships.get(String(productId)) || [];
  if (!options.length) return null;
  let bestComboId = null;
  let bestScore = -1;
  options.forEach(({ comboId }) => {
    const items = itemsByCombo.get(comboId) || [];
    const score = items.filter((i) => includedProductIds.has(String(i.product_id))).length;
    if (score > bestScore) {
      bestScore = score;
      bestComboId = comboId;
    }
  });
  return bestComboId != null ? comboMap.get(bestComboId) : null;
}

/**
 * Set components with no own price: show combined BOM component prices, or the set price.
 * Amount uses per-piece allocation across the set BOM.
 */
export function resolveSetComponentPricing({
  productId,
  productMap,
  comboMap,
  itemsByCombo,
  memberships,
  includedProductIds,
  priceAt,
}) {
  const pid = String(productId);
  const product = productMap.get(pid) || {};
  const own = activeUnitPrice(product, priceAt);
  const combo = pickComboForProduct(pid, memberships, itemsByCombo, includedProductIds, comboMap);
  if (!combo) {
    return { unitPrice: own, displayPrice: own, setComboId: null };
  }
  if (own > 0) {
    return { unitPrice: own, displayPrice: own, setComboId: combo.id };
  }

  const items = itemsByCombo.get(combo.id) || [];
  let componentSum = 0;
  let bomTotal = 0;
  items.forEach((item) => {
    const need = Number(item.quantity) || 0;
    if (need <= 0) return;
    bomTotal += need;
    const cp = productMap.get(String(item.product_id)) || {};
    componentSum += activeUnitPrice(cp, priceAt) * need;
  });

  const setPrice = activeComboUnitPrice(combo, priceAt);
  const displayPrice = componentSum > 0 ? componentSum : setPrice;
  const unitPrice = bomTotal > 0
    ? (componentSum > 0 ? componentSum / bomTotal : setPrice / bomTotal)
    : own;

  return { unitPrice, displayPrice, setComboId: combo.id };
}

function displayPriceForRun(dataRows, start, end, resolveDisplayPrice) {
  for (let k = start; k < end; k += 1) {
    const p = resolveDisplayPrice(dataRows[k]);
    if (p !== '' && p != null && Number(p) > 0) return p;
  }
  return '';
}

/**
 * Excel-style merged Price cells for consecutive set component rows (same set_combo_id).
 * Merges even when no price exists (empty merged cell). Price text = first positive in run.
 */
export function planSetPriceCellMerges(dataRows, resolveDisplayPrice) {
  const plan = new Array((dataRows || []).length).fill(null);
  let i = 0;
  while (i < dataRows.length) {
    const row = dataRows[i];
    const comboId = row?.set_combo_id;
    if (comboId == null) {
      plan[i] = { kind: 'single' };
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < dataRows.length && dataRows[j]?.set_combo_id === comboId) {
      j += 1;
    }
    const run = j - i;
    if (run >= 2) {
      const price = displayPriceForRun(dataRows, i, j, resolveDisplayPrice);
      plan[i] = { kind: 'mergeStart', rowSpan: run, price };
      for (let k = i + 1; k < j; k += 1) plan[k] = { kind: 'mergeContinue' };
    } else {
      plan[i] = { kind: 'single' };
    }
    i = j;
  }
  return plan;
}

export function applyComboLocationPrices(combos, locationId, comboLocationPriceRows) {
  const priceMap = buildComboLocationPriceMap(comboLocationPriceRows || []);
  const map = new Map();
  (combos || []).forEach((combo) => {
    const resolved = resolveComboLocationPricing(combo, locationId, priceMap);
    map.set(combo.id, {
      ...combo,
      combo_price: resolved.combo_price,
      standard_price: resolved.standard_price,
      promotional_price: resolved.promotional_price,
      promo_start_date: resolved.promo_start_date,
      promo_end_date: resolved.promo_end_date,
      _pricingResolved: resolved,
    });
  });
  return map;
}
