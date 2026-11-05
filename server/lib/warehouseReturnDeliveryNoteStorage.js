import { firebaseStoragePublicUrl, uploadBufferToFirebaseStorage } from './firebaseStorage.js';

const BUCKET_FOLDER = 'warehouse-return-delivery-notes';

/**
 * Store a return delivery note PDF (CR) for public QR links on Zebra labels.
 * @returns {Promise<string|null>} public URL
 */
export async function uploadWarehouseReturnDeliveryNotePdf(sessionId, pdfBase64Input) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('session_id is required.');
  let b64 = String(pdfBase64Input || '').trim();
  b64 = b64.replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '').replace(/\s+/g, '');
  if (!b64) return null;

  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Invalid return delivery note PDF.');

  const objectPath = `${sid}.pdf`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: BUCKET_FOLDER,
    objectPath,
    buffer,
    contentType: 'application/pdf',
    cacheControl: '31536000',
  });

  const url = firebaseStoragePublicUrl(BUCKET_FOLDER, objectPath);
  if (!url) throw new Error('Could not resolve return delivery note URL.');
  return url;
}
