import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import { openOrCreateQuotationPdf } from './QuotationerPdfService';
import { convertQuoteToLayby } from './services/quoteConversion';
import { cacheClear, cachePeek, cacheSet, applyPortalSnapshot, PORTAL_SWR_TTL_MS } from './utils/staleCache';
import { LAYBY_ROWS_CACHE_KEY } from './utils/laybyRollup';
import {
  canDeleteQuotationData,
  canEditQuotation,
  canManageCatalog,
  isHassanAwadUser,
  isQuotationerOnlyExperience,
} from './accessControl';
import { computeQuotationDisplayTotal, quotationHasOutstandingDue, sortQuotationRows } from './utils/quotationDisplay';
import { enrichQuotationListTotals } from './services/quotationListTotals';
import { fetchQuoteProductionRoutingsMap } from './services/quoteProductionApi';
import { executeSendQuoteOrder } from './services/sendQuoteOrderFlow';
import { pickQuoteProductionRouteForSend } from './services/quoteProductionApi';
import { apiUrl, withApiHeaders } from './utils/apiUrl';
import WarehouseSkuWhereabouts from './components/WarehouseSkuWhereabouts';
import QuoteRowActionsDropdown from './components/QuoteRowActionsDropdown';
import OrdersTypeFunnelFilter from './components/OrdersTypeFunnelFilter';
import { isQuoteShowroomOrderFromRouting } from './utils/quoteShowroomOrder';

const readLocalUser = () => {
  try {
    const raw = localStorage.getItem('user');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.id || parsed.email)) return parsed;
  } catch {}
  return null;
};

const titleCaseWords = (text) => String(text || '')
  .split(/\s+/)
  .filter(Boolean)
  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

const CANONICAL_APP_ORIGIN = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');
const QUOTES_BOARD_CACHE_KEY = 'quotes-board:list:v1';

async function fetchQuotationRead(action, params = {}) {
  let headers = {};
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers = { Authorization: `Bearer ${token}` };
  } catch {}

  const qs = new URLSearchParams({ action, ...params }).toString();
  const attempts = [
    apiUrl(`/api/quotation-read?${qs}`),
    apiUrl(`/api/admin?${new URLSearchParams({ adminAction: 'quotation-read', action, ...params })}`),
    `${CANONICAL_APP_ORIGIN}/api/quotation-read?${qs}`,
  ];

  let lastError = null;
  for (const url of attempts) {
    let resp;
    try {
      resp = await fetch(url, { headers: withApiHeaders(headers) });
    } catch (err) {
      lastError = err?.message || 'Network error';
      continue;
    }
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && payload?.ok) {
      return payload.rows || [];
    }
    lastError = payload?.error || `quotation-read failed (${resp.status})`;
  }
  throw new Error(lastError || 'quotation-read failed');
}

function resolveQuotesBoardMode(pathname, boardModeProp) {
  if (boardModeProp) return boardModeProp;
  const p = String(pathname || '').split('?')[0];
  if (p === '/showroom-orders' || p.startsWith('/showroom-orders/')) return 'showroom';
  if (p === '/factory-orders' || p.startsWith('/factory-orders/')) return 'factory';
  if (p === '/orders' || p.startsWith('/orders/')) return 'all';
  return 'all';
}

