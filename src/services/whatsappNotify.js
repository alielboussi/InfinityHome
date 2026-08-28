import db from '../dataClient';
import { isFahme } from '../laybyRules';
import { usesCashBookWhatsAppRouting } from '../utils/whatsappCustomerRules';
import { previewLaybyWhatsApp, previewSaleWhatsApp, sendLaybyWhatsApp, sendSaleWhatsApp } from './whatsapp';
import { buildClientWhatsAppPreviewForRow } from './whatsappMessagePreview';
import { buildLaybyPdfUrlForWhatsApp, buildPosSalePdfUrlForWhatsApp } from './whatsappPdfs';
import { fetchLaybyStatement } from './laybyStatement';
import { filterStatementToLaybyAccount } from '../utils/laybyRollup';
import { LUSAKA_BRANCH_ID } from '../utils/locationIds';

async function loadCustomerInfo(customerId) {
  if (!customerId) return {};
  const { data } = await db
    .from('customers')
    .select('id, name, phone, address, city, tpin, currency')
    .eq('id', customerId)
    .maybeSingle();
  return data || {};
}

async function resolveCustomerLaybyId(laybyId, customerId) {
  if (laybyId) return laybyId;
  if (!customerId) return null;

  const { data: activeLayby } = await db
    .from('laybys')
    .select('id, status, updated_at, created_at')
    .eq('customer_id', customerId)
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeLayby?.id) return activeLayby.id;

  // A fully settled Fahme transaction can close the active row before the PDF
  // is generated. In that case use the customer's most recently updated account.
  const { data: latestLayby } = await db
    .from('laybys')
    .select('id, updated_at, created_at')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestLayby?.id || null;
}

async function buildFreshLaybySnapshot({ laybyId, customerId, laybySnapshot } = {}) {
  const resolvedCustomerId = customerId || laybySnapshot?.customer_id;
  if (!resolvedCustomerId) return laybySnapshot || null;

  const customerInfo = laybySnapshot?.customerInfo
    || laybySnapshot?.customer
    || await loadCustomerInfo(resolvedCustomerId);

  const loadStatement = async () => {
    const resolvedLaybyId = laybyId || laybySnapshot?.id || laybySnapshot?.primaryLayby?.id || null;
    const resolvedLaybySaleId = laybySnapshot?.primaryLayby?.sale_id
      || laybySnapshot?.sale_id
      || null;
    const { data: statementRes } = await fetchLaybyStatement(resolvedCustomerId, {
      laybyId: resolvedLaybyId,
      laybySaleId: resolvedLaybySaleId,
    });
    if (!statementRes) return null;
    return {
      sales: statementRes?.sales || [],
      items: statementRes?.items || [],
      payments: statementRes?.payments || [],
    };
  };

  let statement = laybySnapshot?.statement || laybySnapshot?.fullStatement || null;
  const resolvedLaybyId = laybyId || laybySnapshot?.id || laybySnapshot?.primaryLayby?.id || null;
  const resolvedLaybySaleId = laybySnapshot?.primaryLayby?.sale_id
    || laybySnapshot?.sale_id
    || null;
  if (statement && resolvedLaybyId) {
    statement = filterStatementToLaybyAccount(statement, {
      laybyId: resolvedLaybyId,
      laybySaleId: resolvedLaybySaleId,
    });
  }
  if (!statement || (!statement.sales?.length && !statement.items?.length && !statement.payments?.length)) {
    statement = await loadStatement();
    if (!statement?.sales?.length && !statement?.items?.length && !statement?.payments?.length) {
      await new Promise((resolve) => { setTimeout(resolve, 600); });
      statement = await loadStatement();
    }
  }

  return {
    ...(laybySnapshot || {}),
    id: laybyId || laybySnapshot?.id || laybySnapshot?.primaryLayby?.id,
    primaryLayby: laybySnapshot?.primaryLayby || laybySnapshot,
    customer_id: resolvedCustomerId,
    customerInfo,
    statement,
    fullStatement: statement,
    totalsByCurrency: laybySnapshot?.totalsByCurrency || null,
  };
}

