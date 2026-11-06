import db from '../dataClient';
import { normalizeQuotationItemRow } from '../utils/quotationDisplay';
import {
  buildFactoryOrderWhatsAppMessage,
  generateFactoryOrderBilingualPdf,
} from '../utils/quoteFactoryOrderPdf';
import {
  fetchQuoteProductionRouting,
  saveQuoteProductionRoute,
  sendFactoryOrderWhatsApp,
  sendQuoteToWarehouseProduction,
} from './quoteProductionApi';

function titleCaseWords(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Full "Send Order" action from `/quotes-board` (and Quotationer list view):
 * 1. Loads quote, items, units, customer contact, and routing (`upholstery` | `carpentry`).
 * 2. Sends the quote order to the Upholstery or Carpentry mobile app (`sendQuoteToWarehouseProduction`).
 * 3. Builds the bilingual (English + Arabic) no-price A4 PDF and sends it with the template message
 *    to the "Factory New" WhatsApp group (`120363201559496504@g.us`).
 */
export async function executeSendQuoteOrder(quoteRowOrId, { fallbackRoute = '' } = {}) {
  const quoteId = typeof quoteRowOrId === 'object' ? quoteRowOrId?.id : quoteRowOrId;
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('Quote ID is required.');

  const [{ data: quoteRow, error: qErr }, { data: rawItems, error: iErr }, { data: units }, routingInitial] =
    await Promise.all([
      db.from('quotations').select('*').eq('id', qid).maybeSingle(),
      db.from('quotation_items').select('*').eq('quotation_id', qid).order('sort_order'),
      db.from('quotation_units').select('*'),
      fetchQuoteProductionRouting(qid).catch(() => null),
    ]);

  if (qErr) throw new Error(qErr.message || 'Failed to load quote.');
  if (iErr) throw new Error(iErr.message || 'Failed to load quote items.');
  if (!quoteRow) throw new Error('Quote not found.');

  let routing = routingInitial;
  let route = String(routing?.route || fallbackRoute || '').trim().toLowerCase();
  if (route !== 'carpentry' && route !== 'upholstery') {
    const picked = typeof window !== 'undefined'
      ? window.prompt('Select department for this order: type "carpentry" or "upholstery"', 'carpentry')
      : '';
    const cleaned = String(picked || '').trim().toLowerCase();
    if (cleaned !== 'carpentry' && cleaned !== 'upholstery') {
      throw new Error('Choose Carpentry or Upholstery on the quote before sending the order.');
    }
    route = cleaned;
    routing = await saveQuoteProductionRoute(qid, route);
  }

  let customerName = '';
  let customerPhone = '';
  if (quoteRow.customer_id) {
    const [{ data: cust }, { data: qc }] = await Promise.all([
      db.from('customers').select('name, phone').eq('id', quoteRow.customer_id).maybeSingle(),
      db.from('quote_customers').select('name, phone').eq('id', quoteRow.customer_id).maybeSingle(),
    ]);
    customerName = titleCaseWords(cust?.name || qc?.name || '');
    customerPhone = String(cust?.phone || qc?.phone || '').trim();
  }

  const qpIds = [...new Set((rawItems || []).map((i) => i.quote_product_id).filter(Boolean))];
  const productMap = new Map();
  if (qpIds.length) {
    const { data: qps } = await db
      .from('quotation_products')
      .select('id, name, unit_id, description')
      .in('id', qpIds);
    (qps || []).forEach((p) => productMap.set(p.id, p));
  }

  const enrichedItems = (rawItems || []).map((raw) => {
    const norm = normalizeQuotationItemRow(raw);
    const qp = productMap.get(raw.quote_product_id || '');
    const unitId = raw.unit_id ?? qp?.unit_id ?? null;
    const unitMeta = (units || []).find((u) => String(u.id) === String(unitId));
    return {
      ...norm,
      name: norm.name || qp?.name || '',
      description: norm.description || qp?.description || '',
      unit_label: unitMeta?.name || '',
      unit_abbr: unitMeta?.abbreviation || unitMeta?.name || '',
    };
  });

  if (!routing?.sent_to_production_at) {
    await sendQuoteToWarehouseProduction(qid);
  }

  const message = buildFactoryOrderWhatsAppMessage({
    route,
    customerName,
    customerPhone,
    items: enrichedItems,
  });

  const { base64 } = await generateFactoryOrderBilingualPdf(
    {
      ...quoteRow,
      customer_name: customerName,
      customer_phone: customerPhone,
    },
    enrichedItems,
    { route },
  );

  const safeQuoteNum = String(quoteRow.quote_number || qid).replace(/[^a-zA-Z0-9#_-]/g, '_');
  const safeCust = (customerName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_') || 'Customer';
  const pdfFilename = `Order_${safeQuoteNum}_${safeCust}.pdf`;

  await sendFactoryOrderWhatsApp({
    message,
    pdfBase64: base64,
    pdfFilename,
  });

  return {
    ok: true,
    quote_id: qid,
    route,
    sent_to_production_at: new Date().toISOString(),
  };
}
