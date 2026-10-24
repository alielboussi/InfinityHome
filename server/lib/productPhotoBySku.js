import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';

function publicSiteBase() {
  return String(
    process.env.INFINITY_PUBLIC_URL
    || process.env.REACT_APP_API_BASE
    || 'https://www.infinity-home.online',
  ).replace(/\/+$/, '');
}

/** Stable QR URL — redirects to the product image when one exists in the catalog. */
export function buildProductPhotoQrUrl(sku) {
  const clean = String(sku || '').trim();
  const base = publicSiteBase();
  if (!clean) return `${base}/api/health?action=product-photo`;
  return `${base}/api/health?action=product-photo&sku=${encodeURIComponent(clean)}`;
}

function pickImageUrl(product, imageRows) {
  if (!product) return '';
  const pid = String(product.id || '');
  const fromJoin = (imageRows || []).find((row) => String(row?.product_id) === pid);
  const raw = String(product.image_url || fromJoin?.image_url || '').trim();
  if (!raw) return '';
  return rewriteLegacyProductImageUrl(raw) || raw;
}

export async function resolveProductImageUrlForSku(db, sku) {
  const clean = String(sku || '').trim();
  if (!clean) return '';
  const { data: products, error } = await db
    .from('products')
    .select('id, image_url, sku')
    .eq('sku', clean)
    .limit(1);
  if (error || !Array.isArray(products) || !products[0]) return '';
  const product = products[0];
  const { data: images } = await db
    .from('product_images')
    .select('product_id, image_url')
    .eq('product_id', product.id)
    .limit(3);
  return pickImageUrl(product, images);
}
