import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

/**
 * @deprecated Prefer passing signature_png_base64 on delivery-submit.
 * Standalone upload op for tools/tests once API is deployed.
 */
export async function uploadDeliveryDriverSignature(sessionId, pngBase64) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('Missing delivery session id.');
  const raw = String(pngBase64 || '').trim();
  if (!raw) throw new Error('Missing signature image.');

  const result = await warehouseMobileRequest('delivery-signature-upload', {
    session_id: sid,
    signature_png_base64: raw,
  });
  const url = String(result?.signature_url || '').trim();
  if (!url) throw new Error('Signature upload failed.');
  return url;
}
