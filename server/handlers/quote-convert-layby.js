// Serverless API: quote-convert-layby
// Converts a quotation to a layby sale using the Supabase service role (bypasses RLS).

import { createClient } from '@supabase/supabase-js';
import { computeQuoteLaybyTotal } from '../../src/utils/quotationDisplay.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const isUuid = (value) => UUID_RE.test(String(value || '').trim());

function normalizeSaleActor(userUid) {
  if (userUid != null && isUuid(userUid)) {
    return { user_uid: String(userUid).trim(), user_id: null };
  }
  return { user_uid: null, user_id: null };
}

async function resolveTable(db, preferred, candidates = []) {
  const list = Array.from(new Set([preferred, ...candidates]));
  for (const name of list) {
    try {
      const { error } = await db.from(name).select('*', { head: true, count: 'estimated' });
      if (!error) return name;
      const msg = String(error?.message || error?.details || '');
      if (/relation .* does not exist|not found|404/i.test(msg)) continue;
    } catch (_) { /* try next */ }
  }
  return preferred;
}

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const error = new Error('Supabase service env not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE)');
    error.status = 500;
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

function getSupabaseAnonClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

async function getRequestUserUid(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const supabase = getSupabaseAnonClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return isUuid(data.user.id) ? data.user.id : null;
}

export default async function handler(req, res) {
  const sendError = (status, stage, err) => {
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(status).json(payload);
  };

  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Origin', '*');
      sendError(405, 'method', new Error('Method Not Allowed'));
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const quote = body.quote || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const quotationStatus = String(body.quotationStatus || 'converted').trim() || 'converted';

    if (!quote?.id) {
      sendError(400, 'validate', new Error('Quote id is required'));
      return;
    }
    if (!quote?.customer_id || !isUuid(quote.customer_id)) {
      sendError(400, 'validate', new Error('Quote customer is required'));
      return;
    }

    const currency = quote.currency || 'K';
    const nowIso = new Date().toISOString();
    const actor = normalizeSaleActor(await getRequestUserUid(req));
    const supabase = getSupabaseServiceClient();

    const saleItems = items.map((item) => ({
      product_id: item.product_id != null && isUuid(item.product_id) ? item.product_id : null,
      quantity: Math.max(1, toNumber(item.quantity) || 1),
      unit_price: toNumber(item.unit_price),
      currency: item.currency || currency,
      display_name: item.display_name || item.name_override || null,
    }));

    const subtotal = saleItems.reduce(
      (sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)),
      0,
    );
    const saleDiscount = Math.max(0, toNumber(quote.discount));
    const total = computeQuoteLaybyTotal({ quote, subtotal, discount: saleDiscount });

    const { data: laybyRow, error: laybyErr } = await supabase
      .from('laybys')
      .insert([
        {
          customer_id: quote.customer_id,
          total_amount: total,
          paid_amount: 0,
          status: 'active',
          origin: 'quote',
          notes: 'origin=quote',
          created_at: nowIso,
          updated_at: nowIso,
        },
      ])
      .select('id')
      .single();
    if (laybyErr) {
      sendError(500, 'layby_insert', laybyErr);
      return;
    }

    const salesTable = await resolveTable(supabase, 'sales', ['sale']);
    const salesItemsTable = await resolveTable(supabase, 'sales_items', ['sale_items', 'sales_item']);

    const salePayload = {
      customer_id: quote.customer_id,
      total_amount: total,
      currency,
      status: 'layby',
      sale_date: nowIso,
      layby_id: laybyRow.id,
      discount: saleDiscount,
      vat_apply: Boolean(quote?.vat_apply),
      vat_inclusive: Boolean(quote?.vat_apply) ? Boolean(quote?.vat_inclusive) : false,
      vat_rate: Boolean(quote?.vat_apply) ? Math.max(0, toNumber(quote?.vat_rate)) : 0,
      user_uid: actor.user_uid,
      user_id: actor.user_id,
      receipt_number: null,
    };

    const { data: saleRow, error: saleErr } = await supabase
      .from(salesTable)
      .insert(salePayload)
      .select('*')
      .single();

    if (saleErr) {
      try {
        await supabase.from('laybys').delete().eq('id', laybyRow.id);
      } catch {}
      sendError(500, 'sale_insert', saleErr);
      return;
    }

    if (saleItems.length > 0) {
      const mapped = saleItems.map((item) => ({
        sale_id: saleRow.id,
        product_id: item.product_id,
        display_name: item.display_name,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        currency: item.currency || currency,
        color: item.color ?? null,
      }));
      const { error: itemsErr } = await supabase.from(salesItemsTable).insert(mapped);
      if (itemsErr) {
        try {
          await supabase.from(salesTable).delete().eq('id', saleRow.id);
          await supabase.from('laybys').delete().eq('id', laybyRow.id);
        } catch {}
        sendError(500, 'items_insert', itemsErr);
        return;
      }
    }

    const { error: laybyLinkErr } = await supabase
      .from('laybys')
      .update({
        sale_id: saleRow.id,
        total_amount: total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', laybyRow.id);
    if (laybyLinkErr) {
      sendError(500, 'layby_link', laybyLinkErr);
      return;
    }

    let quoteUpdateErr = null;
    const quoteUpdateWithLayby = await supabase
      .from('quotations')
      .update({ status: quotationStatus, sale_id: saleRow.id, layby_id: laybyRow.id })
      .eq('id', quote.id);
    quoteUpdateErr = quoteUpdateWithLayby.error;
    if (quoteUpdateErr) {
      const quoteUpdateFallback = await supabase
        .from('quotations')
        .update({ status: quotationStatus, sale_id: saleRow.id })
        .eq('id', quote.id);
      quoteUpdateErr = quoteUpdateFallback.error;
    }
    if (quoteUpdateErr) {
      sendError(500, 'quotation_update', quoteUpdateErr);
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      ok: true,
      sale: saleRow,
      laybyId: laybyRow.id,
      itemsInserted: saleItems.length,
    });
  } catch (err) {
    sendError(err?.status || 500, 'unknown', err);
  }
}
