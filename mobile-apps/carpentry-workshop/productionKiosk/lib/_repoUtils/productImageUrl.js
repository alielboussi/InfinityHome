import { rewriteLegacyProductImageUrl } from './storageImageUrl';

/** Resolve product image URLs to Firebase Storage public URLs. */
export function resolveProductImageUrl(rawUrl) {
  return rewriteLegacyProductImageUrl(rawUrl);
}

/** Pick the best image URL from a product row (matches Products List priority). */
export function resolveProductRecordImageUrl(product) {
  if (!product) return '';
  const related = Array.isArray(product.product_images) && product.product_images.length > 0
    ? product.product_images[0]?.image_url
    : '';
  const raw = (product.image_url && String(product.image_url).trim() !== '')
    ? product.image_url
    : (related || '');
  const resolved = resolveProductImageUrl(raw);
  return resolved && String(resolved).trim() !== '' ? resolved : '';
}
