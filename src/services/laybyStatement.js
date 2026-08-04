import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { fetchCanonicalFinancials } from '../utils/financials';
import { normalizeLaybyStatement } from '../utils/laybyStatementNormalize';
import { fetchMergedLaybyPayments } from './laybyPayments';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

const sanitizePaymentNote = (note) => {
  const raw = String(note || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered.includes('auto-migrated') && lowered.includes('down_payment')) return '';
  if (lowered.includes('migrated from sales.down_payment')) return '';
  return raw;
};


export async function fetchLaybyStatement(customerId) {
  const rawId = String(customerId || '').trim();
  if (!rawId || rawId === 'undefined' || rawId === 'null' || !isUuid(rawId)) {
    return { error: new Error('customerId is required') };
  }
  try {
    const resp = await fetch('/api/layby-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: rawId }),
    });
    const text = await resp.text().catch(() => '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: json };

    const status = resp.status || 0;
    const canFallback = status === 405 || status === 404 || status === 401 || status === 403 || status === 0;
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to fetch layby statement (${status})`) };
  } catch (e) {
    // Continue to fallback
  }

  try {
    const { data: laybyRows, error: laybyErr } = await fromPublic('laybys')
      .select('id, sale_id, status')
      .eq('customer_id', customerId);
    if (laybyErr) return { error: laybyErr };
    const laybyIds = new Set((laybyRows || []).map(r => String(r.id || '')).filter(Boolean));
    const laybySaleIds = new Set((laybyRows || []).map(r => String(r.sale_id || '')).filter(Boolean));

    const { data: salesRows, error: salesErr } = await fromPublic('sales')
      .select('id, sale_date, currency, status, layby_id')
      .eq('customer_id', customerId);
    if (salesErr) return { error: salesErr };

    const laybySales = (salesRows || []).filter(s => {
      const saleId = String(s.id || '');
      const laybyId = String(s.layby_id || '');
      const status = String(s.status || '').trim().toLowerCase();
      return status === 'layby' || laybyIds.has(laybyId) || laybySaleIds.has(saleId);
    });

    const saleIds = laybySales.map(s => s.id).filter(v => v != null);
    if (!saleIds.length) return { data: { sales: [], items: [], payments: [] } };

    const finMap = await fetchCanonicalFinancials(db, saleIds);
    let quoteBySale = new Map();
    try {
      const { data: quoteRows } = await fromPublic('quotations')
        .select('sale_id, total, discount, currency, status')
        .in('sale_id', saleIds)
        .in('status', ['converted', 'invoice']);
      quoteBySale = new Map(
        (quoteRows || [])
          .map((quote) => {
            const saleId = String(quote?.sale_id || '').trim();
            const totalDue = Number(quote?.total || 0);
            if (!saleId || !(totalDue > 0)) return null;
            return [saleId, {
              total_due: totalDue,
              discount_amount: Number(quote?.discount || 0),
              currency: quote?.currency || null,
            }];
          })
          .filter(Boolean)
      );
    } catch {}

    const sales = laybySales.map(s => {
      const fin = finMap.get(String(s.id)) || {};
      const quoteFin = quoteBySale.get(String(s.id));
      const shouldUseQuoteTotal = quoteFin && Math.abs(Number(fin.total_due || 0) - Number(quoteFin.total_due || 0)) > 0.009;
      const totalDue = shouldUseQuoteTotal ? Number(quoteFin.total_due || 0) : Number(fin.total_due || 0);
      const paidAmount = Number(fin.paid_amount || 0);
      const discountAmount = shouldUseQuoteTotal ? Number(quoteFin.discount_amount || 0) : Number(fin.discount_amount || 0);
      const subtotalBeforeDiscount = shouldUseQuoteTotal
        ? Math.max(Number(fin.subtotal_before_discount || 0), totalDue + discountAmount)
        : Number(fin.subtotal_before_discount || 0);
      return {
        sale_id: s.id,
        sale_date: s.sale_date,
        currency: s.currency || quoteFin?.currency || fin.currency || null,
        layby_id: s.layby_id || null,
        total_due: totalDue,
        paid_amount: paidAmount,
        outstanding_amount: Number(fin.outstanding_amount || Math.max(0, totalDue - paidAmount)),
        subtotal_before_discount: subtotalBeforeDiscount,
        discount_amount: discountAmount,
      };
    });

    const { data: items, error: itemsErr } = await fromPublic('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds);
    if (itemsErr) return { error: itemsErr };

    const { data: payments, error: payErr } = await fetchMergedLaybyPayments({ customerId, saleIds });
    if (payErr) return { error: payErr };

    const allPayments = payments || [];

    const normalizedPayments = allPayments.map(p => ({
      ...p,
      notes: sanitizePaymentNote(p.notes),
      payment_type: String(p.payment_type || '').toLowerCase(),
    }));

    return { data: normalizeLaybyStatement({ sales, items: items || [], payments: normalizedPayments }) };
  } catch (err) {
    return { error: err };
  }
}
