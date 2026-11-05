import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { notifyLaybyWhatsApp } from '../services/whatsappNotify';

const PENDING_QUOTE_WA_KEY = 'pendingQuoteWaLaybys';
const SENT_QUOTE_WA_KEY = 'sentQuoteWaLaybys';

function readIdSet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = JSON.parse(raw || '[]');
    return new Set((Array.isArray(parsed) ? parsed : []).map((id) => String(id)));
  } catch {
    return new Set();
  }
}

function writeIdSet(key, set) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}

function readPendingSet() {
  return readIdSet(PENDING_QUOTE_WA_KEY);
}

function writePendingSet(set) {
  writeIdSet(PENDING_QUOTE_WA_KEY, set);
}

export function markQuoteLaybyWhatsAppSent(laybyId) {
  if (laybyId == null || String(laybyId).trim() === '') return;
  const set = readIdSet(SENT_QUOTE_WA_KEY);
  set.add(String(laybyId));
  writeIdSet(SENT_QUOTE_WA_KEY, set);
}

export function wasQuoteLaybyWhatsAppSent(laybyId) {
  if (laybyId == null || String(laybyId).trim() === '') return false;
  return readIdSet(SENT_QUOTE_WA_KEY).has(String(laybyId));
}

export function shouldSendQuoteConvertOnPayment({ laybyId, fromQuote, hadPaymentsBefore } = {}) {
  if (!fromQuote || hadPaymentsBefore || wasQuoteLaybyWhatsAppSent(laybyId)) return false;
  return true;
}

export function markQuoteLaybyPendingWhatsApp(laybyId) {
  if (laybyId == null || String(laybyId).trim() === '') return;
  const set = readPendingSet();
  set.add(String(laybyId));
  writePendingSet(set);
}

export function clearQuoteLaybyPendingWhatsApp(laybyId) {
  if (laybyId == null || String(laybyId).trim() === '') return false;
  const set = readPendingSet();
  const had = set.delete(String(laybyId));
  writePendingSet(set);
  return had;
}

export function isQuoteLaybyPendingWhatsApp(laybyId) {
  if (laybyId == null || String(laybyId).trim() === '') return false;
  return readPendingSet().has(String(laybyId));
}

export async function saleHasPayments(saleId) {
  if (saleId == null || String(saleId).trim() === '') return false;
  try {
    const [{ data: salesPays }, { data: laybyPays }] = await Promise.all([
      fromPublic('sales_payments').select('id').eq('sale_id', saleId).limit(1),
      fromPublic('layby_payments').select('id').eq('sale_id', saleId).limit(1),
    ]);
    return Boolean((salesPays || []).length || (laybyPays || []).length);
  } catch {
    return false;
  }
}

export async function salesHavePayments(saleIds = []) {
  const ids = Array.from(new Set((saleIds || []).map((id) => String(id)).filter(Boolean)));
  if (!ids.length) return false;
  try {
    const [{ data: salesPays }, { data: laybyPays }] = await Promise.all([
      fromPublic('sales_payments').select('id').in('sale_id', ids).limit(1),
      fromPublic('layby_payments').select('id').in('sale_id', ids).limit(1),
    ]);
    return Boolean((salesPays || []).length || (laybyPays || []).length);
  } catch {
    return false;
  }
}

export async function isQuoteOriginLayby({ laybyId, saleId } = {}) {
  try {
    if (laybyId != null && String(laybyId).trim() !== '') {
      const { data: byLayby } = await db
        .from('quotations')
        .select('id')
        .eq('layby_id', laybyId)
        .limit(1);
      if (byLayby?.length) return true;
    }
    if (saleId != null && String(saleId).trim() !== '') {
      const { data: bySale } = await db
        .from('quotations')
        .select('id')
        .eq('sale_id', saleId)
        .limit(1);
      if (bySale?.length) return true;
    }
  } catch {}
  return false;
}

export function scheduleQuoteConvertWhatsAppIfStillPending({
  laybyId,
  customerId,
  saleId,
  delayMs = 4000,
} = {}) {
  if (!laybyId) return;
  markQuoteLaybyPendingWhatsApp(laybyId);
  window.setTimeout(async () => {
    if (!isQuoteLaybyPendingWhatsApp(laybyId)) return;
    if (await saleHasPayments(saleId)) {
      clearQuoteLaybyPendingWhatsApp(laybyId);
      return;
    }
    if (!isQuoteLaybyPendingWhatsApp(laybyId)) return;
    clearQuoteLaybyPendingWhatsApp(laybyId);
    markQuoteLaybyWhatsAppSent(laybyId);
    await notifyLaybyWhatsApp({
      laybyId,
      customerId,
      saleId,
      eventType: 'quote_convert',
    });
  }, delayMs);
}
