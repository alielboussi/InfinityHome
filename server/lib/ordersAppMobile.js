import { getLoginAccessRecord } from './loginAccess.js';
import { newUuid } from './uuid.js';
import {
  evaluateOrdersAppAccess,
  isOrdersAppOwnerEmail,
  isProductionLoginAccessAdminEmail,
} from '../../src/mobile/mobileAccessManifest.js';
import {
  computeQuotationTotals,
  normalizeQuotationItemRow,
  resolveQuoteLineQuantity,
  sortQuotationRows,
} from '../../src/utils/quotationDisplay.js';
import { buildQuoteItemMetadataFromPayload } from '../../src/utils/quoteProductionItemFields.js';
import {
  getQuoteProductionRouting,
  sendQuoteToProduction,
  upsertQuoteProductionRoute,
} from './quoteProductionRouting.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_RECEIVER_LIST_STATUSES,
  WAREHOUSE_RETURN_DELIVERY_SOURCES,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';
import { acceptWarehouseDeliveryServer } from './warehouseDeliveryAccept.js';
import {
  createWarehouseReturnOrder,
  listKitweReturnProductOptions,
  listWarehouseReturnOrders,
} from './warehouseReturnOrders.js';
import {
  getPosSaleDetailForStorage,
  listPosSalesForStorage,
  listWarehouseStorageSends,
  submitWarehouseStorageSend,
} from './warehouseStorageSends.js';

function trim(value) {
  return String(value ?? '').trim();
}

function asArray(value, keys) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of keys) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
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
  const unitRaw = body.unit_id;
  const unit_id = unitRaw != null && unitRaw !== ''
    ? (Number.isFinite(Number(unitRaw)) ? Number(unitRaw) : unitRaw)
    : null;
  const row = {
    name,
    price: Number(body.price) || 0,
    unit_id,
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

export async function opOrdersUnitsList(sb) {
  const { data, error } = await sb
    .from('quotation_units')
    .select('id, name, abbreviation')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to load units.');
  return { units: data || [] };
}

export async function opOrdersQuotesList(sb) {
  const { data, error } = await sb
    .from('quotations')
    .select('id, quote_number, customer_id, created_at, updated_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id')
    .limit(400);
  if (error) throw new Error(error.message || 'Failed to load orders.');
  const rows = sortQuotationRows(data || []).slice(0, 200);
  const withNames = await attachCustomerNames(sb, rows);
  const ids = withNames.map((q) => q.id).filter(Boolean);
  let routingById = {};
  if (ids.length) {
    const { data: routings } = await sb
      .from('quote_production_routing')
      .select('quote_id, route, sent_to_production_at, accepted_at, completed_at, metadata')
      .in('quote_id', ids);
    (routings || []).forEach((r) => {
      routingById[String(r.quote_id)] = r;
    });
  }
  return {
    quotes: withNames.map((q) => ({
      ...q,
      routing: routingById[String(q.id)] || null,
    })),
  };
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
  const routing = await getQuoteProductionRouting(sb, quoteId).catch(() => null);
  const { data: units } = await sb.from('quotation_units').select('id, name, abbreviation');
  return {
    quote: named,
    items: (items || []).map(normalizeQuotationItemRow),
    routing,
    units: units || [],
  };
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
      const unitRaw = it.unit_id;
      const unit_id = unitRaw != null && unitRaw !== ''
        ? (Number.isFinite(Number(unitRaw)) ? Number(unitRaw) : unitRaw)
        : null;
      const row = {
        quote_product_id: it.quote_product_id || it.product_id || null,
        name_override: name,
        description: trim(it.description) || null,
        quantity: resolveQuoteLineQuantity(it.quantity, it.unit_price),
        unit_price: Number(it.unit_price || it.price || 0),
        unit_id,
        sort_order: idx + 1,
      };
      if (metadata) row.metadata = metadata;
      return row;
    })
    .filter(Boolean);
  if (!cleanItems.length) throw new Error('Add at least one product.');

  const route = trim(body.route || body.production_route).toLowerCase();
  if (route && route !== 'carpentry' && route !== 'upholstery') {
    throw new Error('Workshop route must be Carpentry or Upholstery.');
  }
  if (!trim(body.id || body.quote_id) && !route) {
    throw new Error('Choose Carpentry or Upholstery before saving this quote.');
  }

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
  if (route) {
    await upsertQuoteProductionRoute(sb, quoteId, route, {});
  }
  return { quote_id: quoteId };
}

