import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { isFahme } from '../laybyRules';
import { fetchProductLocationPricesForLocation } from './locationPricing';
import {
  buildLocationPriceMap,
  buildProductPriceMap,
  reconcileSaleItemUnits,
} from '../utils/saleDisplayPricing';

const PRODUCT_LINE_SEP = '─────────────────';
const BALANCE_EPSILON = 0.000001;

function normalizeCurrency(currency) {
  const raw = String(currency || 'K').trim().toUpperCase();
  if (raw === '$' || raw === 'USD') return 'USD';
  return 'K';
}

function formatAmount(amount, currency) {
  const n = Number(amount || 0);
  const decimals = n % 1 !== 0;
  const fmt = Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })
    : '0';
  const label = normalizeCurrency(currency) === 'USD' ? '$' : 'K';
  return `${label} ${fmt}`;
}

function formatSaleDateForMessage(isoOrDate) {
  if (!isoOrDate) return '';
  const raw = String(isoOrDate).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatReceiptNumberForMessage(receiptNumber) {
  return String(receiptNumber || '')
    .split(',')
    .map((part) => part.trim().replace(/^#+\s*/, ''))
    .filter(Boolean)
    .join(', ');
}

function pushLine(lines, label, value) {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  lines.push(`${label}: ${value}`);
}

function waBold(text) {
  return `*${String(text || '').trim()}*`;
}

function paymentMethodDisplayName(type) {
  const key = String(type || '').trim().toLowerCase();
  const map = {
    cash: 'Cash',
    visa_card: 'Visa Card',
    bank_transfer: 'Bank Transfer',
    mobile_money: 'Mobile Money',
    cheque: 'Cheque',
    goods: 'Goods',
    down_payment: 'Down Payment',
    credit: 'Credit',
  };
  return map[key] || String(type || 'Cash');
}

function getPaymentMethodEmoji(type) {
  const key = String(type || '').trim().toLowerCase();
  const map = {
    cash: '💵',
    visa_card: '💳',
    bank_transfer: '🏦',
    mobile_money: '📱',
    cheque: '📝',
    goods: '📦',
    down_payment: '💰',
    credit: '🧾',
  };
  return map[key] || '💳';
}

function buildSalePaidLines(payments, currency) {
  const rows = (payments || []).filter((payment) => {
    if (Number(payment.amount || 0) <= 0) return false;
    return String(payment.payment_type || '').trim().toLowerCase() !== 'credit';
  });
  if (!rows.length) return '';

  const byType = new Map();
  rows.forEach((payment) => {
    const type = String(payment.payment_type || 'cash').trim().toLowerCase();
    byType.set(type, (byType.get(type) || 0) + Number(payment.amount || 0));
  });

  const typeOrder = ['cash', 'visa_card', 'bank_transfer', 'mobile_money', 'cheque', 'goods', 'down_payment'];
  const lines = [];
  Array.from(byType.keys())
    .sort((left, right) => {
      const leftIndex = typeOrder.indexOf(left);
      const rightIndex = typeOrder.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    })
    .forEach((type) => {
      const amount = Number(byType.get(type) || 0);
      if (amount <= 0) return;
      const emoji = getPaymentMethodEmoji(type);
      const label = paymentMethodDisplayName(type);
      lines.push(`${emoji} Total ${label} Paid: ${formatAmount(amount, currency)}`);
    });
  return lines.join('\n');
}

function buildPaidLine(payments, currency) {
  const rows = (payments || []).filter((payment) => Number(payment.amount || 0) > 0);
  if (!rows.length) return '';
  return rows.map((payment) => {
    const emoji = getPaymentMethodEmoji(payment.payment_type);
    const method = paymentMethodDisplayName(payment.payment_type);
    return `${emoji} Paid ${formatAmount(payment.amount, currency)} BY: ${method}`;
  }).join('\n');
}

function safeProductLabel(item, productMap) {
  const display = String(item?.display_name || '').trim();
  if (display) return display;
  const productId = item?.product_id != null ? String(item.product_id) : '';
  if (productId && productMap?.has(productId)) {
    return String(productMap.get(productId)?.name || 'Product').trim() || 'Product';
  }
  return 'Product';
}

function buildProductLines(items, currency, productMap, locationPriceMap, saleTotal, saleDiscount) {
  const displayItems = reconcileSaleItemUnits(items || [], {
    saleTotal,
    saleDiscount,
    productMap,
    locationPriceMap,
  });

  const scoped = displayItems.filter((item) => {
    const qty = Number(item.quantity || 0);
    const name = safeProductLabel(item, productMap);
    return name && qty > 0;
  });

  const chargedSubtotal = Number(saleTotal || 0) + Number(saleDiscount || 0);
  const resolved = scoped.map((item) => {
    const qty = Number(item.quantity || 0);
    const unit = Number(item.unit_price || 0);
    return { item, qty, unit };
  });

  let linesSubtotal = resolved.reduce((sum, row) => sum + row.qty * row.unit, 0);
  if (chargedSubtotal > 0) {
    if (linesSubtotal > 0 && Math.abs(linesSubtotal - chargedSubtotal) > 0.009) {
      const factor = chargedSubtotal / linesSubtotal;
      resolved.forEach((row) => { row.unit *= factor; });
    } else if (resolved.length === 1 && resolved[0].qty > 0) {
      resolved[0].unit = chargedSubtotal / resolved[0].qty;
    }
  }

  return resolved.map(({ item, qty, unit }) => {
    const name = safeProductLabel(item, productMap);
    const lineTotal = qty * unit;
    return `${qty} x ${waBold(name)} = (${formatAmount(unit, currency)} x ${qty}) = ${formatAmount(lineTotal, currency)}`;
  });
}

function buildWhatsAppMessage({
  eventType,
  locationName,
  dateTimeIso,
  receiptNumber,
  customerName,
  customerPhone,
  productLines,
  discountAmount,
  summaryTotal,
  payments,
  balanceDue,
  currency,
  previousDueBalance,
}) {
  const lines = [];

  if (eventType === 'quote_convert' || eventType === 'layby_addition') {
    lines.push('🏭 *Factory Production*');
  } else if (eventType === 'new_layby') {
    lines.push('📋 *Layby Created*');
  } else if (eventType === 'statement') {
    lines.push('📋 *Layby Statement*');
  } else if (eventType === 'sale') {
    lines.push('✅ *Completed Sale*');
  }

  pushLine(lines, '📍 Location', locationName);
  pushLine(lines, '📅 Date', formatSaleDateForMessage(dateTimeIso));
  pushLine(lines, '🧾 Receipt', formatReceiptNumberForMessage(receiptNumber));
  pushLine(lines, '👤 Customer Name', customerName);
  pushLine(lines, '📞 Customer Number', customerPhone);

  if (eventType === 'layby_addition') {
    if (previousDueBalance != null && Number(previousDueBalance) >= 0) {
      lines.push('');
      lines.push(`Previous Due Balance: ${formatAmount(previousDueBalance, currency)}`);
    }
    lines.push('');
    lines.push('*New Sale*');
    if (productLines?.length) {
      lines.push('');
      lines.push('🛒 *Products:*');
      lines.push(productLines.join(`\n${PRODUCT_LINE_SEP}\n`));
    }
  } else if (productLines?.length && eventType !== 'statement') {
    lines.push('');
    lines.push('🛒 *Products:*');
    lines.push(productLines.join(`\n${PRODUCT_LINE_SEP}\n`));
  }

  if (Number(discountAmount || 0) > 0 && eventType !== 'statement') {
    lines.push('');
    pushLine(lines, 'Discount', formatAmount(discountAmount, currency));
  }

  lines.push('');
  lines.push(`📋 Summary: ${formatAmount(summaryTotal, currency)}`);

  const paidLine = eventType === 'sale'
    ? buildSalePaidLines(payments, currency)
    : buildPaidLine(payments, currency);
  if (paidLine) lines.push(paidLine);

  const due = Number(balanceDue || 0);
  if (due > BALANCE_EPSILON) {
    lines.push(`⏳ Balance Due: ${formatAmount(due, currency)}`);
  } else if (eventType !== 'statement') {
    lines.push("This customer's due balance is fully closed");
  }

  if (eventType === 'sale') {
    lines.push('');
    lines.push('These sale products have been deducted from your inventory. Kindly confirm your inventory.');
  }

  return lines.join('\n').trim();
}

async function loadSalePreviewData(saleId) {
  const { data: sale, error: saleErr } = await fromPublic('sales')
    .select('id, customer_id, sale_date, created_at, total_amount, discount, currency, receipt_number, location_id, layby_id, status')
    .eq('id', saleId)
    .maybeSingle();
  if (saleErr || !sale) throw new Error(saleErr?.message || 'Sale not found');

  const [{ data: items }, { data: payments }, { data: customer }, locationRes] = await Promise.all([
    fromPublic('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .eq('sale_id', sale.id),
    fromPublic('sales_payments')
      .select('amount, payment_type, payment_date, reference, notes, currency')
      .eq('sale_id', sale.id)
      .order('payment_date', { ascending: true }),
    sale.customer_id
      ? fromPublic('customers').select('name, phone, currency').eq('id', sale.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sale.location_id
      ? fromPublic('locations').select('name').eq('id', sale.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const productIds = new Set((items || []).map((item) => item.product_id).filter(Boolean).map(String));
  const [{ data: products }, locationPriceRows] = await Promise.all([
    productIds.size
      ? db.from('products').select('id, name, price, promotional_price').in('id', Array.from(productIds))
      : Promise.resolve({ data: [] }),
    sale.location_id
      ? fetchProductLocationPricesForLocation(db, sale.location_id)
      : Promise.resolve([]),
  ]);

  return {
    sale,
    items: items || [],
    payments: payments || [],
    customer: customer || {},
    locationName: locationRes?.data?.name || '',
    productMap: buildProductPriceMap(products || []),
    locationPriceMap: buildLocationPriceMap(locationPriceRows || [], productIds),
  };
}

async function resolveLaybyId(laybyId, customerId) {
  if (laybyId) return laybyId;
  if (!customerId) return null;
  const { data: activeLayby } = await fromPublic('laybys')
    .select('id')
    .eq('customer_id', customerId)
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeLayby?.id) return activeLayby.id;
  const { data: latestLayby } = await fromPublic('laybys')
    .select('id')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return latestLayby?.id || null;
}

export async function buildClientWhatsAppPreviewForRow(row) {
  if (!row?.id) return { ok: false, error: 'Missing sale' };

  const saleId = row.id;
  const customerId = row.customer_id;
  const laybyId = row.layby_id || row.layby?.id || null;

  if (isFahme(customerId)) {
    return {
      ok: true,
      message: 'Fahme account: WhatsApp sends the consolidated layby statement PDF (no individual sale text message).',
      attachmentNote: 'Layby statement PDF will be attached when sent.',
    };
  }

  const isLaybyRow = String(row.computedStatus || row.status || '').toLowerCase() === 'layby'
    || (laybyId && Number(row.outstanding || 0) > BALANCE_EPSILON);

  if (isLaybyRow) {
    const resolvedLaybyId = await resolveLaybyId(laybyId, customerId);
    if (!resolvedLaybyId) return { ok: false, error: 'No layby account found for customer' };

    const eventType = Number(row.paid || 0) <= BALANCE_EPSILON ? 'new_layby' : 'layby_addition';
    const data = await loadSalePreviewData(saleId);
    const currency = normalizeCurrency(data.sale.currency || data.customer.currency || 'K');
    const summaryTotal = Number(data.sale.total_amount || 0);
    const discountAmount = Number(data.sale.discount || 0);
    const productLines = buildProductLines(
      data.items,
      currency,
      data.productMap,
      data.locationPriceMap,
      summaryTotal,
      discountAmount,
    );
    const paidOnSale = (data.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balanceDue = Math.max(0, summaryTotal - paidOnSale);

    const message = buildWhatsAppMessage({
      eventType,
      locationName: data.locationName,
      dateTimeIso: data.sale.sale_date || data.sale.created_at,
      receiptNumber: data.sale.receipt_number,
      customerName: data.customer.name,
      customerPhone: data.customer.phone,
      productLines,
      discountAmount,
      summaryTotal,
      payments: data.payments,
      balanceDue: eventType === 'new_layby' ? balanceDue : Number(row.outstanding || balanceDue),
      currency,
      previousDueBalance: eventType === 'layby_addition'
        ? Math.max(0, Number(row.outstanding || 0) - balanceDue)
        : null,
    });

    return {
      ok: true,
      message,
      attachmentNote: eventType === 'new_layby' ? '' : 'Layby statement PDF may be attached for some notifications.',
    };
  }

  const data = await loadSalePreviewData(saleId);
  const currency = normalizeCurrency(data.sale.currency || data.customer.currency || 'K');
  const summaryTotal = Number(data.sale.total_amount || 0);
  const discountAmount = Number(data.sale.discount || 0);
  const productLines = buildProductLines(
    data.items,
    currency,
    data.productMap,
    data.locationPriceMap,
    summaryTotal,
    discountAmount,
  );

  const message = buildWhatsAppMessage({
    eventType: 'sale',
    locationName: data.locationName,
    dateTimeIso: data.sale.sale_date || data.sale.created_at,
    receiptNumber: data.sale.receipt_number,
    customerName: data.customer.name,
    customerPhone: data.customer.phone,
    productLines,
    discountAmount,
    summaryTotal,
    payments: data.payments,
    balanceDue: 0,
    currency,
  });

  return {
    ok: true,
    message,
    attachmentNote: 'Sales receipt PDF will be attached when sent.',
  };
}
