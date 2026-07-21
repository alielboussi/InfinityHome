// Unified Serverless API: checkout
// Performs sale header insert (rejects duplicate receipt numbers), batch insert of sales_items, and payments insert.
// Method: POST
// Body: {
//   sale: { customer_id, sale_date, total_amount, status, updated_at, location_id, layby_id, currency, discount, receipt_number },
//   items?: [{ sale_id (ignored), product_id, display_name?, quantity, unit_price, currency, color }],
//   payments?: [{ sale_id (ignored), amount, payment_type, currency, payment_date?, reference?, allocation_batch_uuid? }]
// }
// Response: { ok: true, sale, storedReceiptNumber, itemsInserted: number, paymentsInserted: number, paymentsBatch?: string }

import { createClient } from '@supabase/supabase-js';
import { newUuid } from '../server/lib/uuid.js';
import { applyInventoryDeduction } from '../server/lib/inventoryDeduction.js';
import {
  assertReceiptNumberAvailable,
  isDuplicateReceiptError,
  RECEIPT_DUPLICATE_ERROR,
} from '../src/utils/receiptNumber.js';

const ATOMIC_CHECKOUT_RPC = 'pos_finalize_checkout_atomic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

function normalizeSaleActor(sale = {}) {
  const next = { ...sale };
  if (next.user_uid != null && !isUuid(next.user_uid)) {
    const legacy = Number(next.user_uid);
    if (Number.isFinite(legacy) && legacy > 0 && next.user_id == null) {
      next.user_id = legacy;
    }
    next.user_uid = null;
  }
  if (next.location_id != null && !isUuid(next.location_id)) {
    next.location_id = null;
  }
  if (next.customer_id != null && !isUuid(next.customer_id)) {
    throw new Error('customer_id must be a UUID');
  }
  if (next.layby_id != null && !isUuid(next.layby_id)) {
    next.layby_id = null;
  }
  return next;
}

// Resolve a table name from preferred and candidate variants by probing existence
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
  return preferred; // fallback; downstream will return clear error if truly missing
}

function isAtomicCheckoutUnavailable(error) {
  const message = String(error?.message || error?.details || error || '');
  const code = String(error?.code || '');
  return /pos_finalize_checkout_atomic|PGRST202|42883|does not exist|Could not find the function/i.test(message)
    || (code === '42804' && /uuid|text/i.test(message));
}

