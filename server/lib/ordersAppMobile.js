import { getLoginAccessRecord } from './loginAccess.js';
import { newUuid } from './uuid.js';
import {
  evaluateOrdersAppAccess,
  isOrdersAppOwnerEmail,
  isProductionLoginAccessAdminEmail,
} from '../../src/mobile/mobileAccessManifest.js';
import {
  computeQuotationTotals,
  resolveQuoteLineQuantity,
  sortQuotationRows,
} from '../../src/utils/quotationDisplay.js';
import { buildQuoteItemMetadataFromPayload } from '../../src/utils/quoteProductionItemFields.js';
import {
  sendQuoteToProduction,
  upsertQuoteProductionRoute,
} from './quoteProductionRouting.js';
import { listWarehouseReturnOrders } from './warehouseReturnOrders.js';
import { listWarehouseStorageSends } from './warehouseStorageSends.js';

function trim(value) {
  return String(value ?? '').trim();
}

export async function assertOrdersAppUser(user, grant) {
  if (evaluateOrdersAppAccess(grant, user?.email)) return;
  const err = new Error('You do not have access to the Orders app.');
  err.status = 403;
  throw err;
}

export async function opOrdersAccessSelf(user, grant) {
  const record = await getLoginAccessRecord(user?.id);
  return {
    allowed: evaluateOrdersAppAccess(grant, user?.email),
    display_name: record?.mobile_display_name || record?.display_name || user?.full_name || user?.email || null,
    grant,
    owner: isOrdersAppOwnerEmail(user?.email) || isProductionLoginAccessAdminEmail(user?.email),
  };
}

export async function opOrdersCustomersList(sb) {
  const { data, error } = await sb
    .from('quote_customers')
    .select('id, name, currency, phone, address, city, country, tpin, created_at')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to load customers.');
  return { customers: data || [] };
}

export async function opOrdersCustomerSave(sb, body) {
  const name = trim(body.name);
  if (!name) throw new Error('Customer name is required.');
  const row = {
    name,
    phone: trim(body.phone) || null,
    currency: trim(body.currency) || 'K',
    address: trim(body.address) || null,
    city: trim(body.city) || null,
    country: trim(body.country) || null,
    tpin: trim(body.tpin) || null,
  };
  const id = trim(body.id);
  if (id) {
    const { data, error } = await sb.from('quote_customers').update(row).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(error.message || 'Failed to update customer.');
    return { customer: data };
  }
  const { data, error } = await sb.from('quote_customers').insert([{ id: newUuid(), ...row }]).select('*').maybeSingle();
  if (error) throw new Error(error.message || 'Failed to save customer.');
  return { customer: data };
}

export async function opOrdersProductsList(sb) {
  const { data, error } = await sb
    .from('quotation_products')
    .select('id, name, price, unit_id, description, active, created_at')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to load products.');
  return { products: data || [] };
}

export async function opOrdersProductSave(sb, body) {
  const name = trim(body.name);
  if (!name) throw new Error('Product name is required.');
  const row = {
    name,
    price: Number(body.price) || 0,
    description: trim(body.description) || null,
    active: body.active === false ? false : true,
  };
  const id = trim(body.id);
  if (id) {
    const { data, error } = await sb.from('quotation_products').update(row).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(error.message || 'Failed to update product.');
    return { product: data };
  }
  const { data, error } = await sb.from('quotation_products').insert([{ id: newUuid(), ...row }]).select('*').maybeSingle();
  if (error) throw new Error(error.message || 'Failed to save product.');
  return { product: data };
}

async function attachCustomerNames(sb, quotes) {
  const rows = Array.isArray(quotes) ? quotes : [];
  const ids = [...new Set(rows.map((q) => q?.customer_id).filter(Boolean).map((v) => String(v)))];
  if (!ids.length) return rows;
  const nameById = {};
  const { data: qc } = await sb.from('quote_customers').select('id, name, phone').in('id', ids);
  (qc || []).forEach((c) => {
    nameById[String(c.id)] = { name: c.name, phone: c.phone };
  });
  return rows.map((q) => ({
    ...q,
    customer_name: nameById[String(q.customer_id)]?.name || null,
    customer_phone: nameById[String(q.customer_id)]?.phone || null,
  }));
}

export async function opOrdersQuotesList(sb) {
  const { data, error } = await sb
    .from('quotations')
    .select('id, quote_number, customer_id, created_at, updated_at, total, subtotal, status, currency')
    .limit(400);
  if (error) throw new Error(error.message || 'Failed to load orders.');
  const rows = sortQuotationRows(data || []).slice(0, 200);
  const withNames = await attachCustomerNames(sb, rows);
  return { quotes: withNames };
}

export async function opOrdersQuoteGet(sb, body) {
  const quoteId = trim(body.quote_id || body.id);
  if (!quoteId) throw new Error('quote_id is required.');
  const [{ data: quote, error: qErr }, { data: items, error: iErr }] = await Promise.all([
    sb.from('quotations').select('*').eq('id', quoteId).maybeSingle(),
    sb.from('quotation_items').select('*').eq('quotation_id', quoteId).order('sort_order'),
  ]);
  if (qErr) throw new Error(qErr.message || 'Failed to load order.');
  if (iErr) throw new Error(iErr.message || 'Failed to load order lines.');
  if (!quote) throw new Error('Order not found.');
  const [named] = await attachCustomerNames(sb, [quote]);
  return { quote: named, items: items || [] };
}

