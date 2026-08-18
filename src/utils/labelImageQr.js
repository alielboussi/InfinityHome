import { resolveProductImageUrl, resolveProductRecordImageUrl } from './productImageUrl';

/** Firebase Storage (or legacy) URL for a product or set row on a price label. */
export function resolveLabelItemImageUrl(item, data) {
  if (!data) return '';
  const type = String(item?.type || '').toLowerCase();
  if (type === 'set' || type === 'combo') {
    const raw = data.picture_url || data.image_url || '';
    return resolveProductImageUrl(raw) || String(raw || '').trim();
  }
  return resolveProductRecordImageUrl(data);
}

/** QR payload — direct image URL so phones open the Firebase photo when scanned. */
export function buildLabelImageQrValue(item, data) {
  return resolveLabelItemImageUrl(item, data);
}
