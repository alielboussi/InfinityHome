import {
  firebaseStoragePublicUrl,
  uploadBufferToFirebaseStorage,
} from './firebaseStorage.js';

const FOLDER = 'Quotations';

export function normalizeQuoteLineImageUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

/** Upload Hassan quote line reference image (JPEG/PNG/WebP). */
export async function uploadQuoteLineImageBuffer({
  quoteId,
  itemId,
  buffer,
  contentType = 'image/jpeg',
  ext = 'jpg',
} = {}) {
  const qid = String(quoteId || '').trim();
  const iid = String(itemId || 'draft').trim() || 'draft';
  if (!buffer?.length) throw new Error('Image data required');
  const safeExt = String(ext || 'jpg').replace(/[^\w]+/g, '') || 'jpg';
  const objectPath = `quote-line-images/${qid}/${iid}/${Date.now()}.${safeExt}`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: FOLDER,
    objectPath,
    buffer,
    contentType,
    cacheControl: 86400,
  });
  return firebaseStoragePublicUrl(FOLDER, objectPath);
}

export async function uploadQuoteProductionDrawingBuffer({
  quoteId,
  buffer,
  contentType = 'image/jpeg',
  ext = 'jpg',
} = {}) {
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id required');
  if (!buffer?.length) throw new Error('Image data required');
  const safeExt = String(ext || 'jpg').replace(/[^\w]+/g, '') || 'jpg';
  const objectPath = `production-drawings/${qid}/${Date.now()}.${safeExt}`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: FOLDER,
    objectPath,
    buffer,
    contentType,
    cacheControl: 86400,
  });
  return firebaseStoragePublicUrl(FOLDER, objectPath);
}