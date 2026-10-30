import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
} from '../shared/warehouseScanResolver';

function compactText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

/** Send Delivery product search — name or finished-product family SKU. */
export function filterAssembliesForDeliverySearch(assemblies, rawQuery, { limit = 25 } = {}) {
  const q = String(rawQuery || '').trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const qCompact = compactText(q);
  const scanKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(q));

  return (assemblies || [])
    .filter((a) => {
      const name = String(a.name || '');
      const nameLower = name.toLowerCase();
      if (nameLower.includes(qLower)) return true;
      if (compactText(name).includes(qCompact)) return true;

      const sku = String(a.family_sku || '').trim();
      if (!sku) return false;
      const skuCompact = compactText(sku);
      if (skuCompact.includes(qCompact) || sku.toLowerCase().includes(qLower)) return true;

      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const key of scanKeys) {
        if (key && storedKeys.has(key)) return true;
      }
      return false;
    })
    .slice(0, limit);
}
