/* eslint-disable no-unused-vars, no-loop-func */
/* eslint-disable import/first */
import jsPDF from 'jspdf';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import { pdfTheme, formatCurrency } from './pdfTheme';
import { USE_LAYBY_RPC, fetchLaybyStatementRPC } from './laybyStatementService';
import { fetchCanonicalFinancials } from './utils/financials';
import { normalizeLaybyStatement } from './utils/laybyStatementNormalize';
import { fetchLaybyStatement } from './services/laybyStatement';
import { fetchLaybyPaymentsByCustomerId, fetchMergedLaybyPayments } from './services/laybyPayments';
import { rewriteLegacyStorageUrl } from './utils/storageImageUrl';
import { isFahme } from './laybyRules';
import laybyPdfItemFallbacks from './data/laybyPdfItemFallbacks.json';
import laybyPdfSettlementFallbacks from './data/laybyPdfSettlementFallbacks.json';
import laybyTelegramItemFallbacks from './data/laybyTelegramItemFallbacks.json';
import laybyTelegramSettlementFallbacks from './data/laybyTelegramSettlementFallbacks.json';
// Unified Layby PDF generator (desktop + mobile). ESLint import/first rule disabled above due to build tool duplication anomaly.

// Helper: Title case with acronym preservation (A)
const ACRONYM_KEEP = new Set(['FNB','VAT','TPIN','USD','ZMW']);
function titleCase(str = '') {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map(w => {
      const clean = w.replace(/[^A-Za-z0-9]/g,'');
      if (ACRONYM_KEEP.has(clean.toUpperCase())) return clean.toUpperCase();
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function posPaymentTypeLabel(type = '') {
  const key = String(type || '').trim().toLowerCase();
  const map = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    mobile_money: 'Mobile Money',
    cheque: 'Cheque',
    visa_card: 'Visa Card',
    goods: 'Goods',
    credit: 'Credit',
    down_payment: 'Down Payment',
  };
  return map[key] || titleCase(String(type || '').replace(/_/g, ' '));
}

function isSystemReceiptTag(value) {
  const raw = String(value || '').trim();
  return /^TG_DUE_/i.test(raw) || /^PDF_ITEM_RESTORE_/i.test(raw);
}

function isPlaceholderReference(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  return /^-+$/.test(raw);
}

function sanitizePaymentReference(value) {
  const raw = String(value || '').trim();
  if (!raw || isPlaceholderReference(raw) || isSystemReceiptTag(raw)) return '';
  return raw;
}

function isSystemMigrationSale(sale) {
  if (isSystemReceiptTag(sale?.receipt_number)) return true;
  const saleId = String(sale?.sale_id || '').trim();
  return /^(TG-|PDF-)/i.test(saleId);
}

function saleAmountForMatch(sale, finBySale) {
  const sid = String(sale?.id ?? sale?.sale_id ?? '');
  const fin = finBySale?.[sid];
  return Number(fin?.total_due ?? fin?.subtotal_before_discount ?? sale?.total_amount ?? 0);
}

function saleGrossAmountForMatch(sale, finBySale) {
  const sid = String(sale?.id ?? sale?.sale_id ?? '');
  const fin = finBySale?.[sid];
  // Prefer negotiated/statement due over raw item subtotals — subtotals can lag edited sales.
  const candidates = [
    fin?.total_due,
    sale?.total_due,
    sale?.total_amount,
    fin?.subtotal_before_discount,
    sale?.subtotal_before_discount,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function dedupeSystemMigrationSales(sales, finBySale) {
  const list = Array.isArray(sales) ? sales.slice() : [];
  const realSales = list.filter((sale) => !isSystemMigrationSale(sale));
  const migrationSales = list.filter((sale) => isSystemMigrationSale(sale));
  if (!migrationSales.length) return list;

  const kept = realSales.slice();
  migrationSales.forEach((sale) => {
    const migAmount = saleGrossAmountForMatch(sale, finBySale);
    if (migAmount > 0 && realSales.some((realSale) => (
      amountsRoughlyMatch(saleGrossAmountForMatch(realSale, finBySale), migAmount)
    ))) return;
    kept.push(sale);
  });
  return kept;
}

function sectionItemsTotal(section) {
  return (section?.items || []).reduce((sum, item) => (
    sum + Number(item?.amount ?? (Number(item?.qty || 0) * Number(item?.price || 0)))
  ), 0);
}

function amountsRoughlyMatch(left, right) {
  const a = Number(left || 0);
  const b = Number(right || 0);
  if (a <= 0 && b <= 0) return true;
  const diff = Math.abs(a - b);
  const scale = Math.max(a, b, 1);
  return diff <= Math.max(250, scale * 0.08);
}

function mergeFallbackSections(primarySections, telegramSections) {
  const byDate = new Map();
  [...(primarySections || []), ...(telegramSections || [])].forEach((section) => {
    const key = String(section?.isoDate || '').trim();
    if (!key || !Array.isArray(section?.items) || !section.items.length) return;
    const existing = byDate.get(key);
    if (!existing || sectionItemsTotal(section) > sectionItemsTotal(existing)) {
      byDate.set(key, section);
    }
  });
  return Array.from(byDate.values()).sort((left, right) => (
    String(left?.isoDate || '').localeCompare(String(right?.isoDate || ''))
  ));
}

function pickBestFallbackSection(dateKeyStr, salesForDate, available, finBySale) {
  if (!available.length) return null;

  const direct = available.find((section) => String(section?.isoDate || '') === String(dateKeyStr || ''));
  if (direct) return direct;

  const targetTotal = (salesForDate || []).reduce((sum, sale) => sum + saleGrossAmountForMatch(sale, finBySale), 0);
  const isMigrationDate = (salesForDate || []).some(isSystemMigrationSale);

  if (targetTotal > 0) {
    const amountMatches = available
      .map((section) => ({
        section,
        diff: Math.abs(sectionItemsTotal(section) - targetTotal),
      }))
      .filter((row) => amountsRoughlyMatch(sectionItemsTotal(row.section), targetTotal))
      .sort((left, right) => left.diff - right.diff);
    if (amountMatches.length) return amountMatches[0].section;
  }

  if (available.length === 1) {
    if (isMigrationDate || targetTotal <= 0) return available[0];
    const onlySection = available[0];
    const targetTs = Date.parse(`${dateKeyStr}T00:00:00Z`);
    const sectionTs = Date.parse(`${onlySection?.isoDate || ''}T00:00:00Z`);
    if (Number.isFinite(targetTs) && Number.isFinite(sectionTs)) {
      const diff = Math.abs(sectionTs - targetTs);
      const maxDiffMs = 120 * 24 * 60 * 60 * 1000;
      if (diff <= maxDiffMs) return onlySection;
    }
    // One telegram/PDF section for this customer — prefer real items over "brought forward".
    return onlySection;
  }

  const targetTs = Date.parse(`${dateKeyStr}T00:00:00Z`);
  if (Number.isFinite(targetTs)) {
    let best = null;
    let bestDiff = Infinity;
    available.forEach((section) => {
      const sectionTs = Date.parse(`${section?.isoDate || ''}T00:00:00Z`);
      if (!Number.isFinite(sectionTs)) return;
      const diff = Math.abs(sectionTs - targetTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = section;
      }
    });
    const maxDiffMs = (isMigrationDate ? 365 : 45) * 24 * 60 * 60 * 1000;
    if (best && bestDiff <= maxDiffMs) return best;
  }

  if (isMigrationDate && targetTotal > 0) {
    const ranked = available
      .map((section) => ({
        section,
        diff: Math.abs(sectionItemsTotal(section) - targetTotal),
      }))
      .sort((left, right) => left.diff - right.diff);
    if (ranked.length) return ranked[0].section;
  }

  return null;
}

function assignFallbackSectionsByDate(dateSections, salesByDate, fallbackSections, finBySale) {
  const assignment = new Map();
  const usedSections = new Set();
  const dateMeta = (dateSections || []).map((dateKeyStr) => {
    const salesForDate = salesByDate[dateKeyStr] || [];
    const targetTotal = salesForDate.reduce((sum, sale) => sum + saleGrossAmountForMatch(sale, finBySale), 0);
    return {
      dateKeyStr,
      salesForDate,
      targetTotal,
      isMigrationDate: salesForDate.some(isSystemMigrationSale),
    };
  });

  const sortedDates = dateMeta.slice().sort((left, right) => {
    if (left.isMigrationDate !== right.isMigrationDate) return left.isMigrationDate ? -1 : 1;
    if (left.targetTotal !== right.targetTotal) return right.targetTotal - left.targetTotal;
    return String(left.dateKeyStr).localeCompare(String(right.dateKeyStr));
  });

  sortedDates.forEach(({ dateKeyStr, salesForDate, targetTotal, isMigrationDate }) => {
    const available = (fallbackSections || []).filter((section) => (
      Array.isArray(section?.items)
      && section.items.length
      && !usedSections.has(String(section?.isoDate || ''))
    ));
    const match = pickBestFallbackSection(dateKeyStr, salesForDate, available, finBySale)
      || (isMigrationDate && available.length === 1 ? available[0] : null);
    if (!match) return;
    assignment.set(dateKeyStr, match);
    usedSections.add(String(match.isoDate));
  });

  return assignment;
}

function isMigrationCarryRow(row) {
  const name = String(row?.name || '').trim().toUpperCase();
  return name === 'OUTSTANDING BALANCE BROUGHT FORWARD'
    || name === 'ITEM BREAKDOWN NOT CAPTURED (TOTAL CARRIED)'
    || name.includes('BROUGHT FORWARD')
    || name.includes('NOT CAPTURED');
}

function resolveFallbackSectionForDate(dateKeyStr, salesForDate, fallbackSections, finBySale, usedIsoDates, preassigned) {
  if (preassigned?.has(dateKeyStr)) return preassigned.get(dateKeyStr);

  const sections = (fallbackSections || []).filter((section) => (
    Array.isArray(section?.items) && section.items.length
  ));
  const available = sections.filter((section) => !usedIsoDates.has(String(section?.isoDate || '')));
  const match = pickBestFallbackSection(dateKeyStr, salesForDate, available, finBySale);
  if (match) return match;

  const isMigrationDate = (salesForDate || []).some(isSystemMigrationSale);
  if (isMigrationDate && sections.length === 1) return sections[0];

  return pickBestFallbackSection(dateKeyStr, salesForDate, sections, finBySale);
}

function findFallbackSectionByAmount(targetTotal, fallbackSections) {
  const total = Number(targetTotal || 0);
  if (total <= 0 || !Array.isArray(fallbackSections) || !fallbackSections.length) return null;
  const sections = fallbackSections.filter((section) => Array.isArray(section?.items) && section.items.length);
  const ranked = sections
    .map((section) => ({
      section,
      diff: Math.abs(sectionItemsTotal(section) - total),
    }))
    .filter((row) => amountsRoughlyMatch(sectionItemsTotal(row.section), total))
    .sort((left, right) => left.diff - right.diff);
  if (ranked[0]?.section) return ranked[0].section;

  if (sections.length === 1) return sections[0];

  const relaxed = sections
    .map((section) => ({
      section,
      diff: Math.abs(sectionItemsTotal(section) - total),
    }))
    .sort((left, right) => left.diff - right.diff);
  const best = relaxed[0];
  if (best && best.diff <= Math.max(total, sectionItemsTotal(best.section)) * 0.25) {
    return best.section;
  }
  return null;
}

function resolveItemFallbackSection(dateKeyStr, salesForDate, fallbackSections, finBySale, canonicalTotal) {
  const sections = (fallbackSections || []).filter((section) => Array.isArray(section?.items) && section.items.length);
  if (!sections.length) return null;

  const byAmount = findFallbackSectionByAmount(canonicalTotal, sections);
  if (byAmount) return byAmount;

  const byDate = pickBestFallbackSection(dateKeyStr, salesForDate, sections, finBySale);
  if (byDate) return byDate;

  return sections.length === 1 ? sections[0] : null;
}

// Toggle for internal debug logging (set to true to re-enable logs during development)
const PDF_DEBUG = false;
const DRAW_TABLE_BORDERS = false; // temporary: disable all table borders per user request
const DRAW_PAGE_BORDER = true;

// Remove noisy console logs unless debug enabled
const safeLog = (type, ...args) => { if (!PDF_DEBUG) return; // eslint-disable-next-line no-console
  console[type](...args); };

// Dynamic sales column selection with graceful fallback.
// We attempt optional columns and remove any that trigger a 400 error so no warning appears to user.
// Note: down_payment removed; use sales_payments + computeSaleFinancials instead
const SALES_MANDATORY = ['id','sale_date','currency','layby_id','total_amount','customer_id'];
const SALES_OPTIONAL = ['discount']; // removed sale_discount (column no longer present)
async function selectSales(whereFn, single = false) {
  let cols = [...SALES_MANDATORY, ...SALES_OPTIONAL];
  while (true) {
    let query = fromPublic('sales').select(cols.join(', '));
    query = whereFn(query);
    if (single) query = query.limit(1).maybeSingle();
    const { data, error } = await query;
    if (!error) return { data, error: null };
    const msg = (error.message || '').toLowerCase();
    const missing = SALES_OPTIONAL.find(opt => msg.includes(`column sales.${opt}`));
    if (missing) {
      cols = cols.filter(c => c !== missing);
      if (PDF_DEBUG) console.warn('[LaybyPDF] Removing missing optional column', missing);
      continue; // retry without this optional column
    }
    // If some other error, log only in debug mode and return
    if (PDF_DEBUG) console.warn('[LaybyPDF] sales select error', error.message || error);
    return { data: null, error };
  }
}

let cachedCompany = null;

async function getCompanySettings() {
  if (cachedCompany) return cachedCompany;
  try {
    // Prefer global cache if another page already fetched settings
    if (typeof window !== 'undefined' && window.companySettings) {
      cachedCompany = window.companySettings;
      return cachedCompany;
    }
  } catch {}
  try {
    const { data } = await db.from('company_settings').select('*').single();
    cachedCompany = data || {};
    if (typeof window !== 'undefined') window.companySettings = cachedCompany;
  } catch {
    cachedCompany = {};
  }
  return cachedCompany;
}

function safe(val, fallback = '') {
  return (val === undefined || val === null) ? fallback : String(val);
}

function sanitizePaymentNote(note) {
  const raw = String(note || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered.includes('auto-migrated') && lowered.includes('down_payment')) return '';
  if (lowered.includes('migrated from sales.down_payment')) return '';
  return raw;
}

async function fetchSalesPaymentsForSaleIds(saleIds = []) {
  const ids = (saleIds || []).filter((value) => value != null);
  if (!ids.length) return [];
  try {
    const { data, error } = await fromPublic('sales_payments')
      .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
      .in('sale_id', ids)
      .order('payment_date', { ascending: true });
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function fetchLaybyPaymentsForSales(saleIds = []) {
  const ids = (saleIds || []).filter(v => v != null);
  if (!ids.length) return [];
  let laybyRows = [];
  try {
    let data = null;
    let error = null;
    ({ data, error } = await fromPublic('layby_payments')
      .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
      .in('sale_id', ids)
      .order('payment_date', { ascending: true }));
    if (!error) {
      laybyRows = data || [];
    } else {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('discount_amount')) {
        ({ data, error } = await fromPublic('layby_payments')
          .select('sale_id, amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
          .in('sale_id', ids)
          .order('payment_date', { ascending: true }));
        if (!error) laybyRows = (data || []).map(row => ({ ...row, discount_amount: 0 }));
      }
    }
  } catch {}

  const salesRows = await fetchSalesPaymentsForSaleIds(ids);
  if (!laybyRows.length) return salesRows;
  if (!salesRows.length) return laybyRows;

  const merged = [];
  const seen = new Set();
  [...laybyRows, ...salesRows].forEach((row) => {
    const key = buildLaybyPaymentMergeKey({
      ...row,
      payment_type: String(row?.payment_type || '').toLowerCase(),
    });
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });
  return merged;
}

function isClosedSaleStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'voided' || s === 'refunded' || s === 'settled' || s === 'paid';
}

async function appendLegacyDownPayments({ payments = [], sales = [] }) {
  const saleIds = (sales || []).map(s => s?.id || s?.sale_id).filter(v => v != null);
  if (!saleIds.length) return payments;
  const existingDown = new Set(
    (payments || [])
      .filter(p => String(p.payment_type || '').toLowerCase() === 'down_payment')
      .map(p => String(p.sale_id || ''))
  );
  try {
    const { data: downRows, error } = await fromPublic('sales_payments')
      .select('sale_id, amount, payment_date, currency, payment_type')
      .in('sale_id', saleIds)
      .eq('payment_type', 'down_payment');
    if (error || !downRows?.length) return payments;
    const extra = downRows
      .filter(r => Number(r?.amount || 0) > 0 && !existingDown.has(String(r.sale_id || '')))
      .map(r => ({
        id: `down-${r.sale_id}`,
        sale_id: r.sale_id,
        amount: Number(r.amount || 0),
        discount_amount: 0,
        payment_type: 'down_payment',
        payment_date: r.payment_date || null,
        reference: null,
        currency: r.currency || null,
        notes: 'Legacy down payment',
        allocation_batch_uuid: null,
      }));
    return extra.length ? payments.concat(extra) : payments;
  } catch {
    return payments;
  }
}

const LAYBY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isLaybyUuid = (value) => LAYBY_UUID_RE.test(String(value || '').trim());
const FAHME_PRIMARY_KEY = 'mohammad fahme';

function readRowTotalsUsd(opts) {
  const raw = opts?.totalsByCurrency || {};
  const entry = raw.USD || raw.$ || raw.usd || null;
  if (!entry) return null;
  return {
    total: Number(entry.total || 0),
    paid: Number(entry.paid || 0),
    discount: Number(entry.discount || 0),
    due: Number(entry.due || 0),
  };
}

function parseFallbackSettlementDateTs(dateLabel) {
  const m = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(String(dateLabel || '').trim());
  if (!m) return 0;
  const ts = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isFinite(ts) ? ts : 0;
}

function settlementLineDescription({ dateLabel, note, paymentType }) {
  const type = String(paymentType || 'Cash').trim();
  const cleanNote = String(note || '').trim();
  if (dateLabel && cleanNote) return `(${dateLabel}) - ${cleanNote} - ${type}`;
  if (dateLabel) return `(${dateLabel}) - ${type}`;
  if (cleanNote) return `${cleanNote} - ${type}`;
  return type || 'Down Payment';
}

function settlementLineDateTs(line) {
  if (line?.date) {
    const ts = new Date(line.date).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  const match = String(line?.description || '').match(/\(([0-9]{2}\/[0-9]{2}\/[0-9]{4})\)/);
  return match ? parseFallbackSettlementDateTs(match[1]) : 0;
}

function settlementLineDayKey(line) {
  const ts = settlementLineDateTs(line);
  if (!ts) return '';
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function paymentDayKey(payment) {
  const raw = payment?.payment_date || payment?.date || null;
  if (!raw) return '';
  try {
    return new Date(raw).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, desc) {
  const lineDay = settlementLineDayKey(line) || (lineTs ? new Date(lineTs).toISOString().slice(0, 10) : '');
  return paymentLines.some((existing) => {
    const existingAmount = Number(existing?.amount || 0);
    if (Math.abs(existingAmount - amount) > 0.01) return false;
    const existingDay = settlementLineDayKey(existing);
    if (lineDay && existingDay) return lineDay === existingDay;
    const existingTs = settlementLineDateTs(existing);
    if (lineTs && existingTs) return Math.abs(lineTs - existingTs) < 36e5;
    return String(existing?.description || '') === String(desc || line?.description || '');
  });
}

function paymentRowToSettlementLine(payment) {
  const dateLabel = payment?.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-GB') : '';
  const paymentType = titleCase(String(payment?.payment_type || 'cash').replace(/_/g, ' '));
  let note = sanitizePaymentNote(payment?.notes || '').trim();
  const reference = sanitizePaymentReference(payment?.reference);
  if (reference && !note.includes(reference)) {
    note = note ? `${note} (${reference})` : reference;
  }
  if (note && (isSystemReceiptTag(note) || isPlaceholderReference(note))) note = '';
  if (note.toLowerCase() === paymentType.toLowerCase()) note = '';
  return {
    description: settlementLineDescription({ dateLabel, note, paymentType }),
    paymentType,
    amount: Number(payment?.amount || 0),
    date: payment?.payment_date || null,
    discount_amount: Number(payment?.discount_amount || 0),
  };
}

function isPaymentCoveredByFallbackRow(payment, fallbackRows) {
  const amount = Number(payment?.amount || 0);
  const paymentDay = paymentDayKey(payment);
  return (fallbackRows || []).some((row) => {
    if (Math.abs(Number(row?.amount || 0) - amount) > 0.01) return false;
    const fallbackTs = parseFallbackSettlementDateTs(row?.date);
    if (!paymentDay || !fallbackTs) return false;
    const fallbackDay = new Date(fallbackTs).toISOString().slice(0, 10);
    return paymentDay === fallbackDay;
  });
}

function groupPaymentsByAllocationBatch(payments = []) {
  const grouped = new Map();
  (payments || []).forEach((payment, index) => {
    const batchKey = String(payment?.allocation_batch_uuid || '').trim() || `single:${payment?.id || index}`;
    const paymentAmount = Number(payment?.amount || 0);
    const paymentDiscount = Number(payment?.discount_amount || 0);
    if (!grouped.has(batchKey)) {
      grouped.set(batchKey, {
        sale_id: payment?.sale_id,
        amount: paymentAmount,
        discount_amount: paymentDiscount,
        payment_date: payment?.payment_date || null,
        payment_type: payment?.payment_type || 'cash',
        notes: payment?.notes || '',
        reference: payment?.reference || '',
        allocation_batch_uuid: payment?.allocation_batch_uuid || null,
      });
      return;
    }
    const entry = grouped.get(batchKey);
    // layby_payments and sales_payments mirror the same batch — do not sum.
    if (String(payment?.allocation_batch_uuid || '').trim()) {
      entry.amount = Math.max(entry.amount, paymentAmount);
      entry.discount_amount = Math.max(entry.discount_amount, paymentDiscount);
    } else {
      entry.amount += paymentAmount;
      entry.discount_amount += paymentDiscount;
    }
    if (payment?.payment_date && (!entry.payment_date || payment.payment_date > entry.payment_date)) {
      entry.payment_date = payment.payment_date;
    }
    if (!entry.notes && payment?.notes) entry.notes = payment.notes;
    if (!entry.reference && payment?.reference) entry.reference = payment.reference;
    if (!entry.payment_type && payment?.payment_type) entry.payment_type = payment.payment_type;
  });
  return Array.from(grouped.values()).map((row) => ({
    ...row,
    payment_type: String(row.payment_type || 'cash').toLowerCase(),
  }));
}

function appendFahmeLiveSettlementPayments({ paymentLines, payments, fallbackSettlementRows }) {
  const fallbackMaxTs = (fallbackSettlementRows || []).reduce(
    (maxTs, row) => Math.max(maxTs, parseFallbackSettlementDateTs(row?.date)),
    0,
  );
  const grouped = groupPaymentsByAllocationBatch(payments);
  grouped.forEach((payment) => {
    const amount = Number(payment?.amount || 0);
    if (!(amount > 0)) return;
    const paymentTs = payment?.payment_date ? new Date(payment.payment_date).getTime() : 0;
    if (fallbackMaxTs && paymentTs && paymentTs <= fallbackMaxTs) return;
    if (isPaymentCoveredByFallbackRow(payment, fallbackSettlementRows)) return;
    const line = paymentRowToSettlementLine(payment);
    const lineTs = settlementLineDateTs(line);
    if (isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, line.description)) return;
    paymentLines.push(line);
  });
}

function resolveFahmeTargetPaid(opts, related) {
  const rowTotals = readRowTotalsUsd(opts);
  if (rowTotals) {
    const total = Number(rowTotals.total || 0);
    const discount = Number(rowTotals.discount || 0);
    const due = Number(rowTotals.due || 0);
    if (total > 0 && due >= 0) {
      return Math.max(0, total - discount - due);
    }
    if (Number(rowTotals.paid || 0) > 0) {
      return Number(rowTotals.paid || 0);
    }
  }
  return groupPaymentsByAllocationBatch(related?.payments || [])
    .reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
}

function appendLivePaymentsNotInFallback({ paymentLines, payments, fallbackSettlementRows }) {
  (payments || []).forEach((payment) => {
    const amount = Number(payment?.amount || 0);
    if (!(amount > 0)) return;
    if (isPaymentCoveredByFallbackRow(payment, fallbackSettlementRows)) return;
    const line = paymentRowToSettlementLine(payment);
    const lineTs = settlementLineDateTs(line);
    if (isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, line.description)) return;
    paymentLines.push(line);
  });
}

function appendLivePaymentsAfterFallback({ paymentLines, fallbackSettlementRows, livePaymentLines }) {
  if (!livePaymentLines.length) return;
  const fallbackMaxTs = (fallbackSettlementRows || []).reduce(
    (maxTs, row) => Math.max(maxTs, parseFallbackSettlementDateTs(row?.date)),
    0,
  );
  livePaymentLines.forEach((line) => {
    const desc = String(line?.description || '');
    if (/TG_DUE_|PDF_ITEM_RESTORE_/i.test(desc)) return;
    const amount = Number(line?.amount || 0);
    if (!(amount > 0)) return;
    const lineTs = settlementLineDateTs(line);
    // Keep payments on/after the last trusted fallback date (new down payments).
    if (fallbackMaxTs && lineTs && lineTs <= fallbackMaxTs) return;
    if (!fallbackMaxTs && !lineTs) return;
    if (isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, desc)) return;
    paymentLines.push(line);
  });
}

function appendUnlistedLivePayments({ paymentLines, livePaymentLines }) {
  livePaymentLines.forEach((line) => {
    const amount = Number(line?.amount || 0);
    if (!(amount > 0)) return;
    const lineTs = settlementLineDateTs(line);
    if (isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, line.description)) return;
    paymentLines.push(line);
  });
}

function appendPaymentsToClosePaidGap({ paymentLines, payments, targetPaid, fallbackSettlementRows }) {
  const goal = Number(targetPaid || 0);
  if (!(goal > 0)) return;
  let currentPaid = paymentLines.reduce((sum, line) => sum + Number(line?.amount || 0), 0);
  if (!(goal > currentPaid + 0.01)) return;

  const fallbackMaxTs = (fallbackSettlementRows || []).reduce(
    (maxTs, row) => Math.max(maxTs, parseFallbackSettlementDateTs(row?.date)),
    0,
  );
  const candidates = (payments || [])
    .map((payment) => paymentRowToSettlementLine(payment))
    .filter((line) => Number(line?.amount || 0) > 0)
    .sort((left, right) => settlementLineDateTs(left) - settlementLineDateTs(right));

  const tryAppend = (ignoreFallbackDate) => {
    candidates.forEach((line) => {
      if (!(goal > currentPaid + 0.01)) return;
      const amount = Number(line?.amount || 0);
      const lineTs = settlementLineDateTs(line);
      if (!ignoreFallbackDate && fallbackMaxTs && lineTs && lineTs <= fallbackMaxTs) return;
      if (isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, line.description)) return;
      paymentLines.push(line);
      currentPaid += amount;
    });
  };

  tryAppend(false);
  if (goal > currentPaid + 0.01) tryAppend(true);

  // Management row paid total is authoritative — if settlement lines still fall short, show the gap.
  currentPaid = paymentLines.reduce((sum, line) => sum + Number(line?.amount || 0), 0);
  const gap = Number((goal - currentPaid).toFixed(2));
  if (gap <= 0.01) return;

  const exactMatch = candidates.find((line) => {
    const amount = Number(line?.amount || 0);
    const lineTs = settlementLineDateTs(line);
    return Math.abs(amount - gap) < 0.01
      && !isSettlementLineAlreadyListed(paymentLines, line, amount, lineTs, line.description);
  });
  if (exactMatch) {
    paymentLines.push(exactMatch);
    return;
  }

  const newestAfterFallback = candidates
    .filter((line) => {
      const lineTs = settlementLineDateTs(line);
      return !fallbackMaxTs || !lineTs || lineTs > fallbackMaxTs;
    })
    .sort((left, right) => settlementLineDateTs(right) - settlementLineDateTs(left))[0];
  const dateLabel = newestAfterFallback?.date
    ? new Date(newestAfterFallback.date).toLocaleDateString('en-GB')
    : '';
  paymentLines.push({
    description: settlementLineDescription({
      dateLabel,
      note: '',
      paymentType: newestAfterFallback?.paymentType || 'Cash',
    }),
    paymentType: newestAfterFallback?.paymentType || 'Cash',
    amount: gap,
    date: newestAfterFallback?.date || null,
    discount_amount: 0,
  });
}

function buildLaybyPaymentMergeKey(payment) {
  const batch = String(payment?.allocation_batch_uuid || '').trim();
  if (batch) return `batch:${batch}`;
  if (payment?.id != null) return `id:${payment.id}`;
  return [
    payment?.sale_id || '',
    payment?.payment_date || '',
    Number(payment?.amount || 0),
    Number(payment?.discount_amount || 0),
    String(payment?.payment_type || '').toLowerCase(),
    String(payment?.reference || ''),
    String(payment?.notes || ''),
  ].join('|');
}

function mergeLaybyPaymentRows(related, extraRows = []) {
  const merged = [...(related.payments || [])];
  const seen = new Set(merged.map(buildLaybyPaymentMergeKey));
  (extraRows || []).forEach((row) => {
    const normalized = { ...row, payment_type: String(row?.payment_type || '').toLowerCase() };
    const key = buildLaybyPaymentMergeKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  });
  related.payments = merged;
}

async function augmentFahmeSettlementPayments(related, customerId) {
  const id = String(customerId || '').trim();
  if (!id) return;
  const saleIds = new Set(
    (related.sales || []).map((sale) => sale?.id ?? sale?.sale_id).filter((value) => value != null),
  );
  try {
    const { data: customerSales } = await fromPublic('sales')
      .select('id')
      .eq('customer_id', id);
    (customerSales || []).forEach((sale) => {
      if (sale?.id != null) saleIds.add(sale.id);
    });
  } catch {}
  try {
    const { data, error } = await fetchMergedLaybyPayments({
      customerId: id,
      saleIds: Array.from(saleIds),
    });
    if (error || !Array.isArray(data)) return;
    mergeLaybyPaymentRows(related, data);
  } catch {}
}

function normalizeSettlementLineDescriptions(paymentLines) {
  paymentLines.forEach((line) => {
    const dateLabel = line?.date
      ? new Date(line.date).toLocaleDateString('en-GB')
      : (String(line?.description || '').match(/\(([0-9]{2}\/[0-9]{2}\/[0-9]{4})\)/)?.[1] || '');
    const paymentType = String(line?.paymentType || 'Cash').trim();
    let note = String(line?.description || '').trim();
    note = note
      .replace(/^\([0-9]{2}\/[0-9]{2}\/[0-9]{4}\)\s*-\s*/i, '')
      .replace(new RegExp(`\\s*-\\s*${paymentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '')
      .trim();
    if (note.toLowerCase() === paymentType.toLowerCase()) note = '';
    if (isPlaceholderReference(note)) note = '';
    line.description = settlementLineDescription({ dateLabel, note, paymentType });
    if (!line.date && dateLabel) {
      const ts = parseFallbackSettlementDateTs(dateLabel);
      if (ts) line.date = new Date(ts).toISOString();
    }
  });
}

function getLogoUrl(company) {
  const url = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '');
  if (url) return url;
  try {
    if (typeof window !== 'undefined') return window.location.origin + '/bestrest-logo.png';
  } catch {}
  return '';
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

// opts.mode: 'download' | 'blob' | 'arraybuffer' (default 'download')
export async function generateLaybyPdf(layby, opts = {}) {
  try {
    const company = await getCompanySettings();
    const companyName = safe(company?.company_name || company?.name, 'Best Rest Furniture');
    const companyAddress = safe(company?.company_address || company?.address, '');
    const companyPhone = safe(company?.company_phone || company?.phone, '');
    const companyEmail = safe(company?.company_email || company?.email, '');
    const companyTPIN = safe(company?.company_tpin || company?.tpin, '');

    const logoUrl = getLogoUrl(company);
    const img = await loadImage(logoUrl);

    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let cursorY = margin;

    const drawPageBorder = () => {
      try {
        if (!DRAW_PAGE_BORDER) return;
        const mm = 2.834;
        const inset = 2 * mm; // 2mm
        doc.setDrawColor(0, 132, 170);
        doc.setLineWidth(1);
        doc.rect(inset, inset, pageWidth - inset * 2, pageHeight - inset * 2);
      } catch {}
    };

    // Prepare header sizes (we'll draw watermark first, so compute boxes now)
    const headerFont = { family: 'helvetica', style: 'bold', size: 22 };
    const subFont = { family: 'helvetica', style: 'bold', size: 16 };
    doc.setFont(headerFont.family, headerFont.style);
    doc.setFontSize(headerFont.size);
    const headerText = opts?.posReceipt ? 'Sales Receipt' : 'Layby Statement';
    const headerW = doc.getTextWidth(headerText);
    const headerH = headerFont.size + 4;
    const headerX = (pageWidth - headerW) / 2;
    const headerY = cursorY; // baseline
    const headerBox = { x: headerX - 6, y: headerY - headerH + 4, w: headerW + 12, h: headerH + 4 };
    cursorY += headerFont.size;

    doc.setFont(subFont.family, subFont.style);
    doc.setFontSize(subFont.size);
    const subW = doc.getTextWidth(companyName);
    const subH = subFont.size + 4;
    const subX = (pageWidth - subW) / 2;
    const subY = cursorY + 10; // baseline below header
    const subBox = { x: subX - 6, y: subY - subH + 4, w: subW + 12, h: subH + 4 };
    cursorY = subY + 2;

    // Compute logo placement and reserve box (aligned with headers)
    let reservedLogoBottom = margin;
    let logoReserve = null;
  const logoMaxW = 100;
  const logoMaxH = 100;
    let logoDraw = null; // function to actually draw later
    if (img) {
      try {
        let w = img.width;
        let h = img.height;
        const scale = Math.min(logoMaxW / w, logoMaxH / h, 1);
        w = Math.max(24, w * scale);
        h = Math.max(24, h * scale);
  // Lift logo ~2cm higher, but keep a small top padding to avoid clipping into page border
  const CM = 28.346;
  const lift = 2 * CM; // ~2cm in points
  const logoY = Math.max(6, (margin - 18) - lift);
        const logoX = margin;
        reservedLogoBottom = logoY + h;
        logoReserve = { x: logoX, y: logoY, w, h };
        logoDraw = () => {
          try { doc.addImage(img, 'PNG', logoX, logoY, w, h); } catch {}
        };
      } catch {}
    }

    // After headers/logo area, content starts here
    const afterHeadersY = margin + 30;
    const contentStartY = Math.max(cursorY + 8, reservedLogoBottom + 8, afterHeadersY);
    cursorY = contentStartY;

    drawPageBorder();

    // Left block: Customer details
    const customer = layby?.customerInfo || layby?.customer || {};
    const custName = safe(customer.name || layby?.customer_name || layby?.customerName, '');
    const custPhone = safe(customer.phone || layby?.customer_phone || layby?.phone, '');
    const custAddress = safe(
      customer.address || customer.address_line1 || customer.address_line_1 || customer.customer_address || layby?.customer_address,
      ''
    );
    const fallbackCustomerKey = String(custName || '').trim().toLowerCase();
    const fahmeCustomerId = layby?.customer_id || customer?.id || null;
    const isFahmeCustomer = isFahme(fahmeCustomerId)
      || fallbackCustomerKey === FAHME_PRIMARY_KEY
      || fallbackCustomerKey === 'mohammad fahme acc(2)';
    let fallbackSectionsPrimary = [];
    if (isFahmeCustomer) {
      const mainSections = Array.isArray(laybyPdfItemFallbacks?.[FAHME_PRIMARY_KEY])
        ? laybyPdfItemFallbacks[FAHME_PRIMARY_KEY]
        : [];
      const extraSections = fallbackCustomerKey !== FAHME_PRIMARY_KEY
        && Array.isArray(laybyPdfItemFallbacks?.[fallbackCustomerKey])
        ? laybyPdfItemFallbacks[fallbackCustomerKey]
        : [];
      fallbackSectionsPrimary = extraSections.length
        ? mergeFallbackSections(mainSections, extraSections)
        : mainSections;
    } else {
      fallbackSectionsPrimary = Array.isArray(laybyPdfItemFallbacks?.[fallbackCustomerKey])
        ? laybyPdfItemFallbacks[fallbackCustomerKey]
        : [];
    }
    const fallbackSectionsTelegram = Array.isArray(laybyTelegramItemFallbacks?.[fallbackCustomerKey])
      ? laybyTelegramItemFallbacks[fallbackCustomerKey]
      : [];
    const fallbackSections = isFahmeCustomer
      ? fallbackSectionsPrimary
      : mergeFallbackSections(fallbackSectionsPrimary, fallbackSectionsTelegram);

    let fallbackSettlementPrimary = [];
    if (isFahmeCustomer) {
      const mainSettlement = Array.isArray(laybyPdfSettlementFallbacks?.[FAHME_PRIMARY_KEY])
        ? laybyPdfSettlementFallbacks[FAHME_PRIMARY_KEY]
        : [];
      const extraSettlement = Array.isArray(laybyPdfSettlementFallbacks?.['mohammad fahme acc(2)'])
        ? laybyPdfSettlementFallbacks['mohammad fahme acc(2)']
        : [];
      fallbackSettlementPrimary = extraSettlement.length
        ? [...mainSettlement, ...extraSettlement]
        : mainSettlement;
    } else {
      fallbackSettlementPrimary = Array.isArray(laybyPdfSettlementFallbacks?.[fallbackCustomerKey])
        ? laybyPdfSettlementFallbacks[fallbackCustomerKey]
        : [];
    }
    const fallbackSettlementTelegram = Array.isArray(laybyTelegramSettlementFallbacks?.[fallbackCustomerKey])
      ? laybyTelegramSettlementFallbacks[fallbackCustomerKey]
      : [];
    const fallbackSettlementRows = fallbackSettlementPrimary.length
      ? fallbackSettlementPrimary
      : (isFahmeCustomer ? [] : fallbackSettlementTelegram);
    const fallbackItemsByDate = new Map(
      fallbackSections
        .filter((section) => section?.isoDate && Array.isArray(section?.items))
        .map((section) => [String(section.isoDate), section.items])
    );
    // Build left block: remove currency line entirely; always show Address label (even if empty)
    const leftLines = [
      custName ? `Customer: ${custName}` : 'Customer: —',
      custPhone ? `Phone: ${custPhone}` : undefined,
      `Address:${custAddress ? ' ' + custAddress : ''}`,
      // Keep Sale ID if present
      layby?.sale_id ? `Sale ID: ${layby.sale_id}` : undefined,
    ].filter(Boolean);

    // Right block: Company details
    const rightX = pageWidth - margin;
    const rightLines = [
      companyName,
      companyAddress || undefined,
      companyPhone ? `Phone: ${companyPhone}` : undefined,
      companyEmail ? `Email: ${companyEmail}` : undefined,
      companyTPIN ? `TPIN: ${companyTPIN}` : undefined,
    ].filter(Boolean);

    // Compute block rectangles for watermark avoidance (do not draw text yet)
  const lineH = 16;
  // Slightly pad reserved boxes to keep watermarks comfortably away
  const boxPad = 6;
  const leftW = Math.max(220, pageWidth * 0.45 - margin);
  const rightW = Math.max(220, pageWidth * 0.45 - margin);
  const leftBox = { x: margin - boxPad, y: cursorY - 12 - boxPad, w: leftW + boxPad * 2, h: lineH * leftLines.length + 16 + boxPad * 2 };
  const rightBox = { x: pageWidth - rightW - margin - boxPad, y: cursorY - 12 - boxPad, w: rightW + boxPad * 2, h: lineH * rightLines.length + 16 + boxPad * 2 };

    // Build reserved boxes: header, subheader, logo, left/right blocks
    const reservedBoxes = [headerBox, subBox].concat(logoReserve ? [logoReserve] : []).concat([leftBox, rightBox]);

    // Watermark grid: behind all text; cover entire page (top to bottom)
    try {
      doc.saveGraphicsState && doc.saveGraphicsState();
      // Light gray with optional opacity if supported
      // Make watermark clearly visible but still subtle
      if (doc.GState) { try { doc.setGState(new doc.GState({ opacity: 0.14 })); } catch {} }
      doc.setTextColor(175);
      doc.setFont('helvetica', 'bold');
      const wmFontSize = 38;
      doc.setFontSize(wmFontSize);
      const wm = companyName;
      const wmW = doc.getTextWidth(wm);
      const angle = 30;
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const wmH = wmFontSize + 4;
      // Axis-aligned extents of rotated text box
      const rotW = Math.abs(wmW * cos) + Math.abs(wmH * sin);
      const rotH = Math.abs(wmW * sin) + Math.abs(wmH * cos);
      // Denser grid for better visibility across entire page
      const stepX = Math.max(180, rotW * 1.05);
      const stepY = Math.max(120, rotH * 1.35);
      // Cover the entire page area (beyond edges to ensure full coverage)
      const startX = -rotW; // start before the visible area
      const startY = -rotH; // start above the visible area
      for (let y = startY; y < pageHeight + rotH; y += stepY) {
        for (let x = startX; x < pageWidth + rotW; x += stepX) {
          doc.text(wm, x, y, { angle });
        }
      }
      doc.restoreGraphicsState && doc.restoreGraphicsState();
      doc.setTextColor(0);
    } catch {}

    // Now draw headers, logo, and blocks on top
    doc.setFont(headerFont.family, headerFont.style);
    doc.setFontSize(headerFont.size);
    doc.text(headerText, pageWidth / 2, headerY, { align: 'center' });
    doc.setFont(subFont.family, subFont.style);
    doc.setFontSize(subFont.size);
    doc.text(companyName, pageWidth / 2, subY, { align: 'center' });
    if (logoDraw) logoDraw();

    // Left block text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    let yLeft = contentStartY;
    leftLines.forEach(line => { doc.text(line, margin, yLeft); yLeft += lineH; });
    // Right block text
    let yRight = contentStartY;
    rightLines.forEach(line => { doc.text(line, rightX, yRight, { align: 'right' }); yRight += lineH; });

    // Note: Removed duplicate watermark pass to prevent overlapping watermarks

    // ---------------------------
    // Fetch related sales, items, products, payments for tables (RPC first, fallback legacy)
    // ---------------------------
  const related = { sales: [], items: [], payments: [], products: {}, finBySale: {} };
    // If a pre-fetched statement (useLaybyData) is provided, hydrate related directly and skip network fetch below
    if (opts.statement && opts.statement.sales) {
      try {
        related.sales = (opts.statement.sales || []).map(s => ({ id: s.sale_id || s.id || s.saleId, ...s }));
        related.items = Array.isArray(opts.statement.items) ? opts.statement.items : [];
        related.payments = Array.isArray(opts.statement.payments) ? opts.statement.payments.map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() })) : [];
        (opts.statement.sales || []).forEach(s => {
          const sid = s.sale_id || s.id;
          if (sid != null) {
            related.finBySale[String(sid)] = {
              total_due: Number(s.total_due || 0),
              paid_amount: Number(s.paid_amount || 0),
              outstanding_amount: Number(s.outstanding_amount || Math.max(0, Number(s.total_due || 0) - Number(s.paid_amount || 0))),
              subtotal_before_discount: Number(s.subtotal_before_discount || 0),
              discount_amount: Number(s.discount_amount || 0),
            };
          }
        });
      } catch {}
    }
    try {
      // Track whether RPC path was used so we can augment with extra customer sales/items if needed
      let rpcUsed = false;
      let apiUsed = false;
      const laybyId = layby?.id;
      if (!related.sales.length) { // Only fetch if not pre-populated
      if (USE_LAYBY_RPC && layby?.customer_id && laybyId) {
        try {
          const { data: rpcData, error: rpcErr } = await fetchLaybyStatementRPC(layby.customer_id, laybyId);
          if (!rpcErr && rpcData && rpcData.sales) {
            related.sales = rpcData.sales.map(s => ({ id: s.sale_id, ...s }));
            related.items = rpcData.items || [];
            related.payments = (rpcData.payments || []).map(p => ({ ...p, sale_id: p.sale_id }));
            (rpcData.sales || []).forEach(s => {
              related.finBySale[String(s.sale_id)] = {
                total_due: Number(s.total_due||0),
                paid_amount: Number(s.paid_amount||0),
                outstanding_amount: Number(s.outstanding_amount||0),
                subtotal_before_discount: Number(s.subtotal_before_discount || 0),
                discount_amount: Number(s.discount_amount || 0),
              };
            });
            rpcUsed = true;
            if (PDF_DEBUG) { try { console.info('[LaybyPDF] Used get_layby_statement RPC'); } catch {} }
          }
        } catch (e) { if (PDF_DEBUG) { try { console.warn('[LaybyPDF] RPC fetch failed, fallback', e?.message || e); } catch {} } }
      }
        if (!rpcUsed && !related.sales.length && layby?.customer_id) {
          try {
            const { data: apiData, error: apiErr } = await fetchLaybyStatement(layby.customer_id);
            if (!apiErr && apiData?.sales) {
              related.sales = (apiData.sales || []).map(s => ({ id: s.sale_id || s.id || s.saleId, ...s }));
              related.items = Array.isArray(apiData.items) ? apiData.items : [];
              related.payments = Array.isArray(apiData.payments)
                ? apiData.payments.map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }))
                : [];
              (apiData.sales || []).forEach(s => {
                const sid = s.sale_id || s.id;
                if (sid != null) {
                  related.finBySale[String(sid)] = {
                    total_due: Number(s.total_due || 0),
                    paid_amount: Number(s.paid_amount || 0),
                    outstanding_amount: Number(s.outstanding_amount || Math.max(0, Number(s.total_due || 0) - Number(s.paid_amount || 0))),
                    subtotal_before_discount: Number(s.subtotal_before_discount || 0),
                    discount_amount: Number(s.discount_amount || 0),
                  };
                }
              });
              apiUsed = true;
              if (PDF_DEBUG) { try { console.info('[LaybyPDF] Used layby-statement API'); } catch {} }
            }
          } catch (e) { if (PDF_DEBUG) { try { console.warn('[LaybyPDF] API fetch failed, fallback', e?.message || e); } catch {} } }
        }
      let sales = [];
        if (!rpcUsed && !apiUsed && laybyId) {
        // Primary: find any sales rows linked via layby_id (only if numeric to match bigint column)
        try {
          const laybyIdNum = typeof laybyId === 'string' ? parseInt(laybyId, 10) : laybyId;
          if (Number.isFinite(laybyIdNum)) {
            const { data: saleRows, error: salesErr } = await selectSales(q => q.eq('layby_id', laybyIdNum));
            if (salesErr && PDF_DEBUG) { try { console.error('[LaybyPDF] sales fetch error by layby_id', salesErr.message || salesErr); } catch {} }
            sales = saleRows || [];
          }
        } catch {}
        // Always merge explicit sale_id row too (some legacy rows may only link via sale_id)
        if (layby?.sale_id) {
          const { data: singleSale, error: singleSaleErr } = await selectSales(q => q.eq('id', layby.sale_id), true);
          if (singleSaleErr && PDF_DEBUG) { try { console.error('[LaybyPDF] single sale fetch error (explicit sale_id)', singleSaleErr.message || singleSaleErr); } catch {} }
          if (singleSale && !sales.some(s => Number(s.id) === Number(singleSale.id))) sales.push(singleSale);
        }
        // Secondary fallback: maybe the layby row itself holds the sale_id and wasn't passed in
        if ((!sales || sales.length === 0) && !layby?.sale_id) {
          try {
            const { data: laybyRow, error: laybyRowErr } = await db
              .from('laybys')
              .select('sale_id')
              .eq('id', laybyId)
              .maybeSingle();
            if (laybyRowErr && PDF_DEBUG) { try { console.error('[LaybyPDF] layby row fetch error for sale_id lookup', laybyRowErr.message || laybyRowErr); } catch {} }
            if (laybyRow?.sale_id) {
              const { data: singleSale2, error: singleSale2Err } = await selectSales(q => q.eq('id', laybyRow.sale_id), true);
              if (singleSale2Err && PDF_DEBUG) { try { console.error('[LaybyPDF] single sale fetch error (laybyRow.sale_id)', singleSale2Err.message || singleSale2Err); } catch {} }
              if (singleSale2) sales = [singleSale2];
            }
          } catch (e) { if (PDF_DEBUG) { try { console.error('[LaybyPDF] unexpected error in laybyRow fallback', e?.message || e); } catch {} } }
        }
        // Do not merge other customer sales; keep only layby-linked sales.
      } else if (!rpcUsed && layby?.sale_id) {
        const { data: singleSale, error: singleSaleErr } = await selectSales(q => q.eq('id', layby.sale_id), true);
        if (singleSaleErr && PDF_DEBUG) { try { console.error('[LaybyPDF] single sale fetch error (no laybyId path)', singleSaleErr.message || singleSaleErr); } catch {} }
        if (singleSale) sales = [singleSale];
      }
      if (!rpcUsed) {
        try {
          const byId = new Map();
          (sales || []).forEach(s => { const key = String(s.id); if (!byId.has(key)) byId.set(key, s); });
          sales = Array.from(byId.values());
        } catch {}
        related.sales = sales;
        const saleIds = sales.map(s => s.id);
        try { console.info('[LaybyPDF] Sales fetched for layby', layby?.id, saleIds); } catch {}
        if (saleIds.length) {
          const saleIdsNumeric = saleIds.map(v => typeof v === 'string' ? parseInt(v, 10) : v).filter(v => Number.isFinite(v));
          try {
            const finMap = await fetchCanonicalFinancials(db, saleIdsNumeric);
            finMap.forEach((r, k) => { related.finBySale[String(k)] = r; });
          } catch {}
          const { data: itemRows, error: itemsErr } = await db
            .from('sales_items')
            .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
            .in('sale_id', saleIdsNumeric);
          if (itemsErr && PDF_DEBUG) { try { console.error('[LaybyPDF] sales_items fetch error', itemsErr.message || itemsErr); } catch {} }
          related.items = itemRows || [];
          try { console.info('[LaybyPDF] Items fetched counts', { count: related.items.length, sample: related.items.slice(0,3) }); } catch {}
          const productIds = [...new Set((itemRows || []).map(r => r.product_id).filter(Boolean))];
          if (productIds.length) {
            const { data: prodRows } = await db
              .from('products')
              .select('id, name')
              .in('id', productIds);
            (prodRows || []).forEach(p => { related.products[p.id] = p.name; });
          }
          const paymentRows = await fetchLaybyPaymentsForSales(saleIdsNumeric);
          related.payments = paymentRows || [];
          try {
            const baseSaleId = layby?.sale_id;
            if (baseSaleId) {
              const basePay = await fetchLaybyPaymentsForSales([baseSaleId]);
              (basePay || []).forEach(p => {
                if (!related.payments.some(x => x.sale_id === p.sale_id && x.amount === p.amount && x.payment_date === p.payment_date && x.reference === p.reference)) {
                  related.payments.push(p);
                }
              });
            }
          } catch {}
          try { console.info('[LaybyPDF] Payments fetched', related.payments.length); } catch {}
          try {
            const seen = new Set();
            related.payments = (related.payments || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() })).filter(p => {
              const key = `${p.sale_id}|${p.payment_date || ''}|${Number(p.amount || 0)}|${String(p.reference || '')}|${String(p.notes || '')}|${String(p.payment_type || '').toLowerCase()}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          } catch {}
        }
      }
      if (rpcUsed) {
        // finBySale already populated; ensure payments normalized
        try {
          related.payments = (related.payments || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
        } catch {}
      }
      // Do not augment RPC with other customer sales; keep only layby-linked sales.
      }
    } catch (fetchErr) {
      // eslint-disable-next-line no-console
      console.warn('Failed to fetch layby related data for PDF', fetchErr?.message || fetchErr);
    }

    // Quote-origin preference: if layby came from a quote, use quotation_items for the PDF.
    try {
      const statementSaleIds = Array.from(new Set((related.sales || []).map(s => String(s.id || s.sale_id || '')).filter(Boolean)));
      const statementLaybyIds = Array.from(new Set((related.sales || []).map(s => String(s.layby_id || '')).filter(Boolean)));
      const saleIdsForQuote = statementSaleIds.slice();
      if (layby?.sale_id && !saleIdsForQuote.includes(layby.sale_id)) saleIdsForQuote.push(layby.sale_id);
      let quoteRow = null;
      if (saleIdsForQuote.length) {
        const { data: qBySale } = await db
          .from('quotations')
          .select('id, sale_id, created_at')
          .in('sale_id', saleIdsForQuote)
          .order('created_at', { ascending: false })
          .limit(1);
        if (qBySale && qBySale.length) quoteRow = qBySale[0];
      }
      if (!quoteRow && layby?.id && isLaybyUuid(layby.id) && !opts?.posReceipt) {
        const { data: qByLayby } = await db
          .from('quotations')
          .select('id, sale_id, created_at')
          .eq('layby_id', layby.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (qByLayby && qByLayby.length) quoteRow = qByLayby[0];
      }
      const origin = String(layby?.origin || '').toLowerCase();
      const originNote = String(layby?.notes || '').toLowerCase();
      const isSingleStatementExport = statementSaleIds.length <= 1 && statementLaybyIds.length <= 1;
      const preferQuoteItems = !!quoteRow && isSingleStatementExport && (origin === 'quote' || originNote.includes('origin=quote') || (related.items || []).length === 0);
      if (preferQuoteItems && quoteRow?.id) {
        const { data: qItems } = await db
          .from('quotation_items')
          .select('id, quotation_id, quote_product_id, product_id, name_override, description, quantity, unit_price, unit_id, sort_order')
          .eq('quotation_id', quoteRow.id)
          .order('sort_order');
        const qpIds = [...new Set((qItems || []).map(it => it.quote_product_id).filter(Boolean))];
        const qpNameMap = new Map();
        if (qpIds.length) {
          const { data: qpRows } = await db
            .from('quotation_products')
            .select('id, name')
            .in('id', qpIds);
          (qpRows || []).forEach(r => qpNameMap.set(r.id, r.name));
        }
        const baseSaleId = quoteRow.sale_id || layby?.sale_id || null;
        if (baseSaleId && (!related.sales || related.sales.length === 0)) {
          related.sales = [{ id: baseSaleId, sale_date: quoteRow.created_at || layby?.created_at || null }];
        }
        if (qItems && qItems.length) {
          related.items = qItems.map(it => ({
            sale_id: baseSaleId,
            product_id: it.product_id || it.quote_product_id || null,
            display_name: it.name_override || qpNameMap.get(it.quote_product_id) || it.description || null,
            quantity: Number(it.quantity || 0),
            unit_price: Number(it.unit_price || 0),
            currency: layby?.sale_currency || layby?.customerInfo?.currency || 'K',
          }));
        }
      }
    } catch {}

    // Fallback: ensure payments load for layby sale even if RPC/legacy returned none.
    try {
      if ((!related.payments || related.payments.length === 0) && layby?.sale_id != null) {
        const payRows = await fetchLaybyPaymentsForSales([layby.sale_id]);
        related.payments = (payRows || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
      }
      if ((!related.sales || related.sales.length === 0) && layby?.sale_id != null) {
        related.sales = [{ id: layby.sale_id, sale_date: layby?.created_at || null, currency: layby?.sale_currency || layby?.customerInfo?.currency || null }];
      }
    } catch {}

    // Ensure legacy down_payment rows are included in settlement and totals.
    try {
      if (!opts?.posReceipt) {
        related.payments = await appendLegacyDownPayments({ payments: related.payments, sales: related.sales });
      }
      related.payments = (related.payments || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
    } catch {}

    if (isFahmeCustomer) {
      await augmentFahmeSettlementPayments(related, fahmeCustomerId);
      related.payments = (related.payments || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
    }

    // ---------------------------
    // Group items by sale date (or created_at fallback)
    // Use timezone-safe normalization: prefer raw YYYY-MM-DD if present,
    // fall back to local Date getters (not toISOString) to avoid day shift.
    // ---------------------------
    const normalizeYYYYMMDD = (raw) => {
      const str = String(raw || '');
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      try {
        const dt = new Date(str);
        if (isNaN(dt.getTime())) return '';
        const y = dt.getFullYear();
        const mo = String(dt.getMonth() + 1).padStart(2, '0');
        const da = String(dt.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
      } catch { return ''; }
    };
    const prettyDMY = (yyyy_mm_dd, sep = '.') => {
      if (!yyyy_mm_dd) return '';
      const parts = yyyy_mm_dd.split('-');
      if (parts.length !== 3) return yyyy_mm_dd;
      const [y, m, d] = parts;
      return `${d}${sep}${m}${sep}${y}`;
    };
    const dateKey = s => normalizeYYYYMMDD(s.sale_date || s.created_at || '') || 'unknown';
    const saleRowId = (sale) => String(sale?.id ?? sale?.sale_id ?? '');
    related.sales = dedupeSystemMigrationSales(related.sales, related.finBySale || {});
    const salesByDate = {};
    related.sales.forEach(s => {
      const k = dateKey(s);
      (salesByDate[k] = salesByDate[k] || []).push(s);
    });
    // Migration-only rollup sales: rebuild date sections from telegram item fallbacks
    // so real product lines render instead of "Outstanding balance brought forward".
    try {
      if (!isFahmeCustomer && fallbackSectionsTelegram.length) {
        const currentSales = (related.sales || []).slice();
        const migrationOnly = currentSales.length > 0 && currentSales.every(isSystemMigrationSale);
        if (migrationOnly) {
          const rollupTotal = currentSales.reduce((sum, sale) => {
            const fin = related.finBySale?.[saleRowId(sale)] || {};
            return sum + Number(fin.total_due ?? sale.total_amount ?? 0);
          }, 0);
          const telegramDates = fallbackSectionsTelegram
            .map((section) => String(section?.isoDate || '').trim())
            .filter(Boolean);
          if (telegramDates.length) {
            const currencyGuess = currentSales.map((sale) => sale?.currency).find(Boolean)
              || layby?.sale_currency
              || customer?.currency
              || 'K';
            Object.keys(salesByDate).forEach((key) => { delete salesByDate[key]; });
            related.sales = [];
            telegramDates.forEach((isoDate, idx) => {
              const section = fallbackSectionsTelegram.find((row) => String(row?.isoDate || '') === isoDate)
                || fallbackSectionsTelegram[idx];
              const syntheticId = `fallback-${fallbackCustomerKey}-${isoDate}-${idx}`;
              const sectionTotal = sectionItemsTotal(section);
              const totalDue = telegramDates.length === 1
                ? (rollupTotal > 0 ? rollupTotal : sectionTotal)
                : sectionTotal;
              const synthetic = {
                id: syntheticId,
                sale_id: syntheticId,
                sale_date: `${isoDate}T00:00:00.000Z`,
                currency: currencyGuess,
                layby_id: layby?.id || null,
              };
              related.sales.push(synthetic);
              (salesByDate[isoDate] = salesByDate[isoDate] || []).push(synthetic);
              if (totalDue > 0) {
                related.finBySale[syntheticId] = {
                  total_due: totalDue,
                  paid_amount: 0,
                  outstanding_amount: totalDue,
                  subtotal_before_discount: totalDue,
                  discount_amount: 0,
                };
              }
            });
          }
        }
      }
    } catch {}
    // For Fahme accounts: expand collapsed historical rollups into trusted multi-date
    // product sections from JSON, while keeping any newer live sales not covered by that rollup.
    try {
      const primaryDates = fallbackSectionsPrimary
        .map((section) => String(section?.isoDate || '').trim())
        .filter(Boolean);
      const hasMultiFallbackDates = primaryDates.length > 1;
      const fallbackGross = (fallbackSectionsPrimary || []).reduce(
        (sum, section) => sum + sectionItemsTotal(section),
        0
      );

      if (isFahmeCustomer && hasMultiFallbackDates && fallbackGross > 0) {
        const currentSales = (related.sales || []).slice();
        const currencyGuess = 'USD';
        const saleAmount = (sale) => saleGrossAmountForMatch(sale, related.finBySale || {});
        const liveDates = Object.keys(salesByDate).filter((d) => d && d !== 'unknown');
        const overlapCount = primaryDates.filter((d) => liveDates.includes(d)).length;
        const liveAlreadyHasHistory = overlapCount >= Math.min(2, primaryDates.length);

        // Prefer a single live sale that is the historical rollup (~fallbackGross).
        let rollupSales = currentSales.filter((sale) => amountsRoughlyMatch(saleAmount(sale), fallbackGross));

        // Else: earliest sales that together match the historical rollup.
        if (!rollupSales.length && currentSales.length && !liveAlreadyHasHistory) {
          const ordered = currentSales.slice().sort((a, b) => {
            const ta = new Date(a?.sale_date || a?.created_at || 0).getTime() || 0;
            const tb = new Date(b?.sale_date || b?.created_at || 0).getTime() || 0;
            return ta - tb;
          });
          let acc = 0;
          const taken = [];
          for (const sale of ordered) {
            const amt = saleAmount(sale);
            const next = acc + amt;
            if (amountsRoughlyMatch(next, fallbackGross) || next <= fallbackGross + 1) {
              taken.push(sale);
              acc = next;
              if (amountsRoughlyMatch(acc, fallbackGross)) break;
              continue;
            }
            break;
          }
          if (taken.length && amountsRoughlyMatch(acc, fallbackGross)) {
            rollupSales = taken;
          }
        }

        const rollupIds = new Set(rollupSales.map((s) => saleRowId(s)));
        const extraSales = currentSales.filter((sale) => {
          const sid = saleRowId(sale);
          if (!sid || rollupIds.has(sid)) return false;
          if (amountsRoughlyMatch(saleAmount(sale), fallbackGross)) return false;
          const iso = dateKey(sale);
          if (primaryDates.includes(iso)) return false;
          return true;
        });

        // Expand when we found a rollup, or live data has no historical date overlap yet.
        const shouldExpand = !liveAlreadyHasHistory && (
          rollupSales.length > 0
          || currentSales.length === 0
          || liveDates.every((d) => !primaryDates.includes(d))
        );

        if (shouldExpand) {
          Object.keys(salesByDate).forEach((key) => { delete salesByDate[key]; });
          related.sales = [];

          primaryDates.forEach((isoDate, idx) => {
            const syntheticId = `fallback-${fallbackCustomerKey}-${isoDate}-${idx}`;
            const section = (fallbackSectionsPrimary || []).find(
              (row) => String(row?.isoDate || '') === isoDate
            );
            const sectionTotal = sectionItemsTotal(section);
            const synthetic = {
              id: syntheticId,
              sale_id: syntheticId,
              sale_date: `${isoDate}T00:00:00.000Z`,
              currency: currencyGuess,
              layby_id: layby?.id || null,
            };
            related.sales.push(synthetic);
            (salesByDate[isoDate] = salesByDate[isoDate] || []).push(synthetic);
            if (sectionTotal > 0) {
              related.finBySale[syntheticId] = {
                total_due: sectionTotal,
                paid_amount: 0,
                outstanding_amount: sectionTotal,
                subtotal_before_discount: sectionTotal,
                discount_amount: 0,
              };
            }
          });

          // Keep newer / non-rollup live sales so Acc(2) still shows post-restore purchases.
          extraSales.forEach((sale) => {
            const sid = saleRowId(sale);
            if (!sid || sid.startsWith('fallback-')) return;
            const iso = dateKey(sale);
            if (!iso || iso === 'unknown') return;
            related.sales.push({ ...sale, currency: currencyGuess });
            (salesByDate[iso] = salesByDate[iso] || []).push(sale);
          });
        }
      }
    } catch {}
    // Normalize sale_id keys as strings to avoid number/string mismatches
    const itemRowsBySale = related.items.reduce((acc, r) => {
      const key = String(r.sale_id);
      (acc[key] = acc[key] || []).push(r); return acc;
    }, {});
  const dateSections = Object.keys(salesByDate).sort();
  const hasAnyItems = related.items && related.items.length > 0;
  const usedFallbackIsoDates = new Set();
  const fallbackAssignments = assignFallbackSectionsByDate(
    dateSections,
    salesByDate,
    fallbackSections,
    related.finBySale || {}
  );
  // Running cumulative due shown between tables
  let cumulativeDueAcrossDates = 0;
  const isPosReceipt = Boolean(opts?.posReceipt);

    // Credit tracking removed: all payments are treated uniformly.

    // --------------- Table Rendering ---------------
    function addPageWithWatermarkIfNeeded(force) {
      if (!force) return;
      doc.addPage();
      // redraw watermark on new page covering entire page
      try {
        const pW = doc.internal.pageSize.getWidth();
        const pH = doc.internal.pageSize.getHeight();
        doc.saveGraphicsState && doc.saveGraphicsState();
        if (doc.GState) { try { doc.setGState(new doc.GState({ opacity: 0.14 })); } catch {} }
        doc.setTextColor(175); doc.setFont('helvetica','bold'); doc.setFontSize(38);
        const wm = companyName; const wmW = doc.getTextWidth(wm); const wmFontSize = 38; const angle = 30; const rad=(angle*Math.PI)/180; const cos=Math.cos(rad), sin=Math.sin(rad); const wmH = wmFontSize+4; const rotW=Math.abs(wmW*cos)+Math.abs(wmH*sin); const rotH=Math.abs(wmW*sin)+Math.abs(wmH*cos); const stepX=Math.max(180, rotW*1.05); const stepY=Math.max(120, rotH*1.35);
        for (let y=-rotH; y < pH+rotH; y+=stepY) { for (let x=-rotW; x < pW+rotW; x+=stepX) { doc.text(wm,x,y,{angle}); } }
        doc.restoreGraphicsState && doc.restoreGraphicsState(); doc.setTextColor(0);
      } catch {}
      drawPageBorder();
    }

    const saleCurrency = (related?.sales || []).map(s => s?.currency).find(Boolean) || null;
    // Fahme accounts are USD-only on statements — never render as K from mis-tagged sales.
    const currency = isFahmeCustomer
      ? '$'
      : (saleCurrency || layby?.sale_currency || customer?.currency || 'K');
    const numberFmt = n => formatCurrency(n, currency);

    const tableMarginLeft = margin;
  const colWidths = { qty: 40, name: pageWidth - margin*2 - 40 - 90 - 100, price: 90, amount: 100 };
  const headerHeight = pdfTheme.table.headerHeight; const rowLineHeight = pdfTheme.table.rowHeight; const cellPaddingX = pdfTheme.table.paddingX; const cellPaddingY = pdfTheme.table.paddingY;
  const detailLineHeight = Math.max(10, rowLineHeight * 0.65);
  // Theme colors (derived from app CSS): primary teal, accent blue, danger red, success green (assumed)
  const COLORS = { primary: '#00b4d8', accent: '#0099cc', blue: '#00bfff', red: '#ff4d4f', green: '#28a745', grayHeader: '#f2f8fb' };
    let yCursor = Math.max(yLeft, yRight) + 20; // start below details blocks

    function ensureSpace(blockHeight) {
      const pH = doc.internal.pageSize.getHeight();
      if (yCursor + blockHeight + 40 > pH) {
        addPageWithWatermarkIfNeeded(true);
        yCursor = margin; // top margin
      }
    }

  const dateTotals = [];
  const dateDiscountTotals = []; // track discounts per date section
  let hasCanonicalOutstanding = false;
    const usablePageHeight = pageHeight - margin - 40; // bottom buffer

    function drawTableHeader(dateLabel) {
  // Date spanning row (styled) with merged cells (no internal vertical lines crossing it)
  doc.setFont(pdfTheme.fonts.family,'bold'); doc.setFontSize(pdfTheme.fonts.size.date);
  const tableWidth = colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
  // Background for date row
  doc.setFillColor(240, 248, 251); // date bar background from theme
  try { if (DRAW_TABLE_BORDERS) doc.rect(tableMarginLeft, yCursor - 2, tableWidth, headerHeight, 'F'); else doc.rect(tableMarginLeft, yCursor - 2, tableWidth, headerHeight, 'F'); } catch {}
  doc.setTextColor(0);
  doc.text(`Date: ${dateLabel}`, tableMarginLeft + cellPaddingX, yCursor + headerHeight/2, { baseline: 'middle' });
  // Draw single outer border line for merged date row (top & bottom)
  try {
    doc.setDrawColor(0,0,0); doc.setLineWidth(0.6);
    // top border
    if (DRAW_TABLE_BORDERS) doc.line(tableMarginLeft, yCursor - 2, tableMarginLeft + tableWidth, yCursor - 2);
    // bottom border (will also serve as top border for next header bar)
    if (DRAW_TABLE_BORDERS) doc.line(tableMarginLeft, yCursor + headerHeight - 2, tableMarginLeft + tableWidth, yCursor + headerHeight - 2);
  } catch {}
  yCursor += headerHeight;
  // Column header row with brand color bar
  doc.setFillColor(0,132,170); // header bar
  try { if (DRAW_TABLE_BORDERS) doc.rect(tableMarginLeft, yCursor - 2, tableWidth, headerHeight, 'F'); else doc.rect(tableMarginLeft, yCursor - 2, tableWidth, headerHeight, 'F'); } catch {}
  // Draw bottom border line thicker for header separation
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.8); doc.line(tableMarginLeft, yCursor + headerHeight - 2, tableMarginLeft + tableWidth, yCursor + headerHeight - 2);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(255);
  const xStart = tableMarginLeft;
  const headY = yCursor + headerHeight/2;
  doc.text('Qty', xStart + cellPaddingX, headY, { baseline: 'middle' });
  doc.text('Product Name', xStart + colWidths.qty + cellPaddingX, headY, { baseline: 'middle' });
  doc.text('Price', xStart + colWidths.qty + colWidths.name + colWidths.price - cellPaddingX, headY, { align: 'right', baseline: 'middle' });
  doc.text('Amount', xStart + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount - cellPaddingX, headY, { align: 'right', baseline: 'middle' });
  yCursor += headerHeight;
  doc.setTextColor(0);
  return xStart;
    }

    // Draw full grid verticals for table (Qty | Name | Price | Amount | outer edge)
    function drawVerticals(tableTopY, tableBottomY) {
      const xStart = tableMarginLeft;
      const xQty = xStart + colWidths.qty;
      const xName = xQty + colWidths.name;
      const xPrice = xName + colWidths.price;
      const xAmount = xPrice + colWidths.amount;
      doc.setDrawColor(0,0,0); doc.setLineWidth(0.6);
      if (DRAW_TABLE_BORDERS) [xQty, xName, xPrice, xAmount].forEach(x => doc.line(x, tableTopY, x, tableBottomY));
    }

    if (!dateSections.length) {
      ensureSpace(24);
      doc.setFont('helvetica','italic'); doc.setFontSize(12);
      doc.text('No recorded sale item lines for this layby.', tableMarginLeft, yCursor);
      yCursor += 24;
    }

    dateSections.forEach(dateKeyStr => {
      const salesForDate = salesByDate[dateKeyStr];
      let items = [];
      salesForDate.forEach(s => { (itemRowsBySale[saleRowId(s)] || []).forEach(it => items.push({ sale: s, ...it })); });
      // Defensive: if the same sale appeared multiple times due to merges, item duplicates can occur.
      // Dedupe items by composite key (sale_id + display_name/product_id + unit_price + quantity + color)
      try {
        const seen = new Set();
        items = items.filter(it => {
          const key = `${it.sale?.id}|${String(it.product_id || '')}|${String(it.display_name || '')}|${Number(it.unit_price || 0)}|${Number(it.quantity || 0)}|${String(it.color || '')}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } catch {}
      // Collapse set components: when a sale includes a priced custom/display line (parent set)
      // and multiple zero-priced component lines, render only the parent line like POS checkout.
      // Heuristic: treat any line with display_name present, no product_id and unit_price > 0 as a set parent.
      // Then hide zero-priced component lines (product_id present, no display_name, unit_price === 0) for that sale.
      try {
        const bySale = items.reduce((acc, it) => {
          const sid = String(it.sale?.id || '');
          (acc[sid] = acc[sid] || []).push(it);
          return acc;
        }, {});
        const collapsed = [];
        Object.keys(bySale).forEach(sid => {
          const group = bySale[sid];
          const hasParent = group.some(it => {
            const unit = Number((it.unit_price != null ? it.unit_price : it.price) || 0);
            const hasDisplay = !!(it.display_name && String(it.display_name).trim());
            const noProductId = it.product_id == null;
            return hasDisplay && noProductId && unit > 0;
          });
          if (!hasParent) {
            collapsed.push(...group);
          } else {
            group.forEach(it => {
              const unit = Number((it.unit_price != null ? it.unit_price : it.price) || 0);
              const isZeroPricedComponent = (it.product_id != null) && unit === 0;
              if (isZeroPricedComponent) return; // hide component line when set parent exists
              collapsed.push(it);
            });
          }
        });
        items = collapsed;
      } catch {}
      let rows = [];
      items.forEach(it => {
        const rawName = (it.display_name || it.product_name || (it.product_id ? (related.products[it.product_id] || '') : '') || 'Product').trim();
        const name = /^REPLACE_WITH_PDF_ITEM_\d+$/i.test(rawName) || /^REPLACE_FROM_PDF$/i.test(rawName) || /^PDF_TOTAL_LOCKED$/i.test(rawName)
          ? 'PDF Restored Item'
          : rawName;
        const qty = Number((it.quantity != null ? it.quantity : it.qty) || 0);
        const price = Number((it.unit_price != null ? it.unit_price : it.price) || 0);
        const amount = price * qty;
        const saleId = it.sale?.id;
        const detailLines = [];
        if (it.color) detailLines.push(`Color: ${it.color}`);
        rows.push({ qty, name, price, amount, saleId, type: 'regular', indent: 0, detailLines });
      });
      // Remove any empty/zero rows (qty 0 OR amount 0) unless there is a non-zero price *and* quantity.
      const originalRows = rows.slice();
      rows = rows.filter(r => {
        if (!r) return false;
        if (Number(r.qty || 0) <= 0) return false; // must have positive quantity
        const nameTrim = (r.name || '').trim();
        // Drop rows with no name & zero value OR rows with zero price+amount regardless of name (avoid blank lines)
        if (!nameTrim && Number(r.amount || 0) === 0 && Number(r.price || 0) === 0) return false;
        if (Number(r.price || 0) === 0 && Number(r.amount || 0) === 0 && !nameTrim) return false;
        return true;
      });
      // If filtering removed everything (e.g., fallback scenario) restore original to avoid empty section
      if (!rows.length) rows = originalRows;
      const isPlaceholderRow = (row) => {
        const name = String(row?.name || '').trim().toUpperCase();
        return name === 'PDF_TOTAL_LOCKED'
          || name === 'REPLACE_FROM_PDF'
          || /^REPLACE_WITH_PDF_ITEM_\d+$/.test(name)
          || name === 'PDF RESTORED ITEM'
          || isMigrationCarryRow(row);
      };
      const placeholderOnly = rows.length > 0 && rows.every(isPlaceholderRow);
      const fallbackSection = resolveFallbackSectionForDate(
        dateKeyStr,
        salesForDate,
        fallbackSections,
        related.finBySale || {},
        usedFallbackIsoDates,
        fallbackAssignments
      );
      const fallbackItemsForDate = fallbackSection?.items
        || fallbackItemsByDate.get(dateKeyStr)
        || null;
      if ((placeholderOnly || !rows.length) && fallbackItemsForDate) {
        if (fallbackSection?.isoDate) usedFallbackIsoDates.add(String(fallbackSection.isoDate));
        rows = (fallbackItemsForDate || []).map((item) => ({
          qty: Number(item?.qty || 0),
          name: String(item?.name || 'Product').trim(),
          price: Number(item?.price || 0),
          amount: Number(item?.amount || (Number(item?.qty || 0) * Number(item?.price || 0))),
          saleId: null,
          type: 'regular',
          indent: 0,
          detailLines: item?.color ? [`Color: ${String(item.color).trim()}`] : [],
        }));
      }
      // Never treat restored/placeholder marker rows as billable item lines.
      rows = rows.filter((row) => !isPlaceholderRow(row));
      const billableRows = rows.slice();
      const finBySalePreview = related.finBySale || {};
      const finRowsPreview = salesForDate.map((s) => finBySalePreview[saleRowId(s)]).filter(Boolean);
      const carryOnlyPreviewNet = finRowsPreview.reduce((sum, v) => sum + Number(v.subtotal_before_discount || 0), 0);
      // Some Fahme statement rows are rollup carry headers with no item lines.
      // If such a section repeats the already accumulated due, skip rendering it to avoid double counting.
      if (isFahmeCustomer && billableRows.length === 0 && carryOnlyPreviewNet > 0) {
        const repeatedCarry = Math.abs(Number(carryOnlyPreviewNet) - Number(cumulativeDueAcrossDates || 0)) < 0.01;
        if (repeatedCarry) {
          return;
        }
      }
      const finBySaleForAlign = related.finBySale || {};
      const finRowsForAlign = salesForDate.map((s) => finBySaleForAlign[saleRowId(s)]).filter(Boolean);
      const canonicalTotalForAlign = finRowsForAlign.reduce((sum, row) => sum + Number(row.total_due || 0), 0);
      // Prefer real/fallback product lines only — never invent a carry-forward balance row.
      if (!rows.length && canonicalTotalForAlign > 0) {
        const itemFallback = resolveItemFallbackSection(
          dateKeyStr,
          salesForDate,
          fallbackSections,
          related.finBySale || {},
          canonicalTotalForAlign
        );
        if (itemFallback?.items?.length) {
          rows = itemFallback.items.map((item) => ({
            qty: Number(item?.qty || 0),
            name: String(item?.name || 'Product').trim(),
            price: Number(item?.price || 0),
            amount: Number(item?.amount || (Number(item?.qty || 0) * Number(item?.price || 0))),
            saleId: null,
            type: 'regular',
            indent: 0,
            detailLines: item?.color ? [`Color: ${String(item.color).trim()}`] : [],
          }));
        } else {
          return;
        }
      } else if (!rows.length) {
        return;
      }
      // Strip any legacy carry-forward rows that may still arrive from statement data.
      rows = rows.filter((row) => {
        const name = String(row?.name || '').trim().toLowerCase();
        return name !== 'outstanding balance brought forward'
          && !name.includes('outstanding balance brought forward')
          && name !== 'item breakdown not captured (total carried)';
      });
      if (!rows.length) return;
      // For regular customers, keep per-date visible line totals aligned with canonical sale totals
      // so PDF values match layby-management aggregates.
      if (!isFahmeCustomer && canonicalTotalForAlign > 0) {
        const targetRows = rows.filter((row) => Number(row?.amount || 0) > 0 && String(row?.type || 'regular') === 'regular');
        const sourceSum = targetRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        if (targetRows.length && sourceSum > 0 && Math.abs(sourceSum - canonicalTotalForAlign) > 0.01) {
          const ratio = canonicalTotalForAlign / sourceSum;
          let allocated = 0;
          targetRows.forEach((row, index) => {
            let nextAmount;
            if (index === targetRows.length - 1) {
              nextAmount = Number((canonicalTotalForAlign - allocated).toFixed(2));
            } else {
              nextAmount = Number((Number(row.amount || 0) * ratio).toFixed(2));
              allocated += nextAmount;
            }
            row.amount = Math.max(0, nextAmount);
            const qty = Math.max(1, Number(row.qty || 1));
            row.price = Number((row.amount / qty).toFixed(2));
          });
        }
      }
      const computeDetailSegments = (row) => {
        const lines = (row.detailLines || []).map(line => String(line || '').trim()).filter(Boolean);
        if (!lines.length) return [];
        const indentOffset = row.indent || 0;
        const wrapWidth = Math.max(40, colWidths.name - 8 - indentOffset);
        const segments = [];
        lines.forEach(line => {
          const parts = doc.splitTextToSize(line, wrapWidth);
          parts.forEach(part => segments.push(part));
        });
        return segments;
      };
      const clipTextToWidth = (value, maxWidth) => {
        const text = String(value || '');
        if (!text) return '';
        if (doc.getTextWidth(text) <= maxWidth) return text;
        const ellipsis = '...';
        let out = text;
        while (out.length > 1 && doc.getTextWidth(out + ellipsis) > maxWidth) {
          out = out.slice(0, -1);
        }
        return `${out}${ellipsis}`;
      };
      rows.forEach(row => {
        const segments = computeDetailSegments(row);
        row._detailSegments = segments;
        row._detailHeight = segments.length ? segments.length * detailLineHeight : 0;
      });
  // Prefer canonical financials for totals (PDF-aligned view)
  const finBySale = related.finBySale || {};
  const finRowsForDate = salesForDate.map((s) => finBySale[saleRowId(s)]).filter(Boolean);
  const canonicalNetForDate = finRowsForDate.reduce((a,v)=> a + Number(v.subtotal_before_discount || 0), 0);
  const canonicalTotalForDate = finRowsForDate.reduce((a,v)=> a + Number(v.total_due || 0), 0);
  // Some records carry list-price item rows while canonical layby subtotal is negotiated/lower.
  // For single regular rows, align line amount to canonical subtotal so exported PDF matches statement totals.
  if (rows.length === 1 && canonicalNetForDate > 0) {
    const only = rows[0];
    const looksLikeRealItem = String(only?.type || 'regular') === 'regular'
      && !isPlaceholderRow(only)
      && !String(only?.name || '').toLowerCase().includes('item breakdown not captured');
    const lineAmount = Number(only?.amount || 0);
    if (looksLikeRealItem && Math.abs(lineAmount - canonicalNetForDate) > 0.01) {
      const qty = Math.max(1, Number(only?.qty || 1));
      only.amount = Number(canonicalNetForDate.toFixed(2));
      only.price = Number((only.amount / qty).toFixed(2));
    }
  }
  // Compute visible table totals from rows to ensure Net matches the table content
  const netFromItems = rows.reduce((a,r)=>a + Number(r.amount || 0), 0);
  // View-provided figures (may include docs without item lines)
  const viewNet = finRowsForDate.reduce((a,v)=> a + Number(v.subtotal_before_discount || 0), 0);
  let viewDiscount = finRowsForDate.reduce((a,v)=> a + Number(v.discount_amount || 0), 0);
  if (isFahmeCustomer && Number(fallbackSection?.discount || 0) > 0) {
    viewDiscount = Math.max(viewDiscount, Number(fallbackSection.discount || 0));
  }
  const forceCanonicalDateTotal = canonicalTotalForDate > 0 && !isFahmeCustomer;
  // Fahme: drive Net/Due from visible item lines (fallback history + live extras) so settlement matches the PDF body.
  // Prefer canonical date totals to match layby-management exactly when available.
  const net = forceCanonicalDateTotal
    ? canonicalTotalForDate
    : (netFromItems > 0 ? netFromItems : viewNet);
  // Cap discount so it never exceeds net (guards against view/items mismatch)
  const discount = forceCanonicalDateTotal ? 0 : Math.min(Number(viewDiscount || 0), net);
  const totalAfterDiscount = forceCanonicalDateTotal ? canonicalTotalForDate : Math.max(0, net - discount);
  const viewOutstanding = finRowsForDate.length ? finRowsForDate.reduce((a,v)=> a + Number(v.outstanding_amount || 0), 0) : null;
  const dueForDate = totalAfterDiscount;
  const closed = finRowsForDate.length ? (viewOutstanding === 0 && totalAfterDiscount > 0) : (totalAfterDiscount === 0 && net > 0);
  // Track per-date Net to aggregate later (grand total pre-discount)
  dateTotals.push(net);
      dateDiscountTotals.push(discount);
  const dateLabel = prettyDMY(dateKeyStr, '.');

      // Estimate single-page height
      let blockHeight = headerHeight + headerHeight; // date + columns header
      rows.forEach(r => {
        blockHeight += rowLineHeight;
        if (r._detailHeight) blockHeight += r._detailHeight + 2;
      });
  // footer rows we will render: Net, Discount (if any), VAT Inclusive, Total, Due (= Total)
  const footerRowCount = (isPosReceipt ? 3 : 4) + (discount > 0 ? 1 : 0);
  blockHeight += rowLineHeight * footerRowCount;

      const totalsHeight = headerHeight * 2; // Net + Total lines plus spacing (VAT is label-only) roughly
      const valueColX = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
      const labelColX = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price - 10;
      const drawDetailSegments = (row, xStart) => {
        const segments = row._detailSegments || [];
        if (!segments.length) return;
        yCursor += 2;
        doc.setFontSize(9); doc.setTextColor(80);
        const textX = xStart + colWidths.qty + cellPaddingX + (row.indent || 0);
        segments.forEach(segment => {
          const midY = yCursor + detailLineHeight / 2;
          doc.text(segment, textX, midY, { baseline: 'middle' });
          yCursor += detailLineHeight;
        });
        doc.setTextColor(0); doc.setFontSize(10.5);
      };

      // If it fits wholly, draw normally with borders
      const needsSplit = blockHeight > usablePageHeight;
      if (!needsSplit) {
        ensureSpace(blockHeight);
        const tableTopY = yCursor;
        const xStart = drawTableHeader(dateLabel);
        doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
        const rowTops = [tableTopY];
        const rowMeta = [];
        rows.forEach((r, idx) => {
          // Row background zebra
          if ((rowTops.length % 2) === 1) { doc.setFillColor(250,252,253); try { /* no border when disabled */ if (DRAW_TABLE_BORDERS) doc.rect(xStart, yCursor, colWidths.qty + colWidths.name + colWidths.price + colWidths.amount, rowLineHeight, 'F'); else doc.rect(xStart, yCursor, colWidths.qty + colWidths.name + colWidths.price + colWidths.amount, rowLineHeight, 'F'); } catch {} }
          const midY = yCursor + rowLineHeight/2 + (cellPaddingY/2 - 1);
          const qtyText = (r.qtyDisplay !== undefined) ? String(r.qtyDisplay || '') : (r.qty != null ? String(r.qty) : '');
          const nameX = xStart + colWidths.qty + cellPaddingX + (r.indent || 0);
          const priceText = (typeof r.price === 'number' && Number.isFinite(r.price)) ? numberFmt(r.price) : '';
          const amountText = (typeof r.amount === 'number' && Number.isFinite(r.amount)) ? numberFmt(r.amount) : '';
          doc.text(qtyText || '', xStart + cellPaddingX, midY, { baseline: 'middle' });
          const nameText = clipTextToWidth(r.name || '', Math.max(40, colWidths.name - (cellPaddingX * 2) - (r.indent || 0)));
          doc.text(nameText, nameX, midY, { baseline: 'middle' });
          doc.text(priceText || '', xStart + colWidths.qty + colWidths.name + colWidths.price - cellPaddingX, midY, { align: 'right', baseline: 'middle' });
          doc.text(amountText || '', xStart + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount - cellPaddingX, midY, { align: 'right', baseline: 'middle' });
          yCursor += rowLineHeight;
          drawDetailSegments(r, xStart);
          rowTops.push(yCursor);
          // Do not add heavy line for each product; we'll only heavy-separate footer groups.
          rowMeta.push({ bottom: yCursor, type: 'product', heavy: false });
          // Draw a light horizontal line only after the last product row (true table content boundary)
          if (idx === rows.length - 1) {
            doc.setDrawColor(0,0,0); doc.setLineWidth(0.6);
            if (DRAW_TABLE_BORDERS) doc.line(xStart, yCursor, xStart + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount, yCursor);
          }
        });
        // Footer inside table (uniform row heights)
        doc.setFont('helvetica','bold'); doc.setFontSize(10.5);
        const labelX = xStart + colWidths.qty + colWidths.name + colWidths.price - cellPaddingX;
        const valueX = xStart + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount - cellPaddingX;
        // Footer shows figures before any payments are applied; Due equals Total for the date section
        const footerDefs = [
          { label: 'Net', value: numberFmt(net) },
          ...(discount > 0 ? [{ label: 'Discount', value: '-' + numberFmt(discount) }] : []),
          { label: 'VAT @ 16%', value: 'Inclusive' },
          { label: 'Total', value: numberFmt(totalAfterDiscount) },
          ...(!isPosReceipt ? [{ label: 'Due', value: numberFmt(dueForDate) }] : []),
        ];
        const HEAVY_FOOTER = new Set(['Net','VAT @ 16%','Due','Balance Closed','Full Payment Closed']);
        footerDefs.forEach((rw, fIdx) => {
          const midY = yCursor + rowLineHeight/2;
          doc.text(rw.label, labelX, midY, { align: 'right', baseline: 'middle' });
          if (rw.value) doc.text(rw.value, valueX, midY, { align: 'right', baseline: 'middle' });
          yCursor += rowLineHeight;
          rowTops.push(yCursor);
          // Do not draw separator lines under totals per request
          rowMeta.push({ bottom: yCursor, type: 'footer', label: rw.label, heavy: false });
        });
  const tableBottomY = yCursor; // now bottom matches last real row/footer; no trailing blank lines
        // Draw borders: outer rect up to final table bottom (no blank filler rows)
        const xEnd = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
        if (DRAW_TABLE_BORDERS) { doc.setDrawColor(0,0,0); doc.setLineWidth(0.9); doc.rect(tableMarginLeft, tableTopY - 2, xEnd - tableMarginLeft, tableBottomY - (tableTopY - 2)); }
        // Vertical grid lines full height of content below merged date row, but not drawing extra lines inside footer beyond separation already drawn.
        drawVerticals(tableTopY + headerHeight - 2, tableBottomY);
        // --- Cumulative Due row (merged, between tables) ---
        const newCum = cumulativeDueAcrossDates + dueForDate;
        if (!isPosReceipt && cumulativeDueAcrossDates > 0) {
          // ensure small gap below table
          const midYcum = yCursor + rowLineHeight/2;
          doc.setFont('helvetica','bold'); doc.setFontSize(11);
          doc.text('Total Due', labelX, midYcum, { align: 'right', baseline: 'middle' });
          doc.text(numberFmt(newCum), valueX, midYcum, { align: 'right', baseline: 'middle' });
          yCursor += rowLineHeight + 8;
        }
        cumulativeDueAcrossDates = newCum;
        return;
      }

      // Split mode
      let idx = 0;
      while (idx < rows.length) {
        // Start new page segment if necessary
        if (yCursor + headerHeight * 2 > usablePageHeight) {
          addPageWithWatermarkIfNeeded(true); yCursor = margin;
        }
        const segTop = yCursor;
        const xStart = drawTableHeader(dateLabel + (idx > 0 ? ' (cont.)' : ''));
        doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
  const verticalStartY = segTop - 2; // for outer rect
  const verticalInnerStartY = segTop + headerHeight - 2; // skip merged date row for internal verticals
        let rowCountThisPage = 0;
        const rowBottoms = [];
        // capture remaining due for this date to show after full date completes
        let remainingDueForThisDate = null;
        while (idx < rows.length) {
          const r = rows[idx];
            const rowNeeded = rowLineHeight + (r._detailHeight || 0) + 2;
            const remaining = usablePageHeight - yCursor - totalsHeight;
            if (rowNeeded > remaining) break; // move to next page to preserve totals together
            const qtyText = (r.qtyDisplay !== undefined) ? String(r.qtyDisplay || '') : (r.qty != null ? String(r.qty) : '');
            const nameX = xStart + colWidths.qty + cellPaddingX + (r.indent || 0);
            const priceText = (typeof r.price === 'number' && Number.isFinite(r.price)) ? numberFmt(r.price) : '';
            const amountText = (typeof r.amount === 'number' && Number.isFinite(r.amount)) ? numberFmt(r.amount) : '';
            const nameText = clipTextToWidth(r.name || '', Math.max(40, colWidths.name - (cellPaddingX * 2) - (r.indent || 0)));
            doc.text(qtyText || '', xStart + cellPaddingX, yCursor);
            doc.text(nameText, nameX, yCursor);
            doc.text(priceText || '', xStart + colWidths.qty + colWidths.name + colWidths.price - cellPaddingX, yCursor, { align: 'right' });
            doc.text(amountText || '', xStart + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount - cellPaddingX, yCursor, { align: 'right' });
            yCursor += rowLineHeight;
            drawDetailSegments(r, xStart);
            rowBottoms.push(yCursor - 4);
            idx++; rowCountThisPage++;
        }
        // If no rows placed (row too big), force place one to avoid infinite loop
        if (rowCountThisPage === 0 && idx < rows.length) {
          const r = rows[idx];
          const qtyText = (r.qtyDisplay !== undefined) ? String(r.qtyDisplay || '') : (r.qty != null ? String(r.qty) : '');
          const nameX = xStart + colWidths.qty + cellPaddingX + (r.indent || 0);
          const priceText = (typeof r.price === 'number' && Number.isFinite(r.price)) ? numberFmt(r.price) : '';
          const amountText = (typeof r.amount === 'number' && Number.isFinite(r.amount)) ? numberFmt(r.amount) : '';
          const nameText = clipTextToWidth(r.name || '', Math.max(40, colWidths.name - (cellPaddingX * 2) - (r.indent || 0)));
          doc.text(qtyText || '', xStart + cellPaddingX, yCursor);
          doc.text(nameText, nameX, yCursor);
          doc.text(priceText || '', xStart + colWidths.qty + colWidths.name + colWidths.price - cellPaddingX, yCursor, { align: 'right' });
          doc.text(amountText || '', xStart + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount - cellPaddingX, yCursor, { align: 'right' });
          yCursor += rowLineHeight;
          drawDetailSegments(r, xStart);
          rowBottoms.push(yCursor - 4);
          idx++;
        }
        // If finished rows, draw totals on this page (ensure space else new page)
        const remainingRows = rows.length - idx;
        if (remainingRows === 0) {
          if (yCursor + totalsHeight > usablePageHeight) { addPageWithWatermarkIfNeeded(true); yCursor = margin; }
          doc.setFont('helvetica','bold'); doc.setFontSize(11);
          const labelX = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price - 10;
          const valueX = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
          // Recompute totals anchored to canonical view; Due = Total (no payments applied here)
          const finRowsForDate2 = salesForDate.map((s) => (related.finBySale || {})[saleRowId(s)]).filter(Boolean);
          const netFromItems2 = rows.reduce((a,r)=>a + Number(r.amount || 0), 0);
          const viewNet2 = finRowsForDate2.reduce((a,v)=> a + Number(v.subtotal_before_discount || 0), 0);
          let viewDiscount2 = finRowsForDate2.reduce((a,v)=> a + Number(v.discount_amount || 0), 0);
          const netIncl = netFromItems2 > 0 ? netFromItems2 : viewNet2;
          const discount2 = Math.min(Number(viewDiscount2 || 0), netIncl);
          const totalAfterDiscount2 = Math.max(0, netIncl - discount2);
          const dueForDate2 = totalAfterDiscount2;
          // Save for post-table cumulative Total Due line
          remainingDueForThisDate = dueForDate2;
          const footerDefs = [
            { label: 'Net', value: numberFmt(netIncl) },
            ...(discount2 > 0 ? [{ label: 'Discount', value: '-' + numberFmt(discount2) }] : []),
            { label: 'VAT @ 16%', value: 'Inclusive' },
            { label: 'Total', value: numberFmt(totalAfterDiscount2) },
            ...(!isPosReceipt ? [{ label: 'Due', value: numberFmt(dueForDate2) }] : []),
          ];
          const HEAVY_FOOTER = new Set(['Net','VAT @ 16%','Due','Balance Closed','Full Payment Closed']);
          const footerMeta = [];
          footerDefs.forEach(rw => {
            const midY = yCursor + rowLineHeight/2;
            doc.text(rw.label, labelX, midY, { align: 'right', baseline: 'middle' });
            if (rw.value) doc.text(rw.value, valueX, midY, { align: 'right', baseline: 'middle' });
            yCursor += rowLineHeight;
            footerMeta.push({ bottom: yCursor, heavy: HEAVY_FOOTER.has(rw.label) });
          });
          // Draw heavy footer lines
          const xEndFooter = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
          footerMeta.forEach(f => { if (DRAW_TABLE_BORDERS && f.heavy) { doc.setDrawColor(0,0,0); doc.setLineWidth(0.85); doc.line(tableMarginLeft, f.bottom, xEndFooter, f.bottom); } });
        }
        // Draw borders for this segment (outer rect + inner horizontal lines only)
        const segBottom = (remainingRows === 0) ? yCursor : (rowBottoms[rowBottoms.length - 1]);
        const xEnd = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
        if (DRAW_TABLE_BORDERS) {
          doc.setDrawColor(0,0,0); doc.setLineWidth(0.9);
          doc.rect(tableMarginLeft, verticalStartY, xEnd - tableMarginLeft, segBottom - verticalStartY);
          doc.setDrawColor(60); doc.setLineWidth(0.45);
          rowBottoms.forEach(yL => doc.line(tableMarginLeft, yL, xEnd, yL));
        }
        drawVerticals(verticalInnerStartY, segBottom);
        // If this segment completes the date section, show cumulative due row below
        if (remainingRows === 0 && remainingDueForThisDate != null) {
          const newCum2 = cumulativeDueAcrossDates + remainingDueForThisDate;
          if (!isPosReceipt && cumulativeDueAcrossDates > 0) {
            // small gap
            const labelXcum = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price - 10;
            const valueXcum = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
            const midYcum = yCursor + rowLineHeight/2;
            doc.setFont('helvetica','bold'); doc.setFontSize(11);
            doc.text('Total Due', labelXcum, midYcum, { align: 'right', baseline: 'middle' });
            doc.text(numberFmt(newCum2), valueXcum, midYcum, { align: 'right', baseline: 'middle' });
            yCursor += rowLineHeight + 8;
          }
          cumulativeDueAcrossDates = newCum2;
        }
        if (remainingRows > 0) { addPageWithWatermarkIfNeeded(true); yCursor = margin; }
      }
    });

    // --------------- Grand Totals (before settlement) ---------------
  const grandTotal = dateTotals.reduce((a,b)=>a+b,0);
  const grandDiscount = dateDiscountTotals.reduce((a,b)=>a+b,0);
  const rowTotalsUsd = readRowTotalsUsd(opts);

    // If only one date section rendered and we still have a lot of vertical space before settlement,
    // push settlement downward to visually balance the page.
    // Removed earlier settlement push logic; we'll instead try to keep settlement on same page with a fixed gap if it fits

    // --------------- Settlement Section ---------------
    if (!opts?.posReceipt) {
    try {
      if (isFahmeCustomer) {
        await augmentFahmeSettlementPayments(related, fahmeCustomerId);
        related.payments = (related.payments || []).map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
      }
        // Build payment events as one row per original down-payment batch.
  const paymentLines = [];
  const saleById = {}; related.sales.forEach(s => { saleById[s.id] = s; });
  const allowedSaleIds = new Set((related.sales || []).map(s => String(s.id || s.sale_id)));
  if (layby?.sale_id != null) allowedSaleIds.add(String(layby.sale_id));
  // Fahme history is rendered from synthetic fallback sale ids, so live payments
  // must not be filtered against those ids or new down payments disappear.
  const settlementPaymentsAll = isFahmeCustomer
    ? (related.payments || []).filter((p) => Number(p?.amount || 0) > 0 || Number(p?.discount_amount || 0) > 0)
    : (related.payments || []).filter(p => allowedSaleIds.has(String(p.sale_id)));
  const pdfBatchTag = 'PDF_ITEM_RESTORE_20260610/';
  // Only treat as frozen PDF-restore when the layby notes explicitly say so.
  // Do NOT lock Fahme accounts forever just because historical JSON fallbacks exist.
  const isPdfRestoreCustomer = String(layby?.notes || '').toUpperCase().includes('PDF_ITEM_RESTORE_20260610');
  const settlementPaymentsTagged = settlementPaymentsAll.filter((payment) =>
    String(payment?.notes || '').includes(pdfBatchTag)
      || String(payment?.reference || '').includes(pdfBatchTag)
  );
  const settlementPayments = (isPdfRestoreCustomer && settlementPaymentsTagged.length)
    ? settlementPaymentsTagged
    : settlementPaymentsAll;
      const groupedByBatch = new Map();
      settlementPayments.forEach((payment, index) => {
        const batchKey = String(payment?.allocation_batch_uuid || '').trim();
        const key = batchKey || `single:${index}`;
        const paymentAmount = Number(payment?.amount || 0);
        const paymentDiscount = Number(payment?.discount_amount || 0);
        if (!groupedByBatch.has(key)) {
          groupedByBatch.set(key, {
            amount: paymentAmount,
            discount_amount: paymentDiscount,
            date: payment?.payment_date || null,
            paymentType: titleCase(String(payment?.payment_type || 'cash').replace(/_/g, ' ')),
            note: sanitizePaymentNote(payment?.notes || '').trim(),
            reference: String(payment?.reference || '').trim(),
          });
          return;
        }
        const entry = groupedByBatch.get(key);
        if (batchKey) {
          entry.amount = Math.max(entry.amount, paymentAmount);
          entry.discount_amount = Math.max(entry.discount_amount, paymentDiscount);
        } else {
          entry.amount += paymentAmount;
          entry.discount_amount += paymentDiscount;
        }
        if (!entry.date && payment?.payment_date) entry.date = payment.payment_date;
        if (!entry.note) entry.note = sanitizePaymentNote(payment?.notes || '').trim();
        if (!entry.reference) entry.reference = String(payment?.reference || '').trim();
        if (!entry.paymentType) entry.paymentType = titleCase(String(payment?.payment_type || 'cash').replace(/_/g, ' '));
      });

      Array.from(groupedByBatch.values()).forEach((entry) => {
        const dateLabel = entry.date ? new Date(entry.date).toLocaleDateString('en-GB') : '';
        const descriptionParts = [];
        if (dateLabel) descriptionParts.push(`(${dateLabel})`);
        const noteIsSystemTag = isSystemReceiptTag(entry.note);
        const cleanNote = entry.note && !noteIsSystemTag && !isPlaceholderReference(entry.note) ? entry.note : '';
        const cleanRef = sanitizePaymentReference(entry.reference);
        if (cleanNote) descriptionParts.push(cleanNote);
        if (cleanRef) descriptionParts.push(`Ref: ${cleanRef}`);
        const description = descriptionParts.join(' - ') || 'Down Payment';
        paymentLines.push({
          description,
          paymentType: entry.paymentType || 'Cash',
          amount: Number(entry.amount || 0),
          date: entry.date || null,
          discount_amount: Number(entry.discount_amount || 0),
        });
      });
      const livePaymentLines = paymentLines.slice();

      const buildFallbackSettlementLines = () => {
        const lines = [];
        fallbackSettlementRows.forEach((row) => {
          const dateLabel = String(row?.date || '').trim();
          const note = String(row?.description || '').trim();
          const type = String(row?.paymentType || 'Cash').trim();
          const description = settlementLineDescription({ dateLabel, note, paymentType: type });
          const dateTs = parseFallbackSettlementDateTs(dateLabel);
          lines.push({
            description,
            paymentType: type,
            amount: Number(row?.amount || 0),
            date: dateTs ? new Date(dateTs).toISOString() : null,
            discount_amount: 0,
          });
        });
        return lines;
      };

      if (isFahmeCustomer && fallbackSettlementRows.length) {
        // Fahme must win over PDF-restore mode — restore notes exist on historical rows but
        // live down payments (e.g. 28 Jul 2026) are not PDF_ITEM_RESTORE tagged.
        const fallbackLines = buildFallbackSettlementLines();
        paymentLines.length = 0;
        paymentLines.push(...fallbackLines);
        const livePaymentsGrouped = groupPaymentsByAllocationBatch(related.payments || settlementPaymentsAll);
        appendFahmeLiveSettlementPayments({
          paymentLines,
          payments: livePaymentsGrouped,
          fallbackSettlementRows,
        });
        const paidAfterAppend = paymentLines.reduce((sum, line) => sum + Number(line?.amount || 0), 0);
        const targetPaid = resolveFahmeTargetPaid(opts, related);
        if (targetPaid > paidAfterAppend + 0.01) {
          appendUnlistedLivePayments({ paymentLines, livePaymentLines });
        }
        appendPaymentsToClosePaidGap({
          paymentLines,
          payments: livePaymentsGrouped,
          targetPaid,
          fallbackSettlementRows,
        });
      } else if (isPdfRestoreCustomer && fallbackSettlementRows.length) {
        const fallbackLines = buildFallbackSettlementLines();
        paymentLines.length = 0;
        paymentLines.push(...fallbackLines);
        appendLivePaymentsAfterFallback({ paymentLines, fallbackSettlementRows, livePaymentLines });
      }

      const hasOnlySystemTaggedLines = paymentLines.length > 0
        && paymentLines.every((line) => {
          const desc = String(line.description || '').trim();
          return /TG_DUE_|PDF_ITEM_RESTORE_/i.test(desc)
            || /^\([0-9]{2}\/[0-9]{2}\/[0-9]{4}\)\s*-\s*$/i.test(desc)
            || desc === 'Down Payment';
        });
      const settlementPaymentsAreMigrationOnly = settlementPayments.length > 0
        && settlementPayments.every((payment) => (
          isSystemReceiptTag(payment?.reference)
          || isSystemReceiptTag(payment?.notes)
        ));

      // Do not re-wipe Fahme/restore settlements — that dropped newly added down payments.
      if (!isPdfRestoreCustomer && !isFahmeCustomer && fallbackSettlementRows.length && (
        !paymentLines.length || hasOnlySystemTaggedLines || settlementPaymentsAreMigrationOnly
      )) {
        const fallbackLines = buildFallbackSettlementLines();
        paymentLines.length = 0;
        paymentLines.push(...fallbackLines);
      }
      if (isFahmeCustomer) {
        normalizeSettlementLineDescriptions(paymentLines);
      }
      paymentLines.sort((a, b) => {
        const da = settlementLineDateTs(a);
        const db = settlementLineDateTs(b);
        if (da !== db) return da - db;
        return String(a.description || '').localeCompare(String(b.description || ''));
      });
      if (!paymentLines.length) {
        paymentLines.push({
          description: 'No down payments recorded',
          paymentType: '-',
          amount: 0,
          date: null,
          discount_amount: 0,
        });
      }
    // Settlement Due Remaining = accrued total due across all sales minus down-payments/discounts.
    // Prefer Layby Management row totals for Fahme so Settlement matches the table row.
    const lastCumulativeDue = cumulativeDueAcrossDates;
    const paidTotal = paymentLines.reduce((a,l)=> a + Number(l.amount || 0), 0);
    const discountTotal = paymentLines.reduce((sum, p) => sum + Number(p.discount_amount || 0), 0);
    const downPaymentTotal = paidTotal;
    const dueRemaining = (rowTotalsUsd && isFahmeCustomer && Number(rowTotalsUsd.due || 0) >= 0)
      ? Math.max(0, Number(rowTotalsUsd.due || 0))
      : Math.max(0, Number(lastCumulativeDue || 0) - paidTotal - discountTotal);
      if (paymentLines.length) {
        // Desired gap between main table and settlement: 3cm (~85pt)
        const CM = 28.346; const desiredGap = 3 * CM; // ≈85.04pt
        const settlementHeightEstimate = 40 + headerHeight + (paymentLines.length + 2) * rowLineHeight; // title + header + rows + total paid + due row
        const pH = doc.internal.pageSize.getHeight();
        // If settlement fits on current page with desired gap and 40pt bottom buffer, keep it here; else new page.
        const needGap = yCursor + desiredGap + settlementHeightEstimate + 40 > pH;
        if (needGap) {
          addPageWithWatermarkIfNeeded(true);
          yCursor = margin; // top of new page
        } else {
          yCursor += desiredGap; // maintain visual separation
        }
        const tableWidth = colWidths.qty + colWidths.name + colWidths.price + colWidths.amount;
        const useLegacySettlementLayout = isFahmeCustomer;
        const typeColWidth = useLegacySettlementLayout ? 0 : 140;
        const amountColWidth = 120;
        const descColWidth = tableWidth - typeColWidth - amountColWidth;
        const descX = tableMarginLeft + cellPaddingX;
        const typeX = tableMarginLeft + descColWidth + cellPaddingX;
        const amountX = tableMarginLeft + tableWidth - cellPaddingX;
        doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text('Settlement', tableMarginLeft, yCursor); yCursor += 10;
        // Header row
        doc.setFillColor(0,132,170); try { if (DRAW_TABLE_BORDERS) doc.rect(tableMarginLeft, yCursor, tableWidth, headerHeight, 'F'); else doc.rect(tableMarginLeft, yCursor, tableWidth, headerHeight, 'F'); } catch {}
// Skip drawing header separator lines & internal row separators when borders disabled
        doc.setTextColor(255); doc.setFontSize(11);
        doc.text('Description', descX, yCursor + headerHeight/2 + 1, { baseline: 'middle' });
        if (!useLegacySettlementLayout) {
          doc.text('Payment Type', typeX, yCursor + headerHeight/2 + 1, { baseline: 'middle' });
        }
        doc.text('Amount', amountX, yCursor + headerHeight/2 + 1, { align: 'right', baseline: 'middle' });
        yCursor += headerHeight;
        doc.setTextColor(0); doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
        const rowStartY = yCursor;
        paymentLines.forEach(l => {
          const rowH = rowLineHeight;
          ensureSpace(rowH + 30);
            const wrappedDesc = doc.splitTextToSize(String(l.description || ''), Math.max(40, descColWidth - (cellPaddingX * 2)));
            const descY = yCursor + rowH/2;
            doc.text(wrappedDesc[0] || '', descX, descY, { baseline: 'middle' });
            if (!useLegacySettlementLayout) {
              doc.text(String(l.paymentType || ''), typeX, yCursor + rowH/2, { baseline: 'middle' });
            }
            doc.text(numberFmt(l.amount), amountX, yCursor + rowH/2, { align: 'right', baseline: 'middle' });
            yCursor += rowH;
        });
        if (DRAW_TABLE_BORDERS) {
          doc.line(tableMarginLeft, yCursor, tableMarginLeft + tableWidth, yCursor);
        }
        doc.setFont('helvetica','bold');
        doc.text('Total Paid', descX, yCursor + rowLineHeight/2, { baseline: 'middle' });
        doc.text(numberFmt(downPaymentTotal), amountX, yCursor + rowLineHeight/2, { align: 'right', baseline: 'middle' });
        yCursor += rowLineHeight;
        // Due remaining row
        doc.setFont('helvetica','bold');
        doc.text('Due Remaining', descX, yCursor + rowLineHeight/2, { baseline: 'middle' });
        doc.setTextColor(255,0,0); doc.text(numberFmt(dueRemaining), amountX, yCursor + rowLineHeight/2, { align: 'right', baseline: 'middle' }); doc.setTextColor(0);
        yCursor += rowLineHeight;
        // Borders (outer + light inner separators only)
        if (DRAW_TABLE_BORDERS) {
          doc.setDrawColor(0,0,0); doc.setLineWidth(0.8); doc.rect(tableMarginLeft, rowStartY - headerHeight, tableWidth, yCursor - (rowStartY - headerHeight));
          doc.setDrawColor(180); doc.setLineWidth(0.4);
        }
        let lineY = rowStartY - headerHeight; // top header top
        // after header
        if (DRAW_TABLE_BORDERS) doc.line(tableMarginLeft, lineY + headerHeight, tableMarginLeft + tableWidth, lineY + headerHeight);
        paymentLines.forEach((l,i)=> {
          const yLine = rowStartY + (i+1)*rowLineHeight;
          if (DRAW_TABLE_BORDERS) doc.line(tableMarginLeft, yLine, tableMarginLeft + tableWidth, yLine);
        });
        // line before due row
        if (DRAW_TABLE_BORDERS) doc.line(tableMarginLeft, yCursor - rowLineHeight, tableMarginLeft + tableWidth, yCursor - rowLineHeight);
      }
    } catch (settleErr) {
      console.warn('Settlement section failed', settleErr?.message || settleErr);
    }
    } else {
    try {
      const allowedSaleIds = new Set((related.sales || []).map((sale) => String(sale.id || sale.sale_id)));
      if (layby?.sale_id != null) allowedSaleIds.add(String(layby.sale_id));
      const salePayments = (related.payments || [])
        .filter((payment) => allowedSaleIds.has(String(payment.sale_id)))
        .map((payment) => ({ ...payment, payment_type: String(payment.payment_type || 'cash').toLowerCase() }))
        .filter((payment) => payment.payment_type !== 'credit');

      const byType = new Map();
      salePayments.forEach((payment) => {
        const type = String(payment.payment_type || 'cash').toLowerCase();
        byType.set(type, (byType.get(type) || 0) + Number(payment.amount || 0));
      });

      const totalPaid = salePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const netOwed = Number(cumulativeDueAcrossDates || 0) > 0
        ? Number(cumulativeDueAcrossDates || 0)
        : Math.max(0, Number(grandTotal || 0) - Number(grandDiscount || 0));
      const dueRemaining = Math.max(0, netOwed - totalPaid);

      const summaryRows = [];
      const typeOrder = ['cash', 'visa_card', 'bank_transfer', 'mobile_money', 'cheque', 'goods', 'down_payment'];
      Array.from(byType.keys())
        .sort((left, right) => {
          const leftIndex = typeOrder.indexOf(left);
          const rightIndex = typeOrder.indexOf(right);
          return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
        })
        .forEach((type) => {
          const amount = Number(byType.get(type) || 0);
          if (amount > 0) {
            summaryRows.push({ label: `Total ${posPaymentTypeLabel(type)} Paid`, value: amount });
          }
        });

      if (!summaryRows.length && totalPaid > 0) {
        summaryRows.push({ label: 'Total Cash Paid', value: totalPaid });
      }
      summaryRows.push({ label: 'Total Paid', value: totalPaid, bold: true });
      if (dueRemaining > 0.005) {
        summaryRows.push({ label: 'Due', value: dueRemaining, bold: true, red: true });
      }

      if (summaryRows.length) {
        const CM = 28.346;
        const desiredGap = 2 * CM;
        const settlementHeightEstimate = summaryRows.length * rowLineHeight + 20;
        const pH = doc.internal.pageSize.getHeight();
        if (yCursor + desiredGap + settlementHeightEstimate + 40 > pH) {
          addPageWithWatermarkIfNeeded(true);
          yCursor = margin;
        } else {
          yCursor += desiredGap;
        }

        const labelX = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price - cellPaddingX;
        const valueX = tableMarginLeft + colWidths.qty + colWidths.name + colWidths.price + colWidths.amount - cellPaddingX;
        summaryRows.forEach((row) => {
          const midY = yCursor + rowLineHeight / 2;
          doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
          doc.setFontSize(10.5);
          if (row.red) doc.setTextColor(255, 0, 0);
          doc.text(row.label, labelX, midY, { align: 'right', baseline: 'middle' });
          doc.text(numberFmt(row.value), valueX, midY, { align: 'right', baseline: 'middle' });
          doc.setTextColor(0);
          yCursor += rowLineHeight;
        });
      }
    } catch (posSettleErr) {
      console.warn('POS receipt payment summary failed', posSettleErr?.message || posSettleErr);
    }
    }

    // Final save (temporary until tables added)
    // --------------- Terms & Conditions Page ---------------
    try {
      addPageWithWatermarkIfNeeded(true); // ensures watermark also on terms page
      const pw = doc.internal.pageSize.getWidth();
      const startY = margin;
      doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text('Terms & Conditions', pw/2, startY + 10, { align: 'center' });
      doc.setFont('helvetica','normal'); doc.setFontSize(12);
      const bodyLines = [
        '1. Period Of Validity: 7 Days After Issued Date',
        '2. Delivery Of Goods: Upon Completion Of Payment'
      ];
      // Center block vertically a bit lower
      let ty = startY + 60;
      bodyLines.forEach(line => { doc.text(line, pw/2, ty, { align: 'center' }); ty += 22; });
      ty += 10;
      doc.setFont('helvetica','bold'); doc.text('Banking Details', pw/2, ty, { align: 'center' }); ty += 26; doc.setFont('helvetica','normal');
      const bankLines = [
        'Account Name: BEST REST FURNITURE',
        'Bank Name: First National Bank (FNB)',
        'Account Number: 62377271912',
        'Branch Location: Kitwe',
        'Branch Code: 260212',
        'SWIFT Code: FIRNZMLX'
      ];
      bankLines.forEach(l => { doc.text(l, pw/2, ty, { align: 'center' }); ty += 20; });
    } catch {}

    // --------------- Page Numbers ---------------
    try {
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica','normal'); doc.setFontSize(9);
        const footerText = `Page ${i} of ${pageCount}`;
        const px = doc.internal.pageSize.getWidth() / 2;
        const py = doc.internal.pageSize.getHeight() - 18;
        doc.text(footerText, px, py, { align: 'center' });
      }
    } catch {}

  const safeCustomer = (custName || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_') || 'Customer';
  // (C + D) Append statement date and currency code
  const statementDate = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  // Attempt a primary currency guess: use layby.currency or first sale currency or 'K'
  const primaryCurrency = (saleCurrency || layby?.sale_currency || customer?.currency || 'K').toUpperCase();
  const currencyCode = ACRONYM_KEEP.has(primaryCurrency) ? primaryCurrency : primaryCurrency.replace(/[^A-Z]/g,'');
  const fileName = opts?.posReceipt
    ? `${safeCustomer}_Sales_Receipt_${statementDate}_${currencyCode}.pdf`
    : `${safeCustomer}_Layby_Statement_${statementDate}_${currencyCode}.pdf`;
    const mode = String(opts?.mode || 'download').toLowerCase();
    if (mode === 'blob') {
      try { return doc.output('blob'); } catch { return null; }
    }
    if (mode === 'arraybuffer') {
      try { return doc.output('arraybuffer'); } catch { return null; }
    }
    try { doc.save(fileName); } catch {}
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('generateLaybyPdf failed:', e?.message || e);
    return false;
  }
}

export default generateLaybyPdf;
