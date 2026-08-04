// Serverless API: quotation-read
// Server-side reads for quotation modules (Firebase Admin SDK).

import { getDataClient } from '../lib/getDataClient.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeLimit(raw, fallback = 200, max = 500) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

async function attachCustomerNames(db, quotes) {
  const rows = Array.isArray(quotes) ? quotes : [];
  const ids = Array.from(new Set(rows.map((q) => q?.customer_id).filter(Boolean).map((v) => String(v))));
  if (!ids.length) return rows;

  const nameById = {};
  try {
    const { data: qc } = await db.from('quote_customers').select('id, name').in('id', ids);
    (qc || []).forEach((c) => {
      if (c?.id && c?.name) nameById[String(c.id)] = c.name;
    });
  } catch {}

  const missing = ids.filter((id) => !nameById[id]);
  if (missing.length) {
    try {
      const { data: cust } = await db.from('customers').select('id, name').in('id', missing);
      (cust || []).forEach((c) => {
        if (c?.id && c?.name) nameById[String(c.id)] = c.name;
      });
    } catch {}
  }

  return rows.map((q) => ({
    ...q,
    customer_name: nameById[String(q.customer_id)] || null,
  }));
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const action = String(req.query?.action || '').trim().toLowerCase();
    if (!action) {
      res.status(400).json({ ok: false, error: 'Missing action' });
      return;
    }

    const db = getDataClient();

    if (action === 'list-quotes') {
      const limit = safeLimit(req.query?.limit, 200);
      const { data, error } = await db
        .from('quotations')
        .select('id, quote_number, customer_id, created_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = await attachCustomerNames(db, data || []);
      res.status(200).json({ ok: true, rows });
      return;
    }

    if (action === 'get-quote') {
      const quoteId = String(req.query?.id || '').trim();
      if (!quoteId) {
        res.status(400).json({ ok: false, error: 'Missing id' });
        return;
      }
      const [{ data: quote, error: quoteErr }, { data: items, error: itemsErr }] = await Promise.all([
        db.from('quotations').select('*').eq('id', quoteId).maybeSingle(),
        db.from('quotation_items').select('*').eq('quotation_id', quoteId).order('sort_order'),
      ]);
      if (quoteErr) throw quoteErr;
      if (itemsErr) throw itemsErr;
      if (!quote) {
        res.status(404).json({ ok: false, error: 'Quote not found' });
        return;
      }
      res.status(200).json({ ok: true, quote, items: items || [] });
      return;
    }

    if (action === 'list-products') {
      const limit = safeLimit(req.query?.limit, 200);
      const q = String(req.query?.q || '').trim();
      let query = db
        .from('quotation_products')
        .select('id, name, price, unit_id, description, active, image_url, qr_code_url')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (q) {
        const like = `%${q}%`;
        query = query.or(`name.ilike.${like},description.ilike.${like}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      res.status(200).json({ ok: true, rows: data || [] });
      return;
    }

    if (action === 'list-units') {
      const { data, error } = await db.from('quotation_units').select('*').order('name', { ascending: true });
      if (error) throw error;
      res.status(200).json({ ok: true, rows: data || [] });
      return;
    }

    if (action === 'list-customers') {
      const { data, error } = await db
        .from('quote_customers')
        .select('id, name, currency, phone, address, city, country, tpin, created_at')
        .order('name', { ascending: true });
      if (error) throw error;
      res.status(200).json({ ok: true, rows: data || [] });
      return;
    }

    res.status(404).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