async function tryAtomicCheckout(supabase, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const sale = payload?.sale || {};
  if (items.length === 0 || !sale?.location_id) {
    return { supported: false, data: null, error: null };
  }

  const { data, error } = await supabase.rpc(ATOMIC_CHECKOUT_RPC, {
    p_payload: {
      sale,
      items,
      payments: Array.isArray(payload?.payments) ? payload.payments : [],
      allow_negative: true,
      clamp_to_zero: false,
    },
  });

  if (error) {
    if (isAtomicCheckoutUnavailable(error)) {
      return { supported: false, data: null, error: null };
    }
    return { supported: true, data: null, error };
  }

  return { supported: true, data, error: null };
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
  const sale = normalizeSaleActor(body.sale || {});
  const items = Array.isArray(body.items) ? body.items : [];
  const payments = Array.isArray(body.payments) ? body.payments : [];
    if (!sale || !sale.total_amount || !sale.customer_id) {
      sendError(400, 'validate', new Error('Missing required fields: customer_id, total_amount'));
      return;
    }

  // Resolve table names (supports environments that used singular names)
  const salesTable = await resolveTable(supabase, 'sales', ['sale']);
  const salesItemsTable = await resolveTable(supabase, 'sales_items', ['sale_items', 'sales_item']);
  const salesPaymentsTable = await resolveTable(supabase, 'sales_payments', ['sale_payments', 'sales_payment']);
  const tableDebug = { salesTable, salesItemsTable, salesPaymentsTable };

  // 1) Create sale header; reject duplicate receipt numbers
    const hasReceipt = typeof sale?.receipt_number === 'string' && sale.receipt_number.trim() !== '';
    const storedReceiptNumber = hasReceipt ? sale.receipt_number.trim() : null;
    if (hasReceipt) {
      try {
        await assertReceiptNumberAvailable(supabase, salesTable, storedReceiptNumber);
      } catch (dupErr) {
        sendError(409, 'receipt', dupErr);
        return;
      }
    }

    const salePayload = hasReceipt
      ? { ...sale, receipt_number: storedReceiptNumber }
      : { ...sale, receipt_number: sale?.receipt_number || null };

    const atomicResult = await tryAtomicCheckout(supabase, {
      sale: salePayload,
      items,
      payments,
    });

    if (atomicResult.supported) {
      if (atomicResult.error) {
        if (isDuplicateReceiptError(atomicResult.error)) {
          sendError(409, 'receipt', new Error(RECEIPT_DUPLICATE_ERROR));
          return;
        }
        sendError(500, 'atomic_checkout', atomicResult.error);
        return;
      }

      const atomicData = atomicResult.data || {};
      const atomicSaleId = atomicData?.sale_id ?? atomicData?.saleId ?? null;
      let saleRow = null;
      if (atomicSaleId != null) {
        const { data: fetchedSale } = await supabase.from(salesTable).select('*').eq('id', atomicSaleId).maybeSingle();
        saleRow = fetchedSale || null;
      }

      const storedReceiptNumber = atomicData?.receipt_number || atomicData?.receiptNumber || salePayload.receipt_number || null;
      let inventoryApplied = atomicData?.inventory_applied === true || atomicData?.inventoryApplied === true;
      if (!inventoryApplied && atomicSaleId != null && salePayload?.location_id && items.length > 0) {
        await applyInventoryDeduction(supabase, {
          items,
          locationId: salePayload.location_id,
          saleId: atomicSaleId,
          receiptNumber: storedReceiptNumber,
          userUid: salePayload?.user_uid || null,
          userId: salePayload?.user_id || null,
        });
        inventoryApplied = true;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json({
        ok: true,
        sale: saleRow || { id: atomicSaleId, ...salePayload },
        storedReceiptNumber,
        itemsInserted: Number(atomicData?.items_inserted ?? atomicData?.itemsInserted ?? items.length),
        paymentsInserted: Number(atomicData?.payments_inserted ?? atomicData?.paymentsInserted ?? payments.length),
        paymentsBatch: atomicData?.payments_batch || atomicData?.paymentsBatch || null,
        inventoryApplied,
        tableDebug: { ...tableDebug, usedAtomicCheckout: true, atomicCheckoutRpc: ATOMIC_CHECKOUT_RPC },
      });
      return;
    }

    const payload = hasReceipt
      ? { ...sale, receipt_number: storedReceiptNumber }
      : { ...sale, receipt_number: sale?.receipt_number || null };
    const resIns = await supabase.from(salesTable).insert(payload).select('*').single();
    if (resIns.error) {
      const msg = String(resIns.error?.message || '');
      if (/null value in column\s+"id"\s+of relation\s+"sales"/i.test(msg)) {
        sendError(500, 'sales', new Error(`${msg}. Remediation: run supabase/sql/patches/006_sales_id_identity.sql to add identity/default for public.sales.id.`));
        return;
      }
      if (isDuplicateReceiptError(resIns.error)) {
        sendError(409, 'receipt', new Error(RECEIPT_DUPLICATE_ERROR));
        return;
      }
      sendError(500, 'sales', resIns.error);
      return;
    }
    const saleRow = resIns.data;

    const saleId = saleRow?.id;
    const saleCurrency = saleRow?.currency || sale?.currency || null;

    // 2) Insert items (if provided)
    let itemsInserted = 0;
    if (items && items.length > 0) {
      const mapped = items.map((it) => {
        return {
          sale_id: saleId,
          product_id: it.product_id ?? null,
          display_name: it.display_name ?? null,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          currency: saleCurrency,
          color: it.color || null,
        };
      });
      const { error } = await supabase.from(salesItemsTable).insert(mapped);
      if (error) {
        const msgLow = String(error.message || error.details || '').toLowerCase();
        if (/null value in column "id" of relation "sales_items"/i.test(String(error.message || ''))) {
          sendError(500, 'items', new Error(`${error.message}. Remediation: apply supabase/sql/patches/007_sales_items_id_identity.sql to add sequence/identity default for public.sales_items.id.`));
          return;
        }
        // Enhance common relation missing case with guidance
        if (/relation \"sales\" does not exist/.test(String(error.message))) {
          // Probe whether public.sales is selectable (it was for header insert, but we double check)
          try {
            const head = await supabase.from(salesTable).select('id', { head: true, count: 'estimated' });
            if (head.error) {
              sendError(500, 'items', new Error(`Items insert failed due to missing relation "sales" and header probe now also failing: ${head.error.message}. This indicates a broken foreign key or trigger referencing a dropped table name. Repair the FK on '${salesItemsTable}.sale_id' to reference public.${salesTable}(id).`));
              return;
            }
          } catch (_) { /* ignore */ }
          sendError(500, 'items', new Error(`Items insert failed: relation "sales" does not exist. Likely a stale FOREIGN KEY or trigger on '${salesItemsTable}' still referencing an old table name. Action: In SQL editor run: ALTER TABLE public.${salesItemsTable} DROP CONSTRAINT IF EXISTS ${salesItemsTable}_sale_id_fkey; then ALTER TABLE public.${salesItemsTable} ADD CONSTRAINT ${salesItemsTable}_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.${salesTable}(id) ON DELETE CASCADE;`));
          return;
        }
        if (/pgrst205/.test(msgLow)) {
          sendError(500, 'items', new Error(`Items insert failed: table '${salesItemsTable}' not in schema cache (PGRST205). Ensure 'public' schema is exposed in Supabase Settings > API and reload PostgREST.`));
          return;
        }
        sendError(500, 'items', error);
        return;
      }
      itemsInserted = mapped.length;
    }

    // 3) Insert payments (if provided)
    let paymentsInserted = 0; let paymentsBatch = null;
    if (payments && payments.length > 0) {
      const batch = newUuid();
      const nowIso = new Date().toISOString();
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
      const { error } = await supabase.from(salesPaymentsTable).insert(mapped);
      if (error) { sendError(500, 'payments', error); return; }
      paymentsInserted = mapped.length; paymentsBatch = batch;
    }

    // 4) Apply inventory deduction server-side when the atomic checkout RPC is unavailable.
    let inventoryApplied = false;
    if (saleId != null && salePayload?.location_id && items.length > 0) {
      await applyInventoryDeduction(supabase, {
        items,
        locationId: salePayload.location_id,
        saleId,
        receiptNumber: storedReceiptNumber,
        userUid: salePayload?.user_uid || null,
        userId: salePayload?.user_id || null,
      });
      inventoryApplied = true;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ ok: true, sale: saleRow, storedReceiptNumber, itemsInserted, paymentsInserted, paymentsBatch, inventoryApplied, tableDebug: { ...tableDebug, usedAtomicCheckout: false } });
  } catch (e) {
    sendError(500, 'unhandled', e);
  }
}
