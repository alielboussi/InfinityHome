// Client service to save sales edits via service-role API (bypasses RLS)

import supabase from '../supabase';

const isLocalHost = () => {
  try {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(h);
  } catch {
    return false;
  }
};

const toNumber = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

async function applySaleEditDirect(payload) {
  const saleId = payload?.saleId || payload?.sale_id || payload?.id;
  const sale = payload?.sale || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!saleId) throw new Error('Missing saleId');
  if (!sale?.customer_id) throw new Error('Missing customer_id');

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
  if (deleteErr) throw deleteErr;

  if (itemsPayload.length > 0) {
    const { error: insertErr } = await supabase.from('sales_items').insert(itemsPayload);
    if (insertErr) throw insertErr;
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

  const { data: existingSale, error: saleFetchErr } = await supabase
    .from('sales')
    .select('id, layby_id')
    .eq('id', saleId)
    .maybeSingle();
  if (saleFetchErr) throw saleFetchErr;

  const { error: saleErr } = await supabase
    .from('sales')
    .update(saleUpdates)
    .eq('id', saleId);
  if (saleErr) throw saleErr;

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
      if (laybyErr) throw laybyErr;
    } else {
      const { data: insertedLayby, error: insErr } = await supabase
        .from('laybys')
        .insert(laybyPayload)
        .select('id')
        .single();
      if (insErr) throw insErr;
      activeLaybyId = insertedLayby?.id || null;
    }

    if (activeLaybyId) {
      const { error: linkErr } = await supabase
        .from('sales')
        .update({ layby_id: activeLaybyId })
        .eq('id', saleId);
      if (linkErr) throw linkErr;
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
    if (laybyDoneErr) throw laybyDoneErr;
  }

  return { saleId, laybyId: activeLaybyId, total_amount: newTotal, itemsInserted: itemsPayload.length };
}

export async function saveSaleEdit(payload) {
  const localHost = isLocalHost();
  const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/, '');
  const apiUrl = localHost ? '/api/sales-edit' : (apiBase ? `${apiBase}/api/sales-edit` : '/api/sales-edit');
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  const shouldTryApi = forceApi || localHost || Boolean(apiBase) || process.env.NODE_ENV === 'production';

  if (shouldTryApi) {
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const text = await resp.text().catch(() => '');
      let json = {};
      if (text) {
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
      }
      if (resp.ok && json?.ok) return { data: json, error: null };

      const status = resp.status || 0;
      const message = json?.error || json?.message || json?.detail || json?.raw || text || `Sales edit API error (${status || 'network'})`;
      const canFallback = localHost && !forceApi && (status === 0 || status === 401 || status === 403 || status === 404 || status === 405);
      if (!canFallback) return { data: null, error: new Error(message) };
    } catch (err) {
      if (!localHost || forceApi) {
        const message = err?.message ? `Sales edit API request failed: ${err.message}` : 'Sales edit API request failed';
        return { data: null, error: new Error(message) };
      }
    }
  }

  try {
    const data = await applySaleEditDirect(payload);
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