export async function opOrdersQuoteDelete(sb, body) {
  const quoteId = trim(body.quote_id || body.id);
  if (!quoteId) throw new Error('quote_id is required.');
  await sb.from('quotation_items').delete().eq('quotation_id', quoteId);
  const { error } = await sb.from('quotations').delete().eq('id', quoteId);
  if (error) throw new Error(error.message || 'Failed to delete quote.');
  return { ok: true };
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

const SESSION_SELECT = 'id, delivery_number, from_location, to_location, created_at, transfer_datetime, submitted_at, status, total_qty, created_by_id, created_by_email, created_by_name, accepted_at, applied_at, completed_at, last_edited_at, pdf_url, metadata';

function sortDeliverySessions(rows) {
  return [...rows].sort((a, b) => {
    const na = String(a.delivery_number || '');
    const nb = String(b.delivery_number || '');
    return nb.localeCompare(na, undefined, { numeric: true });
  });
}

async function loadDeliveryEntriesBySession(sb, sessionIds) {
  const ids = (sessionIds || []).filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await sb
    .from('warehouse_delivery_entries')
    .select('*')
    .in('session_id', ids);
  if (error) throw new Error(error.message || 'Failed to load delivery lines.');
  const bySession = {};
  (data || []).forEach((row) => {
    const key = String(row.session_id);
    if (!bySession[key]) bySession[key] = [];
    bySession[key].push(row);
  });
  return bySession;
}

export async function opOrdersDeliveriesList(sb) {
  const [{ data: factoryRows, error: sessErr }, { data: returnRows, error: returnErr }] = await Promise.all([
    sb
      .from('warehouse_delivery_sessions')
      .select(SESSION_SELECT)
      .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
      .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
      .in('status', WAREHOUSE_RECEIVER_LIST_STATUSES)
      .order('delivery_number', { ascending: false }),
    sb
      .from('warehouse_delivery_sessions')
      .select(SESSION_SELECT)
      .in('metadata->>source', WAREHOUSE_RETURN_DELIVERY_SOURCES)
      .in('status', WAREHOUSE_RECEIVER_LIST_STATUSES)
      .order('delivery_number', { ascending: false }),
  ]);
  if (sessErr) throw new Error(sessErr.message || 'Failed to load deliveries.');
  if (returnErr) throw new Error(returnErr.message || 'Failed to load return deliveries.');
  const byId = new Map();
  [...(factoryRows || []), ...(returnRows || [])].forEach((row) => {
    if (row?.id) byId.set(String(row.id), row);
  });
  const sessions = sortDeliverySessions([...byId.values()]).slice(0, 200);
  const entriesBySession = await loadDeliveryEntriesBySession(sb, sessions.map((s) => s.id));
  return { sessions, entriesBySession };
}

export async function opOrdersDeliveryGet(sb, body) {
  const sessionId = trim(body.session_id || body.id);
  if (!sessionId) throw new Error('session_id is required.');
  const { data: session, error } = await sb
    .from('warehouse_delivery_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load delivery.');
  if (!session) throw new Error('Delivery not found.');
  const entriesBySession = await loadDeliveryEntriesBySession(sb, [sessionId]);
  return { session, entries: entriesBySession[sessionId] || [] };
}

export async function opOrdersDeliveryReceiverCheck(sb, body, user) {
  void user;
  const entryId = trim(body.entry_id);
  const checked = body.checked !== false;
  if (!entryId) throw new Error('entry_id is required.');
  const { data: entry } = await sb.from('warehouse_delivery_entries').select('*').eq('id', entryId).maybeSingle();
  if (!entry) throw new Error('Delivery line not found.');
  const now = new Date().toISOString();
  const metadata = {
    ...(entry.metadata || {}),
    receiver_checked_at: checked ? now : null,
  };
  if (checked) {
    metadata.sent_to_customer = false;
    metadata.sent_to_customer_at = null;
    metadata.sent_to_customer_by_email = null;
  }
  const { error } = await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', entryId);
  if (error) throw new Error(error.message || 'Failed to update line');
  return { entry_id: entryId, receiver_checked: checked, metadata };
}

export async function opOrdersDeliverySendToCustomer(sb, body, user) {
  const entryId = trim(body.entry_id);
  const send = body.send !== false && body.sent !== false;
  if (!entryId) throw new Error('entry_id is required.');
  const { data: entry } = await sb.from('warehouse_delivery_entries').select('*').eq('id', entryId).maybeSingle();
  if (!entry) throw new Error('Delivery line not found.');
  if (entry.metadata?.received_at) throw new Error('This item is already accepted.');
  const now = new Date().toISOString();
  const metadata = { ...(entry.metadata || {}) };
  if (send) {
    metadata.sent_to_customer = true;
    metadata.sent_to_customer_at = now;
    metadata.sent_to_customer_by_email = user?.email || null;
    metadata.receiver_checked_at = now;
  } else {
    metadata.sent_to_customer = false;
    metadata.sent_to_customer_at = null;
    metadata.sent_to_customer_by_email = null;
    metadata.receiver_checked_at = null;
  }
  const { error } = await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', entryId);
  if (error) throw new Error(error.message || 'Failed to update line');
  return { entry_id: entryId, sent_to_customer: send, metadata };
}

export async function opOrdersDeliveryAccept(sb, body, user) {
  const sessionId = trim(body.session_id);
  if (!sessionId) throw new Error('session_id is required.');
  return acceptWarehouseDeliveryServer(sb, sessionId, {
    acceptedBy: user?.id || null,
    acceptedByEmail: user?.email || null,
  });
}

export async function opOrdersRepairsList(sb) {
  const payload = await listWarehouseReturnOrders(sb, { hassanOnly: true, limit: 200 });
  return { repairs: asArray(payload, ['return_orders', 'repairs']) };
}

export async function opOrdersTrackingList(sb) {
  const payload = await listWarehouseReturnOrders(sb, { trackageOnly: true, hassanOnly: true, limit: 300 });
  return { repairs: asArray(payload, ['return_orders', 'repairs']) };
}

export async function opOrdersStorageList(sb) {
  const payload = await listWarehouseStorageSends(sb, {});
  return { sends: asArray(payload, ['storage_sends', 'sends']) };
}

export async function opOrdersReturnProductsList(sb) {
  return listKitweReturnProductOptions(sb);
}

export async function opOrdersReturnCreate(sb, body, user) {
  return createWarehouseReturnOrder(sb, body, user);
}

export async function opOrdersStoragePosList(sb, user) {
  return listPosSalesForStorage(sb, user);
}

export async function opOrdersStoragePosDetail(sb, body, user) {
  return getPosSaleDetailForStorage(sb, user, body);
}

export async function opOrdersStorageSubmit(sb, body, user) {
  return submitWarehouseStorageSend(sb, body, user);
}
