function hasPriceValue(value) {
  return value != null && value !== '';
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

export function locationPriceKey(entityId, locationId) {
  return `${normalizeId(entityId)}:${normalizeId(locationId)}`;
}

function findLocationPriceRow(priceMap, entityId, locationId, entityField) {
  if (!priceMap || !entityId || !locationId) return null;
  const direct = priceMap.get(locationPriceKey(entityId, locationId));
  if (direct) return direct;
  const entityNorm = normalizeId(entityId);
  const locationNorm = normalizeId(locationId);
  for (const row of priceMap.values()) {
    if (normalizeId(row?.[entityField]) === entityNorm && normalizeId(row?.location_id) === locationNorm) {
      return row;
    }
  }
  return null;
}

export function buildProductLocationPriceMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = locationPriceKey(row?.product_id, row?.location_id);
    if (!key || key === ':') return;
    map.set(key, row);
  });
  return map;
}

export function buildComboLocationPriceMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = locationPriceKey(row?.combo_id, row?.location_id);
    if (!key || key === ':') return;
    map.set(key, row);
  });
  return map;
}

export function resolveProductLocationPricing(product, locationId, priceMap) {
  const base = product || {};
  const override = locationId
    ? findLocationPriceRow(priceMap, base.id, locationId, 'product_id')
    : null;
  return {
    price: hasPriceValue(override?.price) ? override.price : base.price,
    promotional_price: hasPriceValue(override?.promotional_price)
      ? override.promotional_price
      : base.promotional_price,
  };
}

export function resolveComboLocationPricing(combo, locationId, priceMap) {
  const base = combo || {};
  const override = locationId
    ? findLocationPriceRow(priceMap, base.id, locationId, 'combo_id')
    : null;
  const globalStandard = base.combo_price ?? base.standard_price ?? null;
  const comboPrice = hasPriceValue(override?.combo_price) ? override.combo_price : globalStandard;
  return {
    combo_price: comboPrice,
    standard_price: comboPrice,
    promotional_price: hasPriceValue(override?.promotional_price)
      ? override.promotional_price
      : base.promotional_price,
  };
}
