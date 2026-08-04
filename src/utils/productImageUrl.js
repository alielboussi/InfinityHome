import { rewriteLegacyProductImageUrl } from './storageImageUrl';

/** Resolve product image URLs to Firebase Storage public URLs. */
export function resolveProductImageUrl(rawUrl) {
  return rewriteLegacyProductImageUrl(rawUrl);
}
