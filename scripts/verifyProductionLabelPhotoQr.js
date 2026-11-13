/**
 * Production labels must always embed the stable product-photo QR for the packet SKU.
 */
import { buildProductPhotoQrUrl } from '../server/lib/productPhotoBySku.js';
import { buildWarehouseProductionLabelZpl } from '../server/lib/zebraProductionLabelZpl.js';

const sku = 'TU01ABCDEF';
const qrUrlFloor1 = buildProductPhotoQrUrl(sku);
const qrUrlFloor2 = buildProductPhotoQrUrl(sku, { photoFloor: 'floor2' });
const zpl = buildWarehouseProductionLabelZpl({
  name: 'Layla 3 Seater',
  sku,
  printedAt: new Date('2026-01-15T10:00:00Z'),
});
const zplFloor2 = buildWarehouseProductionLabelZpl({
  name: 'Coffee Table',
  sku,
  photoFloor: 'floor2',
  printedAt: new Date('2026-01-15T10:00:00Z'),
});

if (!qrUrlFloor1.includes('action=product-photo') || !qrUrlFloor1.includes(encodeURIComponent(sku))) {
  console.error('[verifyProductionLabelPhotoQr] unexpected Floor 1 QR URL:', qrUrlFloor1);
  process.exit(1);
}
if (!qrUrlFloor2.includes('floor=2') || qrUrlFloor2.includes('floor=1')) {
  console.error('[verifyProductionLabelPhotoQr] Floor 2 QR must include floor=2:', qrUrlFloor2);
  process.exit(1);
}
if (!zplFloor2.includes('floor=2')) {
  console.error('[verifyProductionLabelPhotoQr] Floor 2 ZPL must encode floor=2 QR');
  process.exit(1);
}
const bqnCount = (zpl.match(/\^BQN/g) || []).length;
if (bqnCount !== 1 || !zpl.includes('product-photo') || !zpl.includes(encodeURIComponent(sku))) {
  console.error('[verifyProductionLabelPhotoQr] ZPL must include exactly one image QR block');
  process.exit(1);
}
if (!zpl.includes('Layla 3 Seater') || !zpl.includes('^BQN')) {
  console.error('[verifyProductionLabelPhotoQr] ZPL missing product name or QR block');
  process.exit(1);
}

console.log('[verifyProductionLabelPhotoQr] ok');