export async function notifyLaybyWhatsApp({
  laybyId,
  customerId,
  eventType,
  saleId,
  locationId,
  laybySnapshot,
  laybyClosed,
  editSummary,
} = {}) {
  try {
    const resolvedLaybyId = await resolveCustomerLaybyId(laybyId, customerId);
    if (!resolvedLaybyId) return { ok: false, error: 'No active layby account found for customer' };

    const resolvedCustomerId = customerId || laybySnapshot?.customer_id;
    const needsPdf = eventType === 'statement' || isFahme(resolvedCustomerId);
    let pdfUrl;
    let pdfFilename;
    let pdfBase64;
    if (needsPdf) {
      const freshSnapshot = await buildFreshLaybySnapshot({
        laybyId: resolvedLaybyId,
        customerId,
        laybySnapshot,
      });
      const pdf = await buildLaybyPdfUrlForWhatsApp({
        laybyId: resolvedLaybyId,
        customerId: freshSnapshot?.customer_id || customerId,
        laybySnapshot: freshSnapshot,
      });
      if (!pdf?.url && !pdf?.base64) {
        return { ok: false, error: pdf?.error || 'Layby PDF could not be generated for WhatsApp' };
      }
      pdfUrl = pdf?.url;
      pdfBase64 = pdf?.url ? undefined : pdf?.base64;
      pdfFilename = pdf?.filename;
    }

    return sendLaybyWhatsApp({
      laybyId: resolvedLaybyId,
      eventType,
      saleId,
      locationId,
      pdfUrl,
      pdfBase64,
      pdfFilename,
      laybyClosed,
      editSummary,
    });
  } catch (e) {
    console.warn('Layby WhatsApp notify failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function notifySaleWhatsApp({ saleId, channel, pdfUrl, pdfFilename } = {}) {
  if (saleId == null || String(saleId).trim() === '') {
    return { ok: false, error: 'Missing saleId' };
  }

  try {
    let resolvedPdfUrl = String(pdfUrl || '').trim();
    let resolvedPdfFilename = String(pdfFilename || '').trim();
    if (!resolvedPdfUrl) {
      const pdf = await buildPosSalePdfUrlForWhatsApp({ saleId });
      resolvedPdfUrl = pdf?.url || '';
      resolvedPdfFilename = pdf?.filename || resolvedPdfFilename;
    }
    if (!resolvedPdfFilename) {
      resolvedPdfFilename = 'Sales_Receipt.pdf';
    }

    return sendSaleWhatsApp({
      saleId,
      channel,
      pdfUrl: resolvedPdfUrl || undefined,
      pdfFilename: resolvedPdfFilename,
    });
  } catch (e) {
    console.warn('Sale WhatsApp notify failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

const BALANCE_EPSILON = 0.000001;

export async function previewSaleWhatsAppForRow(row) {
  try {
    const clientPreview = await buildClientWhatsAppPreviewForRow(row);
    if (!clientPreview?.ok) return clientPreview;
    if (String(clientPreview.message || '').trim()) {
      return clientPreview;
    }
  } catch (e) {
    console.warn('Client WhatsApp preview failed, trying API:', e?.message || e);
  }

  if (!row?.id) return { ok: false, error: 'Missing sale' };

  const saleId = row.id;
  const customerId = row.customer_id;
  const laybyId = row.layby_id || row.layby?.id || null;

  try {
    if (isFahme(customerId)) {
      const resolvedLaybyId = await resolveCustomerLaybyId(laybyId, customerId);
      if (!resolvedLaybyId) return { ok: false, error: 'No layby account found for customer' };
      return previewLaybyWhatsApp({
        laybyId: resolvedLaybyId,
        eventType: 'statement',
        saleId,
      });
    }

    if (
      String(row.computedStatus || row.status || '').toLowerCase() === 'layby'
      || (laybyId && Number(row.outstanding || 0) > BALANCE_EPSILON)
    ) {
      const resolvedLaybyId = await resolveCustomerLaybyId(laybyId, customerId);
      if (!resolvedLaybyId) return { ok: false, error: 'No layby account found for customer' };
      const eventType = Number(row.paid || 0) <= BALANCE_EPSILON ? 'new_layby' : 'layby_addition';
      return previewLaybyWhatsApp({
        laybyId: resolvedLaybyId,
        eventType,
        saleId,
      });
    }

    return previewSaleWhatsApp({ saleId });
  } catch (e) {
    console.warn('Sale WhatsApp preview failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

function resolveStatementSaleId(sale) {
  if (!sale) return null;
  const id = sale.sale_id ?? sale.id ?? sale.saleId ?? null;
  const normalized = String(id ?? '').trim();
  return normalized || null;
}

function pickLatestLaybySale(row) {
  const sales = row?.fullStatement?.sales || row?.statement?.sales || [];
  const latest = [...sales].sort((a, b) => {
    const ta = new Date(a?.sale_date || a?.created_at || 0).getTime();
    const tb = new Date(b?.sale_date || b?.created_at || 0).getTime();
    return tb - ta;
  })[0] || null;

  if (latest) {
    const id = resolveStatementSaleId(latest);
    return id ? { ...latest, id, sale_id: id } : null;
  }

  const fallbackId = String(row?.primaryLayby?.sale_id || '').trim();
  if (fallbackId) {
    return {
      id: fallbackId,
      sale_id: fallbackId,
      sale_date: row?.primaryLayby?.created_at || null,
      status: 'layby',
    };
  }

  return null;
}

function getSalePaidFromLaybyRow(row, saleId) {
  const payments = row?.fullStatement?.payments || row?.statement?.payments || [];
  const key = String(saleId || '');
  return (payments || [])
    .filter((payment) => String(payment?.sale_id || '') === key)
    .reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
}

function buildLaybyCustomerResendRow(row) {
  const customerId = row?.customerId || row?.customer_id;
  const laybyId = row?.primaryLayby?.id || (row?.laybys || []).find((entry) => entry?.id)?.id || null;
  const sale = pickLatestLaybySale(row);
  const saleId = resolveStatementSaleId(sale);
  if (!customerId || !saleId) return null;
  const paid = getSalePaidFromLaybyRow(row, saleId);
  const outstandingSale = (row?.fullStatement?.sales || row?.statement?.sales || [])
    .find((entry) => String(resolveStatementSaleId(entry) || '') === String(saleId));
  const dueFromTotals = Object.values(row?.totalsByCurrency || {})
    .reduce((sum, entry) => sum + Number(entry?.due || 0), 0);
  return {
    id: saleId,
    customer_id: customerId,
    layby_id: laybyId,
    computedStatus: 'layby',
    status: sale?.status || outstandingSale?.status || 'layby',
    paid,
    outstanding: Number(
      outstandingSale?.outstanding_amount
      ?? outstandingSale?.outstanding
      ?? outstandingSale?.total_due
      ?? dueFromTotals
      ?? 0,
    ),
    location_id: sale?.location_id || null,
  };
}

async function fetchLatestLaybySaleRow(laybyId) {
  if (!laybyId) return null;

  const select = 'id, sale_date, created_at, status, total_amount, location_id';
  const { data: byLayby } = await db
    .from('sales')
    .select(select)
    .eq('layby_id', laybyId)
    .order('sale_date', { ascending: false })
    .limit(1);
  if ((byLayby || [])[0]) return byLayby[0];

  const laybyIdNum = typeof laybyId === 'string' ? parseInt(laybyId, 10) : laybyId;
  if (Number.isFinite(laybyIdNum) && String(laybyIdNum) !== String(laybyId)) {
    const { data: byLaybyNum } = await db
      .from('sales')
      .select(select)
      .eq('layby_id', laybyIdNum)
      .order('sale_date', { ascending: false })
      .limit(1);
    if ((byLaybyNum || [])[0]) return byLaybyNum[0];
  }

  const { data: laybyRow } = await db
    .from('laybys')
    .select('sale_id')
    .eq('id', laybyId)
    .maybeSingle();
  if (!laybyRow?.sale_id) return null;

  const { data: bySaleId } = await db
    .from('sales')
    .select(select)
    .eq('id', laybyRow.sale_id)
    .maybeSingle();
  return bySaleId || null;
}

async function resolveLaybyCustomerResendRow(row) {
  const built = buildLaybyCustomerResendRow(row);
  if (built?.id) {
    if (built.location_id) return built;
    const { data: sale } = await db
      .from('sales')
      .select('location_id')
      .eq('id', built.id)
      .maybeSingle();
    if (sale?.location_id) return { ...built, location_id: sale.location_id };
    return built;
  }

  const customerId = row?.customerId || row?.customer_id;
  const laybyId = row?.primaryLayby?.id || (row?.laybys || []).find((entry) => entry?.id)?.id || null;
  if (!laybyId || !customerId) return null;

  const sale = await fetchLatestLaybySaleRow(laybyId);
  if (!sale?.id) return null;

  let paid = getSalePaidFromLaybyRow(row, sale.id);
  if (paid <= BALANCE_EPSILON) {
    const { data: pays } = await db
      .from('sales_payments')
      .select('amount')
      .eq('sale_id', sale.id);
    paid = (pays || []).reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
  }

  const dueFromTotals = Object.values(row?.totalsByCurrency || {})
    .reduce((sum, entry) => sum + Number(entry?.due || 0), 0);

  return {
    id: sale.id,
    customer_id: customerId,
    layby_id: laybyId,
    computedStatus: 'layby',
    status: sale.status || 'layby',
    paid,
    outstanding: dueFromTotals,
    location_id: sale.location_id,
  };
}

export function laybyCustomerRowHasLusakaSale(row) {
  const sales = row?.fullStatement?.sales || row?.statement?.sales || [];
  if (sales.some((sale) => String(sale?.location_id || '') === LUSAKA_BRANCH_ID)) return true;
  const latest = pickLatestLaybySale(row);
  return String(latest?.location_id || '') === LUSAKA_BRANCH_ID;
}

export async function laybyCustomerRowHasLusakaSaleAsync(row) {
  if (laybyCustomerRowHasLusakaSale(row)) return true;
  const laybyId = row?.primaryLayby?.id || (row?.laybys || []).find((entry) => entry?.id)?.id || null;
  if (!laybyId) return false;
  const sale = await fetchLatestLaybySaleRow(laybyId);
  return String(sale?.location_id || '') === LUSAKA_BRANCH_ID;
}

/** Monthly balance WhatsApp is Kitwe laybys only — drop rows whose layby sale is in Lusaka. */
export async function filterKitweLaybyRowsForMonthlyBalance(laybyRows = []) {
  const kept = [];
  for (const row of laybyRows || []) {
    const isLusaka = await laybyCustomerRowHasLusakaSaleAsync(row);
    if (!isLusaka) kept.push(row);
  }
  return kept;
}

export function resolveLaybyWhatsAppGroupLabel(customerId, isLusakaSale, customerName) {
  if (usesCashBookWhatsAppRouting(customerId, customerName)) return 'Cash Book';
  if (isFahme(customerId)) return 'Fahme';
  if (isLusakaSale) return 'Lusaka';
  return 'Layby';
}

export async function resendLaybyWhatsAppForCustomerRow(row) {
  const customerId = row?.customerId || row?.customer_id;
  const laybyId = row?.primaryLayby?.id || (row?.laybys || []).find((entry) => entry?.id)?.id || null;
  const resendRow = await resolveLaybyCustomerResendRow(row);
  if (!laybyId || !customerId) return { ok: false, error: 'Missing layby customer' };
  if (!resendRow?.id) return { ok: false, error: 'No layby sale found to resend' };

  if (isFahme(customerId)) {
    return notifyLaybyWhatsApp({
      laybyId,
      customerId,
      eventType: 'statement',
      saleId: resendRow.id,
      locationId: resendRow.location_id,
      laybySnapshot: row,
    });
  }

  const eventType = Number(resendRow.paid || 0) <= BALANCE_EPSILON ? 'new_layby' : 'layby_addition';
  return notifyLaybyWhatsApp({
    laybyId,
    customerId,
    eventType,
    saleId: resendRow.id,
    locationId: resendRow.location_id,
  });
}

export async function previewLaybyWhatsAppForCustomerRow(row) {
  const resendRow = await resolveLaybyCustomerResendRow(row);
  if (!resendRow?.id) return { ok: false, error: 'No layby sale found to preview' };
  return previewSaleWhatsAppForRow(resendRow);
}
