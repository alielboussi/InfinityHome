// Unified Serverless API: customers
// - GET: list customers for dropdowns/pages
// - POST: create or update a customer with light de-duplication
// - POST action=statement: fetch customer statement rows
// - POST action=totals: fetch customer totals rollups
// Uses Supabase service role; bypasses RLS

import { createClient } from '@supabase/supabase-js';

function normalizePhone(phone) {
  const raw = (phone || '').toString();
  return raw.replace(/\D/g, ''); // digits-only
}

function canonName(name) {
  return (name || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const error = new Error('Supabase service env not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE)');
    error.status = 500;
    throw error;
  }
  return createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });
}

function resolveAction(req) {
  return String(req.query?.action || req.query?.a || req.body?.action || req.body?.a || '')
    .trim()
    .toLowerCase();
}

async function trySelectBySaleIds(supabase, saleIds, view, columns) {
  try {
    const { data, error } = await supabase
      .from(view)
      .select(columns)
      .in('sale_id', saleIds);
    if (error) return { ok: false, data: [] };
    return { ok: true, data: data || [] };
  } catch {
    return { ok: false, data: [] };
  }
}

async function handleCustomerStatement(req, res, supabase) {
  const body = req.body || {};
  const customerId = body.customerId || body.customer_id;
  if (!customerId) {
    res.status(400).json({ ok: false, error: 'customerId is required' });
    return;
  }

  const { data: salesRows, error: salesErr } = await supabase
    .from('sales')
    .select('id, sale_date, currency')
    .eq('customer_id', customerId);
  if (salesErr) {
    res.status(500).json({ ok: false, error: salesErr.message || String(salesErr) });
    return;
  }

  const saleIds = (salesRows || []).map((sale) => sale.id).filter((value) => value != null);
  if (!saleIds.length) {
    res.status(200).json({ ok: true, sales: [], items: [], payments: [] });
    return;
  }

  let totalsRows = [];
  let totalsRes = await trySelectBySaleIds(
    supabase,
    saleIds,
    'v_sales_pdf_totals',
    'sale_id, currency, total_due, paid_amount, outstanding_amount, subtotal_before_discount, discount_amount'
  );
  if (totalsRes.ok) totalsRows = totalsRes.data;
  if (!totalsRows.length) {
    totalsRes = await trySelectBySaleIds(
      supabase,
      saleIds,
      'v_sales_financials',
      'sale_id, currency, total_due, paid_amount, outstanding_amount, subtotal_before_discount, discount_amount'
    );
    if (totalsRes.ok) totalsRows = totalsRes.data;
  }

  const totalsBySale = new Map();
  (totalsRows || []).forEach((row) => {
    totalsBySale.set(String(row.sale_id), {
      currency: row.currency || null,
      total_due: Number(row.total_due || 0),
      paid_amount: Number(row.paid_amount || 0),
      outstanding_amount: Number(
        row.outstanding_amount ?? Math.max(0, Number(row.total_due || 0) - Number(row.paid_amount || 0))
      ),
      subtotal_before_discount: Number(row.subtotal_before_discount || 0),
      discount_amount: Number(row.discount_amount || 0),
    });
  });

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds),
    supabase
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
      .in('sale_id', saleIds)
      .order('payment_date', { ascending: true }),
  ]);

  if (itemsRes.error) {
    res.status(500).json({ ok: false, error: itemsRes.error.message || String(itemsRes.error) });
    return;
  }
  if (paymentsRes.error) {
    res.status(500).json({ ok: false, error: paymentsRes.error.message || String(paymentsRes.error) });
    return;
  }

  const sales = (salesRows || []).map((sale) => {
    const fin = totalsBySale.get(String(sale.id)) || {};
    return {
      sale_id: sale.id,
      sale_date: sale.sale_date,
      currency: sale.currency || fin.currency || null,
      total_due: Number(fin.total_due || 0),
      paid_amount: Number(fin.paid_amount || 0),
      outstanding_amount: Number(fin.outstanding_amount ?? Math.max(0, Number(fin.total_due || 0) - Number(fin.paid_amount || 0))),
      subtotal_before_discount: Number(fin.subtotal_before_discount || 0),
      discount_amount: Number(fin.discount_amount || 0),
    };
  });

  res.status(200).json({ ok: true, sales, items: itemsRes.data || [], payments: paymentsRes.data || [] });
}

