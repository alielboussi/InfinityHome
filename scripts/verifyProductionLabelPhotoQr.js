/**
 * Production labels must always embed the stable product-photo QR for the packet SKU.
 */
import { buildProductPhotoQrUrl } from '../server/lib/productPhotoBySku.js';
import { buildWarehouseProductionLabelZpl } from '../server/lib/zebraProductionLabelZpl.js';

const sku = 'TU01ABCDEF';
const qrUrl = buildProductPhotoQrUrl(sku);
const zpl = buildWarehouseProductionLabelZpl({
  name: 'Layla 3 Seater',
  sku,
  printedAt: new Date('2026-01-15T10:00:00Z'),
});

if (!qrUrl.includes('action=product-photo') || !qrUrl.includes(encodeURIComponent(sku))) {
  console.error('[verifyProductionLabelPhotoQr] unexpected QR URL:', qrUrl);
  process.exit(1);
}
if (!zpl.includes('^BQN') || !zpl.includes('product-photo')) {
  console.error('[verifyProductionLabelPhotoQr] ZPL missing photo QR block');
  process.exit(1);
}

console.log('[verifyProductionLabelPhotoQr] ok');
