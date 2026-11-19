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