function nextQuoteNumber(recent) {
  let maxNum = 0;
  (recent || []).forEach((r) => {
    const m = String(r.quote_number || '').match(/^QT#(\d+)$/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  return `QT#${maxNum + 1}`;
}

export async function opOrdersQuoteSave(sb, body, user) {
  const customerId = trim(body.customer_id || body.customerId);
  if (!customerId) throw new Error('Select a customer.');
  const items = Array.isArray(body.items) ? body.items : [];
  const cleanItems = items
    .map((it, idx) => {
      const name = trim(it.name || it.name_override);
      if (!name) return null;
      const metadata = buildQuoteItemMetadataFromPayload(it);
      const row = {
        quote_product_id: it.quote_product_id || it.product_id || null,
        name_override: name,
        description: trim(it.description) || null,
        quantity: resolveQuoteLineQuantity(it.quantity, it.unit_price),
        unit_price: Number(it.unit_price || it.price || 0),
        sort_order: idx + 1,
      };
      if (metadata) row.metadata = metadata;
      return row;
    })
    .filter(Boolean);
  if (!cleanItems.length) throw new Error('Add at least one product.');

  const subtotal = cleanItems.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);
  const discount = Number(body.discount || 0);
  const vatApply = String(body.vat_choice || body.vatChoice || '') === 'vat16';
  const vatRate = vatApply ? 0.16 : 0;
  const totals = computeQuotationTotals({ subtotal, discount, vatApply, vatRate });
  const nowIso = new Date().toISOString();
  const currency = trim(body.currency) || 'K';

  let quoteId = trim(body.id || body.quote_id);
  if (!quoteId) {
    const { data: recent } = await sb
      .from('quotations')
      .select('quote_number, created_at')
      .ilike('quote_number', 'QT#%')
      .order('created_at', { ascending: false })
      .limit(200);
    const header = {
      id: newUuid(),
      customer_id: customerId,
      quote_number: nextQuoteNumber(recent),
      discount,
      vat_apply: vatApply,
      vat_inclusive: false,
      vat_rate: vatRate,
      currency,
      subtotal,
      total: totals.total,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const { data: created, error } = await sb.from('quotations').insert([header]).select('*').maybeSingle();
    if (error) throw new Error(error.message || 'Failed to create order.');
    quoteId = created.id;
    const lines = cleanItems.map((it) => ({ ...it, id: newUuid(), quotation_id: quoteId }));
    const { error: lineErr } = await sb.from('quotation_items').insert(lines);
    if (lineErr) throw new Error(lineErr.message || 'Failed to save order lines.');
    const route = trim(body.route || body.production_route);
    if (route) {
      await upsertQuoteProductionRoute(sb, quoteId, route, {});
    }
    return { quote: created, quote_id: quoteId };
  }

  const { error: updErr } = await sb.from('quotations').update({
    customer_id: customerId,
    discount,
    vat_apply: vatApply,
    vat_rate: vatRate,
    currency,
    subtotal,
    total: totals.total,
    updated_at: nowIso,
  }).eq('id', quoteId);
  if (updErr) throw new Error(updErr.message || 'Failed to update order.');
  await sb.from('quotation_items').delete().eq('quotation_id', quoteId);
  const lines = cleanItems.map((it) => ({ ...it, id: newUuid(), quotation_id: quoteId }));
  const { error: lineErr } = await sb.from('quotation_items').insert(lines);
  if (lineErr) throw new Error(lineErr.message || 'Failed to save order lines.');
  return { quote_id: quoteId };
}

export async function opOrdersQuoteSetRoute(sb, body) {
  const quoteId = trim(body.quote_id);
  if (!quoteId) throw new Error('quote_id is required.');
  await upsertQuoteProductionRoute(sb, quoteId, body.route, { metadata: body.metadata || {} });
  return { ok: true };
}

export async function opOrdersQuoteSendProduction(sb, body, user) {
  const quoteId = trim(body.quote_id);
  if (!quoteId) throw new Error('quote_id is required.');
  const result = await sendQuoteToProduction(sb, quoteId, user?.id);
  return result;
}

export async function opOrdersDeliveriesList(sb) {
  const { data, error } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, delivery_number, status, submitted_at, created_at, metadata, total_qty')
    .in('status', ['submitted', 'accepted', 'completed', 'received'])
    .order('submitted_at', { ascending: false })
    .limit(150);
  if (error) throw new Error(error.message || 'Failed to load deliveries.');
  const sessions = (data || []).map((row) => {
    const meta = row.metadata || {};
    const groups = Array.isArray(meta.print_groups) ? meta.print_groups : [];
    const products = groups.map((g) => trim(g.assembly_name || g.name)).filter(Boolean);
    return {
      id: row.id,
      delivery_number: row.delivery_number,
      status: row.status,
      submitted_at: row.submitted_at || row.created_at,
      driver_name: meta.driver_name || meta.customer_driver_name || '',
      customer_name: meta.customer_name || '',
      document_kind: meta.document_kind || 'delivery',
      quote_number: meta.quote_number || meta.return_number || '',
      products,
      total_qty: row.total_qty,
    };
  });
  return { sessions };
}

export async function opOrdersRepairsList(sb) {
  const rows = await listWarehouseReturnOrders(sb, { hassanOnly: true, limit: 200 });
  return { repairs: rows };
}

export async function opOrdersTrackingList(sb) {
  const rows = await listWarehouseReturnOrders(sb, { trackageOnly: true, hassanOnly: true, limit: 300 });
  return { repairs: rows };
}

export async function opOrdersStorageList(sb) {
  const rows = await listWarehouseStorageSends(sb, {});
  return { sends: rows };
}
