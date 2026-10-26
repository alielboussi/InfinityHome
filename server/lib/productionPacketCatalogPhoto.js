import { firebaseStoragePublicUrl, uploadBufferToFirebaseStorage } from './firebaseStorage.js';
import { retouchProductionSeatingPhotoFromBase64 } from './productionSeatingPhotoRetouch.js';
import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';

const IMAGE_BUCKET = 'productimages';

function storageFolder(packetId) {
  return `warehouse-production-packets/${String(packetId || '').trim()}`;
}

async function syncPosProductImage(sb, { sku, name, imageUrl }) {
  const cleanSku = String(sku || '').trim();
  if (!cleanSku || !imageUrl) return null;
  const variants = [cleanSku, cleanSku.toUpperCase(), cleanSku.toLowerCase()];
  let product = null;
  for (const candidate of variants) {
    const { data: rows } = await sb.from('products').select('id, sku').eq('sku', candidate).limit(1);
    if (Array.isArray(rows) && rows[0]) {
      product = rows[0];
      break;
    }
  }
  if (!product?.id) return null;
  const now = new Date().toISOString();
  const productId = product.id;
  await sb.from('product_images').delete().eq('product_id', productId);
  await sb.from('product_images').insert([{ product_id: productId, image_url: imageUrl }]);
  await sb.from('products').update({
    image_url: imageUrl,
    updated_at: now,
    ...(name ? { name: String(name).trim() } : {}),
  }).eq('id', productId);
  return productId;
}

/**
 * Retouch seating photo, upload to storage, link to warehouse packet SKU (and POS product when present).
 */
export async function attachProductionPacketCatalogPhoto(sb, {
  packet,
  imageBase64,
  productName,
}) {
  const packetId = String(packet?.id || '').trim();
  const sku = String(packet?.sku || '').trim();
  if (!packetId || !sku) throw new Error('packet id and sku are required.');
  if (!imageBase64) throw new Error('Product photo is required.');

  const jpeg = await retouchProductionSeatingPhotoFromBase64(imageBase64);
  const objectPath = `${storageFolder(packetId)}/catalog-${Date.now()}.jpg`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: IMAGE_BUCKET,
    objectPath,
    buffer: jpeg,
    contentType: 'image/jpeg',
    cacheControl: '86400',
  });
  const publicUrl = firebaseStoragePublicUrl(IMAGE_BUCKET, objectPath);
  if (!publicUrl) throw new Error('Failed to resolve public image URL.');

  const now = new Date().toISOString();
  const { error: packetErr } = await sb.from('warehouse_packets').update({
    image_url: publicUrl,
    updated_at: now,
  }).eq('id', packetId);
  if (packetErr) throw new Error(packetErr.message || 'Failed to save packet photo.');

  await syncPosProductImage(sb, {
    sku,
    name: productName || packet?.name,
    imageUrl: publicUrl,
  });

  return rewriteLegacyProductImageUrl(publicUrl) || publicUrl;
}
