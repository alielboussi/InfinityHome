import { getDownloadURL, getStorage, ref, uploadString } from 'firebase/storage';
import { getFirebaseApp } from '../shared/firebase';

/**
 * Persist driver signature PNG under warehouse-delivery-signatures/{sessionId}.png
 */
export async function uploadDeliveryDriverSignature(sessionId, pngBase64) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('Missing delivery session id.');
  const raw = String(pngBase64 || '').replace(/^data:image\/png;base64,/, '').trim();
  if (!raw) throw new Error('Missing signature image.');

  const storage = getStorage(getFirebaseApp());
  const objectRef = ref(storage, `warehouse-delivery-signatures/${sid}.png`);
  await uploadString(objectRef, raw, 'base64', { contentType: 'image/png' });
  return getDownloadURL(objectRef);
}
