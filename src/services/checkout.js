// Client service to call unified checkout API
// Falls back to direct Supabase writes in local dev (where /api routes are not served by CRA)

import supabase from '../supabase';
import { resolveSaleActor } from '../accessControl';
import { applySaleInventoryDeductionViaApi } from '../utils/inventoryApi';
import { newUuid } from '../utils/uuid';
import {
  assertReceiptNumberAvailable,
  isDuplicateReceiptError,
  RECEIPT_DUPLICATE_ERROR,
} from '../utils/receiptNumber';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

function normalizeCheckoutPayload(payload = {}) {
  const sale = { ...(payload.sale || {}) };
  const actor = resolveSaleActor({
    id: sale.user_uid ?? sale.user_id ?? null,
    user_uid: sale.user_uid,
    user_id: sale.user_id,
  });
  sale.user_uid = actor.user_uid;
  sale.user_id = actor.user_id;
  if (sale.location_id != null && !isUuid(sale.location_id)) {
    sale.location_id = null;
  }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
    ...item,
    product_id: item?.product_id != null && isUuid(item.product_id) ? item.product_id : null,
  }));
  return { ...payload, sale, items };
}

// Resolve table names at runtime to tolerate environments using singular names
// e.g., 'sales' vs 'sale', 'sales_items' vs 'sale_items', etc.
const tableCache = new Map();
async function resolveTable(db, preferred, candidates) {
  const key = `${preferred}|${(candidates||[]).join(',')}`;
  if (tableCache.has(key)) return tableCache.get(key);
  const list = Array.from(new Set([preferred, ...(candidates || [])]));
  for (const name of list) {
    try {
      // Use head select to probe existence without fetching rows
      const { error } = await db.from(name).select('*', { head: true, count: 'estimated' });
      if (!error) { tableCache.set(key, name); return name; }
      const msg = String(error?.message || error?.details || '');
      // If error is about relation not existing, continue; otherwise still try next
      if (/relation .* does not exist|not found|404/i.test(msg)) continue;
    } catch (_) { /* continue */ }
  }
  // Fallback to preferred even if not resolvable; downstream will error clearly
  tableCache.set(key, preferred);
  return preferred;
}

function buildInventoryUsage(items = []) {
  const usageMap = new Map();
  for (const item of items) {
    const productId = item?.product_id ?? null;
    if (!productId) continue;
    const quantity = Number(item?.quantity || 0);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    usageMap.set(productId, (usageMap.get(productId) || 0) + quantity);
  }
  return usageMap;
}

async function applyInventoryDeduction(db, { items = [], locationId, saleId, receiptNumber, userUid = null, userId = null }) {
  const usageMap = buildInventoryUsage(items);
  if (!locationId || usageMap.size === 0) return 0;

  let adjustedProducts = 0;
  for (const [productId, usedQty] of usageMap.entries()) {
    const nowIso = new Date().toISOString();
    const { data: invRows, error: invFetchErr } = await db
      .from('inventory')
      .select('id, quantity')
      .eq('product_id', productId)
      .eq('location', locationId);
    if (invFetchErr) throw invFetchErr;

    const rows = Array.isArray(invRows) ? invRows : [];
    const beforeQtyTotal = rows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
    const afterQtyTotal = beforeQtyTotal - Number(usedQty || 0);

    if (rows.length === 0) {
      const { error: insertErr } = await db
        .from('inventory')
        .insert([{ product_id: productId, location: locationId, quantity: afterQtyTotal, updated_at: nowIso }]);
      if (insertErr) throw insertErr;
    } else if (rows.length === 1) {
      const { error: updateErr } = await db
        .from('inventory')
        .update({ quantity: afterQtyTotal, updated_at: nowIso })
        .eq('id', rows[0].id);
      if (updateErr) throw updateErr;
    } else {
      const [firstRow, ...duplicateRows] = rows;
      const { error: updateErr } = await db
        .from('inventory')
        .update({ quantity: afterQtyTotal, updated_at: nowIso })
        .eq('id', firstRow.id);
      if (updateErr) throw updateErr;
      if (duplicateRows.length > 0) {
        const duplicateIds = duplicateRows.map((row) => row.id);
        const { error: zeroErr } = await db
          .from('inventory')
          .update({ quantity: 0, updated_at: nowIso })
          .in('id', duplicateIds);
        if (zeroErr) throw zeroErr;
      }
    }

    const auditId = newUuid();
    const { error: auditErr } = await db
      .from('inventory_adjustments')
      .insert({
        id: auditId,
        product_id: productId,
        location_id: locationId,
        quantity: -Number(usedQty || 0),
        adjustment_type: 'sale_deduction',
        adjusted_at: nowIso,
        metadata: {
          sale_id: saleId,
          receipt_number: receiptNumber || null,
          before_qty: beforeQtyTotal,
          after_qty: afterQtyTotal,
          deducted: Number(usedQty || 0),
          allow_negative: true,
          user_uid: userUid,
          user_id: userId,
        },
      });
    if (auditErr) throw auditErr;

    adjustedProducts += 1;
  }

  return adjustedProducts;
}

