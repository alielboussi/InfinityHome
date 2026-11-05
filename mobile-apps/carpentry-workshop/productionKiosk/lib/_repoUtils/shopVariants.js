export function newShopVariantId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeShopVariants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      const id = String(row?.id || '').trim();
      const name = String(row?.name || '').trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        image_urls: Array.isArray(row?.image_urls)
          ? row.image_urls.filter(Boolean)
          : Array.isArray(row?.imageUrls)
            ? row.imageUrls.filter(Boolean)
            : [],
        stock_qty: Math.max(0, Math.floor(Number(row?.stock_qty ?? row?.stockQty ?? 0))),
        sort_order: Number(row?.sort_order ?? row?.sortOrder ?? index),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function shopVariantCartKey(productId, variantId) {
  const pid = String(productId || '').trim();
  const vid = String(variantId || '').trim();
  return vid ? `${pid}::${vid}` : pid;
}

export function shopListingUsesVariants(variants) {
  return normalizeShopVariants(variants).length > 0;
}

export function shopVariantStockTotal(variants) {
  return normalizeShopVariants(variants).reduce((sum, row) => sum + Number(row.stock_qty || 0), 0);
}
