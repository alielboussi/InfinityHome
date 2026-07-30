const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

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
    promo_start_date: override?.promo_start_date ?? base.promo_start_date ?? null,
    promo_end_date: override?.promo_end_date ?? base.promo_end_date ?? null,
    hasLocationOverride: Boolean(override),
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
    promo_start_date: override?.promo_start_date ?? base.promo_start_date ?? null,
    promo_end_date: override?.promo_end_date ?? base.promo_end_date ?? null,
    hasLocationOverride: Boolean(override),
  };
}

export function applyProductLocationPricing(product, locationId, priceMap) {
  const resolved = resolveProductLocationPricing(product, locationId, priceMap);
  return {
    ...product,
    price: resolved.price,
    promotional_price: resolved.promotional_price,
    promo_start_date: resolved.promo_start_date,
    promo_end_date: resolved.promo_end_date,
    _pricingLocationId: locationId || null,
    _hasLocationPriceOverride: resolved.hasLocationOverride,
  };
}

export function applyComboLocationPricing(combo, locationId, priceMap) {
  const resolved = resolveComboLocationPricing(combo, locationId, priceMap);
  return {
    ...combo,
    combo_price: resolved.combo_price,
    standard_price: resolved.standard_price,
    promotional_price: resolved.promotional_price,
    promo_start_date: resolved.promo_start_date,
    promo_end_date: resolved.promo_end_date,
    _pricingLocationId: locationId || null,
    _hasLocationPriceOverride: resolved.hasLocationOverride,
  };
}

export function buildProductLocationPriceUpsert({
  productId,
  locationId,
  price,
  promotionalPrice,
  promoStartDate,
  promoEndDate,
}) {
  const payload = {
    product_id: productId,
    location_id: locationId,
    updated_at: new Date().toISOString(),
  };
  if (price !== undefined) payload.price = toNumber(price);
  if (promotionalPrice !== undefined) payload.promotional_price = promotionalPrice;
  if (promoStartDate !== undefined) payload.promo_start_date = promoStartDate;
  if (promoEndDate !== undefined) payload.promo_end_date = promoEndDate;
  return payload;
}

export function buildComboLocationPriceUpsert({
  comboId,
  locationId,
  comboPrice,
  promotionalPrice,
  promoStartDate,
  promoEndDate,
}) {
  const payload = {
    combo_id: comboId,
    location_id: locationId,
    updated_at: new Date().toISOString(),
  };
  if (comboPrice !== undefined) payload.combo_price = toNumber(comboPrice);
  if (promotionalPrice !== undefined) payload.promotional_price = promotionalPrice;
  if (promoStartDate !== undefined) payload.promo_start_date = promoStartDate;
  if (promoEndDate !== undefined) payload.promo_end_date = promoEndDate;
  return payload;
}
