import {
  formatProductionLabelBlockDate,
  formatProductionLabelBlockTime,
} from './warehouseProductionLabelCatTime.js';

const DIVIDER = '____________________________________________________________';

function clean(value) {
  return String(value || '').trim();
}

function formatProductLine(row, { includeRemaining, stockLabel }) {
  const name = clean(row?.name) || 'Product';
  const qty = Math.max(0, Math.floor(Number(row?.qty) || 0));
  const remaining = Math.max(0, Math.floor(Number(row?.remainingQty ?? row?.remaining_qty) || 0));
  if (includeRemaining) {
    return `${name} (${qty}) / (${stockLabel}: ${remaining} )`;
  }
  return `${name} (${qty})`;
}

/**
 * Workshop production group alerts (Upholstery + Carpentry). CAT / Africa/Lusaka.
 * @param {'floor2Debit'|'floor2Credit'|'orderComplete'|'sentToPainting'} kind
 * @param {'hassan'|'manufacture'} [orderSource]
 */
export function buildWorkshopProductionWhatsAppText({
  kind = 'floor2Debit',
  orderSource = 'manufacture',
  producedBy,
  customerName,
  customerPhone,
  products = [],
  status,
  destination = '',
  printedAt = new Date(),
} = {}) {
  const at = printedAt instanceof Date ? printedAt : new Date(printedAt);
  const dateLine = formatProductionLabelBlockDate(at);
  const timeLine = `${formatProductionLabelBlockTime(at)} CAT (GMT+2)`;
  const alias = clean(producedBy) || '—';
  const list = Array.isArray(products) ? products.filter((p) => clean(p?.name) || Number(p?.qty) > 0) : [];
  const allRemainingZero = list.every((p) => Math.max(0, Math.floor(Number(p?.remainingQty ?? p?.remaining_qty) || 0)) <= 0);
  const isPainting = kind === 'sentToPainting';
  const isOrder = kind === 'orderComplete';
  const isCredit = kind === 'floor2Credit';
  const isHassan = String(orderSource).toLowerCase() === 'hassan';
  const completed = String(status || '').toLowerCase() === 'completed'
    || (isOrder && allRemainingZero && list.length > 0);
  const includeRemaining = isPainting
    ? list.some((p) => Math.max(0, Math.floor(Number(p?.remainingQty ?? p?.remaining_qty) || 0)) > 0)
    : isOrder
      ? !completed
      : true;
  const stockLabel = isCredit ? 'Floor 2 Qty' : 'Remaining Qty';

  const lines = [
    `Date: ${dateLine}`,
    `Time: ${timeLine}`,
    `User: ${alias}`,
  ];

  if ((isOrder || isPainting) && isHassan) {
    lines.push(`Customer Name: ${clean(customerName) || '—'}`);
    lines.push(`Customer Phone Number: ${clean(customerPhone) || '—'}`);
  }

  lines.push(DIVIDER);
  lines.push('');
  if (!list.length) {
    lines.push('—');
  } else {
    list.forEach((row) => lines.push(formatProductLine(row, { includeRemaining, stockLabel })));
  }
  lines.push('');
  lines.push(DIVIDER);

  if (isPainting) {
    lines.push('');
    lines.push('Status: Sent to Painting');
    lines.push(`From: ${isHassan ? 'Hassan Awad order' : 'Manufacture'}`);
  } else if (isOrder) {
    lines.push('');
    lines.push(`Status: ${completed ? 'Completed' : 'Partial'}`);
    const dest = String(destination || '').trim().toLowerCase();
    if (dest === 'floor1') {
      lines.push('Stored: Floor 1');
    } else if (dest === 'delivery') {
      lines.push('Sent to: Delivery queue');
    }
  }

  return lines.join('\n').trim();
}
