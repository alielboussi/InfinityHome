// Consolidated payments and layby serverless API
// Legacy routes are preserved via vercel.json rewrites.

import { createClient } from '@supabase/supabase-js';
import { newUuid } from '../server/lib/uuid.js';
import { normalizeLaybyStatement } from '../src/utils/laybyStatementNormalize.js';

const ALLOWED_USER_ID = '1b5e098e-1206-447e-b4bc-6d009b85b5d3';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_METHOD = {
  payments: 'POST',
  'payments-list': 'POST',
  'payments-delete': 'POST',
  'layby-statement': 'POST',
  'layby-payments-delete': 'POST',
  'layby-delete-customer': 'POST',
  'quote-convert-layby': 'POST',
};

const ACTION_ALIAS = {
  create: 'payments',
  list: 'payments-list',
  delete: 'payments-delete',
};

function setCors(res, methods = 'POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
}

function getAction(req) {
  const raw = (req.query?.action || req.query?.a || req.body?.action || req.body?.a || '').toString().trim().toLowerCase();
  if (!raw) return 'payments';
  return ACTION_ALIAS[raw] || raw;
}

function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

function isNumericId(value) {
  const raw = String(value || '').trim();
  return raw !== '' && !Number.isNaN(Number(raw));
}

function sanitizePaymentNote(note) {
  const raw = String(note || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered.includes('auto-migrated') && lowered.includes('down_payment')) return '';
  if (lowered.includes('migrated from sales.down_payment')) return '';
  return raw;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const error = new Error('Supabase service env not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE)');
    error.status = 500;
    throw error;
  }
  return createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });
}

function sendDetailedError(res, status, stage, err) {
  const payload = {
    ok: false,
    stage,
    error: err?.message || String(err || 'Unknown error'),
    code: err?.code || null,
    details: err?.details || null,
    hint: err?.hint || null,
  };
  if (!payload.code) delete payload.code;
  if (!payload.details) delete payload.details;
  if (!payload.hint) delete payload.hint;
  setCors(res, 'POST, OPTIONS');
  res.status(status).json(payload);
}

async function handlePaymentsCreate(req, res) {
  const supabase = getSupabaseClient();
  const body = req.body || {};
  const payments = Array.isArray(body.payments) ? body.payments : [];
  if (!payments.length) {
    res.status(400).json({ ok: false, error: 'No payments provided' });
    return;
  }

  const nowIso = new Date().toISOString();
  const allMissing = payments.every((p) => !p.allocation_batch_uuid);
  const defaultBatch = allMissing ? newUuid() : null;

  const mapped = payments.map((p) => ({
    sale_id: p.sale_id,
    amount: Number(p.amount || 0),
    payment_type: p.payment_type || 'cash',
    currency: p.currency || null,
    payment_date: p.payment_date || nowIso,
    discount_amount: Number(p.discount_amount || 0),
    reference: (p.reference || '').trim() || null,
    notes: (p.notes || '').trim() || null,
    allocation_batch_uuid: p.allocation_batch_uuid || defaultBatch || newUuid(),
    created_at: p.created_at || nowIso,
  }));

  for (const row of mapped) {
    const amt = Number(row.amount || 0);
    const disc = Number(row.discount_amount || 0);
    if (!row.sale_id || (!Number.isFinite(amt) && !Number.isFinite(disc))) {
      res.status(400).json({ ok: false, error: 'Invalid payment row (sale_id and amount or discount required)' });
      return;
    }
    if (amt <= 0 && disc <= 0) {
      res.status(400).json({ ok: false, error: 'Invalid payment row (amount or discount required)' });
      return;
    }
  }

  const { error } = await supabase.from('sales_payments').insert(mapped);
  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  const batch = defaultBatch || (mapped[0] && mapped[0].allocation_batch_uuid) || null;
  res.status(200).json({ ok: true, count: mapped.length, batch });
}