// Direct REST insert helper (explicit headers) as a last-resort fallback
async function restInsertPublic(table, row) {
  const base = (process.env.REACT_APP_SUPABASE_URL || '').replace(/\/?$/, '');
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
  if (!base || !key) throw new Error('Supabase env not configured');
  const url = `${base}/rest/v1/${encodeURIComponent(table)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify([row]),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(()=>'');
    const msg = text || `REST insert failed (${resp.status})`;
    throw new Error(msg);
  }
}

/**
 * Perform a full checkout in one call.
 * Tries serverless API first, then falls back to client-side Supabase writes
 * when the API is unavailable (404/Network in local dev).
 * @param {{ sale: object, items?: Array<object>, payments?: Array<object> }} payload
 * @returns {Promise<{ data: { ok: true, sale: object, storedReceiptNumber: string, itemsInserted: number, paymentsInserted: number, paymentsBatch?: string, inventoryApplied?: boolean }|null, error: Error|null }>}
 */
export async function checkout(payload) {
  const normalizedPayload = normalizeCheckoutPayload(payload || {});
  // 1) Attempt serverless API (Vercel) — available in production
  const isLocalHost = (() => {
    try {
      const h = typeof window !== 'undefined' ? window.location.hostname : '';
      return /^(localhost|127\.0\.0\.1)$/i.test(h);
    } catch { return false; }
  })();

  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/,'');
  // Prefer relative path in localhost so CRA proxy handles CORS; use absolute only when not on localhost
  const apiUrl = isLocalHost ? '/api/checkout' : (apiBase ? `${apiBase}/api/checkout` : '/api/checkout');
  const shouldTryApi = !isLocalHost || forceApi || Boolean(apiBase);
  if (shouldTryApi) {
    let isKnownApiBug = false;
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedPayload || {}),
      });
      const text = await resp.text().catch(() => '');
      let json = {};
      if (text) {
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
      }
      if (resp.ok && json?.ok) {
        return { data: json, error: null };
      }

      const status = resp.status || 0;
  const message = json?.error || json?.message || json?.detail || (typeof json === 'string' && json) || (typeof json?.raw === 'string' && json.raw) || text || `Checkout API error (${status || 'network'})`;
      try { console.error('[checkout] API responded with error', status, json); } catch {}

      isKnownApiBug = /randomUUID is not defined/i.test(String(message));
      const canFallback = isLocalHost && (
        isKnownApiBug
        || (!forceApi && (status === 0 || status === 401 || status === 403 || status === 404))
      );
      if (!canFallback) {
        return { data: null, error: new Error(message) };
      }
    } catch (err) {
      try { console.warn('[checkout] API request threw', err); } catch {}
      isKnownApiBug = /randomUUID is not defined/i.test(String(err?.message || ''));
      if (!isLocalHost || (forceApi && !isKnownApiBug)) {
        const message = err?.message ? `Checkout API request failed: ${err.message}` : 'Checkout API request failed';
        return { data: null, error: new Error(message) };
      }
    }
    // Log but do not block local development when fallback is allowed
    try {
      if (isKnownApiBug) {
        console.warn('[checkout] Remote API missing randomUUID import; using local Supabase fallback.');
      } else {
        console.warn('[checkout] API call failed; falling back to browser writes. Check dev proxy and REACT_APP_API_BASE.');
      }
    } catch {}
  }

  // 2) Fallback: perform the checkout steps directly using the browser Supabase client
  try {
    // Pin schema explicitly in case the environment/proxy drops the header
    const db = typeof supabase.schema === 'function' ? supabase.schema('public') : supabase;

    const body = normalizedPayload || {};
    const sale = body.sale || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const payments = Array.isArray(body.payments) ? body.payments : [];

    if (!sale || !sale.total_amount || !sale.customer_id) {
      return { data: null, error: new Error('Missing required fields: customer_id, total_amount') };
    }

    // Resolve table names (plural-first, then common singular variants)
    const salesTable = await resolveTable(db, 'sales', ['sale']);
    const salesItemsTable = await resolveTable(db, 'sales_items', ['sale_items', 'sales_item']);
    const salesPaymentsTable = await resolveTable(db, 'sales_payments', ['sale_payments', 'sales_payment']);

    // Reject duplicate receipt numbers (client-side fallback)
    const hasReceipt = typeof sale?.receipt_number === 'string' && sale.receipt_number.trim() !== '';
    const storedReceiptNumber = hasReceipt ? sale.receipt_number.trim() : null;
    if (hasReceipt) {
      try {
        await assertReceiptNumberAvailable(db, salesTable, storedReceiptNumber);
      } catch (dupErr) {
        return { data: null, error: dupErr };
      }
    }

    const payloadToInsert = hasReceipt
      ? { ...sale, receipt_number: storedReceiptNumber }
      : { ...sale, receipt_number: sale?.receipt_number || null };
    const resIns = await db.from(salesTable).insert(payloadToInsert).select('*').single();
    if (resIns.error) {
      const msg = String(resIns.error?.message || '');
      if (/null value in column\s+"id"\s+of relation\s+"sales"/i.test(msg)) {
        const hint = 'Checkout failed because public.sales.id does not auto-generate. Apply the SQL patch supabase/sql/patches/006_sales_id_identity.sql (adds identity/sequence-backed default).';
        return { data: null, error: new Error(`${msg}. ${hint}`) };
      }
      if (isDuplicateReceiptError(resIns.error)) {
        return { data: null, error: new Error(RECEIPT_DUPLICATE_ERROR) };
      }
      const m = String(resIns.error?.message || resIns.error || '').toLowerCase();
      if (/relation .* does not exist|not found|pgrst/i.test(m)) {
        return { data: null, error: new Error(`Checkout failed: table '${salesTable}' is not available via public schema for ${process.env.REACT_APP_SUPABASE_URL || 'Supabase URL'}. Verify your local .env REACT_APP_SUPABASE_URL/ANON_KEY point to the project that has public.sales and that 'public' is the active profile.`) };
      }
      return { data: null, error: new Error(resIns.error.message || String(resIns.error)) };
    }
    const saleRow = resIns.data;

    const saleId = saleRow?.id;

    // Insert items (JSON per-row to avoid CSV codepath dropping Content-Profile)
    let itemsInserted = 0;
    if (items && items.length > 0) {
      const mapped = items.map((it) => {
        return {
          sale_id: saleId,
          product_id: it.product_id ?? null,
          display_name: it.display_name ?? null,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          currency: it.currency || null,
          color: it.color ?? null,
        };
      });
      for (const row of mapped) {
        const { error } = await db.from(salesItemsTable).insert(row, { returning: 'minimal' });
        if (error) {
          const rawMsg = String(error?.message || error?.details || '');
          const msg = rawMsg.toLowerCase();
          if (/null value in column "id" of relation "sales_items"/i.test(rawMsg)) {
            return { data: null, error: new Error(`${rawMsg}. Remediation: apply supabase/sql/patches/007_sales_items_id_identity.sql to add sequence/identity default for public.sales_items.id.`) };
          }
          // If PostgREST reports Not Found (schema/profile mismatch), try direct REST with explicit headers
          if (/not\s*found|404|relation .* does not exist|pgrst/i.test(msg)) {
            try {
              await restInsertPublic(salesItemsTable, row);
              itemsInserted += 1; // success via REST
              continue;
            } catch (e) {
              return { data: null, error: new Error(`Insert into '${salesItemsTable}' failed (404). The table isn't exposed under Content-Profile 'public' or you're pointing to the wrong project. Details: ${e.message || e}`) };
            }
          }
          return { data: null, error: new Error(error.message || error.details || 'Insert sales_items failed') };
        }
        itemsInserted += 1;
      }
    }

    // Insert payments (JSON per-row to avoid CSV codepath dropping Content-Profile)
    let paymentsInserted = 0;
    if (payments && payments.length > 0) {
      const nowIso = new Date().toISOString();
      const batch = newUuid();
      const mapped = payments.map(p => ({
        sale_id: saleId,
        amount: Number(p.amount || 0),
        payment_type: p.payment_type || 'cash',
        currency: p.currency || null,
        payment_date: p.payment_date || nowIso,
        reference: (p.reference || '').trim() || null,
        allocation_batch_uuid: p.allocation_batch_uuid || batch,
        created_at: p.created_at || nowIso,
      }));
      for (const row of mapped) {
        const { error } = await db.from(salesPaymentsTable).insert(row, { returning: 'minimal' });
        if (error) {
          const msg = String(error?.message || error?.details || '').toLowerCase();
          if (/not\s*found|404|relation .* does not exist|pgrst/i.test(msg)) {
            try {
              await restInsertPublic(salesPaymentsTable, row);
              paymentsInserted += 1;
              continue;
            } catch (e) {
              return { data: null, error: new Error(`Insert into '${salesPaymentsTable}' failed (404). Details: ${e.message || e}`) };
            }
          }
          return { data: null, error: new Error(error.message || error.details || 'Insert sales_payments failed') };
        }
        paymentsInserted += 1;
      }
    }

    let inventoryApplied = false;
    if (saleId != null && sale?.location_id && items.length > 0) {
      try {
        await applySaleInventoryDeductionViaApi({
          items,
          locationId: sale.location_id,
          saleId,
          receiptNumber: storedReceiptNumber,
          userUid: sale?.user_uid || null,
          userId: sale?.user_id || null,
        });
        inventoryApplied = true;
      } catch (apiInvErr) {
        await applyInventoryDeduction(db, {
          items,
          locationId: sale.location_id,
          saleId,
          receiptNumber: storedReceiptNumber,
          userUid: sale?.user_uid || null,
          userId: sale?.user_id || null,
        });
        inventoryApplied = true;
      }
    }

    return { data: { ok: true, sale: saleRow, storedReceiptNumber, itemsInserted, paymentsInserted, inventoryApplied }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
