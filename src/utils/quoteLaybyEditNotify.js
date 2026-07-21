import { computeQuotationDisplayTotal } from './quotationDisplay.js';

const BALANCE_CLOSED_THRESHOLD = 1;

function formatMoney(amount, currency = 'K') {
  const n = Number(amount || 0);
  const sym = String(currency || 'K').trim().toUpperCase() === 'USD' ? '$' : 'K';
  const decimals = n % 1 !== 0;
  const formatted = Number.isFinite(n)
    ? n.toLocaleString('en-US', {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: 2,
    })
    : '0';
  return `${sym} ${formatted}`;
}

function itemLabel(item) {
  return String(item?.name_override || item?.name || 'Item').trim() || 'Item';
}

function itemKey(item) {
  const name = itemLabel(item).toLowerCase();
  const productId = item?.product_id == null ? '' : String(item.product_id);
  return `${productId}|${name}`;
}

function compareQuoteItems(beforeItems = [], afterItems = [], currency = 'K') {
  const lines = [];
  const maxLen = Math.max(beforeItems.length, afterItems.length);

  for (let index = 0; index < maxLen; index += 1) {
    const beforeItem = beforeItems[index];
    const afterItem = afterItems[index];
    if (!beforeItem && afterItem) {
      lines.push(`Added: ${itemLabel(afterItem)} x${Number(afterItem.quantity || 0)} @ ${formatMoney(afterItem.unit_price, currency)}`);
      continue;
    }
    if (beforeItem && !afterItem) {
      lines.push(`Removed: ${itemLabel(beforeItem)}`);
      continue;
    }
    if (!beforeItem || !afterItem) continue;

    const name = itemLabel(afterItem);
    const beforeQty = Number(beforeItem.quantity || 0);
    const afterQty = Number(afterItem.quantity || 0);
    const beforePrice = Number(beforeItem.unit_price || 0);
    const afterPrice = Number(afterItem.unit_price || 0);
    const sameName = itemKey(beforeItem) === itemKey(afterItem);

    if (!sameName) {
      lines.push(`Line ${index + 1}: ${itemLabel(beforeItem)} -> ${itemLabel(afterItem)}`);
    }
    if (Math.abs(beforeQty - afterQty) > 0.009) {
      lines.push(`${name} qty: ${beforeQty} -> ${afterQty}`);
    }
    if (Math.abs(beforePrice - afterPrice) > 0.009) {
      lines.push(`${name} price: ${formatMoney(beforePrice, currency)} -> ${formatMoney(afterPrice, currency)}`);
    }
  }

  return lines;
}

export function buildQuoteLaybyEditSummary({
  beforeQuote = {},
  afterQuote = {},
  beforeItems = [],
  afterItems = [],
  paidTotal = 0,
  laybyClosed = false,
  currency = 'K',
} = {}) {
  const lines = [];
  const beforeTotal = computeQuotationDisplayTotal(beforeQuote);
  const afterTotal = computeQuotationDisplayTotal(afterQuote);
  const beforeVat = Boolean(beforeQuote.vat_apply);
  const afterVat = Boolean(afterQuote.vat_apply);

  if (beforeVat && !afterVat) {
    lines.push('VAT @ 16% removed');
  } else if (!beforeVat && afterVat) {
    lines.push('VAT @ 16% added');
  }

  const beforeDiscount = Number(beforeQuote.discount || 0);
  const afterDiscount = Number(afterQuote.discount || 0);
  if (Math.abs(beforeDiscount - afterDiscount) > 0.009) {
    lines.push(`Discount: ${formatMoney(beforeDiscount, currency)} -> ${formatMoney(afterDiscount, currency)}`);
  }

  const beforeSubtotal = Number(beforeQuote.subtotal || 0);
  const afterSubtotal = Number(afterQuote.subtotal || 0);
  if (Math.abs(beforeSubtotal - afterSubtotal) > 0.009) {
    lines.push(`Subtotal: ${formatMoney(beforeSubtotal, currency)} -> ${formatMoney(afterSubtotal, currency)}`);
  }

  if (Math.abs(beforeTotal - afterTotal) > 0.009) {
    lines.push(`Total: ${formatMoney(beforeTotal, currency)} -> ${formatMoney(afterTotal, currency)}`);
  }

  lines.push(...compareQuoteItems(beforeItems, afterItems, currency));

  const paid = Number(paidTotal || 0);
  if (paid > 0.009) {
    lines.push(`Paid to date: ${formatMoney(paid, currency)}`);
  }

  if (laybyClosed || Math.max(0, afterTotal - paid) < BALANCE_CLOSED_THRESHOLD) {
    lines.push('Lay-buy balance closed — fully paid.');
  } else {
    const balance = Math.max(0, afterTotal - paid);
    lines.push(`New balance due: ${formatMoney(balance, currency)}`);
  }

  if (!lines.length) {
    lines.push('Quote updated.');
  }

  return {
    lines,
    beforeTotal,
    afterTotal,
    laybyClosed: Boolean(laybyClosed),
  };
}
