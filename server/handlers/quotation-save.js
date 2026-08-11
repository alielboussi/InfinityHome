// Serverless API: quotation-save
// Creates or updates a quotation and its items using the Firestore service client.
// Request: POST JSON { id?: string (uuid), quote: {...}, items: [...], vatChoice: 'exclusive'|'vat16' }
// - quote.customer_id may be:
//   - a customers.id (uuid) OR
//   - a quote_customers.id (uuid) — in this case we will resolve/create a real customers row and link to it
// Response: { ok: true, id, quote }

import { computeQuotationTotals, computeQuotationDisplayTotal } from '../../src/utils/quotationDisplay.js';
import { buildQuoteLaybyEditSummary } from '../../src/utils/quoteLaybyEditNotify.js';
import { getDataClient } from '../lib/getDataClient.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function toNumberOr(defaultValue, raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
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

async function getSalePaidTotal(db, saleId) {
  if (!saleId) return 0;
  const sumRows = (rows) => (rows || []).reduce((sum, row) => (
    sum + Number(row?.amount || 0) + Number(row?.discount_amount || 0)
  ), 0);
  const [{ data: salesRows, error: salesErr }, { data: laybyRows, error: laybyErr }] = await Promise.all([
    db.from('sales_payments').select('amount, discount_amount').eq('sale_id', saleId),
    db.from('layby_payments').select('amount, discount_amount').eq('sale_id', saleId),
  ]);
  if (salesErr && laybyErr) {
    throw new Error(`Payment lookup failed: ${salesErr.message || laybyErr.message}`);
  }
  return Math.max(sumRows(salesRows), sumRows(laybyRows));
}

async function resolveConvertedSaleId(db, existing) {
  if (!existing) return null;
  if (existing.sale_id) return existing.sale_id;
  if (!existing.layby_id) return null;
  const { data: layby, error } = await db
    .from('laybys')
    .select('sale_id')
    .eq('id', existing.layby_id)
    .maybeSingle();
  if (error) throw new Error(`Layby lookup failed: ${error.message}`);
  return layby?.sale_id || null;
}

async function syncConvertedQuoteToLaybySale(db, {
  saleId,
  laybyId,
  quote,
  cleanItems,
  total,
  saleDiscount,
  vat_apply,
  vatRate,
}) {
  if (!saleId) return;

  const salesTable = await resolveTable(db, 'sales', ['sale']);
  const salesItemsTable = await resolveTable(db, 'sales_items', ['sale_items', 'sales_item']);
  const nowIso = new Date().toISOString();

  const { error: saleErr } = await db
    .from(salesTable)
    .update({
      total_amount: total,
      discount: saleDiscount,
      vat_apply,
      vat_rate: vatRate,
      updated_at: nowIso,
    })
    .eq('id', saleId);
  if (saleErr) throw new Error(`Sale update failed: ${saleErr.message}`);

  const { error: delErr } = await db.from(salesItemsTable).delete().eq('sale_id', saleId);
  if (delErr) throw new Error(`Sale items reset failed: ${delErr.message}`);

  const saleItems = cleanItems.map((item) => ({
    sale_id: saleId,
    product_id: item.product_id ?? null,
    display_name: item.name_override || null,
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    currency: quote.currency || 'K',
    color: null,
  }));
  if (saleItems.length) {
    const { error: insErr } = await db.from(salesItemsTable).insert(saleItems);
    if (insErr) throw new Error(`Sale items insert failed: ${insErr.message}`);
  }

  if (laybyId) {
    const { data: layby, error: laybyErr } = await db
      .from('laybys')
      .select('paid_amount')
      .eq('id', laybyId)
      .maybeSingle();
    if (laybyErr) throw new Error(`Layby lookup failed: ${laybyErr.message}`);
    const paidFromPayments = await getSalePaidTotal(db, saleId);
    const paidAmount = Math.max(Number(layby?.paid_amount || 0), paidFromPayments);
    const { error: laybyUpdateErr } = await db
      .from('laybys')
      .update({
        total_amount: total,
        paid_amount: paidAmount,
        status: Math.max(0, total - paidAmount) >= 1 ? 'active' : 'completed',
        updated_at: nowIso,
      })
      .eq('id', laybyId);
    if (laybyUpdateErr) throw new Error(`Layby update failed: ${laybyUpdateErr.message}`);
  }
}

