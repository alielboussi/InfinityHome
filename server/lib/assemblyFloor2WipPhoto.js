import { firebaseStoragePublicUrl, uploadBufferToFirebaseStorage } from './firebaseStorage.js';
import { mergeWarehouseFloor2WipImageMetadata } from '../../src/utils/warehouseFloor2WipImage.js';

const MAX_IMAGE_BASE64_CHARS = 3_200_000;

/**
 * Save a Floor 2 WIP photo on assembly metadata only — never sets warehouse_assemblies.image_url.
 */
export async function saveAssemblyFloor2WipPhotoFromBase64(sb, {
  assemblyId,
  imageBase64,
  existingMetadata = null,
} = {}) {
  const aid = String(assemblyId || '').trim();
  const b64 = String(imageBase64 || '').trim();
  if (!aid) throw new Error('assembly_id is required.');
  if (!b64) throw new Error('Photo is required.');
  if (b64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new Error('Photo is too large. Try selecting a smaller image.');
  }

  let metadata = existingMetadata;
  if (metadata == null) {
    const { data: existing, error: loadErr } = await sb
      .from('warehouse_assemblies')
      .select('metadata')
      .eq('id', aid)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
    if (!existing) throw new Error('Product not found.');
    metadata = existing.metadata;
  }

  const { jpegBufferFromCatalogDirectUpload } = await import('./catalogDirectPhotoUpload.js');
  const jpeg = await jpegBufferFromCatalogDirectUpload(b64);
  const objectPath = `warehouse-assemblies/${aid}/floor2-wip/main-${Date.now()}.jpg`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: 'productimages',
    objectPath,
    buffer: jpeg,
    contentType: 'image/jpeg',
    cacheControl: '86400',
  });
  const publicUrl = firebaseStoragePublicUrl('productimages', objectPath);
  if (!publicUrl) throw new Error('Failed to resolve public image URL.');

  const now = new Date().toISOString();
  const nextMeta = mergeWarehouseFloor2WipImageMetadata(metadata, publicUrl);
  const { error: updErr } = await sb
    .from('warehouse_assemblies')
    .update({ metadata: nextMeta, updated_at: now })
    .eq('id', aid);
  if (updErr) throw new Error(updErr.message || 'Failed to save Floor 2 WIP photo');

  return { assembly_id: aid, image_url: publicUrl, floor2_wip_only: true };
}