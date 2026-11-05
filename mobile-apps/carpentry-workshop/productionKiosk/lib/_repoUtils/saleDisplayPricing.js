function selectBestCatalogPrice(promo, standard) {
  const promoValue = Number(promo);
  if (promo != null && promo !== '' && !Number.isNaN(promoValue) && promoValue > 0) return promoValue;
  const standardValue = Number(standard);
  if (standard != null && standard !== '' && !Number.isNaN(standardValue) && standardValue > 0) return standardValue;
  return 0;
}

function resolveLocationUnitPrice(locationRow) {
  if (!locationRow) return 0;
  return selectBestCatalogPrice(locationRow.promotional_price, locationRow.price);
}

function itemKey(item) {
  return [
    String(item?.sale_id ?? ''),
    String(item?.product_id ?? ''),
    String(item?.display_name ?? ''),
    String(item?.color ?? ''),
  ].join('|');
}

export function buildProductPriceMap(products = []) {
  const map = new Map();
  (products || []).forEach((product) => {
    if (product?.id != null) map.set(String(product.id), product);
  });
  return map;
}

export function buildLocationPriceMap(rows = [], productIds = new Set()) {
  const map = new Map();
  (rows || []).forEach((row) => {
    if (row?.product_id != null && productIds.has(String(row.product_id))) {
      map.set(String(row.product_id), row);
    }
  });
  return map;
}

export function resolveItemDisplayUnitPrice(item, { productMap, locationPriceMap } = {}) {
  const stored = Number(item?.unit_price || 0);
  const productId = item?.product_id != null ? String(item.product_id) : '';
  const locationUnit = productId && locationPriceMap?.has(productId)
    ? resolveLocationUnitPrice(locationPriceMap.get(productId))
    : 0;
  const product = productId && productMap?.has(productId) ? productMap.get(productId) : null;
  const catalogUnit = product
    ? selectBestCatalogPrice(product.promotional_price, product.price)
    : 0;

  if (stored > 0 && catalogUnit > 0 && Math.abs(stored - catalogUnit) > 0.009) {
    return stored;
  }
  if (stored > 0 && catalogUnit <= 0) {
    return stored;
  }
  if (locationUnit > 0) return locationUnit;
  if (stored > 0) return stored;
  if (catalogUnit > 0) return catalogUnit;
  return stored;
}

export function reconcileSaleItemUnits(items, {
  saleTotal = 0,
  saleDiscount = 0,
  productMap,
  locationPriceMap,
} = {}) {
  const chargedSubtotal = Number(saleTotal || 0) + Number(saleDiscount || 0);
  const scoped = (items || []).filter((item) => {
    const qty = Number(item?.quantity || 0);
    if (qty <= 0) return false;
    const name = String(item?.display_name || '').trim();
    if (name) return true;
    if (item?.product_id != null) return true;
    return resolveItemDisplayUnitPrice(item, { productMap, locationPriceMap }) > 0;
  });

  if (!scoped.length) return items || [];

  const resolved = scoped.map((item) => {
    const qty = Number(item.quantity || 0);
    const unit = resolveItemDisplayUnitPrice(item, { productMap, locationPriceMap });
    return { item, qty, unit };
  });

  let linesSubtotal = resolved.reduce((sum, row) => sum + row.qty * row.unit, 0);

  if (chargedSubtotal > 0) {
    if (linesSubtotal > 0 && Math.abs(linesSubtotal - chargedSubtotal) > 0.009) {
      const factor = chargedSubtotal / linesSubtotal;
      resolved.forEach((row) => {
        row.unit *= factor;
      });
    } else if (resolved.length === 1 && resolved[0].qty > 0) {
      resolved[0].unit = chargedSubtotal / resolved[0].qty;
    }
  }

  const unitByKey = new Map();
  resolved.forEach(({ item, unit }) => {
    unitByKey.set(itemKey(item), unit);
  });

  return (items || []).map((item) => {
    const key = itemKey(item);
    if (!unitByKey.has(key)) return item;
    return { ...item, unit_price: unitByKey.get(key) };
  });
}
