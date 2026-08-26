// Wrapper enforcing allocation_batch_uuid presence for new sales_payments inserts.
// Primary path: serverless API (/api/payments). Fallback: direct Firestore client insert in local dev.

import db from '../dataClient';
import { newUuid } from '../utils/uuid';

/**
 * Insert payments ensuring allocation_batch_uuid is always set.
 * If caller omits allocation_batch_uuid, we generate a new batch UUID for the group.
 * @param {Array<Object>} payments
 * @param {Object} [opts]
 * @param {boolean} [opts.requireProvided] if true, throw if any payment missing allocation_batch_uuid (future stricter phase)
 */
export async function insertSalesPayments(payments, opts = {}) {
  if (!Array.isArray(payments) || payments.length === 0) {
    return { error: new Error('No payments provided') };
  }
  // Basic client-side validation
  for (const p of payments) {
    const amt = Number(p.amount || 0);
    const disc = Number(p.discount_amount || 0);
    if (!p.sale_id || (!Number.isFinite(amt) && !Number.isFinite(disc))) {
      return { error: new Error('sale_id and amount or discount required') };
    }
    if (amt <= 0 && disc <= 0) {
      return { error: new Error('amount or discount required') };
    }
  }
  try {
    const resp = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payments }),
    });
    const text = await resp.text().catch(()=> '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: { count: json.count, batch: json.batch } };

    // Consider fallback when on localhost and API is unreachable/404/401
    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    const status = resp.status || 0;
    const canFallback = (status === 405) || (isLocal && (status === 0 || status === 401 || status === 403 || status === 404 || status === 503));
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to insert payments (${status})`) };
  } catch (e) {
    // Network error: try fallback only in localhost
    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    if (!isLocal) return { error: e };
  }
  // Fallback path: insert directly via data client (local dev only).
  try {
    const nowIso = new Date().toISOString();
    const allMissing = payments.every(p => !p.allocation_batch_uuid);
    const batch = allMissing ? newUuid() : null;
    const normalizeDate = (raw) => {
      if (!raw) return nowIso;
      const s = String(raw).trim();
      // If user only supplied YYYY-MM-DD convert to ISO at midnight UTC
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        try { return new Date(s + 'T00:00:00Z').toISOString(); } catch { return nowIso; }
      }
      // If already looks like YYYY-MM-DDTHH:MM treat as Date
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        try { return new Date(s).toISOString(); } catch { return nowIso; }
      }
      return nowIso; // fallback to now if format unknown
    };
    const mapped = payments.map(p => ({
      sale_id: p.sale_id,
      amount: Number(p.amount || 0),
      payment_type: p.payment_type || 'cash',
      currency: p.currency || null,
      payment_date: normalizeDate(p.payment_date),
      discount_amount: Number(p.discount_amount || 0),
      reference: (p.reference || '').trim() || null,
      notes: (p.notes || '').trim() || null,
      allocation_batch_uuid: p.allocation_batch_uuid || batch || newUuid(),
      created_at: p.created_at || nowIso,
    }));
    const { error } = await db.from('sales_payments').insert(mapped);
    if (error) return { error };
    return { data: { count: mapped.length, batch: batch || mapped[0]?.allocation_batch_uuid } };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Fetch sales_payments rows for a list of sale IDs.
 * Uses serverless API (/api/payments-list). Falls back to direct Firestore client on localhost.
 * @param {Array<number>} saleIds
 */
export async function fetchSalesPaymentsBySaleIds(saleIds = []) {
  const ids = Array.isArray(saleIds) ? saleIds.filter(v => v !== null && v !== undefined) : [];
  if (!ids.length) return { data: [] };
  try {
    const resp = await fetch('/api/payments-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleIds: ids }),
    });
    const text = await resp.text().catch(() => '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: json.rows || [] };

    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    const status = resp.status || 0;
    const canFallback = isLocal && (status === 0 || status === 401 || status === 403 || status === 404 || status === 503);
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to fetch payments (${status})`) };
  } catch (e) {
    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    if (!isLocal) return { error: e };
  }

  try {
    const { data, error } = await db
      .from('sales_payments')
      .select('id, sale_id, payment_type, amount, discount_amount, currency, payment_date, notes, reference, allocation_batch_uuid')
      .in('sale_id', ids)
      .order('payment_date', { ascending: true });
    if (error) return { error };
    return { data: data || [] };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Delete sales_payments rows by ids.
 * Uses serverless API (/api/payments-delete). Falls back to direct Firestore client on localhost.
 * @param {Array<string|number>} paymentIds
 */
export async function deleteSalesPayments(paymentIds = []) {
  const ids = Array.isArray(paymentIds) ? paymentIds.filter(v => v !== null && v !== undefined) : [];
  if (!ids.length) return { data: { count: 0 } };
  try {
    const resp = await fetch('/api/payments-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const text = await resp.text().catch(() => '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: { count: json.count || ids.length } };

    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    const status = resp.status || 0;
    const canFallback = isLocal && (status === 0 || status === 401 || status === 403 || status === 404 || status === 405 || status === 503);
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to delete payments (${status})`) };
  } catch (e) {
    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(hostname);
    if (!isLocal) return { error: e };
  }

  try {
    const { error } = await db
      .from('sales_payments')
      .delete()
      .in('id', ids);
    if (error) return { error };
    return { data: { count: ids.length } };
  } catch (err) {
    return { error: err };
  }
}
