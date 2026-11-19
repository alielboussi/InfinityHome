import {
  firebaseStoragePublicUrl,
  uploadBufferToFirebaseStorage,
} from './firebaseStorage.js';

/** productimages allows public ?alt=media read (workshop apps + Quotationer thumbnails + factory PDF). */
const FOLDER = 'productimages';
const LINE_IMAGE_PREFIX = 'quotations/quote-line-images';
const DRAWING_PREFIX = 'quotations/production-drawings';

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
  const objectPath = `${LINE_IMAGE_PREFIX}/${qid}/${iid}/${Date.now()}.${safeExt}`;
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
  const objectPath = `${DRAWING_PREFIX}/${qid}/${Date.now()}.${safeExt}`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: FOLDER,
    objectPath,
    buffer,
    contentType,
    cacheControl: 86400,
  });
  return firebaseStoragePublicUrl(FOLDER, objectPath);
}