import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';

function publicSiteBase() {
  return String(
    process.env.INFINITY_PUBLIC_URL
    || process.env.REACT_APP_API_BASE
    || 'https://www.infinity-home.online',
  ).replace(/\/+$/, '');
}

/**
 * Stable QR URL printed on every production label (always encoded, even before a photo exists).
 * Scanning opens this link; when a catalog image exists for the same SKU it redirects to the photo.
 * Labels printed earlier keep working — the QR does not change when you add an image later.
 */
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

async function loadProductImageBySku(db, sku) {
  const clean = String(sku || '').trim();
  if (!clean) return '';
  const variants = [clean, clean.toUpperCase(), clean.toLowerCase()];
  let product = null;
  for (const candidate of variants) {
    const { data: products, error } = await db
      .from('products')
      .select('id, image_url, sku')
      .eq('sku', candidate)
      .limit(1);
    if (!error && Array.isArray(products) && products[0]) {
      product = products[0];
      break;
    }
  }
  if (!product) return '';
  const { data: images } = await db
    .from('product_images')
    .select('product_id, image_url')
    .eq('product_id', product.id)
    .limit(3);
  return pickImageUrl(product, images);
}

async function loadWarehousePacketImageBySku(db, sku) {
  const clean = String(sku || '').trim();
  if (!clean) return '';
  const variants = [clean, clean.toUpperCase(), clean.toLowerCase()];
  let packet = null;
  for (const candidate of variants) {
    const { data: packets, error } = await db
      .from('warehouse_packets')
      .select('id, sku, assembly_id, image_url')
      .eq('sku', candidate)
      .limit(1);
    if (!error && Array.isArray(packets) && packets[0]) {
      packet = packets[0];
      break;
    }
  }
  if (!packet) return '';
  const direct = String(packet.image_url || '').trim();
  if (direct) return rewriteLegacyProductImageUrl(direct) || direct;
  if (!packet?.assembly_id) return '';
  const { data: assembly, error: aErr } = await db
    .from('warehouse_assemblies')
    .select('image_url, cover_image_url')
    .eq('id', packet.assembly_id)
    .maybeSingle();
  if (aErr || !assembly) return '';
  const raw = String(assembly.cover_image_url || assembly.image_url || '').trim();
  if (!raw) return '';
  return rewriteLegacyProductImageUrl(raw) || raw;
}

export async function resolveProductImageUrlForSku(db, sku) {
  const fromProduct = await loadProductImageBySku(db, sku);
  if (fromProduct) return fromProduct;
  return loadWarehousePacketImageBySku(db, sku);
}