async function handlePaymentsList(req, res) {
  const supabase = getSupabaseClient();
  const body = req.body || {};
  const saleIds = Array.isArray(body.saleIds) ? body.saleIds.filter((v) => v !== null && v !== undefined) : [];
  if (!saleIds.length) {
    res.status(400).json({ ok: false, error: 'saleIds is required' });
    return;
  }

  const { data, error } = await supabase
    .from('sales_payments')
    .select('id, sale_id, payment_type, amount, discount_amount, currency, payment_date, notes, reference, allocation_batch_uuid')
    .in('sale_id', saleIds)
    .order('payment_date', { ascending: true });
  if (error) {
    res.status(500).json({ ok: false, error: error.message || String(error) });
    return;
  }

  res.status(200).json({ ok: true, rows: data || [] });
}

async function handlePaymentsDelete(req, res) {
  const supabase = getSupabaseClient();
  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const cleanIds = ids.map((v) => String(v || '').trim()).filter((v) => v);

  if (!cleanIds.length) {
    res.status(200).json({ ok: true, count: 0 });
    return;
  }

  const { error } = await supabase
    .from('sales_payments')
    .delete()
    .in('id', cleanIds);
  if (error) {
    sendDetailedError(res, 500, 'delete', error);
    return;
  }

  res.status(200).json({ ok: true, count: cleanIds.length });
}

