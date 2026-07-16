import { fromPublic } from '../dbSchema';
import supabase from '../supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());
const isNumericId = (value) => {
  const raw = String(value || '').trim();
  return raw !== '' && !Number.isNaN(Number(raw));
};

const buildPaymentKey = (row) => {
  const saleId = String(row?.sale_id || '').trim();
  const date = String(row?.payment_date || '').trim();
  const amount = Number(row?.amount || 0);
  const discount = Number(row?.discount_amount || 0);
  const type = String(row?.payment_type || '').toLowerCase();
  const reference = String(row?.reference || '').trim();
  const notes = String(row?.notes || '').trim();
  const batch = String(row?.allocation_batch_uuid || '').trim();
  return `${saleId}|${date}|${amount}|${discount}|${type}|${reference}|${notes}|${batch}`;
};

const mapRows = (rows) => {
  const normalized = (rows || []).map(p => ({
    ...p,
    payment_type: String(p.payment_type || '').toLowerCase(),
  }));
  const seen = new Set();
  const deduped = [];
  normalized.forEach((row) => {
    const key = buildPaymentKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });
  return deduped;
};

export async function fetchLaybyPaymentsBySaleIds(saleIds = []) {
  const ids = Array.isArray(saleIds) ? saleIds.filter(v => v !== null && v !== undefined) : [];
  if (!ids.length) return { data: [] };
  try {
    let data = null;
    let error = null;
    ({ data, error } = await fromPublic('layby_payments')
      .select('id, sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid, created_at')
      .in('sale_id', ids)
      .order('payment_date', { ascending: true }));
    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('discount_amount')) {
        ({ data, error } = await fromPublic('layby_payments')
          .select('id, sale_id, amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid, created_at')
          .in('sale_id', ids)
          .order('payment_date', { ascending: true }));
        if (error) return { error };
        const patched = (data || []).map(row => ({ ...row, discount_amount: 0 }));
        return { data: mapRows(patched) };
      }
      return { error };
    }
    return { data: mapRows(data) };
  } catch (err) {
    return { error: err };
  }
}

export async function fetchLaybyPaymentsByCustomerId(customerId) {
  const id = String(customerId || '').trim();
  if (!id) return { data: [] };
  try {
    let data = null;
    let error = null;
    ({ data, error } = await fromPublic('layby_payments')
      .select('id, sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid, created_at')
      .eq('customer_id', id)
      .order('payment_date', { ascending: true }));
    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('discount_amount')) {
        ({ data, error } = await fromPublic('layby_payments')
          .select('id, sale_id, amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid, created_at')
          .eq('customer_id', id)
          .order('payment_date', { ascending: true }));
        if (error) return { error };
        const patched = (data || []).map(row => ({ ...row, discount_amount: 0 }));
        return { data: mapRows(patched) };
      }
      return { error };
    }
    return { data: mapRows(data) };
  } catch (err) {
    return { error: err };
  }
}

export async function insertLaybyPayments(rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { data: { count: 0 } };
  const nowIso = new Date().toISOString();
  const customerId = options.customerId || null;
  const mapped = list.map((p) => ({
    sale_id: p.sale_id,
    customer_id: p.customer_id || customerId,
    payment_type: p.payment_type || 'cash',
    amount: Number(p.amount || 0),
    discount_amount: Number(p.discount_amount || 0),
    currency: p.currency || null,
    payment_date: p.payment_date || nowIso,
    reference: (p.reference || '').trim(),
    notes: (p.notes || '').trim(),
    allocation_batch_uuid: p.allocation_batch_uuid || null,
    created_at: p.created_at || nowIso,
  }));

  try {
    const { data, error } = await fromPublic('layby_payments')
      .upsert(mapped, { onConflict: 'sale_id,payment_date,amount,reference,notes,payment_type' });
    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('discount_amount')) {
        const withoutDiscount = mapped.map(({ discount_amount, ...row }) => row);
        const retry = await fromPublic('layby_payments')
          .upsert(withoutDiscount, { onConflict: 'sale_id,payment_date,amount,reference,notes,payment_type' });
        if (retry.error) return { error: retry.error };
        return { data: { count: Array.isArray(retry.data) ? retry.data.length : withoutDiscount.length } };
      }
      return { error };
    }
    return { data: { count: Array.isArray(data) ? data.length : mapped.length } };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Delete layby_payments rows (and matching sales_payments) by row data.
 * Uses serverless API (/api/layby-payments-delete). Falls back to direct Supabase on localhost.
 * @param {Array<Object>} rows
 */
export async function deleteLaybyPayments(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { data: { count: 0 } };
  try {
    const resp = await fetch('/api/layby-payments-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: list }),
    });
    const text = await resp.text().catch(() => '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: { count: json.count || list.length } };

    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    const status = resp.status || 0;
    const canFallback = isLocal && (status === 0 || status === 401 || status === 403 || status === 404 || status === 405);
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to delete layby payments (${status})`) };
  } catch (e) {
    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    if (!isLocal) return { error: e };
  }

  try {
    const ids = list
      .map(r => r?.id)
      .filter(v => v != null)
      .map(v => String(v).trim())
      .filter(v => v && (isUuid(v) || isNumericId(v)));

    let detailRows = list;
    if (ids.length) {
      const { data: laybyRows, error: laybyReadErr } = await fromPublic('layby_payments')
        .select('id, sale_id, amount, payment_type, payment_date, reference, notes, allocation_batch_uuid')
        .in('id', ids);
      if (laybyReadErr) return { error: laybyReadErr };
      detailRows = (laybyRows || []).length ? laybyRows : list;
    }

    if (ids.length) {
      const { error: laybyErr } = await fromPublic('layby_payments').delete().in('id', ids);
      if (laybyErr) return { error: laybyErr };
    }

    for (const row of detailRows) {
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
      if (salesErr) return { error: salesErr };
    }
    return { data: { count: list.length } };
  } catch (err) {
    return { error: err };
  }
}
