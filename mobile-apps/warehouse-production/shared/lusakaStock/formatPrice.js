export function formatLusakaPrice(value, currency) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const c = String(currency || '').toUpperCase();
  const sym = c === 'USD' || c === '$' ? '$' : (c === 'ZMW' || c === 'K' || !c ? 'K' : c);
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

export function resolveProductImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  return url || '';
}

export function resolveProductRecordImageUrl(product) {
  if (!product) return '';
  const related = Array.isArray(product.product_images) && product.product_images.length > 0
    ? product.product_images[0]?.image_url
    : '';
  const raw = (product.image_url && String(product.image_url).trim() !== '')
    ? product.image_url
    : (related || '');
  return resolveProductImageUrl(raw);
}
