import { buildFactoryOrderWhatsAppMessage } from '../../src/utils/quoteFactoryOrderPdf.js';
import { getQuoteProductionRouting } from './quoteProductionRouting.js';

async function resolveCustomerContact(sb, customerId) {
  const cid = String(customerId || '').trim();
  if (!cid) return { name: '', phone: '' };
  const { data: cust } = await sb.from('customers').select('name, phone').eq('id', cid).maybeSingle();
  if (cust?.name) return { name: cust.name, phone: cust.phone || '' };
  const { data: qc } = await sb.from('quote_customers').select('name, phone').eq('id', cid).maybeSingle();
  return { name: qc?.name || '', phone: qc?.phone || '' };
}

/**
 * Orders app Send Order — text + route to Factory New or Aluminum WhatsApp group (PDF optional).
 * Web portal still sends bilingual PDF via client `deliver-factory-order`.
 */
export async function deliverQuoteFactoryOrderWhatsAppText(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id is required');

  const [{ data: quote, error: qErr }, routing, { data: items }] = await Promise.all([
    sb.from('quotations').select('id, quote_number, customer_id, created_at').eq('id', qid).maybeSingle(),
    getQuoteProductionRouting(sb, qid),
    sb.from('quotation_items').select('name, name_override, quantity, quote_product_id').eq('quotation_id', qid),
  ]);
  if (qErr) throw new Error(qErr.message || 'Quote load failed');
  if (!quote) throw new Error('Quote not found');
  const route = String(routing?.route || '').trim().toLowerCase();
  if (route !== 'carpentry' && route !== 'upholstery' && route !== 'aluminum') {
    throw new Error('Choose Carpentry, Upholstery, or Aluminum before sending the order.');
  }

  const customer = await resolveCustomerContact(sb, quote.customer_id);
  const message = buildFactoryOrderWhatsAppMessage({
    route,
    customerName: customer.name,
    customerPhone: customer.phone,
    createdAt: quote.created_at || new Date().toISOString(),
    sentAt: new Date().toISOString(),
    quoteNumber: quote.quote_number,
    items: items || [],
  });

  const { deliverFactoryOrderGroupMessage } = await import('../../api/notify.js');
  await deliverFactoryOrderGroupMessage({ message, route });
  return { route, text_only: true };
}