import db from '../dataClient';
import { normalizeQuotationItemRow } from '../utils/quotationDisplay';
import { buildFactoryOrderWhatsAppMessage } from '../utils/quoteFactoryOrderPdf';
import generateQuotePdf from '../quotespdf';
import {
  fetchQuoteProductionRouting,
  saveQuoteProductionRoute,
  sendFactoryOrderWhatsApp,
  sendQuoteToWarehouseProduction,
} from './quoteProductionApi';
import {
  assertQuoteReadyForSendOrder,
  assertCustomerOrderCatalogLines,
  assertShowroomOrderFloor2Lines,
  assertCustomerOrderZambiaPhone,
} from '../utils/quoteSendOrderValidate';
import { isQuoteShowroomOrderFromRouting } from '../utils/quoteShowroomOrder';
import { resolveQuoteOrderCustomerContact } from '../utils/quoteOrderCustomerContact';

const VALID_ROUTES = new Set(['carpentry', 'upholstery', 'aluminum']);

async function blobToBase64(blob) {
  if (!blob) return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read PDF'));
    reader.readAsDataURL(blob);
  });
}

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
 * 3. Builds the priced customer quotation PDF (same as Hassan’s quote PDF) and sends it with the
 *    template message to Factory New plus Upholstery / Carpentry production groups,
 *    or Aluminum Production when route is aluminum.
 */
export async function executeSendQuoteOrder(quoteRowOrId, { fallbackRoute = '', route: presetRoute = '' } = {}) {
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
  let route = String(presetRoute || routing?.route || fallbackRoute || '').trim().toLowerCase();
  if (!VALID_ROUTES.has(route)) {
    throw new Error('Choose Carpentry, Upholstery, or Aluminum on the quote before sending the order.');
  }
  if (!routing?.route || String(routing.route).toLowerCase() !== route) {
    routing = await saveQuoteProductionRoute(qid, route);
  }

  const contact = await resolveQuoteOrderCustomerContact(db, quoteRow, routing?.metadata);
  const customerName = titleCaseWords(contact.name);
  const customerPhone = String(contact.phone || '').trim();

  const qpIds = [...new Set((rawItems || []).map((i) => i.quote_product_id).filter(Boolean))];
  const productMap = new Map();
  if (qpIds.length) {
    const { data: qps } = await db
      .from('quotation_products')
      .select('id, name, unit_id, description')
      .in('id', qpIds);
    (qps || []).forEach((p) => productMap.set(p.id, p));
  }

  assertQuoteReadyForSendOrder(rawItems || []);
  const isShowroom = isQuoteShowroomOrderFromRouting(routing);
  if (isShowroom) {
    assertShowroomOrderFloor2Lines(rawItems || []);
  } else {
    assertCustomerOrderCatalogLines(rawItems || []);
    assertCustomerOrderZambiaPhone(customerPhone);
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

  try {
    await sendQuoteToWarehouseProduction(qid);
  } catch (prodErr) {
    throw new Error(`Production app: ${prodErr?.message || prodErr}`);
  }

  const message = buildFactoryOrderWhatsAppMessage({
    route,
    customerName,
    customerPhone,
    createdAt: quoteRow.created_at || new Date().toISOString(),
    sentAt: new Date().toISOString(),
    quoteNumber: quoteRow.quote_number,
    items: enrichedItems,
  });

  const blob = await generateQuotePdf(
    {
      ...quoteRow,
      customer_name: customerName,
      customer_phone: customerPhone,
    },
    enrichedItems,
    { mode: 'blob' },
  );

  const safeQuoteNum = String(quoteRow.quote_number || qid).replace(/[^a-zA-Z0-9#_-]/g, '_');
  const safeCust = (customerName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_') || 'Customer';
  const pdfFilename = `${safeCust}_Quote_${safeQuoteNum}.pdf`;

  let pdfBase64 = '';
  try {
    pdfBase64 = await blobToBase64(blob);
  } catch (readErr) {
    throw new Error(`PDF: ${readErr?.message || readErr}`);
  }
  if (!pdfBase64) throw new Error('PDF: empty quotation document');

  try {
    await sendFactoryOrderWhatsApp({
      message,
      pdfBase64,
      pdfFilename,
      route,
      quote_id: qid,
    });
  } catch (waErr) {
    throw new Error(`Factory group: ${waErr?.message || waErr}`);
  }

  return {
    ok: true,
    quote_id: qid,
    route,
    sent_to_production_at: new Date().toISOString(),
  };
}
