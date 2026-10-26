/**
 * Kitwe warehouse sets in POS: sell full set or drop components (return stock to loose SKUs).
 */

export function initKitweSetCartComponents(setProduct) {
  const list = setProduct?.kitweComponents || [];
  return list.map((c) => ({
    component_assembly_id: c.component_assembly_id,
    per_set: Math.max(1, Number(c.per_set) || 1),
    name: c.name || '',
    sku: c.sku || '',
    retail_product_id: c.retail_product_id || null,
    included: true,
  }));
}

export function setKitweSetComponentIncluded(components, componentAssemblyId, included) {
  const id = String(componentAssemblyId || '');
  return (components || []).map((c) => (
    String(c.component_assembly_id) === id ? { ...c, included: Boolean(included) } : c
  ));
}

export function kitweSetHasIncludedComponents(cartLine) {
  return (cartLine?.kitweSetComponents || []).some((c) => c.included);
}

export function buildKitweSetSaleMoves(cartLine) {
  const setQty = Math.max(1, Number(cartLine?.qty) || 1);
  const moves = [];
  for (const c of cartLine?.kitweSetComponents || []) {
    const aid = String(c?.component_assembly_id || '').trim();
    if (!aid) continue;
    const units = Math.max(1, Number(c.per_set) || 1) * setQty;
    if (c.included) {
      moves.push({ assembly_id: aid, quantity: units, kind: 'product' });
    } else {
      moves.push({ assembly_id: aid, quantity: units, kind: 'restock' });
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
    if (!c.included) continue;
    const need = Math.max(1, Number(c.per_set) || 1) * setQty;
    const available = kitweAssemblyStockFromPosProducts(c.component_assembly_id, products);
    if (need > available) {
      return `Not enough stock for ${c.name || c.sku || 'component'} (need ${need}, have ${available}).`;
    }
  }
  return null;
}
