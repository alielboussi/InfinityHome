/** Guards before Hassan Send Order (web board + factory PDF). */

import { readQuoteItemFloor2AssemblyId } from './quoteShowroomOrder.js';
import { assertZambiaNationalPhone } from './zambiaPhoneDigits.js';

export function factoryOrderNamedLines(items = []) {
  return (items || []).filter((line) => {
    const name = String(
      line?.name_override || line?.name || line?.product_name || line?.quote_product_name || '',
    ).trim();
    return name.length > 0 && name !== '-';
  });
}

export function quoteLineHasFloor2Link(line) {
  return Boolean(readQuoteItemFloor2AssemblyId(line));
}

export function assertQuoteReadyForSendOrder(items = []) {
  const named = factoryOrderNamedLines(items);
  if (!named.length) {
    const err = new Error(
      'This order has no product lines. Open the quote, add at least one catalog product or Floor 2 WIP line, save, then Send Order.',
    );
    err.code = 'send_order_no_lines';
    throw err;
  }
  const totalQty = named.reduce((sum, line) => sum + Math.max(0, Number(line?.quantity) || 0), 0);
  if (totalQty < 1) {
    const err = new Error('Each order line needs quantity at least 1 before Send Order.');
    err.code = 'send_order_qty';
    throw err;
  }
}

export function assertCustomerOrderCatalogLines(items = []) {
  const named = factoryOrderNamedLines(items);
  for (const line of named) {
    if (quoteLineHasFloor2Link(line) || line.floor2_wip_line) {
      const err = new Error('Customer orders can only use products from Quotationer → Products.');
      err.code = 'customer_order_catalog_only';
      throw err;
    }
    if (!String(line.quote_product_id || '').trim()) {
      const err = new Error('Customer orders can only use products from Quotationer → Products.');
      err.code = 'customer_order_catalog_only';
      throw err;
    }
  }
}

export function assertShowroomOrderFloor2Lines(items = []) {
  const named = factoryOrderNamedLines(items);
  for (const line of named) {
    if (!quoteLineHasFloor2Link(line)) {
      const err = new Error('Showroom orders can only use products from Floor 2.');
      err.code = 'showroom_order_floor2_only';
      throw err;
    }
  }
}

export function assertCustomerOrderZambiaPhone(phone, prefix = '+260') {
  const raw = String(phone || '').trim();
  if (!raw) {
    const err = new Error('A Zambian phone number has 9 digits excluding the country code.');
    err.code = 'zambia_phone_digits';
    throw err;
  }
  assertZambiaNationalPhone(raw, prefix);
}