export default async function handler(req, res) {
  try {
    setCors(res);
    // CORS preflight support (useful when called from dev UIs)
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const db = getDataClient();

    const body = req.body || {};
    const action = String(body?.action || req.query?.action || '').trim().toLowerCase();

    if (action === 'create-customer') {
      const name = String(body?.name || '').trim();
      if (!name) {
        res.status(400).json({ ok: false, error: 'Missing customer name' });
        return;
      }

      const nowIso = new Date().toISOString();
      const row = {
        name,
        phone: body?.phone || null,
        currency: body?.currency || 'K',
        address: body?.address || null,
        city: body?.city || null,
        country: body?.country || null,
        tpin: body?.tpin || null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await db
        .from('quote_customers')
        .insert([row])
        .select('id, name, currency, phone, address, city, country, tpin, created_at')
        .single();
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }

      res.status(200).json({ ok: true, row: data });
      return;
    }

    if (action === 'create-product') {
      const name = String(body?.name || '').trim();
      if (!name) {
        res.status(400).json({ ok: false, error: 'Missing product name' });
        return;
      }

      const nowIso = new Date().toISOString();
      const unitRaw = body?.unit_id;
      const unit_id = unitRaw != null && unitRaw !== ''
        ? (Number.isFinite(Number(unitRaw)) ? Number(unitRaw) : unitRaw)
        : null;
      const payload = {
        name,
        price: toNumberOr(0, body?.price),
        unit_id,
        description: body?.description || null,
        active: body?.active !== false,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await db
        .from('quotation_products')
        .insert([payload])
        .select('id, name, price, unit_id, description, active, created_at, updated_at')
        .single();
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }

      res.status(200).json({ ok: true, row: data });
      return;
    }

    if (action === 'update-product') {
      const id = String(body?.id || '').trim();
      if (!id) {
        res.status(400).json({ ok: false, error: 'Missing product id' });
        return;
      }

      const patch = { updated_at: new Date().toISOString() };
      if (body?.name != null) {
        const name = String(body.name || '').trim();
        if (!name) {
          res.status(400).json({ ok: false, error: 'Product name cannot be empty' });
          return;
        }
        patch.name = name;
      }
      if (body?.price != null) patch.price = toNumberOr(0, body.price);
      if (body?.description != null) patch.description = body.description || null;
      if (body?.active != null) patch.active = Boolean(body.active);
      if (body?.unit_id !== undefined) {
        const unitRaw = body.unit_id;
        patch.unit_id = unitRaw != null && unitRaw !== ''
          ? (Number.isFinite(Number(unitRaw)) ? Number(unitRaw) : unitRaw)
          : null;
      }

      if (Object.keys(patch).length === 1) {
        res.status(400).json({ ok: false, error: 'No product fields to update' });
        return;
      }

      const { data, error } = await db
        .from('quotation_products')
        .update(patch)
        .eq('id', id)
        .select('id, name, price, unit_id, description, active, created_at, updated_at')
        .single();
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }

      res.status(200).json({ ok: true, row: data });
      return;
    }

    if (action === 'create-unit') {
      const name = String(body?.name || '').trim();
      if (!name) {
        res.status(400).json({ ok: false, error: 'Missing unit name' });
        return;
      }

      const nowIso = new Date().toISOString();
      const payload = {
        name,
        abbreviation: body?.abbreviation || null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await db
        .from('quotation_units')
        .insert([payload])
        .select('*')
        .single();
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }

      res.status(200).json({ ok: true, row: data });
      return;
    }

    const { id, quote, items, vatChoice } = body;
    if (!quote || !Array.isArray(items)) {
      res.status(400).json({ ok: false, error: 'Invalid payload: requires { quote, items[] }' });
      return;
    }

    // Resolve customer_id: accept either customers.id or quote_customers.id
    async function resolveCustomerId(inputId) {
      if (!inputId) return null;
      // 1) Is it already a customers.id?
      {
        const { data, error } = await db.from('customers').select('id').eq('id', inputId).maybeSingle();
        if (error) throw new Error(`Customer check failed: ${error.message}`);
        if (data && data.id) return data.id;
      }
      // 2) Is it a quote_customers.id? If so, upsert into customers and return the new id.
      const { data: qc, error: qcErr } = await db
        .from('quote_customers')
        .select('id, name, phone, currency, address, city, tpin')
        .eq('id', inputId)
        .maybeSingle();
      if (qcErr) throw new Error(`Quote customer lookup failed: ${qcErr.message}`);
      if (!qc) {
        // last resort: not found in either table, treat as null to avoid FK violation
        return null;
      }
      // Try to find existing customers by phone first, then by exact name
      if (qc.phone) {
        const { data: byPhone, error: phoneErr } = await db
          .from('customers')
          .select('id')
          .eq('phone', qc.phone)
          .maybeSingle();
        if (phoneErr) throw new Error(`Customer phone match failed: ${phoneErr.message}`);
        if (byPhone && byPhone.id) return byPhone.id;
      }
      if (qc.name) {
        const { data: byName, error: nameErr } = await db
          .from('customers')
          .select('id')
          .eq('name', qc.name)
          .maybeSingle();
        if (nameErr) throw new Error(`Customer name match failed: ${nameErr.message}`);
        if (byName && byName.id) return byName.id;
      }
      // Create minimal customers row from quote customer
      const newCust = {
        name: qc.name || 'Customer',
        phone: qc.phone || null,
        currency: qc.currency || (quote && quote.currency) || 'K',
        address: qc.address || null,
        city: qc.city || null,
        tpin: qc.tpin || null,
      };
      const { data: createdCust, error: createCustErr } = await db
        .from('customers')
        .insert([newCust])
        .select('id')
        .single();
      if (createCustErr) throw new Error(`Create customer failed: ${createCustErr.message}`);
      return createdCust.id;
    }

    // Sanitize and compute totals server-side
    const cleanItems = items.map((it, idx) => ({
      quotation_id: id || null,
      quote_product_id: it.quote_product_id ?? null,
      product_id: it.product_id ?? null,
      name_override: it.name || it.name_override || null,
      description: it.description || null,
      unit_id: it.unit_id != null && it.unit_id !== '' ? Number(it.unit_id) : null,
      quantity: Number(it.quantity || 0),
      unit_price: Number(it.unit_price || 0),
      sort_order: idx + 1,
    }));

    const subtotal = cleanItems.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);
    const discount = Number(quote.discount || 0);
    const vat_apply = vatChoice === 'vat16';
    const vatRate = vat_apply ? 0.16 : 0;
    const totals = computeQuotationTotals({
      subtotal,
      discount,
      vatApply: vat_apply,
      vatRate,
    });
    const { total } = totals;

    // Ensure quote_number exists following pattern QT#1, QT#2, ... (stored in quote_number column)
    let quote_number = quote.quote_number || null;
    if (!id && !quote_number) {
      const { data: recent, error: recentErr } = await db
        .from('quotations')
        .select('quote_number, created_at')
        .ilike('quote_number', 'QT#%')
        .order('created_at', { ascending: false })
        .limit(200);
      if (recentErr) {
        res.status(500).json({ ok: false, error: `Failed to generate quote number: ${recentErr.message}` });
        return;
      }
      let maxNum = 0;
      (recent || []).forEach(r => {
        const m = String(r.quote_number || '').match(/^QT#(\d+)$/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
      quote_number = `QT#${maxNum + 1}`;
    }

    const resolvedCustomerId = await resolveCustomerId(quote.customer_id ?? null);
    const baseHeader = {
      customer_id: resolvedCustomerId,
      discount: Number(quote.discount || 0),
      vat_apply,
      vat_inclusive: false,
      vat_rate: vatRate,
      currency: quote.currency || 'K',
      subtotal,
      total,
    };

    let quoteId = id || null;
    let responseHeader = null;
    let existingConverted = null;
    let beforeQuoteSnapshot = null;
    let beforeItemsSnapshot = null;
    if (!quoteId) {
      // Create
      const header = { ...baseHeader, quote_number: quote_number || 'QT#1' };
      const { data: created, error: createErr } = await db
        .from('quotations')
        .insert([header])
        .select('*')
        .single();
      if (createErr) {
        res.status(500).json({ ok: false, error: createErr.message });
        return;
      }
      quoteId = created.id;
      responseHeader = header;
      cleanItems.forEach(it => { it.quotation_id = quoteId; });
    } else {
      // Update existing — lock once converted to layby and payments exist
      const { data: existing, error: exErr } = await db
        .from('quotations')
        .select('id, status, sale_id, layby_id, quote_number')
        .eq('id', quoteId)
        .maybeSingle();
      if (exErr) {
        res.status(500).json({ ok: false, error: exErr.message });
        return;
      }
      if (existing) {
        existingConverted = existing;
        const status = String(existing.status || '').toLowerCase();
        const isConverted = status === 'converted'
          || status === 'invoice'
          || Boolean(existing.sale_id)
          || Boolean(existing.layby_id);
        if (isConverted) {
          const linkedSaleId = await resolveConvertedSaleId(db, existing);
          if (linkedSaleId) {
            existing.sale_id = linkedSaleId;
            existingConverted = { ...existingConverted, sale_id: linkedSaleId };
          }
        }
        if (isConverted && existing.sale_id) {
          const { data: existingQuote, error: quoteLoadErr } = await db
            .from('quotations')
            .select('id, subtotal, total, discount, vat_apply, vat_rate')
            .eq('id', quoteId)
            .maybeSingle();
          if (quoteLoadErr) {
            res.status(500).json({ ok: false, error: quoteLoadErr.message });
            return;
          }
          const { data: existingItems, error: itemsLoadErr } = await db
            .from('quotation_items')
            .select('name_override, product_id, quantity, unit_price, sort_order')
            .eq('quotation_id', quoteId)
            .order('sort_order', { ascending: true });
          if (itemsLoadErr) {
            res.status(500).json({ ok: false, error: itemsLoadErr.message });
            return;
          }
          beforeQuoteSnapshot = { ...(existingQuote || {}) };
          beforeItemsSnapshot = existingItems || [];
          const currentTotal = computeQuotationDisplayTotal(existingQuote || existing);
          const paidTotal = await getSalePaidTotal(db, existing.sale_id);
          const outstanding = Math.max(0, currentTotal - paidTotal);
          if (outstanding <= 0.009) {
            res.status(409).json({ ok: false, error: 'Quotation is locked (layby paid in full).' });
            return;
          }
          // Allow lowering quote total below already paid amount.
          // Converted layby sync will mark the sale/layby as completed when paid >= total.
        } else if (isConverted) {
          res.status(409).json({ ok: false, error: 'Quotation is locked (converted).' });
          return;
        }
      }
      const header = { ...baseHeader, quote_number: quote_number || existing?.quote_number || null };
      const { error: updErr } = await db
        .from('quotations')
        .update(header)
        .eq('id', quoteId);
      if (updErr) {
        res.status(500).json({ ok: false, error: updErr.message });
        return;
      }
      responseHeader = header;
      // Replace items
      const { error: delErr } = await db.from('quotation_items').delete().eq('quotation_id', quoteId);
      if (delErr) {
        res.status(500).json({ ok: false, error: delErr.message });
        return;
      }
      cleanItems.forEach(it => { it.quotation_id = quoteId; });
    }

    if (cleanItems.length) {
      const { error: insItemsErr } = await db.from('quotation_items').insert(cleanItems);
      if (insItemsErr) {
        res.status(500).json({ ok: false, error: insItemsErr.message });
        return;
      }
    }

    if (existingConverted?.sale_id) {
      try {
        await syncConvertedQuoteToLaybySale(db, {
          saleId: existingConverted.sale_id,
          laybyId: existingConverted.layby_id,
          quote,
          cleanItems,
          total,
          saleDiscount: Number(quote.discount || 0),
          vat_apply,
          vatRate,
        });
      } catch (syncErr) {
        res.status(500).json({ ok: false, error: syncErr.message || String(syncErr) });
        return;
      }
    }

    let laybyEditNotify = null;
    if (beforeQuoteSnapshot && existingConverted?.layby_id && existingConverted?.sale_id) {
      const paidTotal = await getSalePaidTotal(db, existingConverted.sale_id);
      const afterQuote = {
        ...beforeQuoteSnapshot,
        ...baseHeader,
        subtotal,
        total,
        discount: Number(quote.discount || 0),
        vat_apply,
        vat_rate: vatRate,
        currency: quote.currency || beforeQuoteSnapshot.currency || 'K',
      };
      const summary = buildQuoteLaybyEditSummary({
        beforeQuote: beforeQuoteSnapshot,
        afterQuote,
        beforeItems: beforeItemsSnapshot,
        afterItems: cleanItems,
        paidTotal,
        laybyClosed: Math.max(0, total - paidTotal) < 1,
        currency: afterQuote.currency || 'K',
      });
      laybyEditNotify = {
        laybyId: existingConverted.layby_id,
        saleId: existingConverted.sale_id,
        eventType: 'quote_edit',
        laybyClosed: summary.laybyClosed,
        editSummary: summary.lines,
        quoteNumber: existingConverted.quote_number || quote_number || null,
      };
    }

    res.status(200).json({
      ok: true,
      id: quoteId,
      quote: { id: quoteId, ...(responseHeader || baseHeader), quote_number: (responseHeader || baseHeader).quote_number || quote_number || null },
      laybyEditNotify,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
