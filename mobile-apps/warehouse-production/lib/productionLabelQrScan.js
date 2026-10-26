/** Keep in sync with src/utils/productionLabelQrScan.js */

export function parseProductPhotoQrSku(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  const skuFromQuery = (queryString) => {
    const params = new URLSearchParams(queryString.replace(/^\?/, ''));
    if (params.get('action') !== 'product-photo') return '';
    return String(params.get('sku') || '').trim();
  };

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const sku = skuFromQuery(url.search);
      if (sku) return sku;
      if (url.searchParams.get('action') === 'product-photo') {
        return String(url.searchParams.get('sku') || '').trim();
      }
    }
  } catch {
    // fall through
  }

  const pathMatch = trimmed.match(/[?&]action=product-photo(?:&|$)/i);
  if (pathMatch) {
    const skuMatch = trimmed.match(/[?&]sku=([^&\s#]+)/i);
    if (skuMatch) {
      try {
        return decodeURIComponent(skuMatch[1]).trim();
      } catch {
        return String(skuMatch[1]).trim();
      }
    }
  }

  return '';
}

export function productionScanResolveCandidates(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const out = [];
  const photoSku = parseProductPhotoQrSku(trimmed);
  if (photoSku) out.push(photoSku);
  if (!out.includes(trimmed)) out.push(trimmed);
  return out;
}