async function handleLaybyStatement(req, res) {
  const supabase = getSupabaseClient();
  const body = req.body || {};
  const customerId = body.customerId || body.customer_id;
  if (!customerId || !isUuid(customerId)) {
    res.status(400).json({ ok: false, error: 'customerId is required' });
    return;
  }

  const { data: laybyRows, error: laybyErr } = await supabase
    .from('laybys')
    .select('id, sale_id, status')
    .eq('customer_id', customerId);
  if (laybyErr) {
    res.status(500).json({ ok: false, error: laybyErr.message || String(laybyErr) });
    return;
  }

  const laybyIds = new Set((laybyRows || []).map((r) => String(r.id || '')).filter(Boolean));
  const laybySaleIds = new Set((laybyRows || []).map((r) => String(r.sale_id || '')).filter(Boolean));

  const { data: salesRows, error: salesErr } = await supabase
    .from('sales')
    .select('id, sale_date, currency, status, layby_id')
    .eq('customer_id', customerId);
  if (salesErr) {
    res.status(500).json({ ok: false, error: salesErr.message || String(salesErr) });
    return;
  }

  const laybySales = (salesRows || []).filter((sale) => {
    const saleId = String(sale.id || '');
    const laybyId = String(sale.layby_id || '');
    const status = String(sale.status || '').trim().toLowerCase();
    return status === 'layby' || laybyIds.has(laybyId) || laybySaleIds.has(saleId);
  });

  const saleIds = laybySales.map((sale) => sale.id).filter((v) => v != null);
  if (!saleIds.length) {
    res.status(200).json({ ok: true, sales: [], items: [], payments: [] });
    return;
  }

  const trySelect = async (view, columns) => {
    try {
      const { data, error } = await supabase.from(view).select(columns).in('sale_id', saleIds);
      if (error) return { ok: false, data: [] };
      return { ok: true, data: data || [] };
    } catch {
      return { ok: false, data: [] };
    }
  };

  let totalsRows = [];
  let totalsRes = await trySelect('v_sales_pdf_totals', 'sale_id, currency, total_due, paid_amount, outstanding_amount, subtotal_before_discount, discount_amount');
  if (totalsRes.ok) totalsRows = totalsRes.data;
  if (!totalsRows.length) {
    totalsRes = await trySelect('v_sales_financials', 'sale_id, currency, total_due, paid_amount, outstanding_amount, subtotal_before_discount, discount_amount');
    if (totalsRes.ok) totalsRows = totalsRes.data;
  }

  const totalsBySale = new Map();
  (totalsRows || []).forEach((row) => {
    totalsBySale.set(String(row.sale_id), {
      currency: row.currency || null,
      total_due: Number(row.total_due || 0),
      paid_amount: Number(row.paid_amount || 0),
      outstanding_amount: Number(row.outstanding_amount ?? Math.max(0, Number(row.total_due || 0) - Number(row.paid_amount || 0))),
      subtotal_before_discount: Number(row.subtotal_before_discount || 0),
      discount_amount: Number(row.discount_amount || 0),
    });
  });

  const fetchLaybyPayments = async () => {
    let data = null;
    let error = null;
    ({ data, error } = await supabase
      .from('layby_payments')
      .select('id, sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
      .in('sale_id', saleIds)
      .order('payment_date', { ascending: true }));

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('discount_amount')) {
        ({ data, error } = await supabase
          .from('layby_payments')
          .select('id, sale_id, amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
          .in('sale_id', saleIds)
          .order('payment_date', { ascending: true }));
        if (!error) {
          data = (data || []).map((row) => ({ ...row, discount_amount: 0 }));
        }
      }
    }

    return { data, error };
  };

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds),
    fetchLaybyPayments(),
  ]);

  const { data: quoteRows } = await supabase
    .from('quotations')
    .select('sale_id, total, discount, currency, status')
    .in('sale_id', saleIds)
    .in('status', ['converted', 'invoice']);

  if (itemsRes.error) {
    res.status(500).json({ ok: false, error: itemsRes.error.message || String(itemsRes.error) });
    return;
  }
  if (paymentsRes.error) {
    res.status(500).json({ ok: false, error: paymentsRes.error.message || String(paymentsRes.error) });
    return;
  }

  const quoteBySale = new Map();
  (quoteRows || []).forEach((quote) => {
    const saleId = String(quote?.sale_id || '').trim();
    const quoteTotal = Number(quote?.total || 0);
    if (!saleId || !(quoteTotal > 0)) return;
    quoteBySale.set(saleId, {
      total_due: quoteTotal,
      discount_amount: Number(quote?.discount || 0),
      currency: quote?.currency || null,
    });
  });

  const sales = laybySales.map((sale) => {
    const fin = totalsBySale.get(String(sale.id)) || {};
    const quoteFin = quoteBySale.get(String(sale.id));
    const shouldUseQuoteTotal = quoteFin && Math.abs(Number(fin.total_due || 0) - Number(quoteFin.total_due || 0)) > 0.009;
    const totalDue = shouldUseQuoteTotal ? Number(quoteFin.total_due || 0) : Number(fin.total_due || 0);
    const paidAmount = Number(fin.paid_amount || 0);
    const discountAmount = shouldUseQuoteTotal ? Number(quoteFin.discount_amount || 0) : Number(fin.discount_amount || 0);
    const subtotalBeforeDiscount = shouldUseQuoteTotal
      ? Math.max(Number(fin.subtotal_before_discount || 0), totalDue + discountAmount)
      : Number(fin.subtotal_before_discount || 0);

    return {
      sale_id: sale.id,
      sale_date: sale.sale_date,
      currency: sale.currency || quoteFin?.currency || fin.currency || null,
      layby_id: sale.layby_id || null,
      total_due: totalDue,
      paid_amount: paidAmount,
      outstanding_amount: Number(fin.outstanding_amount ?? Math.max(0, totalDue - paidAmount)),
      subtotal_before_discount: subtotalBeforeDiscount,
      discount_amount: discountAmount,
    };
  });

  const payments = (paymentsRes.data || []).map((payment) => ({
    ...payment,
    notes: sanitizePaymentNote(payment.notes),
    payment_type: String(payment.payment_type || '').toLowerCase(),
  }));

  res.status(200).json({ ok: true, ...normalizeLaybyStatement({ sales, items: itemsRes.data || [], payments }) });
}

