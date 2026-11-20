/**
 * Showroom orders (Floor 2 WIP → production) — Kitwe accept mirrors showroom stock on /kitwe-products.
 */

import { parseUpholsteryMeta } from './upholsteryCatalogView.js';

export function isQuoteShowroomOrderFromRouting(routing) {
  const meta = routing?.metadata || {};
  return meta.showroom_order === true;
}

export function isQuoteShowroomOrder(quoteRow, routing) {
  if (isQuoteShowroomOrderFromRouting(routing)) return true;
  return quoteRow?.showroom_order === true;
}

/** Production tracking row / quote list (align with mobile-apps/shared/quoteShowroomOrder.js). */
export function isProductionQuoteShowroomOrder(quote) {
  return quote?.showroom_order === true;
}

export function isProductionQuoteCustomerOrder(quote) {
  if (isProductionQuoteShowroomOrder(quote)) return false;
  return quote?.customer_order === true;
}

export function isDeliveryShowroomOrderSession(session) {
  const meta = session?.metadata || {};
  if (meta.showroom_order === true) return true;
  const kind = String(meta.document_kind || '').toLowerCase();
  return kind === 'order_delivery' && meta.showroom_order === true;
}

/** Workshop route for a Floor 2 WIP assembly row. */
export function inferShowroomWorkshopRoute(assembly) {
  if (!assembly) return 'carpentry';
  if (parseUpholsteryMeta(assembly).selected) return 'upholstery';
  return 'carpentry';
}

export function quoteLineHasFloor2Assembly(line) {
  const meta = line?.metadata && typeof line.metadata === 'object' ? line.metadata : {};
  return Boolean(String(meta.floor2_assembly_id || line?.floor2_assembly_id || '').trim());
}

/** Hassan customer quotes (incl. mixed Floor 2 + catalog lines) always use the customer badge — not showroom. */
export function buildHassanCustomerQuoteRoutingMetadata(quote, items = []) {
  const hasCustomer = Boolean(String(quote?.customer_id || '').trim());
  const hasFloor2 = (items || []).some(quoteLineHasFloor2Assembly);
  return {
    showroom_order: false,
    customer_order: hasCustomer,
    floor2_customer_lines: hasFloor2,
  };
}

export function assertSingleShowroomRoute(routes) {
  const set = new Set((routes || []).map((r) => String(r || '').toLowerCase()).filter(Boolean));
  if (set.size > 1) {
    throw new Error('All lines in one showroom order must use the same workshop (Carpentry or Upholstery).');
  }
  const only = [...set][0];
  if (only !== 'carpentry' && only !== 'upholstery') {
    throw new Error('Invalid workshop route.');
  }
  return only;
}