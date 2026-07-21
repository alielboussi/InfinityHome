import { createClient } from '@supabase/supabase-js';
import { applyInventoryDeduction } from '../lib/inventoryDeduction.js';
import { applyInventoryRestore } from '../lib/inventoryRestore.js';

const BALANCE_CLOSED_THRESHOLD = 1;
const toNumber = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

async function getLinkedSaleIds(supabase, sale) {
  const ids = new Set([sale.id]);
  if (sale.layby_id) {
    const { data: linked } = await supabase.from('sales').select('id').eq('layby_id', sale.layby_id);
    (linked || []).forEach((row) => { if (row?.id != null) ids.add(row.id); });
  }
  return [...ids];
}

async function getPaidAmount(supabase, sale) {
  const saleIds = await getLinkedSaleIds(supabase, sale);
  const { data: payments, error } = await supabase
    .from('sales_payments')
    .select('amount, payment_type')
    .in('sale_id', saleIds);
  if (error) throw error;
  return (payments || [])
    .filter((p) => String(p.payment_type || '').toLowerCase() !== 'credit')
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

async function recomputeLaybyRollup(supabase, laybyId) {
  if (!laybyId) return;
  const { data: linkedSales } = await supabase
    .from('sales')
    .select('id, total_amount')
    .eq('layby_id', laybyId);
  const saleIds = (linkedSales || []).map((s) => s.id).filter((id) => id != null);
  if (!saleIds.length) {
    await supabase.from('laybys').delete().eq('id', laybyId);
    return;
  }

  const { data: payRows } = await supabase
    .from('sales_payments')
    .select('sale_id, amount, payment_type')
    .in('sale_id', saleIds);
  const paid = (payRows || [])
    .filter((p) => String(p.payment_type || '').toLowerCase() !== 'credit')
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
  const total = (linkedSales || []).reduce((sum, s) => sum + toNumber(s.total_amount), 0);
  const outstanding = Math.max(0, total - paid);
  const status = outstanding < BALANCE_CLOSED_THRESHOLD ? 'completed' : 'active';

  await supabase
    .from('laybys')
    .update({ total_amount: total, paid_amount: paid, status, updated_at: new Date().toISOString() })
    .eq('id', laybyId);
}

function inventoryLinesFromItems(items = []) {
  return items
    .filter((it) => it?.product_id && toNumber(it.quantity) > 0)
    .map((it) => ({
      product_id: it.product_id,
      quantity: toNumber(it.quantity),
    }));
}

export default async function handler(req, res) {
  const sendError = (status, stage, err) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(status).json({
      ok: false,
      stage,
      error: err?.message || String(err || 'Unknown error'),
    });
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
      sendError(405, 'method', new Error('Method Not Allowed'));
      return;
    }

    const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      sendError(500, 'env', new Error('Supabase service env not configured'));
      return;
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });
    const body = req.body || {};
    const operation = String(body.operation || '').trim().toLowerCase();
    const saleId = body.saleId || body.sale_id;
    const removeItemIds = Array.isArray(body.removeItemIds) ? body.removeItemIds.map(Number).filter(Boolean) : [];
    const addItems = Array.isArray(body.addItems) ? body.addItems : [];
    const userUid = body.user_uid || null;
    const userId = body.user_id || null;

    if (!['reversal', 'replacement', 'addition'].includes(operation)) {
      sendError(400, 'validate', new Error('operation must be reversal, replacement, or addition'));
      return;
    }
    if (!saleId) {
      sendError(400, 'validate', new Error('Missing saleId'));
      return;
    }
    if (operation === 'reversal' && !removeItemIds.length) {
      sendError(400, 'validate', new Error('Select at least one line to reverse'));
      return;
    }
    if (operation === 'replacement' && (!removeItemIds.length || !addItems.length)) {
      sendError(400, 'validate', new Error('Replacement requires a removed line and replacement product(s)'));
      return;
    }
    if (operation === 'addition' && !addItems.length) {
      sendError(400, 'validate', new Error('Select at least one product to add'));
      return;
    }

    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('id, customer_id, location_id, layby_id, status, currency, discount, receipt_number, total_amount')
      .eq('id', saleId)
      .maybeSingle();
    if (saleErr || !sale) {
      sendError(404, 'sale', new Error(saleErr?.message || 'Sale not found'));
      return;
    }

    const { data: currentItems, error: itemsErr } = await supabase
      .from('sales_items')
      .select('id, product_id, display_name, quantity, unit_price, currency, color')
      .eq('sale_id', saleId)
      .order('id', { ascending: true });
    if (itemsErr) {
      sendError(500, 'items_fetch', itemsErr);
      return;
    }

    const removed = (currentItems || []).filter((it) => removeItemIds.includes(Number(it.id)));
    const kept = (currentItems || []).filter((it) => !removeItemIds.includes(Number(it.id)));

    const addPayload = addItems.map((line) => ({
      product_id: line?.product_id ?? null,
      display_name: line?.display_name ?? null,
      quantity: toNumber(line?.quantity),
      unit_price: toNumber(line?.unit_price),
      currency: line?.currency || sale.currency || null,
      color: line?.color ?? null,
    })).filter((line) => line.quantity > 0);

    const finalItems = [
      ...kept.map((line) => ({
        product_id: line.product_id,
        display_name: line.display_name,
        quantity: toNumber(line.quantity),
        unit_price: toNumber(line.unit_price),
        currency: line.currency || sale.currency || null,
        color: line.color || null,
      })),
      ...addPayload,
    ];

    if (!finalItems.length) {
      sendError(400, 'validate', new Error('Sale must retain at least one line item'));
      return;
    }

    if (sale.location_id && removed.length) {
      await applyInventoryRestore(supabase, {
        items: inventoryLinesFromItems(removed),
        locationId: sale.location_id,
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        reason: 'sale_adjustment_restore',
        userUid,
        userId,
      });
    }

    if (sale.location_id && addPayload.length) {
      await applyInventoryDeduction(supabase, {
        items: inventoryLinesFromItems(addPayload),
        locationId: sale.location_id,
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        userUid,
        userId,
      });
    }

    const { error: deleteErr } = await supabase.from('sales_items').delete().eq('sale_id', saleId);
    if (deleteErr) {
      sendError(500, 'items_delete', deleteErr);
      return;
    }

    const insertRows = finalItems.map((line) => ({
      sale_id: saleId,
      ...line,
    }));
    const { error: insertErr } = await supabase.from('sales_items').insert(insertRows);
    if (insertErr) {
      sendError(500, 'items_insert', insertErr);
      return;
    }

    const discount = toNumber(sale.discount);
    const subtotal = finalItems.reduce((sum, it) => sum + (toNumber(it.unit_price) * toNumber(it.quantity)), 0);
    const newTotal = Math.max(0, subtotal - discount);
    const paid = await getPaidAmount(supabase, sale);
    const outstanding = Math.max(0, newTotal - paid);

    let newStatus = sale.status;
    let laybyStatus = null;
    let topupRequired = false;

    if (operation === 'replacement') {
      if (outstanding >= BALANCE_CLOSED_THRESHOLD) {
        newStatus = 'layby';
        laybyStatus = 'active';
        topupRequired = true;
      } else {
        newStatus = 'completed';
        laybyStatus = 'completed';
      }
    } else if (operation === 'addition') {
      if (outstanding >= BALANCE_CLOSED_THRESHOLD) {
        newStatus = 'layby';
        laybyStatus = 'active';
        topupRequired = true;
      }
    } else if (operation === 'reversal') {
      if (outstanding >= BALANCE_CLOSED_THRESHOLD) {
        newStatus = sale.layby_id || String(sale.status).toLowerCase() === 'layby' ? 'layby' : sale.status;
        laybyStatus = 'active';
      } else {
        newStatus = 'completed';
        laybyStatus = 'completed';
      }
    }

    const { error: saleUpdateErr } = await supabase
      .from('sales')
      .update({ total_amount: newTotal, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', saleId);
    if (saleUpdateErr) {
      sendError(500, 'sale_update', saleUpdateErr);
      return;
    }

    let laybyId = sale.layby_id || null;
    if (laybyId || newStatus === 'layby') {
      const laybyPayload = {
        sale_id: saleId,
        customer_id: sale.customer_id,
        total_amount: newTotal,
        status: laybyStatus || 'active',
      };
      if (laybyId) {
        await supabase.from('laybys').update(laybyPayload).eq('id', laybyId);
      } else {
        const { data: insertedLayby, error: laybyInsErr } = await supabase
          .from('laybys')
          .insert([{ ...laybyPayload, notes: `${operation} adjustment`, origin: 'pos' }])
          .select('id')
          .single();
        if (laybyInsErr) {
          sendError(500, 'layby_insert', laybyInsErr);
          return;
        }
        laybyId = insertedLayby?.id || null;
        if (laybyId) {
          await supabase.from('sales').update({ layby_id: laybyId }).eq('id', saleId);
        }
      }
      if (laybyId) await recomputeLaybyRollup(supabase, laybyId);
    } else if (laybyId && laybyStatus === 'completed') {
      await supabase.from('laybys').update({ status: 'completed', total_amount: newTotal }).eq('id', laybyId);
      await recomputeLaybyRollup(supabase, laybyId);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      ok: true,
      saleId,
      operation,
      newTotal,
      paid,
      outstanding: outstanding < BALANCE_CLOSED_THRESHOLD ? 0 : outstanding,
      status: newStatus,
      laybyId,
      topupRequired,
      receiptNumber: sale.receipt_number,
      removedCount: removed.length,
      addedCount: addPayload.length,
    });
  } catch (err) {
    sendError(500, 'unknown', err);
  }
}
