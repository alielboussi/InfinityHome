import {
  formatProductionLabelBlockDate,
  formatProductionLabelBlockTime,
} from './warehouseProductionLabelCatTime.js';

const LOCATION_LABEL = '1st Floor Warehouse';

function cleanLine(value) {
  return String(value || '').trim();
}

/**
 * @param {'new'|'existing'} variant
 */
export function buildWarehouseProductionWhatsAppText({
  variant = 'new',
  accountAlias,
  producedBy,
  sku,
  name,
  qtyAdded,
  qtyBefore = 0,
  qtyOnHand,
  printedAt = new Date(),
} = {}) {
  const header = variant === 'existing' ? '***Existing Product***' : '***New Product***';
  const at = printedAt instanceof Date ? printedAt : new Date(printedAt);
  const dateLine = formatProductionLabelBlockDate(at).replace(/\s*\/\s*/g, '/');
  const timeLine = formatProductionLabelBlockTime(at);

  const qty = Math.max(0, Math.floor(Number(qtyAdded) || 0));
  const before = Math.max(0, Math.floor(Number(qtyBefore) || 0));
  const onHand = Math.max(0, Math.floor(Number(qtyOnHand) ?? qty));

  const producer = cleanLine(producedBy || accountAlias) || '—';

  const lines = [
    header,
    '',
    `Location: ${LOCATION_LABEL}`,
    `Produced By: ${producer}`,
    `Date: ${dateLine}`,
    `Time: ${timeLine}`,
    '',
    `SKU: ${cleanLine(sku).toUpperCase()}`,
    `Name: ${cleanLine(name)}`,
    `Qty: ${qty}`,
  ];

  if (variant === 'existing' && before > 0) {
    lines.push(`Stock On Hand: ${onHand}`);
  }

  return lines.join('\n').trim();
}

export function productionWhatsAppImageFileName(imageUrl) {
  const url = String(imageUrl || '').toLowerCase();
  if (url.includes('.png')) return 'product.png';
  return 'product.jpg';
}
