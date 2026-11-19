/**
 * Kitwe warehouse sets in POS: sell full set or drop partial component qty (return stock to loose SKUs).
 */

export function kitweComponentMaxUnits(perSet, setQty) {
  return Math.max(
    0,
    Math.floor(Number(perSet) || 1) * Math.max(1, Math.floor(Number(setQty) || 1)),
  );
}

export function resolveKitweComponentSellUnits(component, setQty) {
  const max = kitweComponentMaxUnits(component?.per_set, setQty);
  if (component?.sellUnits != null && component?.sellUnits !== '') {
    return Math.min(max, Math.max(0, Math.floor(Number(component.sellUnits) || 0)));
  }
  if (component?.included === false) return 0;
  return max;
}

export function initKitweSetCartComponents(setProduct, setQty = 1) {
  const list = setProduct?.kitweComponents || [];
  const sq = Math.max(1, Math.floor(Number(setQty) || 1));
  return list.map((c) => {
    const perSet = Math.max(1, Number(c.per_set) || 1);
    const sellUnits = kitweComponentMaxUnits(perSet, sq);
    return {
      component_assembly_id: c.component_assembly_id,
      per_set: perSet,
      name: c.name || '',
      sku: c.sku || '',
      retail_product_id: c.retail_product_id || null,
      stock: Math.max(0, Number(c.stock) || 0),
      sellUnits,
      included: sellUnits > 0,
    };
  });
}

export function rescaleKitweSetComponentsForQty(components, setQty) {
  const sq = Math.max(1, Math.floor(Number(setQty) || 1));
  return (components || []).map((c) => {
    const max = kitweComponentMaxUnits(c.per_set, sq);
    const prevSell = resolveKitweComponentSellUnits(c, sq);
    const sellUnits = Math.min(max, prevSell);
    return { ...c, sellUnits, included: sellUnits > 0 };
  });
}

export function setKitweSetComponentSellUnits(components, componentAssemblyId, sellUnits, setQty) {
  const id = String(componentAssemblyId || '');
  const sq = Math.max(1, Math.floor(Number(setQty) || 1));
  return (components || []).map((c) => {
    if (String(c.component_assembly_id) !== id) return c;
    const max = kitweComponentMaxUnits(c.per_set, sq);
    const sell = Math.min(max, Math.max(0, Math.floor(Number(sellUnits) || 0)));
    return { ...c, sellUnits: sell, included: sell > 0 };
  });
}

/** @deprecated use setKitweSetComponentSellUnits(sellUnits 0|max) */
export function setKitweSetComponentIncluded(components, componentAssemblyId, included) {
  const row = (components || []).find(
    (c) => String(c.component_assembly_id) === String(componentAssemblyId),
  );
  const max = kitweComponentMaxUnits(row?.per_set, 1);
  const sellUnits = included ? max : 0;
  return setKitweSetComponentSellUnits(components, componentAssemblyId, sellUnits, 1);
}

export function kitweSetHasIncludedComponents(cartLine) {
  const setQty = Math.max(1, Number(cartLine?.qty) || 1);
  return (cartLine?.kitweSetComponents || []).some(
    (c) => resolveKitweComponentSellUnits(c, setQty) > 0,
  );
}

export function buildKitweSetSaleMoves(cartLine) {
  const setQty = Math.max(1, Number(cartLine?.qty) || 1);
  const moves = [];
  for (const c of cartLine?.kitweSetComponents || []) {
    const aid = String(c?.component_assembly_id || '').trim();
    if (!aid) continue;
    const max = kitweComponentMaxUnits(c.per_set, setQty);
    const sell = resolveKitweComponentSellUnits(c, setQty);
    if (sell > 0) {
      moves.push({ assembly_id: aid, quantity: sell, kind: 'product' });
    }
    const restock = max - sell;
    if (restock > 0) {
      moves.push({ assembly_id: aid, quantity: restock, kind: 'restock' });
    }
  }
  return moves;
}

export function kitweAssemblyStockFromPosProducts(assemblyId, products) {
  const aid = String(assemblyId || '');
  const row = (products || []).find(
    (p) => String(p.warehouseAssemblyId) === aid || String(p.id) === `kitwe-wh-${aid}`,
  );
  return Math.max(0, Number(row?.stock) || 0);
}

/** Set recipe components are often hidden from the POS grid — use Kitwe qty captured on the cart line. */
export function resolveKitweComponentAvailableStock(component, products) {
  const onLine = component?.stock;
  if (onLine != null && onLine !== '' && Number.isFinite(Number(onLine))) {
    return Math.max(0, Math.floor(Number(onLine)));
  }
  return kitweAssemblyStockFromPosProducts(component?.component_assembly_id, products);
}

/**
 * @returns {string|null} error message or null if ok
 */
export function validateKitweSetCartLine(cartLine, products) {
  if (!cartLine?.kitweWarehouseSet) return null;
  if (!kitweSetHasIncludedComponents(cartLine)) {
    return `Select at least one component to sell for ${cartLine.name || 'set'}.`;
  }
  const setQty = Math.max(1, Number(cartLine.qty) || 1);
  for (const c of cartLine.kitweSetComponents || []) {
    const sell = resolveKitweComponentSellUnits(c, setQty);
    if (sell <= 0) continue;
    const available = resolveKitweComponentAvailableStock(c, products);
    if (sell > available) {
      return `Not enough stock for ${c.name || c.sku || 'component'} (need ${sell}, have ${available}).`;
    }
  }
  return null;
}