async function handleLaybyDeleteCustomer(req, res) {
  const body = req.body || {};
  const userId = String(body.userId || '').toLowerCase();
  if (userId !== ALLOWED_USER_ID) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }

  const laybyIds = Array.isArray(body.laybyIds) ? body.laybyIds.filter((v) => v != null) : [];
  if (!laybyIds.length) {
    res.status(400).json({ ok: false, error: 'laybyIds is required' });
    return;
  }

  const laybyIdsUuid = laybyIds.filter(isUuid);
  const laybyIdsNumeric = laybyIds
    .filter(isNumericId)
    .map((v) => (typeof v === 'string' ? parseInt(v, 10) : v))
    .filter((v) => Number.isFinite(v));

  if (!laybyIdsUuid.length && !laybyIdsNumeric.length) {
    res.status(400).json({ ok: false, error: 'No valid layby ids provided' });
    return;
  }

  const supabase = getSupabaseClient();

  const detachSales = async (list) => {
    if (!list.length) return;
    const { error } = await supabase.from('sales').update({ layby_id: null }).in('layby_id', list);
    if (error) throw error;
  };

  const deleteLaybys = async (list) => {
    if (!list.length) return;
    const { error } = await supabase.from('laybys').delete().in('id', list);
    if (error) throw error;
  };

  await detachSales(laybyIdsUuid);
  await detachSales(laybyIdsNumeric);
  await deleteLaybys(laybyIdsUuid);
  await deleteLaybys(laybyIdsNumeric);

  res.status(200).json({ ok: true, deleted: laybyIds.length });
}

async function handleLaybyPaymentsDelete(req, res) {
  const supabase = getSupabaseClient();
  const body = req.body || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!rows.length) {
    res.status(200).json({ ok: true, count: 0 });
    return;
  }

  const laybyIds = rows
    .map((row) => String(row?.id || '').trim())
    .filter((value) => value && !value.startsWith('down-'));

  if (laybyIds.length) {
    const { error: laybyErr } = await supabase
      .from('layby_payments')
      .delete()
      .in('id', laybyIds);
    if (laybyErr) {
      sendDetailedError(res, 500, 'layby_delete', laybyErr);
      return;
    }
  }

  for (const row of rows) {
    const saleId = row?.sale_id ?? null;
    if (!saleId) continue;

    const batch = row?.allocation_batch_uuid || null;
    let query = supabase.from('sales_payments').delete().eq('sale_id', saleId);

    if (batch) {
      query = query.eq('allocation_batch_uuid', batch);
    } else {
      query = query
        .eq('amount', Number(row?.amount || 0))
        .eq('payment_type', row?.payment_type || 'cash')
        .eq('payment_date', row?.payment_date || null)
        .eq('reference', row?.reference || null)
        .eq('notes', row?.notes || null);
    }

    const { error: salesErr } = await query;
    if (salesErr) {
      sendDetailedError(res, 500, 'sales_delete', salesErr);
      return;
    }
  }

  res.status(200).json({ ok: true, count: laybyIds.length });
}

export default async function handler(req, res) {
  const action = getAction(req);
  const method = ACTION_METHOD[action];

  setCors(res, method ? `${method}, OPTIONS` : 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!method) {
    res.status(400).json({ ok: false, error: 'Unknown action' });
    return;
  }

  if (req.method !== method) {
    res.setHeader('Allow', `${method}, OPTIONS`);
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    switch (action) {
      case 'payments':
        await handlePaymentsCreate(req, res);
        break;
      case 'payments-list':
        await handlePaymentsList(req, res);
        break;
      case 'payments-delete':
        await handlePaymentsDelete(req, res);
        break;
      case 'layby-statement':
        await handleLaybyStatement(req, res);
        break;
      case 'layby-delete-customer':
        await handleLaybyDeleteCustomer(req, res);
        break;
      case 'layby-payments-delete':
        await handleLaybyPaymentsDelete(req, res);
        break;
      case 'quote-convert-layby': {
        const mod = await import('../server/handlers/quote-convert-layby.js');
        await mod.default(req, res);
        break;
      }
      default:
        res.status(400).json({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    if (action === 'payments-delete' || action === 'layby-payments-delete') {
      sendDetailedError(res, 500, 'unknown', err);
      return;
    }
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
