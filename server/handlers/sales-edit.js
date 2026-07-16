// Serverless API: sales-edit
// Replaces sales_items and updates sales/laybys using Supabase service role (bypasses RLS).

import { createClient } from '@supabase/supabase-js';

const toNumber = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Origin', '*');
      sendError(405, 'method', new Error('Method Not Allowed'));
      return;
    }

    const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      sendError(500, 'env', new Error('Supabase service env not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE)'));
      return;
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });

    const body = req.body || {};
    const saleId = body.saleId || body.sale_id || body.id;
    const sale = body.sale || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!saleId) {
      sendError(400, 'validate', new Error('Missing saleId'));
      return;
    }
    if (!sale?.customer_id) {
      sendError(400, 'validate', new Error('Missing customer_id'));
      return;
    }

    const { data: existingSale, error: saleFetchErr } = await supabase
      .from('sales')
      .select('id, layby_id')
      .eq('id', saleId)
      .maybeSingle();
    if (saleFetchErr) {
      sendError(500, 'sale_fetch', saleFetchErr);
      return;
    }
    if (!existingSale?.id) {
      sendError(404, 'sale_missing', new Error('Sale not found'));
      return;
    }

    const itemsPayload = items.map((line) => ({
      sale_id: saleId,
      product_id: line?.product_id ?? null,
      display_name: line?.display_name ?? null,
      quantity: toNumber(line?.quantity),
      unit_price: toNumber(line?.unit_price),
      currency: line?.currency || sale.currency || null,
      color: line?.color ?? null,
    }));

    const { error: deleteErr } = await supabase.from('sales_items').delete().eq('sale_id', saleId);
    if (deleteErr) {
      sendError(500, 'items_delete', deleteErr);
      return;
    }

    if (itemsPayload.length > 0) {
      const { error: insertErr } = await supabase.from('sales_items').insert(itemsPayload);
      if (insertErr) {
        sendError(500, 'items_insert', insertErr);
        return;
      }
    }

    const discount = toNumber(sale.discount);
    const subtotal = itemsPayload.reduce((sum, it) => sum + (toNumber(it.unit_price) * toNumber(it.quantity)), 0);
    const newTotal = Math.max(0, subtotal - discount);

    const saleUpdates = {
      sale_date: sale.sale_date || null,
      customer_id: sale.customer_id,
      status: sale.status,
      currency: sale.currency,
      total_amount: newTotal,
      discount,
    };

    const { error: saleErr } = await supabase
      .from('sales')
      .update(saleUpdates)
      .eq('id', saleId);
    if (saleErr) {
      sendError(500, 'sale_update', saleErr);
      return;
    }

    const incomingLaybyId = sale.layby_id || null;
    const existingLaybyId = existingSale?.layby_id || null;
    let activeLaybyId = incomingLaybyId || existingLaybyId || null;

    if (sale.status === 'layby') {
      const laybyPayload = {
        sale_id: saleId,
        customer_id: sale.customer_id,
        total_amount: toNumber(sale.layby_total_amount || newTotal),
        status: sale.layby_status || 'active',
        notes: sale.layby_notes || null,
      };

      if (activeLaybyId) {
        const { error: laybyErr } = await supabase
          .from('laybys')
          .update(laybyPayload)
          .eq('id', activeLaybyId);
        if (laybyErr) {
          sendError(500, 'layby_update', laybyErr);
          return;
        }
      } else {
        const { data: insertedLayby, error: insErr } = await supabase
          .from('laybys')
          .insert(laybyPayload)
          .select('id')
          .single();
        if (insErr) {
          sendError(500, 'layby_insert', insErr);
          return;
        }
        activeLaybyId = insertedLayby?.id || null;
      }

      if (activeLaybyId) {
        const { error: linkErr } = await supabase
          .from('sales')
          .update({ layby_id: activeLaybyId })
          .eq('id', saleId);
        if (linkErr) {
          sendError(500, 'sale_link', linkErr);
          return;
        }
      }
    } else if (activeLaybyId) {
      const { error: laybyDoneErr } = await supabase
        .from('laybys')
        .update({
          sale_id: saleId,
          customer_id: sale.customer_id,
          total_amount: toNumber(sale.layby_total_amount || newTotal),
          status: 'completed',
        })
        .eq('id', activeLaybyId);
      if (laybyDoneErr) {
        sendError(500, 'layby_complete', laybyDoneErr);
        return;
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      ok: true,
      saleId,
      laybyId: activeLaybyId,
      total_amount: newTotal,
      itemsInserted: itemsPayload.length,
    });
  } catch (err) {
    sendError(500, 'unknown', err);
  }
}