async function handleCustomerTotals(req, res, supabase) {
  const body = req.body || {};
  const customerIds = Array.isArray(body.customerIds) ? body.customerIds.filter(Boolean) : [];
  if (!customerIds.length) {
    res.status(400).json({ ok: false, error: 'customerIds is required' });
    return;
  }

  const { data: salesRows, error: salesErr } = await supabase
    .from('sales')
    .select('id, customer_id, currency, total_amount, discount')
    .in('customer_id', customerIds);
  if (salesErr) {
    res.status(500).json({ ok: false, error: salesErr.message || String(salesErr) });
    return;
  }

  const saleIds = (salesRows || []).map((sale) => sale.id).filter((value) => value != null);
  if (!saleIds.length) {
    res.status(200).json({ ok: true, totals: {} });
    return;
  }

  let totalsRows = [];
  let totalsRes = await trySelectBySaleIds(
    supabase,
    saleIds,
    'v_sales_pdf_totals',
    'sale_id, currency, subtotal_before_discount, discount_amount, total_due, paid_amount, outstanding_amount'
  );
  if (totalsRes.ok) totalsRows = totalsRes.data;
  if (!totalsRows.length) {
    totalsRes = await trySelectBySaleIds(
      supabase,
      saleIds,
      'v_sales_financials',
      'sale_id, currency, subtotal_before_discount, discount_amount, total_due, paid_amount, outstanding_amount'
    );
    if (totalsRes.ok) totalsRows = totalsRes.data;
  }

  const saleMetaById = new Map();
  (salesRows || []).forEach((sale) => {
    saleMetaById.set(String(sale.id), {
      currency: sale.currency || null,
      total_amount: Number(sale.total_amount || 0),
      sale_discount: Number(sale.discount || 0),
      customer_id: sale.customer_id || null,
    });
  });

  (totalsRows || []).forEach((row) => {
    const key = String(row.sale_id);
    const prev = saleMetaById.get(key) || {};
    saleMetaById.set(key, {
      ...prev,
      currency: row.currency || prev.currency || null,
      subtotal_before_discount: Number(row.subtotal_before_discount || 0),
      sale_discount: Number(row.discount_amount || prev.sale_discount || 0),
      total_due: Number(row.total_due || 0),
    });
  });

  const { data: payRows, error: payErr } = await supabase
    .from('sales_payments')
    .select('sale_id, amount, discount_amount, currency')
    .in('sale_id', saleIds);
  if (payErr) {
    res.status(500).json({ ok: false, error: payErr.message || String(payErr) });
    return;
  }

  const paymentsByCustomerCurrency = new Map();
  (payRows || []).forEach((payment) => {
    const saleMeta = saleMetaById.get(String(payment.sale_id)) || {};
    const customerId = saleMeta.customer_id || null;
    if (!customerId) return;
    const currencyRaw = payment.currency || saleMeta.currency || 'K';
    const code = currencyRaw === '$' || currencyRaw === 'USD' ? 'USD' : 'K';
    const key = `${customerId}|${code}`;
    const prev = paymentsByCustomerCurrency.get(key) || { paid: 0, discount: 0 };
    prev.paid += Number(payment.amount || 0);
    prev.discount += Number(payment.discount_amount || 0);
    paymentsByCustomerCurrency.set(key, prev);
  });

  const totals = {};
  (salesRows || []).forEach((sale) => {
    const customerId = String(sale.customer_id || '');
    if (!customerId) return;
    const fin = saleMetaById.get(String(sale.id)) || {};
    const currencyRaw = fin.currency || sale.currency || 'K';
    const code = currencyRaw === '$' || currencyRaw === 'USD' ? 'USD' : 'K';

    if (!totals[customerId]) totals[customerId] = {};
    if (!totals[customerId][code]) {
      totals[customerId][code] = { total: 0, paid: 0, discount: 0, outstanding: 0, _saleDiscount: 0 };
    }

    const subtotal = Number(fin.subtotal_before_discount || 0);
    const saleDiscount = Number(fin.sale_discount || 0);
    const netTotal = subtotal > 0 ? subtotal : Math.max(0, Number(fin.total_amount || 0) + saleDiscount);
    totals[customerId][code].total += netTotal;
    totals[customerId][code]._saleDiscount += saleDiscount;
  });

  Object.keys(totals).forEach((customerId) => {
    Object.keys(totals[customerId]).forEach((code) => {
      const agg = totals[customerId][code];
      const payKey = `${customerId}|${code}`;
      const payAgg = paymentsByCustomerCurrency.get(payKey) || { paid: 0, discount: 0 };
      const saleDiscount = Number(agg._saleDiscount || 0);
      const paid = Number(payAgg.paid || 0);
      const payDiscount = Number(payAgg.discount || 0);
      const totalDiscount = saleDiscount + payDiscount;
      const outstanding = Math.max(0, Number(agg.total || 0) - saleDiscount - paid - payDiscount);

      totals[customerId][code] = {
        total: Number(agg.total || 0),
        paid,
        discount: totalDiscount,
        outstanding,
      };
    });
  });

  res.status(200).json({ ok: true, totals });
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const supabase = getSupabaseServiceClient();
    const action = resolveAction(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, currency, opening_balance, credit_balance')
        .order('name', { ascending: true });
      if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
      res.status(200).json({ ok: true, rows: data || [] });
      return;
    }

    if (req.method === 'POST') {
      if (action === 'statement') {
        await handleCustomerStatement(req, res, supabase);
        return;
      }

      if (action === 'totals') {
        await handleCustomerTotals(req, res, supabase);
        return;
      }

      const body = req.body || {};
      const id = body.id || null;
      const payload = {
        name: (body.name || '').toString().trim(),
        phone: (body.phone || '').toString().trim() || null,
        country: (body.country || '').toString().trim() || null,
        address: (body.address || '').toString().trim() || null,
        city: (body.city || '').toString().trim() || null,
        tpin: (body.tpin || '').toString().trim() || null,
        currency: (body.currency || '').toString().trim() || 'K',
      };

      if (!id && !payload.name && !payload.phone) {
        res.status(400).json({ ok: false, error: 'At least name or phone is required.' });
        return;
      }

      let created = false;
      let customer = null;

      if (id) {
        const { data, error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', id)
          .select('*')
          .single();
        if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
        customer = data;
      } else {
        // Try dedupe by phone then by name
        if (payload.phone) {
          const phoneDigits = normalizePhone(payload.phone);
          if (phoneDigits) {
            const { data: existingByPhone, error: phoneErr } = await supabase
              .from('customers')
              .select('*')
              .order('created_at', { ascending: true });
            if (phoneErr) { res.status(500).json({ ok: false, error: phoneErr.message }); return; }
            const hit = (existingByPhone || []).find(r => normalizePhone(r.phone) === phoneDigits);
            if (hit) {
              const update = {};
              for (const k of ['name','phone','country','address','city','tpin','currency']) {
                const v = payload[k]; if (v && String(hit[k] || '') !== String(v)) update[k] = v;
              }
              if (Object.keys(update).length > 0) {
                const { data, error } = await supabase.from('customers').update(update).eq('id', hit.id).select('*').single();
                if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
                customer = data;
              } else {
                customer = hit;
              }
            }
          }
        }
        if (!customer && payload.name) {
          const { data: existingByName, error: nameErr } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: true });
          if (nameErr) { res.status(500).json({ ok: false, error: nameErr.message }); return; }
          const nameKey = canonName(payload.name);
          const hit = (existingByName || []).find(r => canonName(r.name) === nameKey);
          if (hit) {
            const update = {};
            for (const k of ['name','phone','country','address','city','tpin','currency']) {
              const v = payload[k]; if (v && String(hit[k] || '') !== String(v)) update[k] = v;
            }
            if (Object.keys(update).length > 0) {
              const { data, error } = await supabase.from('customers').update(update).eq('id', hit.id).select('*').single();
              if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
              customer = data;
            } else {
              customer = hit;
            }
          }
        }
        if (!customer) {
          const { data, error } = await supabase.from('customers').insert([payload]).select('*').single();
          if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
          customer = data; created = true;
        }
      }

      res.status(200).json({ ok: true, customer, created });
      return;
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
