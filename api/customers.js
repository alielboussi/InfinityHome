// Unified Serverless API: customers
// - GET: list customers for dropdowns/pages
// - POST: create or update a customer with light de-duplication
// - POST action=statement: fetch customer statement rows
// - POST action=totals: fetch customer totals rollups
// Uses Firestore service client (server-side).

import { getDataClient } from '../server/lib/getDataClient.js';
import {
  aggregateCustomerTotals,
  buildFinancialsMap,
  computeSaleFinancials,
} from '../src/utils/saleFinancials.js';

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

function getServiceClient() {
  return getDataClient();
}

function resolveAction(req) {
  return String(req.query?.action || req.query?.a || req.body?.action || req.body?.a || '')
    .trim()
    .toLowerCase();
}

async function fetchFinancialsForSales(db, saleIds, salesRows = []) {
  if (!saleIds.length) return new Map();
  const [itemsRes, paymentsRes] = await Promise.all([
    db.from('sales_items').select('sale_id, product_id, display_name, quantity, unit_price, currency, color').in('sale_id', saleIds),
    db.from('sales_payments').select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes, currency').in('sale_id', saleIds),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  return buildFinancialsMap(salesRows, itemsRes.data || [], paymentsRes.data || []);
}

async function handleCustomerStatement(req, res, db) {
  const body = req.body || {};
  const customerId = body.customerId || body.customer_id;
  if (!customerId) {
    res.status(400).json({ ok: false, error: 'customerId is required' });
    return;
  }

  const { data: salesRows, error: salesErr } = await db
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

  const totalsBySale = await fetchFinancialsForSales(db, saleIds, salesRows || []);

  const [itemsRes, paymentsRes] = await Promise.all([
    db
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds),
    db
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
    const fin = totalsBySale.get(String(sale.id)) || computeSaleFinancials({ sale, items: [], payments: [] });
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

async function handleCustomerTotals(req, res, db) {
  const body = req.body || {};
  const customerIds = Array.isArray(body.customerIds) ? body.customerIds.filter(Boolean) : [];
  if (!customerIds.length) {
    res.status(400).json({ ok: false, error: 'customerIds is required' });
    return;
  }

  const { data: salesRows, error: salesErr } = await db
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

  const finMap = await fetchFinancialsForSales(db, saleIds, salesRows || []);

  const { data: payRows, error: payErr } = await db
    .from('sales_payments')
    .select('sale_id, amount, discount_amount, currency')
    .in('sale_id', saleIds);
  if (payErr) {
    res.status(500).json({ ok: false, error: payErr.message || String(payErr) });
    return;
  }

  const totals = aggregateCustomerTotals(salesRows || [], finMap, payRows || []);

  res.status(200).json({ ok: true, totals });
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const db = getServiceClient();
    const action = resolveAction(req);

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('customers')
        .select('id, name, phone, currency, opening_balance, credit_balance')
        .order('name', { ascending: true });
      if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
      res.status(200).json({ ok: true, rows: data || [] });
      return;
    }

    if (req.method === 'POST') {
      if (action === 'statement') {
        await handleCustomerStatement(req, res, db);
        return;
      }

      if (action === 'totals') {
        await handleCustomerTotals(req, res, db);
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
        const { data, error } = await db
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
            const { data: existingByPhone, error: phoneErr } = await db
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
                const { data, error } = await db.from('customers').update(update).eq('id', hit.id).select('*').single();
                if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
                customer = data;
              } else {
                customer = hit;
              }
            }
          }
        }
        if (!customer && payload.name) {
          const { data: existingByName, error: nameErr } = await db
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
              const { data, error } = await db.from('customers').update(update).eq('id', hit.id).select('*').single();
              if (error) { res.status(500).json({ ok: false, error: error.message }); return; }
              customer = data;
            } else {
              customer = hit;
            }
          }
        }
        if (!customer) {
          const { data, error } = await db.from('customers').insert([payload]).select('*').single();
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
