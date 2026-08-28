/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from 'react';
import { FaFileExcel, FaFilePdf, FaWhatsapp } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import generateLaybyPdf from './laybyPdf';
import { deleteSalesPayments, insertSalesPayments } from './services/salesPayments';
import { deleteLaybyPayments, fetchLaybyPaymentsByCustomerId, fetchLaybyPaymentsBySaleIds } from './services/laybyPayments';
import { createSale } from './services/sales';
import { fetchLaybyStatement } from './services/laybyStatement';
import { fetchLaybyCustomerRows } from './services/laybyCustomerRows';
import { insertLaybyPayments } from './services/laybyPayments';
import { getCurrentUser, canManageLaybys } from './accessControl';
import { cacheClear, cacheGet, cacheSet } from './utils/staleCache';
import { buildLaybySaleFinancials, buildPooledLaybyPaymentTarget, computeLaybyTotalsByCurrency, computePooledLaybyTotalsByCurrency, filterStatementToLaybyAccount, filterStatementToOutstandingSales, formatLaybyTotalsLine, getDisplayTotalsByCurrency, LAYBY_ROWS_CACHE_KEY, sumLaybyCustomerTotalsByCurrency } from './utils/laybyRollup';
import {
  applyStartingDuePaymentReduction,
  getStartingDueBalance,
  splitPaymentAcrossStartingDue,
} from './utils/startingDueBalance';
import { normalizeLaybyStatement } from './utils/laybyStatementNormalize';
import BackToDashboard from './BackToDashboard';
import { exportAllLaybyPdfsZip, exportLaybySummaryExcel } from './utils/laybyBulkExport';
import { buildMonthlyBalanceDueMessages, laybyRowsToBalanceDueRows } from './utils/monthlyBalanceDuesMessage';
import { notifyLaybyWhatsApp, previewLaybyWhatsAppForCustomerRow, resendLaybyWhatsAppForCustomerRow, laybyCustomerRowHasLusakaSaleAsync, filterKitweLaybyRowsForMonthlyBalance, resolveLaybyWhatsAppGroupLabel } from './services/whatsappNotify';
import { sendMonthlyBalanceDueWhatsApp } from './services/whatsapp';
import { isFahme } from './laybyRules';
import { assertLaybyPaymentReceiptAvailable } from './utils/receiptNumber';
import { isFahmeStatementLocked, fahmeStatementLockedMessage } from './utils/fahmeStatementLock';
import { isRealtimeEnabled } from './utils/realtimeConfig';
import {
  clearQuoteLaybyPendingWhatsApp,
  isQuoteOriginLayby,
  markQuoteLaybyWhatsAppSent,
  salesHavePayments,
  shouldSendQuoteConvertOnPayment,
} from './utils/whatsappQuotePending';

const formatCurrency = (amount, currency = 'K') => {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount || 0);
  const formatted = n % 1 === 0
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawCode = String(currency || '').trim();
  const code = rawCode.toUpperCase();
  const label = (code === 'USD' || rawCode === '$') ? '$' : (rawCode || 'K');
  return `${label} ${formatted}`;
};

const normalizeCurrencyCode = (value, fallback = 'K') => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return fallback;
  if (raw === '$' || raw === 'USD') return 'USD';
  if (raw === 'K' || raw === 'ZMW') return 'K';
  return raw;
};

/** Fahme accounts are USD-only — fold mis-tagged K buckets into one USD total so deposits accrue. */
const getDisplayTotalsForRow = (row) => getDisplayTotalsByCurrency(row, { isFahmeCustomer: isFahme(row?.customerId) });

/** Match layby table currency for payment entry and allocation fallbacks. */
const resolveCustomerPaymentCurrency = ({ customerId, customer, totalsByCurrency } = {}) => {
  if (isFahme(customerId)) return 'USD';
  const preferred = normalizeCurrencyCode(customer?.currency, '');
  const displayTotals = getDisplayTotalsByCurrency({ totalsByCurrency }, { isFahmeCustomer: isFahme(customerId) });
  const entries = Object.entries(displayTotals || {});
  if (preferred) {
    const match = entries.find(([code]) => code === preferred);
    if (match) return preferred;
  }
  if (entries.length === 1) return entries[0][0];
  const usd = entries.find(([code]) => code === 'USD');
  if (usd) return 'USD';
  return preferred || entries[0]?.[0] || 'K';
};

const allowedPaymentTypes = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'visa_card', 'goods'];
const paymentTypeLabels = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  cheque: 'Cheque',
  visa_card: 'Visa Card',
  goods: 'Goods',
  down_payment: 'Down Payment (Legacy)',
  mixed: 'Mixed',
};

const LAYBY_DELETE_USER_ID = '1b5e098e-1206-447e-b4bc-6d009b85b5d3';
const LAYBY_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());
const isNumericId = (value) => String(value || '').trim() !== '' && !Number.isNaN(Number(value));

const sanitizePaymentNote = (note) => {
  const raw = String(note || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered.includes('auto-migrated') && lowered.includes('down_payment')) return '';
  if (lowered.includes('migrated from sales.down_payment')) return '';
  return raw;
};

const isLegacyDownPaymentRow = (row) => String(row?.payment_type || '').toLowerCase() === 'down_payment';

const getTodayInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseAmountInput = (value) => {
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const defaultPaymentEntryLine = () => ({ amount: '', type: 'cash' });

const resetPaymentModalFields = ({
  setPaymentEntryLines,
  setPaymentDiscount,
  setPaymentDate,
  setReceipt,
  setPaymentNote,
}) => {
  setPaymentEntryLines([defaultPaymentEntryLine()]);
  setPaymentDiscount('');
  setPaymentDate('');
  setReceipt('');
  setPaymentNote('');
};

const buildSelectedLaybyTarget = (row, layby) => {
  if (!row || !layby) return null;
  return {
    ...layby,
    customer_id: row.customerId,
    customerId: row.customerId,
    customerInfo: row.customer || {},
    totalsByCurrency: row.totalsByCurrency || {},
    laybys: row.laybys || [],
    statement: row.statement || null,
    fullStatement: row.fullStatement || row.statement || null,
    primaryLayby: row.primaryLayby || layby,
  };
};

const sumTotalsByCurrency = sumLaybyCustomerTotalsByCurrency;

const sumRowDue = (row) => Object.values(row?.totalsByCurrency || {})
  .reduce((sum, totals) => sum + Number(totals?.due || 0), 0);

const emptyQuoteLinkIndex = () => ({
  bySaleId: {},
  byLaybyId: {},
  byCustomerId: {},
});

const collectRowLinkKeys = (row) => {
  const laybyIds = new Set();
  const saleIds = new Set();
  (row?.laybys || []).forEach((layby) => {
    const laybyId = String(layby?.id || '').trim();
    const saleId = String(layby?.sale_id || '').trim();
    if (laybyId) laybyIds.add(laybyId);
    if (saleId) saleIds.add(saleId);
  });
  (row?.fullStatement?.sales || row?.statement?.sales || []).forEach((sale) => {
    const saleId = String(sale?.sale_id ?? sale?.id ?? '').trim();
    if (saleId && !saleId.startsWith('layby:')) saleIds.add(saleId);
    const laybyId = String(sale?.layby_id || '').trim();
    if (laybyId) laybyIds.add(laybyId);
  });
  return { laybyIds, saleIds };
};

const resolveRowQuoteId = (row, quoteLinkIndex = emptyQuoteLinkIndex()) => {
  if (row?.linkedQuoteId) return row.linkedQuoteId;
  const { laybyIds, saleIds } = collectRowLinkKeys(row);
  for (const laybyId of laybyIds) {
    const quoteId = quoteLinkIndex.byLaybyId?.[laybyId];
    if (quoteId) return quoteId;
  }
  for (const saleId of saleIds) {
    const quoteId = quoteLinkIndex.bySaleId?.[saleId];
    if (quoteId) return quoteId;
  }
  const customerKey = String(row?.customerId || '');
  return quoteLinkIndex.byCustomerId?.[customerKey] || null;
};

const chunkIds = (ids, size = 100) => {
  const list = Array.from(ids);
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
};

const ingestQuoteIntoIndex = (quote, index) => {
  if (!quote?.id) return;
  if (quote.sale_id != null) index.bySaleId[String(quote.sale_id)] = quote.id;
  if (quote.layby_id != null) index.byLaybyId[String(quote.layby_id)] = quote.id;
  const customerKey = String(quote.customer_id || '');
  if (customerKey && !index.byCustomerId[customerKey]) {
    index.byCustomerId[customerKey] = quote.id;
  }
};

const rowIsQuoteOrigin = (row) => (row?.laybys || []).some((layby) => {
  const origin = String(layby?.origin || '').toLowerCase();
  const notes = String(layby?.notes || '').toLowerCase();
  return origin === 'quote' || notes.includes('origin=quote');
});

const canOfferEditQuote = (row) => sumRowDue(row) > 0.009;

export default function LaybyManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [bulkExportBusy, setBulkExportBusy] = useState(false);
  const [monthlyBalanceBusy, setMonthlyBalanceBusy] = useState(false);
  const [bulkExportLabel, setBulkExportLabel] = useState('');
  const [whatsAppRowBusyId, setWhatsAppRowBusyId] = useState('');
  const [whatsappPreview, setWhatsappPreview] = useState({
    open: false,
    loading: false,
    title: '',
    message: '',
    attachmentNote: '',
    error: '',
  });
  const [quoteLinkIndex, setQuoteLinkIndex] = useState(emptyQuoteLinkIndex);
  const currentUser = useMemo(() => getCurrentUser(), []);
  const readOnly = !canManageLaybys(currentUser);
  const handledDeepLinkRef = React.useRef('');
  const canDeleteLaybyCustomer = !readOnly && String(currentUser?.id || '').toLowerCase() === LAYBY_DELETE_USER_ID;

  // Payment add modal
  const [selectedLayby, setSelectedLayby] = useState(null);
  const [paymentEntryLines, setPaymentEntryLines] = useState([defaultPaymentEntryLine()]);
  const [paymentDiscount, setPaymentDiscount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [receipt, setReceipt] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // Payments editor modal
  const [paymentEditLayby, setPaymentEditLayby] = useState(null);
  const [paymentRows, setPaymentRows] = useState([]);
  const [paymentsBusy, setPaymentsBusy] = useState(false);
  const [paymentsErr, setPaymentsErr] = useState('');
  // Realtime refresh tick
  const [rtTick, setRtTick] = useState(0);
  const rtTimerRef = React.useRef(null);

  useEffect(() => {
    if (!isRealtimeEnabled()) return undefined;
    const channel = db
      .channel('layby-mgmt-rt-simple')
      .on('firestore_changes', { event: '*', schema: 'public', table: 'laybys' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales_payments' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .on('firestore_changes', { event: '*', schema: 'public', table: 'layby_payments' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .subscribe();
    return () => {
      try { db.removeChannel(channel); } catch {}
      if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
    };
  }, []);

  const loadRows = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const built = await fetchLaybyCustomerRows();
      if (!built.length) {
        setRows([]);
        try { cacheSet(LAYBY_ROWS_CACHE_KEY, [], LAYBY_ROWS_CACHE_TTL_MS); } catch {}
        return;
      }
      setRows(built);
      try { cacheSet(LAYBY_ROWS_CACHE_KEY, built, LAYBY_ROWS_CACHE_TTL_MS); } catch {}
    } catch (e) {
      if (!silent) setError(e?.message || 'Failed to load layby customers.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let hasCache = false;
    try {
      const cached = cacheGet(LAYBY_ROWS_CACHE_KEY);
      if (Array.isArray(cached) && cached.length) {
        setRows(cached);
        hasCache = true;
      }
    } catch {}
    loadRows({ silent: hasCache });
  }, [rtTick]);

  useEffect(() => {
    let cancelled = false;
    async function loadQuoteLinks() {
      const customerIds = Array.from(new Set((rows || []).map((row) => row?.customerId).filter(Boolean)));
      const saleIds = new Set();
      const laybyIds = new Set();
      (rows || []).forEach((row) => {
        const keys = collectRowLinkKeys(row);
        keys.laybyIds.forEach((id) => laybyIds.add(id));
        keys.saleIds.forEach((id) => saleIds.add(id));
      });
      if (!customerIds.length && !saleIds.size && !laybyIds.size) {
        if (!cancelled) setQuoteLinkIndex(emptyQuoteLinkIndex());
        return;
      }
      try {
        const quotationSelect = 'id, customer_id, sale_id, layby_id, status, created_at';
        const requests = [];
        chunkIds(customerIds, 100).forEach((chunk) => {
          requests.push(
            db
              .from('quotations')
              .select(quotationSelect)
              .in('customer_id', chunk)
              .neq('status', 'draft')
          );
        });
        chunkIds(saleIds, 100).forEach((chunk) => {
          requests.push(
            db
              .from('quotations')
              .select(quotationSelect)
              .in('sale_id', chunk)
          );
        });
        chunkIds(laybyIds, 100).forEach((chunk) => {
          requests.push(
            db
              .from('quotations')
              .select(quotationSelect)
              .in('layby_id', chunk)
          );
        });
        const results = await Promise.all(requests);
        const merged = new Map();
        results.forEach(({ data, error }) => {
          if (error) return;
          (data || []).forEach((quote) => {
            if (quote?.id != null) merged.set(String(quote.id), quote);
          });
        });
        const next = emptyQuoteLinkIndex();
        const quotes = Array.from(merged.values()).sort(
          (left, right) => new Date(right?.created_at || 0) - new Date(left?.created_at || 0)
        );
        quotes.forEach((quote) => ingestQuoteIntoIndex(quote, next));
        if (!cancelled) setQuoteLinkIndex(next);
      } catch {
        if (!cancelled) setQuoteLinkIndex(emptyQuoteLinkIndex());
      }
    }
    loadQuoteLinks();
    return () => { cancelled = true; };
  }, [rows]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const searchParam = String(params.get('search') || '').trim();
    if (searchParam) setSearch(searchParam);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const laybyIdParam = String(params.get('laybyId') || '').trim();
    const saleIdParam = String(params.get('saleId') || '').trim();
    const deepLinkKey = `${laybyIdParam}|${saleIdParam}`;

    if (!laybyIdParam && !saleIdParam) {
      handledDeepLinkRef.current = '';
      return;
    }
    if (!rows.length || handledDeepLinkRef.current === deepLinkKey) return;

    const targetRow = rows.find((row) => (row.laybys || []).some((layby) => {
      if (laybyIdParam && String(layby.id || '') === laybyIdParam) return true;
      if (saleIdParam && String(layby.sale_id || '') === saleIdParam) return true;
      return false;
    }));
    if (!targetRow) return;

    const targetLayby = (targetRow.laybys || []).find((layby) => {
      if (laybyIdParam && String(layby.id || '') === laybyIdParam) return true;
      if (saleIdParam && String(layby.sale_id || '') === saleIdParam) return true;
      return false;
    }) || targetRow.primaryLayby;
    const selectedTarget = buildSelectedLaybyTarget(targetRow, targetLayby);
    if (!selectedTarget) return;

    handledDeepLinkRef.current = deepLinkKey;
    setSearch(targetRow.customer?.name || '');
    if (!readOnly) {
      setPaymentDate(getTodayInputValue());
      setPaymentEntryLines([defaultPaymentEntryLine()]);
      setSelectedLayby(selectedTarget);
    }
  }, [location.search, rows, readOnly]);

  async function reconcileCustomerLaybys(customerId) {
    if (!customerId) return;
    try {
      const [{ data: laybyRows }, { data: statementData, error: statementErr }] = await Promise.all([
        db
          .from('laybys')
          .select('id, sale_id, total_amount, paid_amount, status')
          .eq('customer_id', customerId),
        fetchLaybyStatement(customerId),
      ]);
      const nowIso = new Date().toISOString();
      const saleFinancials = statementErr ? [] : buildLaybySaleFinancials(statementData || {});
      const saleFinancialById = new Map(saleFinancials.map((row) => [String(row.saleId), row]));
      const singleFinancial = saleFinancials.length === 1 ? saleFinancials[0] : null;
      for (const l of (laybyRows || [])) {
        const matchedFinancial = l?.sale_id != null
          ? saleFinancialById.get(String(l.sale_id))
          : (singleFinancial || null);
        const patch = { updated_at: nowIso };
        if (matchedFinancial) {
          patch.total_amount = Number(matchedFinancial.total || 0);
          patch.paid_amount = Number(matchedFinancial.paid || 0) + Number(matchedFinancial.paymentDiscount || 0);
          patch.status = Number(matchedFinancial.due || 0) > 0 ? 'active' : 'completed';
          if (!l?.sale_id && matchedFinancial.saleId != null) patch.sale_id = matchedFinancial.saleId;
        }
        try { await db.from('laybys').update(patch).eq('id', l.id); } catch {}
      }
    } catch {}
  }

  async function refreshCustomerRowFast(customerId) {
    if (!customerId) return;
    try {
      const built = await fetchLaybyCustomerRows();
      const updatedRow = (built || []).find(row => String(row.customerId) === String(customerId));
      setRows((prev) => {
        if (!updatedRow) {
          const next = (prev || []).filter(r => String(r.customerId) !== String(customerId));
          try { cacheSet(LAYBY_ROWS_CACHE_KEY, next, LAYBY_ROWS_CACHE_TTL_MS); } catch {}
          return next;
        }
        const without = (prev || []).filter(r => String(r.customerId) !== String(customerId));
        const next = [updatedRow, ...without].sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0));
        try { cacheSet(LAYBY_ROWS_CACHE_KEY, next, LAYBY_ROWS_CACHE_TTL_MS); } catch {}
        return next;
      });
    } catch {}
  }

  async function handleAddPayment(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    if (!selectedLayby || !paymentDate) {
      setError('Date is required.');
      setLoading(false);
      return;
    }
    const customerId = selectedLayby.customer_id || selectedLayby.customerId;
    if (isFahmeStatementLocked(customerId)) {
      setError(fahmeStatementLockedMessage(customerId));
      setLoading(false);
      return;
    }
    let successFlag = false;
    let whatsappSaleId = null;
    let fromQuote = false;
    let hadPaymentsBefore = false;
    const safetyTimer = setTimeout(() => {
      setLoading(prev => (prev ? false : prev));
    }, 15000);
    try {
      const { data: custRow } = await db.from('customers').select('currency, starting_due_balance').eq('id', customerId).maybeSingle();
      const startingDue = getStartingDueBalance({ ...(selectedLayby.customerInfo || {}), ...(custRow || {}) });
      const curr = resolveCustomerPaymentCurrency({
        customerId,
        customer: { ...(selectedLayby.customerInfo || {}), currency: custRow?.currency || selectedLayby.customerInfo?.currency },
        totalsByCurrency: selectedLayby.totalsByCurrency,
      });
      const activePaymentLines = (paymentEntryLines || [])
        .map((line) => ({
          amount: parseAmountInput(line.amount),
          type: line.type || 'cash',
        }))
        .filter((line) => line.amount > 0);
      const rawAmount = activePaymentLines.reduce((sum, line) => sum + line.amount, 0);
      const rawDiscount = Number(paymentDiscount || 0);
      if ((!Number.isFinite(rawAmount) || rawAmount < 0) || (!Number.isFinite(rawDiscount) || rawDiscount < 0)) {
        setError('Invalid payment or discount amount.');
        setLoading(false);
        return;
      }
      if (rawAmount <= 0 && rawDiscount <= 0) {
        setError('Enter a payment or a discount amount.');
        setLoading(false);
        return;
      }

      const loadOutstandingFromStatement = async () => {
        const cachedStatement = selectedLayby?.fullStatement || selectedLayby?.statement;
        const poolSaleId = selectedLayby?.primaryLayby?.sale_id
          || selectedLayby?.sale_id
          || null;
        if (cachedStatement && (cachedStatement.sales?.length || cachedStatement.payments?.length)) {
          const pooled = buildPooledLaybyPaymentTarget(cachedStatement, poolSaleId);
          if (pooled.length) return pooled;
        }
        const { data: statementData, error: statementErr } = await fetchLaybyStatement(customerId);
        if (statementErr) throw statementErr;
        return buildPooledLaybyPaymentTarget(statementData || {}, poolSaleId);
      };

      let owing = [];
      try {
        owing = await loadOutstandingFromStatement();
      } catch {}

      if (!owing.length) {
        const saleColumns = 'id, discount, sale_date, created_at, layby_id, status, currency, total_amount, customer_id';
        const { data: laybyRows } = await db
          .from('laybys')
          .select('id, sale_id, status')
          .eq('customer_id', customerId);
        const laybyIds = new Set((laybyRows || []).map(r => String(r.id || '')).filter(Boolean));
        const laybySaleIds = new Set((laybyRows || []).map(r => String(r.sale_id || '')).filter(Boolean));

        let { data: salesRows } = await db
          .from('sales')
          .select(saleColumns)
          .eq('customer_id', customerId);
        let salesList = (salesRows || []).filter(s => {
          const status = String(s.status || '').toLowerCase();
          const saleId = String(s.id || '');
          const laybyId = String(s.layby_id || '');
          return status === 'layby' || laybyIds.has(laybyId) || laybySaleIds.has(saleId);
        });

        if (!salesList.length) {
          try {
            const placeholder = {
              customer_id: customerId,
              status: 'layby',
              layby_id: selectedLayby.id,
              sale_date: paymentDate
                ? new Date(`${paymentDate}T12:00:00`).toISOString()
                : new Date().toISOString(),
              currency: curr,
              total_amount: Number(selectedLayby.total_amount || 0) || rawAmount || 0,
              discount: 0,
            };
            const { data: insertSale, error: insertErr } = await createSale(placeholder);
            if (insertErr) throw insertErr;
            salesList = [insertSale];
            if (!selectedLayby.sale_id) {
              await db.from('laybys').update({ sale_id: insertSale.id, updated_at: new Date().toISOString() }).eq('id', selectedLayby.id);
              selectedLayby.sale_id = insertSale.id;
            }
          } catch (mkErr) {
            setError('Unable to create placeholder sale for allocation: ' + (mkErr?.message || mkErr));
            setLoading(false);
            return;
          }
        }

        try {
          owing = await loadOutstandingFromStatement();
        } catch {}

        if (!owing.length) {
          try {
            const { data: statementData } = await fetchLaybyStatement(customerId);
            const poolSaleId = selectedLayby?.primaryLayby?.sale_id
              || selectedLayby?.sale_id
              || salesList[0]?.id
              || null;
            owing = buildPooledLaybyPaymentTarget(statementData || {}, poolSaleId);
          } catch {}
        }
      }

      if (!owing.length && startingDue <= 0.009) {
        setError('Customer account has no outstanding balance.');
        setLoading(false);
        return;
      }

      const saleCurrencyById = new Map();
      try {
        const saleIds = Array.from(new Set((owing || []).map(r => r.saleId).filter(v => v != null)));
        if (saleIds.length) {
          const { data: currencyRows, error: currencyErr } = await db
            .from('sales')
            .select('id, currency')
            .in('id', saleIds);
          if (currencyErr) throw currencyErr;
          (currencyRows || []).forEach(row => {
            if (row?.id != null) saleCurrencyById.set(String(row.id), row.currency || null);
          });
        }
      } catch (currencyLoadErr) {
        console.warn('Failed to load sale currencies for payment allocation', currencyLoadErr?.message || currencyLoadErr);
      }

      const salesOutstanding = owing.reduce((a, r) => a + Number(r.due || 0), 0);
      const displayedDue = sumRowDue(selectedLayby);
      const pooledOutstanding = Math.max(salesOutstanding, displayedDue);
      const totalOutstanding = pooledOutstanding + startingDue;
      let paymentBudget = Math.min(rawAmount, totalOutstanding);
      let remainingDiscount = Math.min(rawDiscount, Math.max(0, totalOutstanding - paymentBudget));
      if (paymentBudget <= 0 && remainingDiscount <= 0) {
        setError('Nothing outstanding to pay.');
        setLoading(false);
        return;
      }

      const trimmedNote = (paymentNote || '').trim();
      const trimmedReceipt = (receipt || '').trim();
      if (!trimmedReceipt || /^-+$/.test(trimmedReceipt)) {
        setError('Receipt # is required.');
        setLoading(false);
        return;
      }
      try {
        await assertLaybyPaymentReceiptAvailable(db, trimmedReceipt, { customerId });
      } catch (receiptErr) {
        setError(receiptErr?.message || 'Receipt number already exists.');
        setLoading(false);
        return;
      }

      const poolSaleId = selectedLayby?.primaryLayby?.sale_id
        || selectedLayby?.sale_id
        || owing[0]?.saleId
        || null;

      const allocationBatchUuid = (typeof window !== 'undefined' && window.crypto?.randomUUID)
        ? window.crypto.randomUUID()
        : `batch-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(16)}`;

      if (!poolSaleId && startingDue > 0.009) {
        const openingInserts = [];
        for (const line of activePaymentLines) {
          const lineAmount = Math.min(Number(line.amount || 0), paymentBudget);
          if (!(lineAmount > 0)) continue;
          paymentBudget -= lineAmount;
          openingInserts.push({
            customer_id: customerId,
            amount: lineAmount,
            payment_type: line.type || 'cash',
            currency: curr,
            payment_date: paymentDate,
            reference: trimmedReceipt || null,
            notes: trimmedNote || null,
            allocation_batch_uuid: allocationBatchUuid,
            discount_amount: 0,
          });
        }
        const discountPaymentType = activePaymentLines[0]?.type || 'cash';
        if (remainingDiscount > 0) {
          openingInserts.push({
            customer_id: customerId,
            amount: 0,
            payment_type: discountPaymentType,
            currency: curr,
            payment_date: paymentDate,
            reference: trimmedReceipt || null,
            notes: trimmedNote || null,
            allocation_batch_uuid: allocationBatchUuid,
            discount_amount: remainingDiscount,
          });
        }
        if (!openingInserts.length) {
          setError('Calculated allocation empty.');
          setLoading(false);
          return;
        }
        const { error: laybyPayErr } = await insertLaybyPayments(openingInserts, {
          customerId,
          allowNullSaleId: true,
        });
        if (laybyPayErr) throw laybyPayErr;

        const { payToStarting } = splitPaymentAcrossStartingDue({
          paymentAmount: rawAmount,
          paymentDiscount: rawDiscount,
          salesOutstanding: 0,
          startingDue,
        });
        if (payToStarting > 0.009) {
          await applyStartingDuePaymentReduction(db, customerId, payToStarting);
        }

        successFlag = true;
        cacheClear(LAYBY_ROWS_CACHE_KEY);
        setSuccess(`Payment of ${formatCurrency(rawAmount, curr)} recorded against opening balance.`);
        await refreshCustomerRowFast(customerId);
        void (async () => {
          try {
            await reconcileCustomerLaybys(customerId);
          } catch (refreshErr) {
            console.warn('Background layby reconcile failed after payment', refreshErr?.message || refreshErr);
          } finally {
            cacheClear(LAYBY_ROWS_CACHE_KEY);
            setRtTick(t => t + 1);
          }
        })();
        return;
      }

      if (!poolSaleId) {
        setError('Unable to resolve layby account for this payment.');
        setLoading(false);
        return;
      }
      const poolCurrency = saleCurrencyById.get(String(poolSaleId))
        || owing[0]?.currency
        || curr;

      const saleIdsForCheck = Array.from(new Set((owing || []).map((row) => row.saleId).filter((id) => id != null)));
      const laybyIdForQuote = selectedLayby?.primaryLayby?.id || selectedLayby?.id;
      const quoteSaleId = selectedLayby?.sale_id || selectedLayby?.primaryLayby?.sale_id || owing[0]?.saleId || null;
      [fromQuote, hadPaymentsBefore] = await Promise.all([
        isQuoteOriginLayby({ laybyId: laybyIdForQuote, saleId: quoteSaleId }),
        salesHavePayments(saleIdsForCheck),
      ]);

      const inserts = [];

      // Pool all down payments against one customer balance (single sale anchor row).
      for (const line of activePaymentLines) {
        const lineAmount = Math.min(Number(line.amount || 0), paymentBudget);
        if (!(lineAmount > 0)) continue;
        paymentBudget -= lineAmount;
        inserts.push({
          sale_id: poolSaleId,
          amount: lineAmount,
          payment_type: line.type || 'cash',
          currency: poolCurrency,
          payment_date: paymentDate,
          reference: trimmedReceipt || null,
          notes: trimmedNote || null,
          allocation_batch_uuid: allocationBatchUuid,
          discount_amount: 0,
        });
      }

      const discountPaymentType = activePaymentLines[0]?.type || 'cash';
      if (remainingDiscount > 0) {
        inserts.push({
          sale_id: poolSaleId,
          amount: 0,
          payment_type: discountPaymentType,
          currency: poolCurrency,
          payment_date: paymentDate,
          reference: trimmedReceipt || null,
          notes: trimmedNote || null,
          allocation_batch_uuid: allocationBatchUuid,
          discount_amount: remainingDiscount,
        });
      }

      if (!inserts.length) {
        setError('Calculated allocation empty.');
        setLoading(false);
        return;
      }
      whatsappSaleId = poolSaleId;

      const { error: payErr } = await insertSalesPayments(inserts);
      if (payErr) throw payErr;

      const laybyRows = inserts.map(row => ({
        ...row,
        customer_id: customerId,
      }));
      const { error: laybyPayErr } = await insertLaybyPayments(laybyRows, { customerId });
      if (laybyPayErr) throw laybyPayErr;

      const { payToStarting } = splitPaymentAcrossStartingDue({
        paymentAmount: rawAmount,
        paymentDiscount: rawDiscount,
        salesOutstanding,
        startingDue,
      });
      if (payToStarting > 0.009) {
        await applyStartingDuePaymentReduction(db, customerId, payToStarting);
      }

      successFlag = true;
      cacheClear(LAYBY_ROWS_CACHE_KEY);
      setSuccess(`Payment of ${formatCurrency(rawAmount, curr)} recorded against layby balance.`);
      await refreshCustomerRowFast(customerId);
      void (async () => {
        try {
          await reconcileCustomerLaybys(customerId);
        } catch (refreshErr) {
          console.warn('Background layby reconcile failed after payment', refreshErr?.message || refreshErr);
        } finally {
          cacheClear(LAYBY_ROWS_CACHE_KEY);
          setRtTick(t => t + 1);
        }
      })();
    } catch (ex) {
      setError(ex?.message || 'Failed to add payment');
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
      if (successFlag) {
        const laybySnapshot = selectedLayby;
        setSelectedLayby(null);
        resetPaymentModalFields({
          setPaymentEntryLines,
          setPaymentDiscount,
          setPaymentDate,
          setReceipt,
          setPaymentNote,
        });
        const laybyId = laybySnapshot?.primaryLayby?.id || laybySnapshot?.id;
        const customerIdForNotify = laybySnapshot?.customer_id || laybySnapshot?.customerId;
        if (laybyId) {
          clearQuoteLaybyPendingWhatsApp(laybyId);
          const sendQuoteConvert = shouldSendQuoteConvertOnPayment({
            laybyId,
            fromQuote,
            hadPaymentsBefore,
          });
          if (sendQuoteConvert) markQuoteLaybyWhatsAppSent(laybyId);
          const eventType = sendQuoteConvert ? 'quote_convert' : 'payment';
          void (async () => {
            await refreshCustomerRowFast(customerIdForNotify);
            await notifyLaybyWhatsApp({
              laybyId,
              customerId: customerIdForNotify,
              eventType,
              saleId: whatsappSaleId,
              laybySnapshot,
            });
          })();
        }
      }
    }
  }

  async function openPaymentsEditor(target) {
    const customerId = target?.customer_id || target?.customerId || target?.customerInfo?.id;
    if (isFahmeStatementLocked(customerId)) {
      setError(fahmeStatementLockedMessage(customerId));
      return;
    }
    setPaymentsErr('');
    setPaymentsBusy(true);
    setPaymentEditLayby(target);
    setPaymentRows([]);
    try {
      const customerId = target?.customer_id || target?.customerId || target?.customerInfo?.id;
      if (!customerId) {
        throw new Error('Missing customer identifier');
      }

      const appendLegacyDownPayments = async (paymentsList, saleIdsList, saleMetaById) => {
        if (!saleIdsList?.length) return paymentsList;
        try {
          const { data: downRows, error: downErr } = await fromPublic('sales_payments')
            .select('sale_id, amount, payment_date, currency, payment_type')
            .in('sale_id', saleIdsList)
            .eq('payment_type', 'down_payment');
          if (downErr || !downRows?.length) return paymentsList;

          const existingDown = new Set(
            (paymentsList || [])
              .filter(p => String(p.payment_type || '').toLowerCase() === 'down_payment')
              .map(p => String(p.sale_id || ''))
          );

          const extra = downRows
            .filter(r => Number(r?.amount || 0) > 0 && !existingDown.has(String(r.sale_id || '')))
            .map(r => {
              const meta = saleMetaById?.get(String(r.sale_id || '')) || {};
              return {
                id: `down-${r.sale_id}`,
                sale_id: r.sale_id,
                amount: Number(r.amount || 0),
                discount_amount: 0,
                payment_type: 'down_payment',
                payment_date: r.payment_date || meta.sale_date || null,
                reference: null,
                currency: r.currency || meta.currency || null,
                notes: 'Legacy down payment',
                allocation_batch_uuid: null,
              };
            });

          return extra.length ? (paymentsList || []).concat(extra) : paymentsList;
        } catch {
          return paymentsList;
        }
      };

      const normalizePayments = rows => (rows || []).map(r => {
        const paymentType = (r.payment_type || '').toLowerCase();
        const isLegacy = isLegacyDownPaymentRow({ payment_type: paymentType });
        return {
          id: r.id,
          sale_id: r.sale_id,
          amount: Number(r.amount || 0),
          discount_amount: Number(r.discount_amount || 0),
          payment_date: r.payment_date,
          reference: r.reference,
          currency: r.currency,
          payment_type: paymentType,
          notes: sanitizePaymentNote(r.notes || ''),
          allocation_batch_uuid: r.allocation_batch_uuid || null,
          _readonly: isLegacy,
          _legacy: isLegacy,
        };
      });

      const groupPaymentsForEditor = (rows) => {
        const groups = new Map();
        (rows || []).forEach((row) => {
          const dateKey = (row.payment_date || '').slice(0, 10);
          const refKey = String(row.reference || '').trim();
          const noteKey = String(row.notes || '').trim();
          const batchKey = row.allocation_batch_uuid
            ? `batch:${row.allocation_batch_uuid}|sale:${row.sale_id || ''}`
            : `fallback:${dateKey}|${row.payment_type}|${row.currency || ''}|${refKey}|${noteKey}`;
          if (!groups.has(batchKey)) {
            groups.set(batchKey, {
              // Always keep a real sales_payments UUID as id (never the batch key).
              id: row.id,
              sale_id: row.sale_id,
              amount: 0,
              discount_amount: 0,
              payment_date: row.payment_date,
              reference: row.reference,
              currency: normalizeCurrencyCode(row.currency, 'K'),
              payment_type: row.payment_type,
              notes: row.notes,
              allocation_batch_uuid: row.allocation_batch_uuid || null,
              _readonly: row._readonly,
              _legacy: row._legacy,
              _grouped: false,
              _groupedIds: [],
              _groupKey: batchKey,
            });
          }
          const entry = groups.get(batchKey);
          entry.amount += Number(row.amount || 0);
          entry.discount_amount += Number(row.discount_amount || 0);
          if (!entry.payment_date && row.payment_date) entry.payment_date = row.payment_date;
          if (row.id != null && !String(row.id).startsWith('down-')) {
            entry._groupedIds.push(row.id);
          }
          entry._grouped = entry._groupedIds.length > 1;
          // Multi-sale batch rows stay view-only (amounts were split across sales).
          if (entry._grouped) entry._readonly = true;
          if (!entry.id || String(entry.id).startsWith('down-')) entry.id = row.id;
        });
        return Array.from(groups.values())
          .sort((a, b) => new Date(a.payment_date || 0) - new Date(b.payment_date || 0));
      };

      const saleIds = new Set();
      const laybyIds = new Set();
      const laybySaleIds = new Set();
      (target?.laybys || []).forEach(l => {
        if (l?.id != null) laybyIds.add(String(l.id));
        if (l?.sale_id != null) {
          saleIds.add(l.sale_id);
          laybySaleIds.add(String(l.sale_id));
        }
      });
      const { data: salesByCustomer } = await fromPublic('sales')
        .select('id, status, layby_id, sale_date, currency')
        .eq('customer_id', customerId);
      (salesByCustomer || []).forEach(s => {
        const laybyId = String(s.layby_id || '');
        const saleId = String(s.id || '');
        const status = String(s.status || '').trim().toLowerCase();
        if (status === 'layby' || laybyIds.has(laybyId) || laybySaleIds.has(saleId)) {
          if (s?.id != null) saleIds.add(s.id);
        }
      });
      let payments = [];
      let statementSales = [];
      try {
        const { data: statementRes, error: statementErr } = await fetchLaybyStatement(customerId);
        if (!statementErr && Array.isArray(statementRes?.sales)) {
          statementSales = statementRes.sales || [];
        }
      } catch {}
      (statementSales || []).forEach(s => {
        const saleId = String(s?.sale_id ?? s?.id ?? '').trim();
        if (saleId) saleIds.add(saleId);
      });
      const ids = Array.from(saleIds);
      const merged = new Map();
      if (ids.length) {
        const { data: payRows, error: payErr } = await fetchLaybyPaymentsBySaleIds(ids);
        if (payErr) throw payErr;
        normalizePayments(payRows).forEach(row => {
          const key = row.id != null ? `id:${row.id}` : `row:${row.sale_id}|${row.payment_date}|${row.amount}`;
          merged.set(key, row);
        });
      }
      const { data: custPayRows, error: custPayErr } = await fetchLaybyPaymentsByCustomerId(customerId);
      if (custPayErr) throw custPayErr;
      normalizePayments(custPayRows).forEach(row => {
        const key = row.id != null ? `id:${row.id}` : `row:${row.sale_id}|${row.payment_date}|${row.amount}`;
        if (!merged.has(key)) merged.set(key, row);
      });
      payments = Array.from(merged.values()).sort((a, b) => new Date(a.payment_date || 0) - new Date(b.payment_date || 0));
      const salesById = new Map(
        [...(salesByCustomer || []), ...(statementSales || [])]
          .map(s => [String(s?.sale_id ?? s?.id ?? ''), { sale_date: s?.sale_date || null, currency: s?.currency || null }])
          .filter(([key]) => key)
      );
      payments = await appendLegacyDownPayments(payments, ids, salesById);
      const groupedPayments = groupPaymentsForEditor(payments);
      setPaymentRows(groupedPayments);
    } catch (e) {
      setPaymentsErr(e?.message || 'Failed to load payments');
    } finally {
      setPaymentsBusy(false);
    }
  }

  function updatePaymentRow(id, patch) {
    setPaymentRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  async function savePayments() {
    if (!paymentEditLayby) return;
    const customerId = paymentEditLayby?.customer_id
      || paymentEditLayby?.customerId
      || paymentEditLayby?.customerInfo?.id;
    if (isFahmeStatementLocked(customerId)) {
      setPaymentsErr(fahmeStatementLockedMessage(customerId));
      return;
    }
    setPaymentsBusy(true);
    setPaymentsErr('');
    try {
      const forceUsd = isFahme(customerId);

      for (const row of paymentRows) {
        if (row._readonly || row._legacy || String(row.id).startsWith('down-')) continue;

        const targetIds = (row._groupedIds || []).filter((id) => isUuid(id));
        const primaryId = isUuid(row.id) ? row.id : targetIds[0];
        if (!primaryId) {
          throw new Error('Cannot save payment: missing valid payment id. Reload and try again.');
        }

        const currency = forceUsd
          ? 'USD'
          : normalizeCurrencyCode(row.currency, 'K');
        const patch = {
          amount: Number(row.amount || 0),
          payment_date: row.payment_date,
          reference: row.reference,
          currency,
          payment_type: row.payment_type,
          discount_amount: Number(row.discount_amount || 0),
          notes: sanitizePaymentNote(row.notes || '').trim() || null,
        };

        // Single editable row maps 1:1 to one sales_payments UUID.
        const idsToUpdate = targetIds.length ? targetIds : [primaryId];
        for (const paymentId of idsToUpdate) {
          const { error: upErr } = await db
            .from('sales_payments')
            .update(patch)
            .eq('id', paymentId);
          if (upErr) throw upErr;

          const laybyPatch = {
            amount: patch.amount,
            discount_amount: patch.discount_amount,
            payment_date: patch.payment_date,
            reference: patch.reference,
            currency: patch.currency,
            payment_type: patch.payment_type,
            notes: patch.notes,
          };
          let laybyUpErr = null;
          ({ error: laybyUpErr } = await fromPublic('layby_payments')
            .update(laybyPatch)
            .eq('source_payment_id', paymentId));
          if (laybyUpErr) {
            ({ error: laybyUpErr } = await fromPublic('layby_payments')
              .update(laybyPatch)
              .eq('sale_id', row.sale_id)
              .eq('allocation_batch_uuid', row.allocation_batch_uuid || null));
          }
          if (laybyUpErr) {
            const message = String(laybyUpErr.message || '').toLowerCase();
            if (!message.includes('discount_amount')) throw laybyUpErr;
            const { discount_amount, ...withoutDiscount } = laybyPatch;
            ({ error: laybyUpErr } = await fromPublic('layby_payments')
              .update(withoutDiscount)
              .eq('source_payment_id', paymentId));
            if (laybyUpErr) throw laybyUpErr;
          }
        }
      }

      if (forceUsd && customerId) {
        try {
          await fromPublic('customers').update({ currency: 'USD' }).eq('id', customerId);
          await fromPublic('sales')
            .update({ currency: 'USD' })
            .eq('customer_id', customerId);
          const saleIdsForCurrency = Array.from(new Set(
            (paymentRows || []).map((r) => r.sale_id).filter((id) => id != null)
          ));
          if (saleIdsForCurrency.length) {
            await db
              .from('sales_payments')
              .update({ currency: 'USD' })
              .in('sale_id', saleIdsForCurrency);
            await fromPublic('layby_payments')
              .update({ currency: 'USD' })
              .in('sale_id', saleIdsForCurrency);
          }
        } catch (currErr) {
          console.warn('Failed to normalize Fahme customer/sales currency to USD', currErr);
        }
      }

      await reconcileCustomerLaybys(customerId);
      cacheClear(LAYBY_ROWS_CACHE_KEY);
      await loadRows();
      setSuccess('Payments updated.');
      setPaymentEditLayby(null);
      setPaymentRows([]);
    } catch (e) {
      setPaymentsErr(e?.message || 'Failed to save payments');
    } finally {
      setPaymentsBusy(false);
    }
  }

  async function deletePayment(row) {
    if (!paymentEditLayby) return;
    const existingRow = row || paymentRows.find(r => r.id === row);
    if (!existingRow) return;
    if (existingRow?._legacy || String(existingRow.id).startsWith('down-')) return;
    const targetIds = Array.isArray(existingRow._groupedIds) && existingRow._groupedIds.length
      ? existingRow._groupedIds
      : [existingRow.id];
    const deletableRows = targetIds.length > 1
      ? targetIds.map((id) => ({
          id,
          sale_id: existingRow.sale_id,
          allocation_batch_uuid: existingRow.allocation_batch_uuid,
        }))
      : [existingRow];
    const filteredRows = deletableRows.filter(r => r && !String(r.id || '').startsWith('down-'));
    const deletableIds = filteredRows.map(r => String(r.id || '').trim()).filter(Boolean);
    if (!deletableIds.length) return;
    const confirmMessage = deletableIds.length > 1
      ? `Delete ${deletableIds.length} payments in this batch?`
      : 'Delete this payment?';
    if (!window.confirm(confirmMessage)) return;
    setPaymentsBusy(true);
    setPaymentsErr('');
    try {
      const { error } = await deleteLaybyPayments(filteredRows);
      if (error) throw error;
      setPaymentRows(prev => prev.filter(r => !deletableIds.includes(String(r.id || '').trim())));
      await reconcileCustomerLaybys(paymentEditLayby?.customer_id || paymentEditLayby?.customerId || paymentEditLayby?.customerInfo?.id);
      cacheClear(LAYBY_ROWS_CACHE_KEY);
      await loadRows();
      setSuccess('Payment deleted.');
      setPaymentEditLayby(null);
      setPaymentRows([]);
    } catch (e) {
      setPaymentsErr(e?.message || 'Failed to delete payment');
    } finally {
      setPaymentsBusy(false);
    }
  }

  async function deleteLaybyCustomer(row) {
    const customerId = row?.customerId || row?.customer?.id;
    if (!customerId) {
      setError('Missing customer id.');
      return;
    }
    if (!canDeleteLaybyCustomer) return;
    const customerName = row?.customer?.name || customerId;
    const confirmed = window.confirm(`Delete layby customer ${customerName}? This removes layby records for this customer.`);
    if (!confirmed) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const laybyIds = (row?.laybys || []).map(l => l.id).filter(v => v != null);
      if (!laybyIds.length) {
        setError('No layby records found for this customer.');
        setLoading(false);
        return;
      }
      const directDelete = async () => {
        const laybyIdsUuid = laybyIds.filter(isUuid);
        const laybyIdsNumeric = laybyIds.filter(isNumericId)
          .map(v => (typeof v === 'string' ? parseInt(v, 10) : v))
          .filter(v => Number.isFinite(v));

        const detachByList = async (list) => {
          if (!list.length) return;
          const { error } = await fromPublic('sales')
            .update({ layby_id: null })
            .in('layby_id', list);
          if (error) throw error;
        };
        const deleteByList = async (list) => {
          if (!list.length) return;
          const { error } = await fromPublic('laybys')
            .delete()
            .in('id', list);
          if (error) throw error;
        };

        if (!laybyIdsUuid.length && !laybyIdsNumeric.length) {
          throw new Error('Unsupported layby id format.');
        }
        await detachByList(laybyIdsUuid);
        await detachByList(laybyIdsNumeric);
        await deleteByList(laybyIdsUuid);
        await deleteByList(laybyIdsNumeric);
      };

      const apiAttempt = async () => {
        try {
          const resp = await fetch('/api/layby-delete-customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ laybyIds, userId: currentUser?.id || null }),
          });
          const text = await resp.text().catch(() => '');
          let json = {};
          if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
          if (resp.ok && json?.ok) return { ok: true };
          const status = resp.status || 0;
          const canFallback = status === 404 || status === 405 || status === 401 || status === 403 || status === 0;
          return { ok: false, canFallback, error: new Error(json?.error || json?.raw || `Failed to delete layby (${status})`) };
        } catch (e) {
          return { ok: false, canFallback: true, error: e };
        }
      };

      const apiRes = await apiAttempt();
      if (!apiRes.ok) {
        if (!apiRes.canFallback) throw apiRes.error;
        await directDelete();
      }
      setRows(prev => prev.filter(r => String(r.customerId) !== String(customerId)));
      cacheClear(LAYBY_ROWS_CACHE_KEY);
      setSuccess('Layby customer removed.');
    } catch (e) {
      setError(e?.message || 'Failed to delete layby customer.');
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const term = (search || '').toLowerCase().trim();
    if (!term) return rows;
    return rows.filter(r => {
      const name = String(r.customer?.name || '').toLowerCase();
      const phone = String(r.customer?.phone || '').toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
  }, [rows, search]);

  async function resolveQuoteIdForRow(row) {
    let quoteId = resolveRowQuoteId(row, quoteLinkIndex);
    if (quoteId) return quoteId;
    const { laybyIds, saleIds } = collectRowLinkKeys(row);
    const attempts = [];
    const saleList = Array.from(saleIds);
    const laybyList = Array.from(laybyIds).filter(isUuid);
    chunkIds(saleList, 100).forEach((chunk) => {
      attempts.push(
        db.from('quotations').select('id, created_at').in('sale_id', chunk).order('created_at', { ascending: false }).limit(1)
      );
    });
    chunkIds(laybyList, 100).forEach((chunk) => {
      attempts.push(
        db.from('quotations').select('id, created_at').in('layby_id', chunk).order('created_at', { ascending: false }).limit(1)
      );
    });
    if (row?.customerId) {
      attempts.push(
        db
          .from('quotations')
          .select('id, created_at')
          .eq('customer_id', row.customerId)
          .neq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1)
      );
    }
    for (const attempt of attempts) {
      try {
        const { data } = await attempt;
        if (data?.[0]?.id) return data[0].id;
      } catch {}
    }
    return null;
  }

  async function handleEditQuote(row) {
    const quoteId = await resolveQuoteIdForRow(row);
    if (!quoteId) {
      setError('No linked quotation found for this layby.');
      return;
    }
    navigate(`/quotationer?quoteId=${encodeURIComponent(quoteId)}&returnTo=layby-management`);
  }

  const summaryTotals = useMemo(() => sumTotalsByCurrency(filteredRows), [filteredRows]);

  const formatTotalsLine = (field) => formatLaybyTotalsLine(summaryTotals, field);

  const exportStamp = () => new Date().toISOString().slice(0, 10);

  async function handleDownloadAllLaybyPdfs() {
    if (!filteredRows.length || bulkExportBusy) return;
    setBulkExportBusy(true);
    setBulkExportLabel('Preparing PDFs...');
    setError('');
    setSuccess('');
    try {
      const result = await exportAllLaybyPdfsZip(filteredRows, {
        onProgress: (current, total, name) => {
          setBulkExportLabel(`PDF ${current}/${total}${name ? `: ${name}` : ''}`);
        },
      });
      if (!result?.ok) {
        setError(result?.error || 'Failed to create layby PDF zip.');
        return;
      }
      setSuccess(`Downloaded ${result.count} layby PDF${result.count === 1 ? '' : 's'} as a zip file.`);
    } catch (e) {
      setError(e?.message || 'Failed to download layby PDF zip.');
    } finally {
      setBulkExportBusy(false);
      setBulkExportLabel('');
    }
  }

  function handleDownloadLaybyExcel() {
    if (!filteredRows.length || bulkExportBusy) return;
    setError('');
    setSuccess('');
    try {
      exportLaybySummaryExcel(filteredRows, `layby-management_${exportStamp()}.xlsx`);
      setSuccess(`Downloaded Excel summary for ${filteredRows.length} layby row${filteredRows.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e?.message || 'Failed to download layby Excel file.');
    }
  }

  async function handleSendMonthlyBalanceWhatsApp() {
    if (monthlyBalanceBusy || bulkExportBusy) return;
    const kitweRows = await filterKitweLaybyRowsForMonthlyBalance(rows);
    const balanceRows = laybyRowsToBalanceDueRows(kitweRows);
    if (!balanceRows.length) {
      setError('No Kitwe layby customers with an outstanding balance to include.');
      return;
    }
    if (!window.confirm(`Send monthly balance due for ${balanceRows.length} Kitwe layby customer(s) to the Layby WhatsApp group?`)) return;
    setMonthlyBalanceBusy(true);
    setError('');
    setSuccess('');
    try {
      const messages = buildMonthlyBalanceDueMessages(balanceRows);
      const result = await sendMonthlyBalanceDueWhatsApp({ messages });
      if (!result?.ok) {
        setError(result?.error || 'Failed to send monthly balance WhatsApp message.');
        return;
      }
      const parts = Number(result.messageCount) > 1 ? ` (${result.messageCount} messages)` : '';
      setSuccess(`Monthly balance due sent for ${balanceRows.length} customer(s)${parts}.`);
    } catch (e) {
      setError(e?.message || 'Failed to send monthly balance WhatsApp message.');
    } finally {
      setMonthlyBalanceBusy(false);
    }
  }

  async function openLaybyWhatsAppPreview(row) {
    const customerName = row?.customer?.name || row?.customerId || 'Customer';
    setWhatsappPreview({
      open: true,
      loading: true,
      title: `WhatsApp preview — ${customerName}`,
      message: '',
      attachmentNote: '',
      error: '',
    });
    try {
      const result = await previewLaybyWhatsAppForCustomerRow(row);
      if (!result?.ok) {
        setWhatsappPreview((prev) => ({
          ...prev,
          loading: false,
          error: result?.error || 'Could not build WhatsApp preview.',
        }));
        return;
      }
      setWhatsappPreview((prev) => ({
        ...prev,
        loading: false,
        message: result.message || '',
        attachmentNote: result.attachmentNote || '',
      }));
    } catch (e) {
      setWhatsappPreview((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || 'Could not build WhatsApp preview.',
      }));
    }
  }

  async function handleSendCustomerLaybyWhatsApp(row) {
    const customerId = row?.customerId;
    if (!customerId) {
      setError('Missing customer id for WhatsApp send.');
      return;
    }
    if (whatsAppRowBusyId) return;

    setWhatsAppRowBusyId(customerId);
    setError('');
    setSuccess('');
    try {
      const result = await resendLaybyWhatsAppForCustomerRow(row);
      if (!result?.ok) {
        setError(`WhatsApp send failed for ${row.customer?.name || customerId}: ${result?.error || 'Unknown error'}`);
        return;
      }
      const isLusakaSale = await laybyCustomerRowHasLusakaSaleAsync(row);
      const groupLabel = resolveLaybyWhatsAppGroupLabel(customerId, isLusakaSale, row?.customer?.name);
      setSuccess(`Layby WhatsApp sent to ${groupLabel} group for ${row.customer?.name || customerId}.`);
    } catch (e) {
      console.warn('Customer layby WhatsApp send failed:', e?.message || e);
      setError(`WhatsApp send failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setWhatsAppRowBusyId('');
    }
  }

  return (
    <div className="layby-mgmt-container" style={{ maxWidth: 1100, margin: '32px auto', background: '#181c20', borderRadius: 12, padding: '24px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
      <div className="page-header-row layby-mgmt-header" style={{ marginBottom: 16 }}>
        <BackToDashboard />
        <h2 style={{ fontSize: '1.6rem', color: 'var(--dash-border, #4caf50)', margin: 0 }}>Layby Management</h2>
        <div className="layby-mgmt-header-actions">
          <button
            type="button"
            className="layby-mgmt-download-btn"
            title={bulkExportBusy ? bulkExportLabel || 'Preparing download...' : 'Download all layby PDFs (ZIP)'}
            aria-label="Download all layby PDFs as ZIP"
            onClick={handleDownloadAllLaybyPdfs}
            disabled={bulkExportBusy || monthlyBalanceBusy || !filteredRows.length}
          >
            <FaFilePdf aria-hidden="true" />
          </button>
          {!readOnly && (
            <button
              type="button"
              className="layby-mgmt-download-btn layby-mgmt-download-btn--whatsapp"
              title={monthlyBalanceBusy ? 'Sending monthly balance...' : 'Send Kitwe layby monthly balance due to WhatsApp group'}
              aria-label="Send Kitwe layby monthly balance due to WhatsApp"
              onClick={handleSendMonthlyBalanceWhatsApp}
              disabled={bulkExportBusy || monthlyBalanceBusy || !rows.length}
            >
              <FaWhatsapp aria-hidden="true" />
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              className="layby-mgmt-download-btn"
              title="Download layby summary (Excel)"
              aria-label="Download layby summary Excel"
              onClick={handleDownloadLaybyExcel}
              disabled={bulkExportBusy || !filteredRows.length}
            >
              <FaFileExcel aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {bulkExportBusy && bulkExportLabel && (
        <div style={{ color: '#9aa4b2', fontSize: 12, marginBottom: 10 }}>{bulkExportLabel}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: readOnly ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="layby-total-box k">Total Sale: {formatTotalsLine('total')}</div>
        <div className="layby-total-box usd">Total Deposit: {formatTotalsLine('paid')}</div>
        {!readOnly && (
          <div className="layby-total-box k">Total Discount: {formatTotalsLine('discount')}</div>
        )}
        <div className="layby-total-box usd">Total Due: {formatTotalsLine('due')}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pos-control pos-search-wide"
          style={{ flex: 1, minWidth: 280 }}
        />
        <div style={{ color: '#9aa4b2', fontSize: 12 }}>Rows: {filteredRows.length}</div>
      </div>

      {error && <div style={{ color: '#ff5252', marginBottom: 10 }}>{error}</div>}
      {success && <div style={{ color: '#4caf50', marginBottom: 10 }}>{success}</div>}

      {(loading && rows.length === 0) ? (
        <div style={{ color: '#9aa4b2', textAlign: 'center', padding: 18 }}>Loading laybys...</div>
      ) : (
        <div style={{ width: '100%', background: 'transparent', borderRadius: 8, overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%', minWidth: 980, background: '#23272f', borderRadius: 8, fontSize: '0.78rem', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="text-col">Customer</th>
                <th className="text-col">Phone</th>
                <th className="num-col">Total Sale</th>
                <th className="num-col">Total Deposit</th>
                {!readOnly && <th className="num-col">Total Discount</th>}
                <th className="num-col">Total Due</th>
                {!readOnly && <th className="actions-col" style={{ minWidth: 220, width: 220 }}>Actions</th>}
                <th className="export-col">Export</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => {
                const formatGroupCell = (field) => {
                  const entries = Object.entries(getDisplayTotalsForRow(row));
                  if (!entries.length) return '—';
                  // Prefer customer currency when not Fahme (Fahme already folded to USD).
                  const preferred = isFahme(row.customerId)
                    ? 'USD'
                    : normalizeCurrencyCode(row.customer?.currency, '');
                  const filtered = preferred
                    ? entries.filter(([code]) => code === preferred)
                    : entries;
                  const use = filtered.length ? filtered : entries;
                  return use.map(([code, vals]) => formatCurrency(vals[field] || 0, code)).join(' · ');
                };

                const primaryLayby = row.primaryLayby;
                const laybyId = primaryLayby?.id || (row.laybys || []).find((layby) => layby?.id)?.id;
                const customerTarget = {
                  customer_id: row.customerId,
                  customerInfo: row.customer || {},
                  statement: row.statement || null,
                  fullStatement: row.fullStatement || row.statement || null,
                  laybys: row.laybys || [],
                  primaryLayby,
                };
                const editQuoteId = resolveRowQuoteId(row, quoteLinkIndex);
                const showEditQuote = canOfferEditQuote(row);
                const rowLocked = Boolean(row.statementLocked || isFahmeStatementLocked(row.customerId));

                return (
                  <tr key={`row-${row.customerId}`} style={{ background: '#1a1f27' }}>
                    <td className="text-col" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                      <div style={{ fontWeight: 700 }}>{row.customer?.name || row.customerId}</div>
                      {row.placeholderHold && (
                        <div style={{ fontSize: '0.75rem', color: '#9aa4b2', marginTop: 4 }}>
                          Pending reconciliation — totals hidden while Acc(2) is being fixed
                        </div>
                      )}
                      {rowLocked && (
                        <div style={{ fontSize: '0.75rem', color: '#63c7ff', marginTop: 4 }}>
                          Signed-off statement locked — totals match reference PDF
                        </div>
                      )}
                    </td>
                    <td className="text-col" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.customer?.phone || '—'}</td>
                    <td className="num-col" style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{formatGroupCell('total')}</td>
                    <td className="num-col" style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{formatGroupCell('paid')}</td>
                    {!readOnly && <td className="num-col" style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{formatGroupCell('discount')}</td>}
                    <td className="num-col" style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{formatGroupCell('due')}</td>
                    {!readOnly && (
                    <td className="actions-col" style={{ minWidth: 220, width: 220, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                      <button
                        style={{ width: '100%', background: '#00bfff', color: '#fff', borderRadius: 6, padding: '6px 10px', fontWeight: 600, fontSize: '0.82rem' }}
                        onClick={() => {
                          try {
                            setPaymentDate(getTodayInputValue());
                          } catch {}
                          setPaymentEntryLines([defaultPaymentEntryLine()]);
                          const target = buildSelectedLaybyTarget(row, primaryLayby || row.primaryLayby);
                          if (target) setSelectedLayby(target);
                        }}
                        disabled={sumRowDue(row) <= 0.009 || rowLocked}
                      >
                        Add Payment
                      </button>
                      <button
                        style={{ width: '100%', background: '#6c5ce7', color: '#fff', borderRadius: 6, padding: '6px 10px', fontWeight: 600, fontSize: '0.82rem' }}
                        title="View and edit payments for this customer"
                        onClick={() => openPaymentsEditor(customerTarget)}
                        disabled={rowLocked}
                      >
                        Edit Payments
                      </button>
                      {showEditQuote && (
                        <button
                          style={{ width: '100%', background: '#2ecc71', color: '#fff', borderRadius: 6, padding: '6px 10px', fontWeight: 600, fontSize: '0.82rem' }}
                          title={editQuoteId ? 'Edit linked quotation (down payments are kept)' : 'Find and edit linked quotation'}
                          onClick={() => { void handleEditQuote(row); }}
                        >
                          Edit Quote
                        </button>
                      )}
                      {canDeleteLaybyCustomer && (
                        <button
                          style={{ width: '100%', background: '#ff5252', color: '#fff', borderRadius: 6, padding: '6px 10px', fontWeight: 700, fontSize: '0.82rem' }}
                          title="Delete layby customer (admin only)"
                          onClick={() => deleteLaybyCustomer(row)}
                        >
                          Delete Layby Customer
                        </button>
                      )}
                    </td>
                    )}
                    <td className="export-col">
                      <div className="layby-export-actions">
                        <button
                          type="button"
                          className="layby-export-btn layby-export-btn--whatsapp"
                          title={isFahme(row.customerId)
                            ? 'Resend layby PDF to Fahme WhatsApp (right-click to preview)'
                            : 'Resend layby WhatsApp to Layby or Lusaka group based on sale location (right-click to preview)'}
                          aria-label="Resend layby WhatsApp message"
                          onClick={() => handleSendCustomerLaybyWhatsApp(row)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openLaybyWhatsAppPreview(row);
                          }}
                          disabled={!laybyId || Boolean(whatsAppRowBusyId)}
                          style={{ opacity: whatsAppRowBusyId === row.customerId ? 0.6 : 1 }}
                        >
                          <FaWhatsapp aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="layby-export-btn layby-export-btn--pdf"
                          title="Download layby PDF"
                          aria-label="Download layby PDF"
                          onClick={async () => {
                            const customerId = row.customerId;
                            const primaryLayby = row.primaryLayby || (row.laybys || []).find((layby) => layby?.id) || null;
                            const laybyId = primaryLayby?.id || (row.laybys || []).find((layby) => layby?.id)?.id;
                            const scopeOptions = {
                              laybyId,
                              laybySaleId: primaryLayby?.sale_id || null,
                            };
                            let statement = {
                              sales: row.fullStatement?.sales || [],
                              items: row.fullStatement?.items || [],
                              payments: row.fullStatement?.payments || [],
                            };
                            if (laybyId) {
                              statement = filterStatementToLaybyAccount(statement, scopeOptions);
                            }
                            // Fahme (and empty cache): always refresh so PDF matches current Layby totals.
                            const shouldRefreshStatement = isFahme(customerId)
                              || (!statement.sales.length && !statement.items.length && !statement.payments.length);
                            if (shouldRefreshStatement) {
                              const { data: statementRes, error: statementErr } = await fetchLaybyStatement(customerId, scopeOptions);
                              if (statementErr && !statement.sales.length) {
                                setError(statementErr?.message || 'Failed to build customer statement');
                                return;
                              }
                              if (!statementErr && statementRes) {
                                statement = {
                                  sales: statementRes?.sales || [],
                                  items: statementRes?.items || [],
                                  payments: statementRes?.payments || [],
                                };
                              }
                            }
                            const pdfLayby = {
                              ...(primaryLayby || {}),
                              id: laybyId || primaryLayby?.id,
                              sale_id: primaryLayby?.sale_id || null,
                              customer_id: row.customerId,
                              customerInfo: row.customer || {},
                            };
                            const totalsByCurrency = computePooledLaybyTotalsByCurrency(statement);
                            await generateLaybyPdf(pdfLayby, {
                              statement,
                              totalsByCurrency,
                            });
                          }}
                        >
                          <FaFilePdf aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 6 : 8} style={{ textAlign: 'center', color: '#9aa4b2', padding: 8 }}>No active laybys.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && selectedLayby && (() => {
        const paymentCurrency = resolveCustomerPaymentCurrency({
          customerId: selectedLayby.customer_id || selectedLayby.customerId,
          customer: selectedLayby.customerInfo,
          totalsByCurrency: selectedLayby.totalsByCurrency,
        });
        const displayTotals = getDisplayTotalsByCurrency(
          { totalsByCurrency: selectedLayby.totalsByCurrency },
          { isFahmeCustomer: isFahme(selectedLayby.customer_id || selectedLayby.customerId) },
        );
        const currentDue = Number(displayTotals[paymentCurrency]?.due || 0);
        const paymentTotal = (paymentEntryLines || []).reduce((sum, line) => sum + parseAmountInput(line.amount), 0);
        const discountTotal = parseAmountInput(paymentDiscount);
        const dueRemaining = Math.max(0, currentDue - paymentTotal - discountTotal);
        return (
        <div className="layby-modal-overlay" onClick={(e) => { if (e.target.classList.contains('layby-modal-overlay')) { setSelectedLayby(null); } }}>
          <div className="layby-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Payment – {selectedLayby.customerInfo?.name}</h3>
            <form onSubmit={handleAddPayment}>
              <div className="layby-form-grid">
                <div className="layby-form-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Payments</label>
                  <div className="payments-section" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(paymentEntryLines || []).map((line, idx) => (
                      <div key={idx} className="payment-row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Amount"
                          value={line.amount}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPaymentEntryLines((lines) => lines.map((L, i) => (i === idx ? { ...L, amount: v } : L)));
                          }}
                          style={{ flex: '1 1 100px', minWidth: 100 }}
                        />
                        <select
                          className="layby-type-select"
                          value={line.type}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPaymentEntryLines((lines) => lines.map((L, i) => (i === idx ? { ...L, type: v } : L)));
                          }}
                          style={{ flex: '1 1 140px', minWidth: 140 }}
                        >
                          {allowedPaymentTypes.map((t) => (
                            <option key={t} value={t}>{paymentTypeLabels[t]}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={() => setPaymentEntryLines((lines) => lines.filter((_, i) => i !== idx))}
                          disabled={(paymentEntryLines || []).length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <button
                        type="button"
                        className="add-payment-btn"
                        onClick={() => setPaymentEntryLines((lines) => [...(lines || []), defaultPaymentEntryLine()])}
                      >
                        Add Another Payment
                      </button>
                      <div style={{ textAlign: 'right' }}>
                        <div>
                          Total: <b>{formatCurrency(paymentTotal, paymentCurrency)}</b>
                        </div>
                        <div style={{ marginTop: 4, fontSize: '0.95em' }}>
                          Due remaining:{' '}
                          <b style={{ color: dueRemaining <= 0.009 ? '#2ecc71' : undefined }}>
                            {formatCurrency(dueRemaining, paymentCurrency)}
                          </b>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="layby-form-field">
                  <label>Discount</label>
                  <input type="number" step="0.01" placeholder="0.00" value={paymentDiscount} onChange={e => setPaymentDiscount(e.target.value)} />
                </div>
                <div className="layby-form-field">
                  <label>Date</label>
                  <input
                    type="date"
                    className="layby-short-date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
                <div className="layby-form-field">
                  <label>Receipt #</label>
                  <input type="text" placeholder="Required" value={receipt} onChange={e => setReceipt(e.target.value)} required />
                </div>
                <div className="layby-form-field" style={{ gridColumn: '1 / span 3' }}>
                  <label>Note</label>
                  <input
                    type="text"
                    placeholder="Optional note for this payment"
                    value={paymentNote}
                    onChange={e => setPaymentNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="layby-modal-actions pos-modal-actions">
                <button
                  type="button"
                  className="pos-modal-btn-secondary"
                  onClick={() => {
                    setSelectedLayby(null);
                    resetPaymentModalFields({
                      setPaymentEntryLines,
                      setPaymentDiscount,
                      setPaymentDate,
                      setReceipt,
                      setPaymentNote,
                    });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="pos-modal-btn-primary" disabled={loading}>{loading ? 'Processing…' : 'Add Payment'}</button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {!readOnly && paymentEditLayby && (
        <div className="pdf-modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="pdf-modal-content"
            style={{
              maxWidth: 900,
              width: '95vw',
              background: 'var(--dash-surface, #111613)',
              color: 'var(--dash-text, #f1f5f2)',
              border: '1px solid var(--dash-border-soft, rgba(30,215,168,0.35))',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0, color: 'var(--dash-border, #1ed7a8)' }}>
              Edit Payments – {paymentEditLayby.customerInfo?.name || 'Customer'} (Account)
            </h3>
            {paymentsErr && <div style={{ color: '#ff6b6b', marginBottom: 8 }}>{paymentsErr}</div>}
            <div style={{ color: 'var(--dash-muted, #a5b4ad)', fontSize: 12, marginBottom: 8 }}>
              Showing payment details
              {isFahme(paymentEditLayby.customer_id || paymentEditLayby.customerId || paymentEditLayby.customerInfo?.id) && (
                <span style={{ color: 'var(--dash-accent, #63c7ff)', marginLeft: 8 }}>
                  · This account is USD ($) only — Save will store all amounts as $
                </span>
              )}
            </div>
            <div style={{ color: 'var(--dash-accent, #63c7ff)', fontSize: 11, marginBottom: 8 }}>
              Rows: {paymentRows.length} · Missing IDs: {paymentRows.filter(r => !r.id || (!isUuid(r.id) && !String(r.id).startsWith('down-'))).length}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPaymentRows((prev) => prev.map((r) => (
                  r._readonly || r._legacy ? r : { ...r, currency: 'USD' }
                )))}
                disabled={paymentsBusy}
                style={{
                  background: 'transparent',
                  color: 'var(--dash-accent, #63c7ff)',
                  border: '1px solid var(--dash-accent, #63c7ff)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontWeight: 700,
                }}
              >
                Set all to $
              </button>
            </div>
            <div style={{
              maxHeight: 360,
              overflow: 'auto',
              border: '1px solid var(--dash-border-soft, rgba(30,215,168,0.35))',
              borderRadius: 8,
              padding: 8,
              background: 'var(--dash-surface-2, #151d18)',
            }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center', padding: 6, width: '12ch', color: 'var(--dash-accent, #63c7ff)' }}>Date</th>
                    <th style={{ textAlign: 'center', padding: 6, width: '10ch', color: 'var(--dash-accent, #63c7ff)' }}>Amount</th>
                    <th style={{ textAlign: 'center', padding: 6, width: '8ch', color: 'var(--dash-accent, #63c7ff)' }}>$/K</th>
                    <th style={{ textAlign: 'center', padding: 6, width: '10ch', color: 'var(--dash-accent, #63c7ff)' }}>Discount</th>
                    <th style={{ textAlign: 'center', padding: 6, width: '12ch', color: 'var(--dash-accent, #63c7ff)' }}>Type</th>
                    <th style={{ textAlign: 'center', padding: 6, color: 'var(--dash-accent, #63c7ff)' }}>Note</th>
                    <th style={{ textAlign: 'center', padding: '6px 6px 6px 0', width: '3.2cm', color: 'var(--dash-accent, #63c7ff)' }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map(row => {
                    const currentPaymentType = String(row.payment_type || '').toLowerCase();
                    const selectValue = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'visa_card', 'goods']
                      .includes(currentPaymentType)
                      ? currentPaymentType
                      : 'cash';
                    const currencyValue = normalizeCurrencyCode(row.currency, 'K') === 'USD' ? 'USD' : 'K';
                    return (
                    <tr key={row._groupKey || row.id}>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input type="date" value={(row.payment_date || '').slice(0, 10)} onChange={e => updatePaymentRow(row.id, { payment_date: e.target.value })} style={{ width: '100%', padding: '4px 6px', textAlign: 'center' }} disabled={row._readonly} />
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input type="number" step="0.01" value={row.amount} onChange={e => updatePaymentRow(row.id, { amount: Number(e.target.value) })} style={{ width: 'calc(100% - 12px)', textAlign: 'center', padding: '4px 6px' }} disabled={row._readonly} />
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        {row._readonly ? (
                          <span>{currencyValue === 'USD' ? '$' : 'K'}</span>
                        ) : (
                          <select
                            value={currencyValue}
                            onChange={(e) => updatePaymentRow(row.id, { currency: e.target.value })}
                            style={{ width: '100%', padding: '4px 6px' }}
                          >
                            <option value="USD">$</option>
                            <option value="K">K</option>
                          </select>
                        )}
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input type="number" step="0.01" value={row.discount_amount ?? ''} onChange={e => updatePaymentRow(row.id, { discount_amount: Number(e.target.value) })} style={{ width: 'calc(100% - 12px)', textAlign: 'center', padding: '4px 6px' }} disabled={row._readonly} />
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        {row._readonly ? (
                          <div style={{ width: '12ch', margin: '0 auto', textAlign: 'center' }}>
                            {paymentTypeLabels[currentPaymentType] || 'Mixed'}
                          </div>
                        ) : (
                          <select
                            value={selectValue}
                            onChange={e => updatePaymentRow(row.id, { payment_type: e.target.value })}
                            style={{ width: '12ch', padding: '4px 6px', margin: '0 auto' }}
                            disabled={row._readonly}
                          >
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="mobile_money">Mobile Money</option>
                            <option value="cheque">Cheque</option>
                            <option value="visa_card">Visa Card</option>
                            <option value="goods">Goods</option>
                          </select>
                        )}
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input
                          type="text"
                          placeholder="Optional note"
                          value={row.notes || ''}
                          onChange={e => updatePaymentRow(row.id, { notes: e.target.value })}
                          style={{ width: '100%', padding: '4px 6px', textAlign: 'center' }}
                          disabled={row._readonly}
                        />
                      </td>
                      <td style={{ padding: '6px 6px 6px 0', textAlign: 'center', verticalAlign: 'middle' }}>
                        <button onClick={() => deletePayment(row)} disabled={paymentsBusy || row._legacy || String(row.id || '').startsWith('down-')} style={{ background: '#e53935', color: '#fff', borderRadius: 4, padding: '2px 0', fontSize: '0.72rem', width: '3cm', margin: '0 auto', opacity: (row._legacy || String(row.id || '').startsWith('down-')) ? 0.6 : 1, textAlign: 'center', display: 'block', border: 'none' }}>Del</button>
                      </td>
                    </tr>
                    );
                  })}
                  {paymentRows.length === 0 && !paymentsBusy && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--dash-muted, #a5b4ad)', padding: 8 }}>No payments yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => setPaymentEditLayby(null)}
                disabled={paymentsBusy}
                style={{
                  background: 'transparent',
                  color: 'var(--dash-accent, #63c7ff)',
                  border: '1px solid var(--dash-accent, #63c7ff)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
              <button
                onClick={savePayments}
                disabled={paymentsBusy}
                style={{
                  background: 'var(--dash-border, #1ed7a8)',
                  color: '#05110e',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 700,
                }}
              >
                {paymentsBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {whatsappPreview.open && (
        <div
          className="layby-modal-overlay"
          onClick={() => setWhatsappPreview({
            open: false,
            loading: false,
            title: '',
            message: '',
            attachmentNote: '',
            error: '',
          })}
        >
          <div className="layby-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3 style={{ marginTop: 0 }}>{whatsappPreview.title || 'WhatsApp preview'}</h3>
            <p style={{ color: '#9aa4b2', fontSize: 12, marginTop: 0 }}>
              Right-click preview — text below matches what will be sent to the Layby or Lusaka group based on sale location.
            </p>
            {whatsappPreview.loading && <div style={{ color: '#9aa4b2' }}>Building preview…</div>}
            {whatsappPreview.error && <div style={{ color: '#ff5252' }}>{whatsappPreview.error}</div>}
            {!whatsappPreview.loading && !whatsappPreview.error && (
              <>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: '#0f141b',
                  color: '#e8edf5',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 13,
                  lineHeight: 1.45,
                  maxHeight: '50vh',
                  overflow: 'auto',
                }}
                >
                  {whatsappPreview.message || '(No message text)'}
                </pre>
                {whatsappPreview.attachmentNote ? (
                  <p style={{ color: '#9aa4b2', fontSize: 12 }}>{whatsappPreview.attachmentNote}</p>
                ) : null}
              </>
            )}
            <div className="layby-modal-actions pos-modal-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="pos-modal-btn-secondary"
                onClick={() => setWhatsappPreview({
                  open: false,
                  loading: false,
                  title: '',
                  message: '',
                  attachmentNote: '',
                  error: '',
                })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
