#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const base = String(process.env.REACT_APP_API_BASE || 'https://infinity-home-pi.vercel.app/').replace(/\/$/, '');
const dbUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!dbUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const sb = createClient(dbUrl, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });

async function callApi(path, method = 'POST', body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

const results = [];
let failures = 0;
function record(name, pass, details) {
  results.push({ name, pass, details });
  if (!pass) failures += 1;
}

const health = await callApi('/api/health', 'GET');
record('health', health.ok, { status: health.status, body: health.json });

const { data: customerRows } = await sb.from('customers').select('id').limit(1);
const customerId = customerRows?.[0]?.id;
if (!customerId) {
  record('precondition-customer', false, { error: 'No customer found' });
} else {
  const totals = await callApi('/api/customer-totals', 'POST', { customerIds: [customerId] });
  record('customers-totals', totals.ok && totals.json?.ok === true, { status: totals.status, body: totals.json });
}

let checkoutSaleId = null;
try {
  const [{ data: cRows }, { data: lRows }] = await Promise.all([
    sb.from('customers').select('id').limit(1),
    sb.from('locations').select('id').limit(1),
  ]);
  const cid = cRows?.[0]?.id;
  const lid = lRows?.[0]?.id;
  if (!cid || !lid) {
    record('checkout-precondition', false, { error: 'Missing customer/location' });
  } else {
    const payload = {
      sale: {
        customer_id: cid,
        location_id: lid,
        total_amount: 1.23,
        status: 'completed',
        sale_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        currency: 'K',
      },
      items: [],
      payments: [
        {
          amount: 1.23,
          payment_type: 'cash',
          currency: 'K',
          payment_date: new Date().toISOString().slice(0, 10),
          notes: `live-smoke-checkout-${Date.now()}`,
        },
      ],
    };
    const out = await callApi('/api/checkout', 'POST', payload);
    checkoutSaleId = out.json?.sale?.id || null;
    record(
      'checkout-create-payment',
      out.ok && out.json?.ok === true && Number(out.json?.paymentsInserted || 0) >= 1,
      { status: out.status, body: out.json }
    );
  }
} finally {
  if (checkoutSaleId != null) {
    try { await sb.from('sales_payments').delete().eq('sale_id', checkoutSaleId); } catch {}
    try { await sb.from('sales_items').delete().eq('sale_id', checkoutSaleId); } catch {}
    try { await sb.from('sales').delete().eq('id', checkoutSaleId); } catch {}
  }
}

let laybySaleId = null;
let laybyCustomerId = null;
let laybyBatch = null;
let laybyCurrency = 'K';
const laybyTag = `live-smoke-layby-${Date.now()}`;

try {
  const { data: laybyRows } = await sb
    .from('laybys')
    .select('id, customer_id, sale_id')
    .not('sale_id', 'is', null)
    .limit(1);

  const row = laybyRows?.[0];
  laybySaleId = row?.sale_id || null;
  laybyCustomerId = row?.customer_id || null;

  if (laybySaleId) {
    const { data: saleRow } = await sb.from('sales').select('currency').eq('id', laybySaleId).maybeSingle();
    laybyCurrency = saleRow?.currency || 'K';
  }

  if (!laybySaleId || !laybyCustomerId) {
    record('layby-precondition', false, { error: 'No layby with sale_id found' });
  } else {
    const pay = await callApi('/api/payments', 'POST', {
      payments: [
        {
          sale_id: laybySaleId,
          amount: 0.77,
          payment_type: 'cash',
          currency: laybyCurrency,
          payment_date: new Date().toISOString().slice(0, 10),
          notes: laybyTag,
        },
      ],
    });
    laybyBatch = pay.json?.batch || null;
    record('layby-payment-create', pay.ok && pay.json?.ok === true, { status: pay.status, body: pay.json });

    const statement = await callApi('/api/layby-statement', 'POST', { customerId: laybyCustomerId });
    const hasSales = Array.isArray(statement.json?.sales) && statement.json.sales.length > 0;
    record('layby-statement', statement.ok && statement.json?.ok === true && hasSales, {
      status: statement.status,
      salesCount: statement.json?.sales?.length || 0,
    });

    const list = await callApi('/api/payments-list', 'POST', { saleIds: [laybySaleId] });
    const targetIds = (list.json?.rows || [])
      .filter((r) => (laybyBatch && r.allocation_batch_uuid === laybyBatch) || r.notes === laybyTag)
      .map((r) => r.id);

    if (targetIds.length) {
      const del = await callApi('/api/payments-delete', 'POST', { ids: targetIds });
      record('layby-payment-cleanup-api', del.ok && del.json?.ok === true, {
        status: del.status,
        body: del.json,
        deleted: targetIds.length,
      });
    } else {
      record('layby-payment-cleanup-api', true, {
        info: 'No API cleanup IDs found (already removed or no batch returned)',
      });
    }
  }
} catch (e) {
  record('layby-suite-exception', false, { error: String(e?.message || e) });
} finally {
  if (laybySaleId) {
    try {
      await sb.from('sales_payments').delete().eq('sale_id', laybySaleId).eq('notes', laybyTag);
    } catch {}
  }
}

try {
  const { data: periods } = await sb
    .from('stock_periods')
    .select('id, location_id, status, opened_at')
    .in('status', ['open', 'open_locked'])
    .order('opened_at', { ascending: false })
    .limit(1);

  const period = periods?.[0];
  if (!period?.id) {
    record('stock-update-precondition', false, { error: 'No open/open_locked stock period found' });
  } else {
    const { data: entries } = await sb
      .from('opening_stock_entries')
      .select('product_id, qty')
      .eq('session_id', period.id);
    const existing = (entries || [])[0] || null;
    if (existing?.product_id) {
      const originalQty = Number(existing.qty || 0);
      const bumpQty = originalQty + 0.01;
      const upsert1 = await callApi('/api/opening-stock-entry', 'POST', {
        action: 'upsert',
        sessionId: period.id,
        productId: existing.product_id,
        qty: bumpQty,
      });
      const upsert2 = await callApi('/api/opening-stock-entry', 'POST', {
        action: 'upsert',
        sessionId: period.id,
        productId: existing.product_id,
        qty: originalQty,
      });
      record(
        'stock-update-upsert-restore',
        upsert1.ok && upsert1.json?.ok === true && upsert2.ok && upsert2.json?.ok === true,
        { upsertStatus: upsert1.status, restoreStatus: upsert2.status, upsertBody: upsert1.json, restoreBody: upsert2.json }
      );
    } else {
      const { data: products } = await sb.from('products').select('id').limit(1);
      const candidate = products?.[0]?.id;
      if (!candidate) {
        record('stock-update-precondition', false, {
          error: 'No product found for opening-stock reversible test',
        });
      } else {
        const upsert = await callApi('/api/opening-stock-entry', 'POST', {
          action: 'upsert',
          sessionId: period.id,
          productId: candidate,
          qty: 0.01,
        });
        const del = await callApi('/api/opening-stock-entry', 'POST', {
          action: 'delete',
          sessionId: period.id,
          productId: candidate,
        });
        record('stock-update-upsert-delete', upsert.ok && upsert.json?.ok === true && del.ok && del.json?.ok === true, {
          upsertStatus: upsert.status,
          deleteStatus: del.status,
          upsertBody: upsert.json,
          deleteBody: del.json,
        });
      }
    }
  }
} catch (e) {
  record('stock-update-suite-exception', false, { error: String(e?.message || e) });
}

const snap = await callApi('/api/inventory-snapshot', 'POST', {});
record('inventory-snapshot-api', snap.ok && snap.json?.ok === true, {
  status: snap.status,
  rows: Array.isArray(snap.json?.data) ? snap.json.data.length : null,
});

console.log(JSON.stringify({ base, failures, results }, null, 2));
process.exit(failures ? 2 : 0);