export default function QuotesBoard({ boardMode: boardModeProp } = {}) {
  const [quotes, setQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [customerMap, setCustomerMap] = React.useState({});
  const [salePaidBySaleId, setSalePaidBySaleId] = React.useState(() => new Map());
  const [routingsMap, setRoutingsMap] = React.useState({});
  const [sendBusyId, setSendBusyId] = React.useState('');
  const [orderTypeFilter, setOrderTypeFilter] = React.useState('all');
  const navigate = useNavigate();
  const location = useLocation();
  const boardMode = resolveQuotesBoardMode(location.pathname, boardModeProp);
  const user = React.useMemo(() => readLocalUser(), []);
  const isQuotationerOnly = isQuotationerOnlyExperience(user, location.pathname, location.search);
  const canDelete = canDeleteQuotationData(user);
  const canSendOrder = React.useMemo(
    () => isHassanAwadUser(user) || canManageCatalog(user) || isQuotationerOnly,
    [user, isQuotationerOnly],
  );

  const normalizeQuoteItemForSale = React.useCallback((item) => {
    const rawQty = Number(item.quantity || 0);
    const rawPrice = Number(item.unit_price || 0);
    if (Number.isFinite(rawQty) && rawQty > 0 && Number.isInteger(rawQty)) {
      return { quantity: rawQty, unit_price: rawPrice };
    }
    const safeQty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
    const qtyInt = Math.max(1, Math.round(safeQty));
    const lineTotal = safeQty * rawPrice;
    const unitPrice = qtyInt ? (lineTotal / qtyInt) : rawPrice;
    return { quantity: qtyInt, unit_price: unitPrice };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      applyPortalSnapshot(QUOTES_BOARD_CACHE_KEY, (snap) => {
        if (Array.isArray(snap?.quotes)) setQuotes(snap.quotes);
        if (snap?.customerMap && typeof snap.customerMap === 'object') setCustomerMap(snap.customerMap);
        if (snap?.routingsMap && typeof snap.routingsMap === 'object') setRoutingsMap(snap.routingsMap);
      }, setLoading);
      let data = [];
      let error = null;
      try {
        data = await fetchQuotationRead('list-quotes', { limit: '200' });
      } catch (readErr) {
        const fallback = await db
          .from('quotations')
          .select('id, quote_number, customer_id, created_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id')
          .order('created_at', { ascending: false })
          .limit(200);
        data = fallback.data || [];
        error = fallback.error || readErr;
      }
      if (!cancelled) {
        if (!error) {
          let rows = sortQuotationRows(data || []);
          try {
            rows = await enrichQuotationListTotals(rows);
          } catch (enrichErr) {
            console.warn('Quote list total enrichment failed:', enrichErr?.message || enrichErr);
          }
          setQuotes(rows);
          const quoteIds = rows.map(r => r.id).filter(Boolean);
          fetchQuoteProductionRoutingsMap(quoteIds)
            .then((rmap) => {
              if (cancelled) return;
              setRoutingsMap(rmap || {});
              const prev = cachePeek(QUOTES_BOARD_CACHE_KEY) || {};
              cacheSet(QUOTES_BOARD_CACHE_KEY, {
                quotes: rows,
                customerMap: prev.customerMap && typeof prev.customerMap === 'object' ? prev.customerMap : {},
                routingsMap: rmap || {},
              }, PORTAL_SWR_TTL_MS);
            })
            .catch(() => {});
          try {
            const ids = Array.from(new Set((data || []).map(q => q.customer_id).filter(Boolean)));
            let map = {};
            (data || []).forEach(q => {
              if (q?.customer_id && q?.customer_name) {
                map[String(q.customer_id)] = titleCaseWords(q.customer_name);
              }
            });
            if (ids.length) {
              const missing = ids.filter(id => !map[String(id)]);
              const { data: cust } = missing.length ? await db.from('customers').select('id, name').in('id', missing) : { data: [] };
              (cust || []).forEach(c => { map[String(c.id)] = titleCaseWords(c.name); });
            }
            if (!cancelled) {
              setCustomerMap(map);
              const prev = cachePeek(QUOTES_BOARD_CACHE_KEY) || {};
              cacheSet(QUOTES_BOARD_CACHE_KEY, {
                quotes: rows,
                customerMap: map,
                routingsMap: prev.routingsMap && typeof prev.routingsMap === 'object' ? prev.routingsMap : {},
              }, PORTAL_SWR_TTL_MS);
            }
          } catch {}
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadPaymentFlags() {
      const saleIds = Array.from(new Set(
        (quotes || []).map(q => q.sale_id).filter(Boolean).map(String)
      ));
      if (!saleIds.length) {
        if (!cancelled) setSalePaidBySaleId(new Map());
        return;
      }
      try {
        const { data: salesPays } = await fromPublic('sales_payments')
          .select('sale_id, amount, discount_amount')
          .in('sale_id', saleIds);
        const paidBySale = new Map();
        (salesPays || []).forEach((row) => {
          if (row?.sale_id == null) return;
          const key = String(row.sale_id);
          paidBySale.set(key, (paidBySale.get(key) || 0) + Number(row.amount || 0) + Number(row.discount_amount || 0));
        });
        if (!cancelled) setSalePaidBySaleId(paidBySale);
      } catch {
        if (!cancelled) setSalePaidBySaleId(new Map());
      }
    }
    loadPaymentFlags();
    return () => { cancelled = true; };
  }, [quotes]);

  const quoteIsEditable = React.useCallback((q) => {
    const paidAmount = q?.sale_id ? Number(salePaidBySaleId.get(String(q.sale_id)) || 0) : 0;
    const hasOutstandingDue = quotationHasOutstandingDue(q, paidAmount);
    return canEditQuotation(user, q, { hasOutstandingDue });
  }, [user, salePaidBySaleId]);

  const quotesForBoard = React.useMemo(() => {
    return quotes.filter((q) => {
      const routing = routingsMap[String(q.id)];
      const showroom = isQuoteShowroomOrderFromRouting(routing);
      if (boardMode === 'showroom') return showroom;
      if (boardMode === 'factory') return !showroom;
      if (boardMode === 'all' && orderTypeFilter === 'customer') return !showroom;
      if (boardMode === 'all' && orderTypeFilter === 'showroom') return showroom;
      return true;
    });
  }, [quotes, routingsMap, boardMode, orderTypeFilter]);

  const applyOrderTypeFilter = React.useCallback((next) => {
    setOrderTypeFilter((prev) => (prev === next ? 'all' : next));
  }, []);

  const filtered = quotesForBoard.filter((q) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const routing = routingsMap[String(q.id)];
    const byNum = (q.quote_number || `Q-${String(q.id).slice(0, 8)}`).toLowerCase().includes(s);
    const custName = (customerMap[String(q.customer_id)] || '').toLowerCase();
    const byCust = custName.includes(s);
    const byAmt = String(computeQuotationDisplayTotal(q).toFixed(2)).toLowerCase().includes(s) || String(q.total || '').toLowerCase().includes(s);
    const byDate = new Date(q.created_at).toLocaleString().toLowerCase().includes(s);
    const route = String(routing?.route || '').toLowerCase();
    const byRoute = route.includes(s) || (s.includes('uphol') && route === 'upholstery') || (s.includes('carp') && route === 'carpentry');
    const lineBlob = JSON.stringify(routing?.metadata?.lines || []).toLowerCase();
    const byProduct = lineBlob.includes(s);
    return byNum || byCust || byAmt || byDate || byRoute || byProduct;
  });

  async function handleConvert(q) {
    try {
      const [{ data: items }, { data: quoteRow }] = await Promise.all([
        db.from('quotation_items').select('*').eq('quotation_id', q.id).order('sort_order'),
        db.from('quotations').select('*').eq('id', q.id).maybeSingle(),
      ]);
      const quote = quoteRow || q;
      await convertQuoteToLayby({
        quote,
        items,
        normalizeItem: normalizeQuoteItemForSale,
        quotationStatus: 'converted',
      });
      // WhatsApp is sent from Layby Management when the first payment is recorded (not on convert).
      cacheClear(LAYBY_ROWS_CACHE_KEY);

      let data = [];
      try {
        data = await fetchQuotationRead('list-quotes', { limit: '200' });
      } catch {
        const fallback = await db.from('quotations').select('id, quote_number, customer_id, created_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id').order('created_at', { ascending: false }).limit(200);
        data = fallback.data || [];
      }
      setQuotes(data || []);
      alert('Converted to layby successfully.');
    } catch (e) {
      alert('Convert failed: ' + (e?.message || e));
    }
  }

  async function handleDownloadPdf(q) {
    try {
      const [{ data: items }, { data: quoteRow }, { data: units }] = await Promise.all([
        db.from('quotation_items').select('*').eq('quotation_id', q.id).order('sort_order'),
        db.from('quotations').select('*').eq('id', q.id).single(),
        db.from('quotation_units').select('*')
      ]);
      let paid = 0;
      if (quoteRow?.sale_id) {
        try {
          const { data: pays } = await fromPublic('sales_payments').select('amount').eq('sale_id', quoteRow.sale_id);
          paid = (pays || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        } catch {}
      }
      let customerName = '';
      if (quoteRow?.customer_id) {
        const { data: cust } = await db.from('customers').select('name').eq('id', quoteRow.customer_id).maybeSingle();
        customerName = titleCaseWords(cust?.name || '');
      }
      await openOrCreateQuotationPdf(
        { ...quoteRow, customer_name: customerName, paid_amount: paid, outstanding_amount: Math.max(0, Number(quoteRow?.total || 0) - paid) },
        (items || []).map(it => ({
          ...it,
          unit_label: units?.find(u => u.id === it.unit_id)?.name || '-',
        })),
        { name: 'Best Rest Furniture' }
      );
    } catch (e) {
      alert('Download failed: ' + (e.message || e));
    }
  }

  async function handleSendOrder(q) {
    if (!q?.id || sendBusyId) return;
    let route = '';
    try {
      const existingRouting = routingsMap[String(q.id)];
      ({ route } = await pickQuoteProductionRouteForSend(q.id, {
        fallbackRoute: existingRouting?.route || '',
      }));
    } catch (e) {
      if (String(e?.message || '') !== 'Send Order cancelled.') {
        alert(String(e?.message || e));
      }
      return;
    }
    setSendBusyId(String(q.id));
    try {
      const res = await executeSendQuoteOrder(q, { fallbackRoute: route, route });
      setRoutingsMap((prev) => ({
        ...prev,
        [String(q.id)]: {
          ...(prev[String(q.id)] || {}),
          quote_id: q.id,
          route: res.route,
          sent_to_production_at: res.sent_to_production_at,
        },
      }));
      const deptLabel = res.route === 'carpentry'
        ? 'Carpentry'
        : (res.route === 'aluminum' ? 'Aluminum' : 'Upholstery');
      const waGroup = res.route === 'aluminum' ? 'Aluminum Production' : 'Factory New';
      alert(`Order sent to ${deptLabel} app and ${waGroup} WhatsApp group.`);
    } catch (e) {
      alert('Send Order failed: ' + (e?.message || e));
    } finally {
      setSendBusyId('');
    }
  }

  async function handleDeleteQuote(q) {
    const ok = window.confirm('Delete this quote? This cannot be undone.');
    if (!ok) return;
    try {
      await db.from('quotation_items').delete().eq('quotation_id', q.id);
      await db.from('quote_production_routing').delete().eq('quote_id', q.id);
      const { error } = await db.from('quotations').delete().eq('id', q.id);
      if (error) throw error;
      setQuotes(prev => prev.filter(row => row.id !== q.id));
      alert('Quote deleted.');
    } catch (e) {
      alert('Delete failed: ' + (e?.message || e));
    }
  }

  function handleEditQuote(q) {
    if (isQuotationerOnly) {
      navigate(`/orders/create?quoteId=${encodeURIComponent(q.id)}`);
      return;
    }
    navigate(`/quotationer?quoteId=${q.id}`);
  }

  return (
    <div className={`content quotes-page${boardMode === 'all' ? ' quotes-orders-board' : ''}`} style={{ padding: 12 }}>
      <div className="quotes-header page-header-row" style={{ marginBottom: 12 }}>
        <h2 className="quotes-title" style={{ margin: 0 }}>
          {boardMode === 'showroom' ? 'Showroom Orders' : (boardMode === 'factory' ? 'Factory Orders' : 'Orders')}
        </h2>
      </div>

      {isHassanAwadUser(user) && boardMode !== 'showroom' ? <WarehouseSkuWhereabouts /> : null}

      {boardMode === 'showroom' ? (
        <button
          type="button"
          className="action-button"
          style={{ marginBottom: 10, background: '#1565c0', color: '#fff', fontWeight: 700 }}
          onClick={() => navigate('/showroom-orders/create')}
        >
          Showroom Orders
        </button>
      ) : null}

      <input
        className="quotes-input"
        style={{ width: boardMode === 'showroom' || boardMode === 'all' ? 420 : 340 }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={
          boardMode === 'showroom' || boardMode === 'all'
            ? 'Search date, workshop (upholstery/carpentry), product, or quote #'
            : 'Search by number, customer, or amount'
        }
      />

      {loading ? <div style={{ color: '#8ab' }}>Loading...</div> : (
        <div className="table-container" style={{ marginTop: 12 }}>
          <table className="table quotes-table">
            <thead>
              <tr>
                <th>Quote #</th>
                {boardMode === 'all' ? (
                  <th className="quotes-orders-type-col">
                    <span className="quotes-orders-type-head">
                      Type
                      <OrdersTypeFunnelFilter
                        value={orderTypeFilter}
                        onChange={setOrderTypeFilter}
                      />
                    </span>
                  </th>
                ) : null}
                <th>Customer</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const isSending = sendBusyId === String(q.id);
                const routing = routingsMap[String(q.id)];
                const alreadySent = Boolean(routing?.sent_to_production_at);
                const showroomOrder = isQuoteShowroomOrderFromRouting(routing);
                const hideSendOrder = boardMode === 'showroom' || showroomOrder;
                return (
                  <tr key={q.id}>
                    <td>{q.quote_number || `Q-${String(q.id).slice(0, 8)}`}</td>
                    {boardMode === 'all' ? (
                      <td className="quotes-orders-type-col">
                        {showroomOrder ? (
                          <span
                            role="button"
                            tabIndex={0}
                            className={`quotation-showroom-order-badge quotes-orders-type-pill${orderTypeFilter === 'showroom' ? ' quotes-orders-type-pill--filtered' : ''}`}
                            onClick={() => applyOrderTypeFilter('showroom')}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyOrderTypeFilter('showroom'); } }}
                            title="Filter by Showroom orders"
                          >
                            Showroom
                          </span>
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            className={`quotation-customer-order-badge quotes-orders-type-pill${orderTypeFilter === 'customer' ? ' quotes-orders-type-pill--filtered' : ''}`}
                            onClick={() => applyOrderTypeFilter('customer')}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyOrderTypeFilter('customer'); } }}
                            title="Filter by Customer orders"
                          >
                            Customer
                          </span>
                        )}
                      </td>
                    ) : null}
                    <td>
                      {showroomOrder && boardMode !== 'all'
                        ? 'Showroom'
                        : (customerMap[String(q.customer_id)] || titleCaseWords(q.customer_name || q.customer || '') || (q.customer_id ? `#${String(q.customer_id).slice(0,8)}` : '-'))}
                    </td>
                    <td>{new Date(q.created_at).toLocaleString()}</td>
                    <td>
                      {showroomOrder && boardMode !== 'all' ? (
                        <span className="quotation-showroom-order-badge">Showroom</span>
                      ) : ((q.status === 'converted' || q.status === 'invoice') ? 'Invoice' : 'Quote')}
                    </td>
                    <td style={{ textAlign: 'right' }}>{computeQuotationDisplayTotal(q).toFixed(2)}</td>
                    <td style={{ minWidth: 120 }}>
                      <QuoteRowActionsDropdown
                        items={[
                          quoteIsEditable(q) && !showroomOrder ? {
                            key: 'edit',
                            label: 'Edit Quote',
                            onClick: () => handleEditQuote(q),
                          } : null,
                          {
                            key: 'pdf',
                            label: 'Download PDF',
                            tone: 'pdf',
                            onClick: () => handleDownloadPdf(q),
                          },
                          canSendOrder && !hideSendOrder ? {
                            key: 'send',
                            label: isSending ? 'Sending…' : (alreadySent ? 'Send Order (Resend)' : 'Send Order'),
                            disabled: Boolean(sendBusyId),
                            onClick: () => handleSendOrder(q),
                          } : null,
                          !isQuotationerOnly && !showroomOrder && q.status !== 'converted' ? {
                            key: 'convert',
                            label: 'Convert to Layby',
                            onClick: () => handleConvert(q),
                          } : null,
                          !isQuotationerOnly && !showroomOrder && q.status === 'converted' && q.sale_id ? {
                            key: 'layby',
                            label: 'Go to Layby',
                            onClick: () => navigate(`/layby-management?laybyId=${encodeURIComponent(q.layby_id || '')}&saleId=${encodeURIComponent(q.sale_id)}`),
                          } : null,
                          !isQuotationerOnly && canDelete ? {
                            key: 'delete',
                            label: 'Delete Quote',
                            tone: 'delete',
                            onClick: () => handleDeleteQuote(q),
                          } : null,
                        ].filter(Boolean)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
