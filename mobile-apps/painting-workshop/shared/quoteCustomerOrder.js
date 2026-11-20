/**
 * Hassan Awad quotation orders tied to a named customer — not showroom /kitwe-products stock.
 * Keep in sync with src/utils/quoteCustomerOrder.js
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

/**
 * Hassan `/warehouse-deliveries` cards — session row metadata may be sparse; merge session + admin-queue lines.
 * @returns {{ showroomOrder: boolean, customerOrder: boolean, quoteNumber: string, customerName: string }}
 */
export function resolveDeliverySessionOrderBadges(session, entries = []) {
  const meta = session?.metadata || {};
  const fromEntries = deliveryEntriesAdminOrderMeta(entries);
  const showroomOrder = meta.showroom_order === true || fromEntries.showroom;

  let customerOrder = false;
  if (!showroomOrder) {
    customerOrder = meta.customer_order === true
      || isDeliveryCustomerOrderSession(session)
      || fromEntries.customer;
    if (!customerOrder) {
      const kind = String(meta.document_kind || '').toLowerCase();
      const hasOrderRef = Boolean(
        String(meta.quote_id || meta.quote_number || meta.production_job_id || '').trim()
        || fromEntries.quoteNumber
        || fromEntries.customer,
      );
      if (kind === 'order_delivery' && hasOrderRef) customerOrder = true;
      else if (
        (meta.quote_id || meta.quote_number || meta.production_job_id)
        && String(meta.customer_name || fromEntries.customerName || '').trim()
      ) {
        customerOrder = true;
      }
    }
  }

  const quoteNumber = String(meta.quote_number || fromEntries.quoteNumber || '').trim();
  const customerName = String(meta.customer_name || fromEntries.customerName || '').trim();
  return { showroomOrder, customerOrder, quoteNumber, customerName };
}

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