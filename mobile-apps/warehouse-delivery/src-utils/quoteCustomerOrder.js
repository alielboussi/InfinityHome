/**
 * Hassan Awad quotation orders tied to a named customer — not showroom /kitwe-products stock.
 */

export function isQuoteCustomerOrder(quoteRow, customerName = '') {
  const cid = quoteRow?.customer_id;
  if (!cid) return false;
  const name = String(
    customerName
    || quoteRow?.customer_name
    || quoteRow?.customer
    || '',
  ).trim();
  return name.length > 0;
}

export function isDeliveryCustomerOrderSession(session) {
  const meta = session?.metadata || {};
  if (meta.showroom_order === true) return false;
  if (meta.customer_order === true) return true;
  const name = String(meta.customer_name || '').trim();
  if (!name) return false;
  const kind = String(meta.document_kind || '').toLowerCase();
  if (kind === 'order_delivery') return true;
  if (meta.quote_id || meta.quote_number || meta.production_job_id) return true;
  return false;
}

function deliveryEntriesAdminOrderMeta(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let showroom = false;
  let customer = false;
  let quoteNumber = '';
  let customerName = '';
  for (const entry of list) {
    const m = entry?.metadata || {};
    const isOrderLine = m.admin_queue_delivery === true
      || String(m.production_job_id || '').trim()
      || String(m.quote_id || '').trim();
    if (!isOrderLine) continue;
    if (m.showroom_order === true) showroom = true;
    else if (m.customer_order === true || m.quote_id || m.production_job_id) customer = true;
    if (!quoteNumber && m.quote_number) quoteNumber = String(m.quote_number).trim();
    if (!customerName && m.customer_name) customerName = String(m.customer_name).trim();
  }
  return { showroom, customer, quoteNumber, customerName };
}

export function deliverySessionQuoteId(session, entries = []) {
  const meta = session?.metadata || {};
  const fromSession = String(meta.quote_id || '').trim();
  if (fromSession) return fromSession;
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    const qid = String(entry?.metadata?.quote_id || '').trim();
    if (qid) return qid;
  }
  return '';
}

/** Hassan quotation → production → driver (not Floor 1 catalog replenishment). */
export function isHassanOrderDeliverySession(session, entries = []) {
  const meta = session?.metadata || {};
  const kind = String(meta.document_kind || '').toLowerCase();
  if (kind === 'order_delivery') return true;
  if (meta.showroom_order === true || meta.customer_order === true) return true;
  if (String(meta.quote_id || meta.production_job_id || meta.quote_number || '').trim()) return true;
  const fromEntries = deliveryEntriesAdminOrderMeta(entries);
  return fromEntries.showroom || fromEntries.customer || Boolean(fromEntries.quoteNumber);
}

/** Same rules as Quotes board / send-to-production metadata (quote_production_routing.metadata). */
export function orderBadgesFromQuoteRoutingMetadata(routingMeta = null) {
  const meta = routingMeta && typeof routingMeta === 'object' ? routingMeta : {};
  if (meta.showroom_order === true) {
    return { showroomOrder: true, customerOrder: false };
  }
  const named = Boolean(String(meta.customer_name || '').trim());
  const customerOrder = meta.customer_order === true || named;
  return { showroomOrder: false, customerOrder };
}

/**
 * Hassan `/warehouse-deliveries` cards — session row metadata may be sparse; merge session + admin-queue lines
 * and optional quote_production_routing.metadata (source of truth for Hassan customer vs showroom orders).
 * @returns {{ showroomOrder: boolean, customerOrder: boolean, quoteNumber: string, customerName: string }}
 */
export function resolveDeliverySessionOrderBadges(session, entries = [], quoteRoutingMeta = null) {
  const meta = session?.metadata || {};
  const fromEntries = deliveryEntriesAdminOrderMeta(entries);
  const hassanOrder = isHassanOrderDeliverySession(session, entries);
  let showroomOrder = meta.showroom_order === true || fromEntries.showroom;
  let customerOrder = false;

  if (quoteRoutingMeta && hassanOrder) {
    const fromRouting = orderBadgesFromQuoteRoutingMetadata(quoteRoutingMeta);
    if (fromRouting.showroomOrder) {
      showroomOrder = true;
      customerOrder = false;
    } else if (fromRouting.customerOrder) {
      customerOrder = true;
    } else if (!showroomOrder) {
      customerOrder = true;
    }
  }

  const kind = String(meta.document_kind || '').toLowerCase();
  if (!showroomOrder && !customerOrder) {
    customerOrder = meta.customer_order === true
      || (hassanOrder && isDeliveryCustomerOrderSession(session))
      || (hassanOrder && fromEntries.customer);
    if (!customerOrder && hassanOrder) {
      const hasOrderRef = Boolean(
        String(meta.quote_id || meta.quote_number || meta.production_job_id || '').trim()
        || fromEntries.quoteNumber
        || fromEntries.customer,
      );
      if (kind === 'order_delivery' && hasOrderRef) customerOrder = true;
      else if (
        hassanOrder
        && (meta.quote_id || meta.quote_number || meta.production_job_id)
        && String(meta.customer_name || fromEntries.customerName || quoteRoutingMeta?.customer_name || '').trim()
      ) {
        customerOrder = true;
      } else if (hassanOrder && (meta.production_job_id || fromEntries.customer)) {
        customerOrder = true;
      } else if (hassanOrder && quoteRoutingMeta && quoteRoutingMeta.showroom_order !== true) {
        customerOrder = true;
      }
    }
  }

  if (showroomOrder) customerOrder = false;

  const quoteNumber = String(
    meta.quote_number
    || fromEntries.quoteNumber
    || quoteRoutingMeta?.quote_number
    || '',
  ).trim();
  const customerName = String(
    meta.customer_name
    || fromEntries.customerName
    || quoteRoutingMeta?.customer_name
    || '',
  ).trim();
  const repairOrder = meta.is_return_shipment === true
    || kind === 'repair_delivery'
    || Boolean(String(meta.return_order_id || '').trim());
  const farmOrder = meta.delivery_flow === 'farm_return'
    || kind === 'farm_return'
    || kind === 'farm_delivery';
  return { showroomOrder, customerOrder, quoteNumber, customerName, repairOrder, farmOrder };
}

/** Kitwe POS / kitwe-products mirror must not include these received lines. */
export function deliveryEntrySkipKitweRetailCatalog(entry, session = null) {
  const meta = entry?.metadata || {};
  const sessionMeta = session?.metadata || {};
  if (meta.showroom_order === true || sessionMeta.showroom_order === true) return false;
  if (meta.customer_order === true || sessionMeta.customer_order === true) return true;
  const customer = String(meta.customer_name || sessionMeta.customer_name || '').trim();
  if (!customer) return false;
  if (String(meta.quote_id || '').trim()) return true;
  if (String(meta.production_job_id || '').trim() && meta.admin_queue_delivery === true) return true;
  const kind = String(sessionMeta.document_kind || '').toLowerCase();
  if (kind === 'order_delivery') return true;
  return false;
}