import { USE_FIREBASE } from '../config/backend';
import { rewriteLegacyProductImageUrl } from './storageImageUrl';

/** Rewrite legacy Supabase product image URLs for Firebase or image-proxy. */
export function resolveProductImageUrl(rawUrl) {
  return rewriteLegacyProductImageUrl(rawUrl, { preferFirebase: USE_FIREBASE });
}
