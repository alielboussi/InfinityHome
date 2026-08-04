import db from '../dataClient';
import { sendLaybyWhatsApp, sendSaleWhatsApp } from './whatsapp';
import { buildLaybyPdfUrlForWhatsApp, buildPosSalePdfUrlForWhatsApp } from './whatsappPdfs';
import { fetchLaybyStatement } from './laybyStatement';

async function loadCustomerInfo(customerId) {
  if (!customerId) return {};
  const { data } = await db
    .from('customers')
    .select('id, name, phone, address, city, tpin, currency')
    .eq('id', customerId)
    .maybeSingle();
  return data || {};
}

async function resolveCustomerLaybyId(laybyId, customerId) {
  if (laybyId) return laybyId;
  if (!customerId) return null;

  const { data: activeLayby } = await db
    .from('laybys')
    .select('id, status, updated_at, created_at')
    .eq('customer_id', customerId)
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeLayby?.id) return activeLayby.id;

  // A fully settled Fahme transaction can close the active row before the PDF
  // is generated. In that case use the customer's most recently updated account.
  const { data: latestLayby } = await db
    .from('laybys')
    .select('id, updated_at, created_at')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestLayby?.id || null;
}

async function buildFreshLaybySnapshot({ laybyId, customerId, laybySnapshot } = {}) {
  const resolvedCustomerId = customerId || laybySnapshot?.customer_id;
  if (!resolvedCustomerId) return laybySnapshot || null;

  const customerInfo = laybySnapshot?.customerInfo
    || laybySnapshot?.customer
    || await loadCustomerInfo(resolvedCustomerId);

  const { data: statementRes } = await fetchLaybyStatement(resolvedCustomerId);
  const statement = statementRes
    ? {
        sales: statementRes?.sales || [],
        items: statementRes?.items || [],
        payments: statementRes?.payments || [],
      }
    : (laybySnapshot?.statement || laybySnapshot?.fullStatement || null);

  return {
    ...(laybySnapshot || {}),
    id: laybyId || laybySnapshot?.id || laybySnapshot?.primaryLayby?.id,
    primaryLayby: laybySnapshot?.primaryLayby || laybySnapshot,
    customer_id: resolvedCustomerId,
    customerInfo,
    statement,
    fullStatement: statement,
  };
}

export async function notifyLaybyWhatsApp({
  laybyId,
  customerId,
  eventType,
  saleId,
  laybySnapshot,
  laybyClosed,
  editSummary,
} = {}) {
  try {
    const resolvedLaybyId = await resolveCustomerLaybyId(laybyId, customerId);
    if (!resolvedLaybyId) return { ok: false, error: 'No active layby account found for customer' };

    const freshSnapshot = await buildFreshLaybySnapshot({
      laybyId: resolvedLaybyId,
      customerId,
      laybySnapshot,
    });
    const pdf = await buildLaybyPdfUrlForWhatsApp({
      laybyId: resolvedLaybyId,
      customerId: freshSnapshot?.customer_id || customerId,
      laybySnapshot: freshSnapshot,
    });

    return sendLaybyWhatsApp({
      laybyId: resolvedLaybyId,
      eventType,
      saleId,
      pdfUrl: pdf?.url,
      pdfFilename: pdf?.filename,
      laybyClosed,
      editSummary,
    });
  } catch (e) {
    console.warn('Layby WhatsApp notify failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function notifySaleWhatsApp({ saleId } = {}) {
  if (saleId == null || String(saleId).trim() === '') {
    return { ok: false, error: 'Missing saleId' };
  }

  try {
    const pdf = await buildPosSalePdfUrlForWhatsApp({ saleId });
    return sendSaleWhatsApp({
      saleId,
      pdfUrl: pdf?.url,
      pdfFilename: pdf?.filename,
    });
  } catch (e) {
    console.warn('Sale WhatsApp notify failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
