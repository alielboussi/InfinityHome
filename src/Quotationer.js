import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import { openOrCreateQuotationPdf } from './QuotationerPdfService';
import generateQuotePdf from './quotespdf';
import { FaTrashAlt } from 'react-icons/fa';
import { cacheGet, cacheSet, cacheClear } from './utils/staleCache';
import { isPathAllowed, canDeleteQuotationData, canEditQuotation, isQuotationConverted, isQuotationerOnlyUser, getUserDisplayName } from './accessControl';
import LaybyDashboardStats from './LaybyDashboardStats';
import { logUserActivity } from './utils/userActivityLog';
import { notifyLaybyWhatsApp } from './services/whatsappNotify';
import {
  computeQuotationDisplayTotal,
  computeQuotationTotals,
  normalizeQuotationItemRow,
  quotationHasOutstandingDue,
  resolveQuoteCustomerForSelect,
  sortQuotationRows,
  sumPaymentRows,
} from './utils/quotationDisplay';

const NAV_BUTTON_STYLE = { padding: '8px 12px', fontSize: 13, background: '#0f7fff', color: '#fff', border: '1px solid #0c6ed8', borderRadius: 6, minHeight: 32 };
const QUOTATION_LIST_CACHE_KEY = 'quotationer:list:v6';
const QUOTATION_LIST_CUSTOMER_MAP_CACHE_KEY = 'quotationer:list:customer-map:v2';
const QUOTE_CUSTOMER_CATALOG_CACHE_KEY = 'quotationer:quote-customers:v1';
const QUOTE_PRODUCT_CATALOG_CACHE_KEY = 'quotationer:quote-products:v1';
const QUOTE_UNIT_CATALOG_CACHE_KEY = 'quotationer:quote-units:v1';
const QUOTATION_CACHE_TTL_MS = 10 * 60 * 1000;
const CANONICAL_APP_ORIGIN = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://infinity-home-pi.vercel.app').replace(/\/+$/, '');

const defaultQuote = { customer_id: null, discount: 0, vat_apply: false, vat_inclusive: false, vat_rate: 0.16, currency: 'K' };
const titleCaseWords = (text) => String(text || '')
  .split(/\s+/)
  .filter(Boolean)
  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');
const canonicalName = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const normalizePhone = (val) => {
  const s = String(val || '').trim();
  if (!s) return '';
  const digits = s.replace(/[^\d+]/g, '');
  return digits.replace(/^(?:\+)?(\d.*)$/,'+$1');
};

function normalizeUnitAbbreviation(abbreviation, unitName = '') {
  const rawAbbr = String(abbreviation || '').trim();
  const rawName = String(unitName || '').trim();
  const repaired = rawAbbr
    .replace(/Â²/g, '²')
    .replace(/â²/gi, '²')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^m\s*²$/i.test(repaired)) return 'm²';

  const compactAbbr = repaired.toLowerCase().replace(/[\s._-]+/g, '').replace(/\^/g, '');
  if (compactAbbr === 'm2' || compactAbbr === 'ma2' || compactAbbr === 'sqm' || compactAbbr === 'sqmeter' || compactAbbr === 'sqmeters') {
    return 'm²';
  }

  const compactName = rawName.toLowerCase().replace(/[^a-z]/g, '');
  if (
    compactName.includes('metersquared') ||
    compactName.includes('metresquared') ||
    compactName.includes('meteresquared') ||
    compactName.includes('squaremeter') ||
    compactName.includes('squaremetre')
  ) {
    return 'm²';
  }

  return repaired || rawName;
}

const readLocalUser = () => {
  try {
    const raw = localStorage.getItem('user');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.id || parsed.email)) return parsed;
  } catch {}
  return null;
};

async function fetchQuotationRead(action, params = {}) {
  let headers = undefined;
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers = { Authorization: `Bearer ${token}` };
  } catch {}

  const relQuotationRead = `/api/quotation-read?${new URLSearchParams({ action, ...params }).toString()}`;
  const relAdminRead = `/api/admin?${new URLSearchParams({ adminAction: 'quotation-read', action, ...params }).toString()}`;
  const canonicalQuotationRead = `${CANONICAL_APP_ORIGIN}/api/quotation-read?${new URLSearchParams({ action, ...params }).toString()}`;

  const attempts = [
    relQuotationRead,
    relAdminRead,
    canonicalQuotationRead,
  ];

  let lastError = null;
  for (const url of attempts) {
    const resp = await fetch(url, headers ? { headers } : undefined);
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && payload?.ok) {
      return payload.rows || [];
    }
    lastError = payload?.error || `quotation-read failed (${resp.status})`;
  }
  throw new Error(lastError || 'quotation-read failed');
}

async function fetchQuotationDetail(quoteId) {
  let headers = undefined;
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers = { Authorization: `Bearer ${token}` };
  } catch {}

  const params = new URLSearchParams({ action: 'get-quote', id: quoteId });
  const relQuotationRead = `/api/quotation-read?${params.toString()}`;
  const relAdminRead = `/api/admin?${new URLSearchParams({ adminAction: 'quotation-read', action: 'get-quote', id: quoteId }).toString()}`;
  const canonicalQuotationRead = `${CANONICAL_APP_ORIGIN}/api/quotation-read?${params.toString()}`;

  const attempts = [relQuotationRead, relAdminRead, canonicalQuotationRead];
  let lastError = null;
  for (const url of attempts) {
    const resp = await fetch(url, headers ? { headers } : undefined);
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok && payload?.ok && payload?.quote) {
      return { quote: payload.quote, items: payload.items || [] };
    }
    lastError = payload?.error || `quotation-read failed (${resp.status})`;
  }
  throw new Error(lastError || 'quotation-read failed');
}

async function fallbackGetQuote(quoteId) {
  const [{ data: quote, error: quoteErr }, { data: items, error: itemsErr }] = await Promise.all([
    db.from('quotations').select('*').eq('id', quoteId).maybeSingle(),
    db.from('quotation_items').select('*').eq('quotation_id', quoteId).order('sort_order'),
  ]);
  if (quoteErr) throw quoteErr;
  if (itemsErr) throw itemsErr;
  return { quote, items: items || [] };
}

async function fetchQuotationWrite(action, payload = {}) {
  let authHeaders = {};
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) authHeaders = { Authorization: `Bearer ${token}` };
  } catch {}

  const attempts = [
    '/api/quotation-save',
    '/api/admin?adminAction=quotation-save',
    `${CANONICAL_APP_ORIGIN}/api/quotation-save`,
  ];

  let lastError = null;
  for (const url of attempts) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const out = await resp.json().catch(() => ({}));
    if (resp.ok && out?.ok) return out;
    lastError = out?.error || `quotation-write failed (${resp.status})`;
  }

  throw new Error(lastError || 'quotation-write failed');
}

async function fallbackListQuotes(limit = 200) {
  const { data, error } = await db
    .from('quotations')
    .select('id, quote_number, customer_id, created_at, updated_at, total, subtotal, status, currency, discount, vat_apply, vat_rate, sale_id, layby_id')
    .limit(Math.min(limit * 3, 1500));
  if (error) throw error;
  return sortQuotationRows(data || []).slice(0, limit);
}

async function fallbackListProducts(query = '', limit = 200) {
  const s = String(query || '').trim().toLowerCase();
  const { data, error } = await db
    .from('quotation_products')
    .select('id, name, price, unit_id, description, active, image_url, qr_code_url, created_at, updated_at')
    .limit(Math.min(limit * 3, 1500));
  if (error) throw error;
  let rows = [...(data || [])].sort((a, b) => {
    const createdCmp = String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (createdCmp !== 0) return createdCmp;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
  if (s) {
    rows = rows.filter((row) =>
      String(row.name || '').toLowerCase().includes(s)
      || String(row.description || '').toLowerCase().includes(s));
  }
  return rows.slice(0, limit);
}

function isActiveQuoteProduct(product) {
  return product?.active !== false;
}

function invalidateQuoteProductCatalogCache() {
  try { cacheClear(QUOTE_PRODUCT_CATALOG_CACHE_KEY); } catch {}
}

async function fallbackListUnits() {
  const { data, error } = await db.from('quotation_units').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fallbackListCustomers() {
  const { data, error } = await db
    .from('quote_customers')
    .select('id, name, currency, phone, address, city, country, tpin, created_at')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function buildQuotationCustomerMap(rows = []) {
  const ids = Array.from(new Set((rows || []).map(q => q?.customer_id).filter(Boolean).map(v => String(v))));
  if (!ids.length) return {};

  const map = {};

  // Prefer names already resolved by the server quotation-read endpoint.
  (rows || []).forEach((q) => {
    const id = q?.customer_id ? String(q.customer_id) : '';
    const name = titleCaseWords(q?.customer_name || q?.customer || '');
    if (id && name) map[id] = name;
  });

  if (ids.every((id) => Boolean(map[id]))) return map;

  const applyRows = (list) => {
    (list || []).forEach((c) => {
      if (!c || !c.id || !c.name) return;
      map[String(c.id)] = titleCaseWords(c.name);
    });
  };

  try {
    const { data: qc } = await db.from('quote_customers').select('id, name').in('id', ids);
    applyRows(qc);
  } catch {}

  const missing = ids.filter((id) => !map[id]);
  if (!missing.length) return map;

  try {
    const { data: cust } = await db.from('customers').select('id, name').in('id', missing);
    applyRows(cust);
  } catch {}

  // Mixed legacy datasets can store customer_id with different id formats.
  // For unresolved ids, do per-id lookups against both tables to avoid one bad id breaking the whole batch.
  const stillMissing = ids.filter((id) => !map[id]);
  for (const id of stillMissing) {
    try {
      const { data: qcOne } = await db.from('quote_customers').select('id, name').eq('id', id).maybeSingle();
      if (qcOne?.name) {
        map[String(qcOne.id)] = titleCaseWords(qcOne.name);
        continue;
      }
    } catch {}
    try {
      const { data: cOne } = await db.from('customers').select('id, name').eq('id', id).maybeSingle();
      if (cOne?.name) {
        map[String(cOne.id)] = titleCaseWords(cOne.name);
      }
    } catch {}
  }

  return map;
}

function useIpadProLayout() {
  const [isIpadPro, setIsIpadPro] = React.useState(false);
  React.useEffect(() => {
    const detect = () => {
      if (typeof window === 'undefined') return false;
      const platform = navigator.platform || '';
      const ua = navigator.userAgent || navigator.vendor || '';
      const touchPoints = navigator.maxTouchPoints || 0;
      const isIpadLike = /iPad/.test(ua) || (platform === 'MacIntel' && touchPoints > 2);
      const width = Math.min(window.screen.width, window.screen.height);
      const height = Math.max(window.screen.width, window.screen.height);
      const matchesPro12 = width === 1024 && height === 1366;
      return isIpadLike && matchesPro12;
    };
    const update = () => setIsIpadPro(detect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return isIpadPro;
}

export default function Quotationer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = React.useState('');
  const [view, setView] = React.useState('home');
  const [editQuoteId, setEditQuoteId] = React.useState('');
  const [listRefreshTick, setListRefreshTick] = React.useState(0);
  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);
  const [error, setError] = React.useState('');

  const evaluateSession = React.useCallback((localUser) => {
    if (!localUser?.id) {
      setAllowed(false);
      setUserId('');
      setError('You must log in to access quotations.');
      setChecking(false);
      navigate('/login');
      return;
    }
    setUserId(localUser.id);
    if (isPathAllowed(localUser, '/quotationer')) {
      setAllowed(true);
      setError('');
    } else {
      setAllowed(false);
      setError('Your account is not authorized for Quotationer access.');
      navigate('/login');
    }
    setChecking(false);
  }, [navigate]);

  React.useEffect(() => {
    evaluateSession(readLocalUser());
  }, [evaluateSession, location.key]);

  // Respond to query params for deep links: ?quoteId=.. or ?view=list
  React.useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const quoteParam = params.get('quoteId') || params.get('id');
    const viewParam = params.get('view');
    if (quoteParam) {
      setEditQuoteId(quoteParam);
      setView('create');
      return;
    }
    if (viewParam) {
      const allowedViews = new Set(['home', 'list', 'customers', 'products', 'create']);
      const v = allowedViews.has(viewParam) ? viewParam : 'home';
      setView(v);
      if (v !== 'create') setEditQuoteId('');
    }
  }, [location.search]);

  const setViewAndUrl = React.useCallback((nextView, opts = {}) => {
    const params = new URLSearchParams();
    if (nextView === 'create' && opts.quoteId) params.set('quoteId', opts.quoteId);
    else if (nextView && nextView !== 'home') params.set('view', nextView);
    navigate({ pathname: '/quotationer', search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
    setView(nextView || 'home');
    setEditQuoteId(nextView === 'create' ? (opts.quoteId || '') : '');
  }, [navigate]);

  const goHome = React.useCallback(() => setViewAndUrl('home'), [setViewAndUrl]);

  const handleOpenQuote = React.useCallback((id) => {
    setViewAndUrl('create', { quoteId: id || '' });
  }, [setViewAndUrl]);

  const handleSaved = React.useCallback(() => {
    setListRefreshTick(t => t + 1);
    setViewAndUrl('list');
  }, [setViewAndUrl]);

  const localUser = readLocalUser();
  const isQuotationerOnly = isQuotationerOnlyUser(localUser);
  const homeLabel = isQuotationerOnly ? 'Dashboard' : 'Quotationer';

  if (checking) return <div style={{ padding: 20, color: '#8ab' }}>Checking access…</div>;
  if (!allowed) {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', background: '#111', padding: 18, borderRadius: 10, border: '1px solid #ff5252', color: '#ffb4b4', textAlign: 'center' }}>
        <h3 style={{ marginTop: 0, color: '#ff7676' }}>Access Restricted</h3>
        <p style={{ marginBottom: 12 }}>{error || 'You do not have permission to view this area.'}</p>
        <button
          style={{ background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}
          onClick={() => navigate('/login')}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className={isQuotationerOnly && view === 'home' ? 'dashboard-container' : 'quotes-page'} style={isQuotationerOnly && view === 'home' ? undefined : { padding: 12 }}>
      {!(isQuotationerOnly && view === 'home') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 className="quotes-title" style={{ margin: 0 }}>{view === 'home' ? homeLabel : 'Quotationer'}</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {view !== 'home' && (
              <button className="action-button" style={NAV_BUTTON_STYLE} onClick={goHome}>Back to {homeLabel}</button>
            )}
          </div>
        </div>
      )}

      {view === 'home' && (
        isQuotationerOnly ? (
          <QuotationerLaybyDashboard
            displayName={getUserDisplayName(localUser)}
            onNewQuote={() => handleOpenQuote('')}
            onList={() => setViewAndUrl('list')}
            onCustomers={() => setViewAndUrl('customers')}
            onProducts={() => setViewAndUrl('products')}
          />
        ) : (
          <QuotationerHome
            onNewQuote={() => handleOpenQuote('')}
            onList={() => setViewAndUrl('list')}
            onCustomers={() => setViewAndUrl('customers')}
            onProducts={() => setViewAndUrl('products')}
          />
        )
      )}
      {view === 'create' && (
        <QuotationCreateView
          key={`create-${editQuoteId || 'new'}`}
          quoteId={editQuoteId}
          onBackHome={goHome}
          onSaved={handleSaved}
        />
      )}
      {view === 'list' && (
        <QuotationListView
          key={`list-${listRefreshTick}`}
          onBackHome={goHome}
          onOpenQuote={handleOpenQuote}
          userId={userId}
          refreshKey={listRefreshTick}
        />
      )}
      {view === 'customers' && (
        <QuotesCustomersView
          onBackHome={goHome}
        />
      )}
      {view === 'products' && (
        <QuoteProductsView
          onBackHome={goHome}
        />
      )}
    </div>
  );
}

function QuotationerLaybyDashboard({ displayName, onNewQuote, onList, onCustomers, onProducts }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    try { sessionStorage.removeItem('bestrest:tabAuthed:v1'); } catch {}
    try { localStorage.removeItem('user'); } catch {}
    navigate('/login', { replace: true });
  };

  return (
    <>
      <section className="dashboard-hero dashboard-hero-single">
        <div className="dashboard-hero-left">
          <div className="dashboard-hero-heading">
            <h1>Dashboard</h1>
            <button type="button" className="logout-btn dashboard-hero-logout" onClick={handleLogout}>Logout</button>
          </div>
          <p>Layby overview and quotation tools.</p>
          <div className="dashboard-meta">
            <div className="meta-card">
              <span className="meta-label">Signed in</span>
              <span className="meta-value">{displayName || 'User'}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Today</span>
              <span className="meta-value">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </section>
      <QuotationerHome
        onNewQuote={onNewQuote}
        onList={onList}
        onCustomers={onCustomers}
        onProducts={onProducts}
      />
      <LaybyDashboardStats active />
    </>
  );
}

function QuotationerHome({ onNewQuote, onList, onCustomers, onProducts }) {
  return (
    <div className="quotationer-home-grid">
      <div className="quotationer-home-card">
        <div className="quotationer-home-card-title">Quote Customers</div>
        <button type="button" className="quotationer-home-card-btn" onClick={onCustomers}>Manage Customers</button>
      </div>
      <div className="quotationer-home-card">
        <div className="quotationer-home-card-title">Quote Products</div>
        <button type="button" className="quotationer-home-card-btn" onClick={onProducts}>Manage Products</button>
      </div>
      <div className="quotationer-home-card">
        <div className="quotationer-home-card-title">Create Quote</div>
        <button type="button" className="quotationer-home-card-btn" onClick={onNewQuote}>New Quote</button>
      </div>
      <div className="quotationer-home-card">
        <div className="quotationer-home-card-title">View Quotes</div>
        <button type="button" className="quotationer-home-card-btn" onClick={onList}>View Quotes</button>
      </div>
    </div>
  );
}

function QuotationListView({ onBackHome, onOpenQuote, refreshKey, userId }) {
  const tableCellStyle = { border: '1px solid #c9d3df', padding: '8px 10px', verticalAlign: 'middle' };
  const [quotes, setQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [customerMap, setCustomerMap] = React.useState({});
  const [salePaidBySaleId, setSalePaidBySaleId] = React.useState(() => new Map());

  const localUser = React.useMemo(() => readLocalUser(), []);

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
    return canEditQuotation(localUser, q, { hasOutstandingDue });
  }, [localUser, salePaidBySaleId]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const cachedQuotes = cacheGet(QUOTATION_LIST_CACHE_KEY);
        const cachedCustomerMap = cacheGet(QUOTATION_LIST_CUSTOMER_MAP_CACHE_KEY);
        const hasCachedQuotes = Array.isArray(cachedQuotes);
        if (hasCachedQuotes) setQuotes(sortQuotationRows(cachedQuotes));
        if (cachedCustomerMap && typeof cachedCustomerMap === 'object') setCustomerMap(cachedCustomerMap);
        setLoading(!hasCachedQuotes);
      } catch {
        setLoading(true);
      }
      let data = null;
      let error = null;
      try {
        data = await fetchQuotationRead('list-quotes', { limit: '200' });
      } catch (readErr) {
        try {
          data = await fallbackListQuotes(200);
        } catch {
          error = readErr;
        }
      }
      if (!cancelled) {
        if (!error) {
          const nextQuotes = sortQuotationRows(data || []);
          setQuotes(nextQuotes);
          try {
            const map = await buildQuotationCustomerMap(nextQuotes);
            if (!cancelled) {
              setCustomerMap(map);
              try {
                cacheSet(QUOTATION_LIST_CACHE_KEY, nextQuotes, QUOTATION_CACHE_TTL_MS);
                cacheSet(QUOTATION_LIST_CUSTOMER_MAP_CACHE_KEY, map, QUOTATION_CACHE_TTL_MS);
              } catch {}
            }
          } catch {}
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const filtered = quotes.filter(q => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const byNum = (q.quote_number || `Q-${String(q.id).slice(0,8)}`).toLowerCase().includes(s);
    const custName = (customerMap[String(q.customer_id)] || '').toLowerCase();
    const byCust = custName.includes(s);
    const byAmt = String(computeQuotationDisplayTotal(q).toFixed(2)).toLowerCase().includes(s) || String(q.total || '').toLowerCase().includes(s);
    return byNum || byCust || byAmt;
  });

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
        const { data: qc } = await db.from('quote_customers').select('name').eq('id', quoteRow.customer_id).maybeSingle();
        if (qc && qc.name) customerName = qc.name; else {
          const { data: cust } = await db.from('customers').select('name').eq('id', quoteRow.customer_id).maybeSingle();
          customerName = cust?.name || '';
        }
      }
      await openOrCreateQuotationPdf(
        { ...quoteRow, customer_name: customerName, paid_amount: paid, outstanding_amount: Math.max(0, Number(quoteRow?.total || 0) - paid) },
        (items||[]).map(it => ({
          ...it,
          unit_label: units?.find(u => u.id === it.unit_id)?.name || '-',
        })),
        { name: 'Best Rest Furniture' }
      );
    } catch (e) {
      alert('Download failed: ' + (e.message || e));
    }
  }

  return (
    <div className="quotes-page quotes-list-page">
      <div className="quotes-header" style={{ marginBottom: 12 }}>
        <h2 className="quotes-title" style={{ margin: 0 }}>Quotations</h2>
      </div>

      <input
        className="quotes-input"
        style={{ width: 340, maxWidth: '100%' }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, customer, or amount"
      />

      {(loading && quotes.length === 0) ? <div className="quotes-muted-text">Loading...</div> : (
        <div className="table-container quotes-table-wrap" style={{ marginTop: 12 }}>
          <table className="table quotes-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={tableCellStyle}>Quote #</th>
                <th style={{ ...tableCellStyle, minWidth: 220 }}>Customer</th>
                <th style={tableCellStyle}>Date</th>
                <th style={tableCellStyle}>Status</th>
                <th style={{ ...tableCellStyle, textAlign: 'right', minWidth: 90 }}>Total</th>
                <th style={{ ...tableCellStyle, minWidth: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id}>
                  <td style={tableCellStyle}>{q.quote_number || `Q-${String(q.id).slice(0,8)}`}</td>
                  <td style={{ ...tableCellStyle, minWidth: 220 }}>{customerMap[String(q.customer_id)] || titleCaseWords(q.customer_name || q.customer || '') || (q.customer_id ? `#${String(q.customer_id).slice(0,8)}` : '-')}</td>
                  <td style={tableCellStyle}>{new Date(q.created_at).toLocaleString()}</td>
                  <td style={tableCellStyle}>{(q.status === 'converted' || q.status === 'invoice') ? 'Invoice' : 'Quote'}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'right' }}>{computeQuotationDisplayTotal(q).toFixed(2)}</td>
                  <td style={{ ...tableCellStyle, minWidth: 200 }}>
                    <div className="quotes-list-actions">
                      {quoteIsEditable(q) && (
                        <button
                          type="button"
                          className="quotes-list-action-btn"
                          onClick={() => onOpenQuote(q.id)}
                        >
                          Edit Quote
                        </button>
                      )}
                      <button
                        type="button"
                        className="quotes-list-action-btn"
                        onClick={() => handleDownloadPdf(q)}
                      >
                        Download PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuotationCreateView({ quoteId, onBackHome, onSaved }) {
  const compactButton = { padding: '8px 12px', fontSize: 13, background: '#0f7fff', color: '#fff', border: '1px solid #0c6ed8', borderRadius: 6, minHeight: 32 };
  const compactDanger = { padding: '8px 12px', fontSize: 13, background: '#d64545', color: '#fff', border: '1px solid #b53434', borderRadius: 6, minHeight: 32 };
  const tableCellStyle = { border: '1px solid #c9d3df', padding: '8px 10px' };
  const navigate = useNavigate();
  const location = useLocation();
  const [quote, setQuote] = React.useState(() => ({ ...defaultQuote }));
  const [vatChoice, setVatChoice] = React.useState('exclusive');
  const [items, setItems] = React.useState([]);
  const [quoteCustomers, setQuoteCustomers] = React.useState([]);
  const [quoteProducts, setQuoteProducts] = React.useState([]);
  const [units, setUnits] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [showCustomerManager, setShowCustomerManager] = React.useState(false);
  const [custSearch, setCustSearch] = React.useState('');
  const [custName, setCustName] = React.useState('');
  const [custPhone, setCustPhone] = React.useState('');
  const [custPrefix, setCustPrefix] = React.useState('+260');
  const [addSearch, setAddSearch] = React.useState('');
  const [currentQuoteId, setCurrentQuoteId] = React.useState(quoteId || '');
  const isIpadProLayout = useIpadProLayout();

  const normalizeDescription = (text) => {
    const parts = String(text || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return parts.join(' ');
  };

  const resetToNewQuote = React.useCallback(() => {
    setQuote({ ...defaultQuote });
    setItems([]);
    setLocked(false);
    setVatChoice('exclusive');
    setCurrentQuoteId('');
    setAddSearch('');
    setCustSearch('');
    setCustName('');
    setCustPhone('');
    setCustPrefix('+260');
    setShowCustomerManager(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setCurrentQuoteId(quoteId || '');
    async function load() {
      if (!quoteId) {
        resetToNewQuote();
      }
      try {
        const cachedCustomers = cacheGet(QUOTE_CUSTOMER_CATALOG_CACHE_KEY);
        const cachedProducts = cacheGet(QUOTE_PRODUCT_CATALOG_CACHE_KEY);
        const cachedUnits = cacheGet(QUOTE_UNIT_CATALOG_CACHE_KEY);
        if (!cancelled) {
          if (Array.isArray(cachedCustomers)) setQuoteCustomers(cachedCustomers);
          if (Array.isArray(cachedProducts)) setQuoteProducts(cachedProducts.filter(isActiveQuoteProduct));
          if (Array.isArray(cachedUnits)) setUnits(cachedUnits);
        }
      } catch {}
      let qcs = [];
      let qp = [];
      let qu = [];
      try {
        [qcs, qp, qu] = await Promise.all([
          fetchQuotationRead('list-customers'),
          fetchQuotationRead('list-products', { limit: '500' }),
          fetchQuotationRead('list-units')
        ]);
      } catch {
        [qcs, qp, qu] = await Promise.all([
          fallbackListCustomers(),
          fallbackListProducts('', 500),
          fallbackListUnits()
        ]);
      }
      if (!cancelled) {
        const nextCustomers = (qcs || []).map(c => ({ ...c, name: titleCaseWords(c.name) }));
        const nextProducts = (qp || []).filter(isActiveQuoteProduct);
        const nextUnits = qu || [];
        setQuoteCustomers(nextCustomers);
        setQuoteProducts(nextProducts);
        setUnits(nextUnits);
        try {
          cacheSet(QUOTE_CUSTOMER_CATALOG_CACHE_KEY, nextCustomers, QUOTATION_CACHE_TTL_MS);
          cacheSet(QUOTE_PRODUCT_CATALOG_CACHE_KEY, nextProducts, QUOTATION_CACHE_TTL_MS);
          cacheSet(QUOTE_UNIT_CATALOG_CACHE_KEY, nextUnits, QUOTATION_CACHE_TTL_MS);
        } catch {}
      }
      if (quoteId && !cancelled) {
        let hdr = null;
        let lines = [];
        try {
          const detail = await fetchQuotationDetail(quoteId);
          hdr = detail?.quote || null;
          lines = detail?.items || [];
        } catch {
          const detail = await fallbackGetQuote(quoteId);
          hdr = detail?.quote || null;
          lines = detail?.items || [];
        }
        if (hdr) {
          const resolved = await resolveQuoteCustomerForSelect(hdr, (qcs || []).map(c => ({ ...c, name: titleCaseWords(c.name) })), db);
          if (!cancelled) {
            if (resolved.customers?.length) setQuoteCustomers(resolved.customers);
            const loadedQuote = resolved.header || hdr;
            setQuote(loadedQuote);
            setCurrentQuoteId(loadedQuote.id || quoteId || '');
            setVatChoice(loadedQuote.vat_apply ? 'vat16' : 'exclusive');
          }
          const user = readLocalUser();
          let hasOutstandingDue = true;
          if (hdr.sale_id) {
            try {
              const { data: salesPays } = await fromPublic('sales_payments')
                .select('amount, discount_amount')
                .eq('sale_id', hdr.sale_id);
              hasOutstandingDue = quotationHasOutstandingDue(hdr, sumPaymentRows(salesPays));
            } catch {}
          }
          if (!cancelled) setLocked(!canEditQuotation(user, hdr, { hasOutstandingDue }));
        }
        if (!cancelled) {
          setItems((lines || []).map(normalizeQuotationItemRow));
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [quoteId, resetToNewQuote]);

  React.useEffect(() => {
    if (!quote.customer_id) return;
    const cust = (quoteCustomers || []).find(c => String(c.id) === String(quote.customer_id));
    if (cust && cust.currency && cust.currency !== quote.currency) {
      setQuote(q => ({ ...q, currency: cust.currency }));
    }
  }, [quote.customer_id, quote.currency, quoteCustomers]);

  React.useEffect(() => {
    if (!vatChoice) return;
    setQuote(q => ({
      ...q,
      vat_rate: vatChoice === 'vat16' ? 0.16 : 0,
      vat_apply: vatChoice === 'vat16',
    }));
  }, [vatChoice]);

  const addItemFromQuoteProduct = (qp) => {
    if (locked) return;
    setItems(prev => [...prev, {
      id: 'local-' + Math.random().toString(36).slice(2),
      quote_product_id: qp.id,
      name: qp.name,
      description: normalizeDescription(qp.description),
      unit_id: qp.unit_id,
      quantity: '',
      unit_price: Number(qp.price || 0),
      image_url: qp.image_url,
      qr_code_url: qp.qr_code_url,
    }]);
  };

  const updateItem = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  const removeItem = (id) => {
    if (locked) return;
    setItems(prev => prev.filter(it => it.id !== id));
  };
  const getNormalizedItems = () => items.map(it => ({
    ...it,
    name: it.name || '',
    description: normalizeDescription(it.description || ''),
    quantity: it.quantity === '' ? '' : Number(it.quantity || 0),
    unit_id: it.unit_id ? Number(it.unit_id) : null,
    unit_price: it.unit_price === '' ? 0 : Number(it.unit_price || 0),
  }));

  const computeTotals = () => {
    const effectiveItems = getNormalizedItems();
    const subtotal = effectiveItems.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);
    const vatApply = vatChoice === 'vat16';
    return computeQuotationTotals({
      subtotal,
      discount: quote.discount,
      vatApply,
      vatRate: vatApply ? 0.16 : 0,
    });
  };

  const saveQuote = async () => {
    const wasEditing = Boolean(currentQuoteId);
    if (!vatChoice) {
      alert('Please choose VAT Exclusive or VAT @ 16%');
      return;
    }
    if (locked) return;
    setSaving(true);
    try {
      const payload = { id: currentQuoteId || undefined, quote, items: getNormalizedItems(), vatChoice };
      const apiBaseRaw = process.env.REACT_APP_API_BASE || '';
      const apiBase = apiBaseRaw.replace(/\/+$/, ''); // trim trailing slashes to avoid double slashes in URL
      const url = apiBase ? `${apiBase}/api/quotation-save` : '/api/quotation-save';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out.ok) {
        if (resp.status === 404 || resp.status === 405) {
          throw new Error('Save API not available in this dev mode. Run "vercel dev" to enable /api routes locally, or set REACT_APP_API_BASE to your deployed URL and call that.');
        }
        throw new Error(out.error || `Save failed (${resp.status})`);
      }
      const createdQuoteId = out.id;
      if (!createdQuoteId) throw new Error('Quote saved but no id returned');
      if (createdQuoteId && !currentQuoteId) setCurrentQuoteId(createdQuoteId);

      if (out.laybyEditNotify?.laybyId) {
        try {
          const notifyResult = await notifyLaybyWhatsApp({
            laybyId: out.laybyEditNotify.laybyId,
            saleId: out.laybyEditNotify.saleId,
            eventType: out.laybyEditNotify.eventType || 'quote_edit',
            laybyClosed: out.laybyEditNotify.laybyClosed,
            editSummary: out.laybyEditNotify.editSummary,
          });
          if (!notifyResult?.ok) {
            console.warn('Layby edit WhatsApp failed:', notifyResult?.error || 'unknown error');
          }
        } catch (notifyErr) {
          console.warn('Layby edit WhatsApp failed:', notifyErr?.message || notifyErr);
        }
      }

      try {
        const selectedCustomer = quoteCustomers.find(c => String(c.id) === String(quote.customer_id));
        const customerName = selectedCustomer?.name ? titleCaseWords(selectedCustomer.name) : undefined;
        const customerPhone = selectedCustomer?.phone || null;
        const customerAddress = selectedCustomer?.address || null;
        const customerCity = selectedCustomer?.city || null;
        const customerTpin = selectedCustomer?.tpin || null;
        const customerEmail = selectedCustomer?.email || null;
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10);
        const timeStr = now.toISOString().slice(11,19).replace(/:/g, '');

        const { data: freshQuote } = await db.from('quotations').select('*').eq('id', createdQuoteId).maybeSingle();
        const { data: freshItems } = await db.from('quotation_items').select('*').eq('quotation_id', createdQuoteId).order('sort_order');
        if (freshQuote) {
          setQuote(q => ({ ...q, ...freshQuote }));
          setCurrentQuoteId(freshQuote.id || createdQuoteId || currentQuoteId);
        }
        if (freshItems) setItems(freshItems);

        const quoteForPdf = freshQuote || { ...quote, id: createdQuoteId, quote_number: out?.quote?.quote_number }; // fallback to current quote state
        const itemsForPdf = freshItems || getNormalizedItems();

        const qpIds = [...new Set((itemsForPdf||[]).map(i => i.quote_product_id).filter(Boolean))];
        let productMap = new Map();
        if (qpIds.length) {
          const { data: qps } = await db
            .from('quotation_products')
            .select('id, name, unit_id, description, image_url, qr_code_url')
            .in('id', qpIds);
          (qps || []).forEach(p => productMap.set(p.id, p));
        }
        const pdfBlob = await generateQuotePdf(
          {
            ...quoteForPdf,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            customer_city: customerCity,
            customer_tpin: customerTpin,
            customer_email: customerEmail,
            vat_apply: vatChoice === 'vat16'
          },
          (itemsForPdf || []).map(it => {
            const qp = productMap.get(it.quote_product_id || '');
            const unitId = it.unit_id ?? qp?.unit_id ?? null;
            const unitMeta = units.find(u => u.id === unitId);
            const unitLabel = unitMeta?.name || '-';
            const unitAbbr = normalizeUnitAbbreviation(unitMeta?.abbreviation, unitLabel) || '-';
            const resolvedName = it.name_override || it.name || qp?.name || it.product_name || it.quote_product_name || '';
            const resolvedDesc = it.description || qp?.description || '';
            return {
              ...it,
              name: resolvedName,
              description: resolvedDesc,
              unit_id: unitId,
              unit_label: unitLabel,
              unit_abbr: unitAbbr,
              image_url: qp?.image_url ?? it.image_url ?? null,
              qr_code_url: qp?.qr_code_url ?? it.qr_code_url ?? null,
            };
          }),
          { mode: 'blob' }
        );

        const quoteNumber = quoteForPdf?.quote_number || out?.quote?.quote_number || '';
        const safeCustomer = (customerName || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
        const safeQuoteNumber = (quoteNumber || 'Quote').replace(/[^a-zA-Z0-9#_-]/g, '');
        const fileName = `${safeCustomer}_${dateStr}_${timeStr}_${safeQuoteNumber}.pdf`;
        const path = `${safeQuoteNumber || createdQuoteId || 'quote'}/${fileName}`;

        const triggerDownload = () => {
          try {
            const blobUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          } catch (err) {
            console.warn('Download link failed, opening in new tab', err);
            const blobUrl = URL.createObjectURL(pdfBlob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
          }
        };

        // Attempt bucket upload (works when storage rules allow the current key; logs if blocked)
        try {
          const { error: upErr } = await db.storage.from('Quotations').upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });
          if (upErr) console.warn('Upload failed', upErr.message || upErr);
        } catch (uploadErr) {
          console.warn('Upload exception', uploadErr?.message || uploadErr);
        }

        triggerDownload();
      } catch (e) {
        console.warn('Quote PDF generation/upload failed:', e?.message || e);
      }
      logUserActivity({
        actionType: wasEditing ? 'quote_edit' : 'quote_create',
        actionLabel: wasEditing ? 'Quote Updated' : 'Quote Created',
        details: `${quote?.quote_number || out?.quote?.quote_number || createdQuoteId} • ${getNormalizedItems().length} line${getNormalizedItems().length === 1 ? '' : 's'}`,
        reference: quote?.quote_number || out?.quote?.quote_number || String(createdQuoteId),
        entityType: 'quotation',
        entityId: String(createdQuoteId),
      });
      const quoteUser = readLocalUser();
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      if (returnTo === 'layby-management') {
        navigate('/layby-management');
        return;
      }
      if (isQuotationerOnlyUser(quoteUser)) {
        navigate('/quotes-board');
        return;
      }
      // After successful save: if editing, return to quotes list; otherwise reset for new quote
      if (wasEditing) {
        if (typeof onSaved === 'function') onSaved();
        else navigate('/quotes');
      } else {
        resetToNewQuote();
      }
    } catch (err) {
      alert('Failed to save quote: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const { subtotal, discount, vatAmount, total } = computeTotals();
  const isEditing = Boolean(currentQuoteId);
  const pageStyle = React.useMemo(() => ({
    padding: isIpadProLayout ? '12px 18px 24px' : 12,
    minHeight: isIpadProLayout ? '100dvh' : undefined
  }), [isIpadProLayout]);
  const tableLayoutMode = React.useMemo(() => isIpadProLayout ? 'auto' : 'fixed', [isIpadProLayout]);
  const tableWrapperStyle = React.useMemo(() => ({
    marginTop: 12,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    width: '100%',
    padding: isIpadProLayout ? 2 : 0
  }), [isIpadProLayout]);
  const lockMessage = React.useMemo(() => {
    if (!locked) return '';
    const converted = isQuotationConverted(quote);
    if (converted) return 'This quotation layby is fully paid and is read-only.';
    return 'This quotation is read-only.';
  }, [locked, quote]);

  return (
    <div className="content quotes-page quotes-create-page" style={pageStyle}>
      <h2 className="quotes-title" style={{ margin: 0 }}>Create Quotation</h2>
      {locked && lockMessage && (
        <div className="quotes-lock-notice">
          {lockMessage}
        </div>
      )}

      <div className="quotes-create-panel">
        <div className="quotes-create-panel-grid">
          <div className="quotes-create-panel-row">
            <select
              className="quotes-select quotes-select-customer"
              value={quote.customer_id != null && quote.customer_id !== '' ? String(quote.customer_id) : ''}
              onChange={e => setQuote(q => ({ ...q, customer_id: e.target.value || null }))}
              style={{ minWidth: 220 }}
            >
              <option value="">Select Customer</option>
              {(quoteCustomers||[]).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <button className="action-button" type="button" style={compactButton} onClick={() => setShowCustomerManager(v => !v)}>
              {showCustomerManager ? 'Hide Customers' : 'Manage Customers'}
            </button>
          </div>

          <div className="quotes-create-panel-row">
            <div className="quotes-create-vat-wrap">
              <span className="quotes-create-label">VAT</span>
              <select
                className="quotes-select quotes-pos-select"
                value={vatChoice}
                onChange={e => setVatChoice(e.target.value)}
                style={{ minWidth: 180 }}
              >
                <option value="exclusive">VAT Exclusive</option>
                <option value="vat16">VAT @ 16%</option>
              </select>
            </div>
            <div className="pos-currency-switch quotes-currency-switch" role="group" aria-label="Currency">
              <button
                type="button"
                className={quote.currency === 'K' ? 'active' : ''}
                onClick={() => setQuote(q => ({ ...q, currency: 'K' }))}
                aria-pressed={quote.currency === 'K'}
              >
                <span className="pos-currency-symbol">K</span>
              </button>
              <button
                type="button"
                className={quote.currency === '$' ? 'active' : ''}
                onClick={() => setQuote(q => ({ ...q, currency: '$' }))}
                aria-pressed={quote.currency === '$'}
              >
                <span className="pos-currency-symbol">$</span>
              </button>
            </div>
          </div>
        </div>
      </div>

          {showCustomerManager && (
            <div className="quotes-create-subpanel">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Customers</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input className="quotes-input" placeholder="Search customers" value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                <div className="phone-group">
                  <select className="phone-prefix" value={custPrefix} onChange={e => setCustPrefix(e.target.value)}>
                    <option value="+260">+260 (ZM)</option>
                    <option value="+243">+243 (CD)</option>
                  </select>
                  <input className="phone-input" placeholder="Phone" value={custPhone} onChange={e => setCustPhone(e.target.value)} />
                </div>
                <input className="quotes-input" placeholder="Customer name" value={custName} onChange={e => setCustName(e.target.value)} />
                <button className="action-button" type="button" style={compactButton} onClick={async () => {
                  if (!custName.trim()) return;
                  const clean = String(custPhone||'').replace(/\s+/g, '');
                  const fullPhone = clean ? `${custPrefix}${clean.replace(/^\+?(260|243)/, '')}` : null;
                  const normalizedName = titleCaseWords(custName.trim());
                  const nameKey = canonicalName(normalizedName);
                  const phoneKey = normalizePhone(fullPhone);
                  const hasDupe = (quoteCustomers || []).some(c => {
                    const sameName = nameKey && canonicalName(c.name) === nameKey;
                    const samePhone = phoneKey && normalizePhone(c.phone) === phoneKey;
                    return sameName || samePhone;
                  });
                  if (hasDupe) {
                    alert('A quote customer with this name or phone already exists.');
                    return;
                  }
                  const payload = { name: normalizedName, phone: fullPhone, currency: quote.currency };
                  try {
                    await fetchQuotationWrite('create-customer', payload);
                    setCustName(''); setCustPhone(''); setCustPrefix('+260');
                    let qcs = [];
                    try {
                      qcs = await fetchQuotationRead('list-customers');
                    } catch {
                      qcs = await fallbackListCustomers();
                    }
                    const nextCustomers = (qcs || []).map(c => ({ ...c, name: titleCaseWords(c.name) }));
                    setQuoteCustomers(nextCustomers);
                    try { cacheSet(QUOTE_CUSTOMER_CATALOG_CACHE_KEY, nextCustomers, QUOTATION_CACHE_TTL_MS); } catch {}
                  } catch (e) {
                    alert('Add customer failed: ' + (e.message || e));
                  }
                }}>Add Customer</button>
              </div>
              <div style={{ marginTop: 8, maxHeight: 240, overflow: 'auto' }}>
                {(quoteCustomers||[])
                  .filter(c => {
                    const s = custSearch.trim().toLowerCase();
                    if (!s) return true; return (c.name||'').toLowerCase().includes(s) || (c.phone||'').toLowerCase().includes(s);
                  })
                  .map(c => (
                    <button key={c.id} className="action-button" style={{ marginRight:6, marginBottom:6 }} onClick={() => setQuote(q => ({ ...q, customer_id: c.id, currency: c.currency || q.currency }))}>{c.name}</button>
                  ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            <input
              className="quotes-input"
              placeholder="Search products to add (name/description)"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              aria-label="Search products to add"
              style={{ width: '100%', maxWidth: 480 }}
            />
            {addSearch.trim() && (
              <div className="quotes-create-product-results">
                {(quoteProducts||[])
                  .filter(isActiveQuoteProduct)
                  .filter(p => {
                    const s = addSearch.trim().toLowerCase();
                    return (p.name||'').toLowerCase().includes(s) || (p.description||'').toLowerCase().includes(s);
                  })
                  .slice(0, 30)
                  .map(p => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                      <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
                        {p.image_url && <img src={p.image_url} alt="img" style={{ width:24, height:24, objectFit:'cover', borderRadius:4 }} />}
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span style={{ color:'#8ab' }}>{p.unit_id ? normalizeUnitAbbreviation(units.find(u => u.id === p.unit_id)?.abbreviation, units.find(u => u.id === p.unit_id)?.name) : ''}</span>
                      </div>
                      <div style={{ color:'#8ab', minWidth:80, textAlign:'right' }}>{Number(p.price||0).toFixed(2)}</div>
                      <button className="action-button" style={compactButton} disabled={locked} onClick={() => addItemFromQuoteProduct(p)}>Add</button>
                    </div>
                  ))}
                {!((quoteProducts||[]).some(p => {
                  if (!isActiveQuoteProduct(p)) return false;
                  const s = addSearch.trim().toLowerCase();
                  return s && ((p.name||'').toLowerCase().includes(s) || (p.description||'').toLowerCase().includes(s));
                })) && (
                  <div style={{ color:'#8ab' }}>No matching products</div>
                )}
              </div>
            )}
          </div>

          <div className="quotes-table-wrap" style={tableWrapperStyle}>
            <table className="table quotes-table" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: tableLayoutMode, minWidth: isIpadProLayout ? 900 : undefined }}>
              <thead>
                <tr>
                  <th style={{ ...tableCellStyle, width: '42%' }}>Item & Description</th>
                  <th style={{ ...tableCellStyle, width: '14%', textAlign: 'center' }}>Qty / Unit</th>
                  <th style={{ ...tableCellStyle, width: '18%', textAlign: 'center' }}>Price</th>
                  <th style={{ ...tableCellStyle, width: '12%', textAlign: 'right' }}>Amount</th>
                  <th style={{ ...tableCellStyle, width: '14%', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const currencyLabel = quote.currency || 'K';
                  const qtyValue = it.quantity === '' ? '' : it.quantity;
                  const unitPriceValue = it.unit_price === '' || it.unit_price == null ? '' : it.unit_price;
                  const lineTotal = (Number(it.quantity || 0) * Number(it.unit_price || 0)).toFixed(2);
                  return (
                    <tr key={it.id}>
                      <td style={{ ...tableCellStyle, width: '42%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input
                            className="quotes-input"
                            value={it.name || ''}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { name: e.target.value })}
                            placeholder="Item name"
                          />
                          <textarea
                            className="quotes-textarea"
                            rows={3}
                            value={it.description || ''}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { description: normalizeDescription(e.target.value) })}
                            placeholder="Description"
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, width: '14%', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                          <input
                            className="quotes-input"
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*"
                            value={qtyValue}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { quantity: e.target.value })}
                            onWheel={e => e.preventDefault()}
                            onWheelCapture={e => e.preventDefault()}
                            style={{ textAlign: 'center', width: '90%', maxWidth: 110, minWidth: 80, height: 36, padding: '6px 8px' }}
                            placeholder="Qty"
                          />
                          <select
                            className="quotes-select"
                            value={it.unit_id || ''}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { unit_id: e.target.value })}
                            style={{ width: '90%', maxWidth: 110, minWidth: 80, fontSize: 12, padding: '6px 8px', height: 32 }}
                          >
                            <option value="">No Unit</option>
                            {units.map(u => (
                              <option key={u.id} value={u.id}>{normalizeUnitAbbreviation(u.abbreviation, u.name)}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'center', width: '18%', padding: '8px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                          {!locked ? (
                            <div style={{ position: 'relative', width: 150, maxWidth: '100%' }}>
                              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8ab', pointerEvents: 'none' }}>{currencyLabel}</span>
                              <input
                                className="quotes-input price-inline-input"
                                type="number"
                                value={unitPriceValue}
                                disabled={locked}
                                onChange={e => updateItem(it.id, { unit_price: e.target.value })}
                                onWheelCapture={e => e.preventDefault()}
                                placeholder={`${currencyLabel} 0.00`}
                                style={{ width: '100%', textAlign: 'right', padding: '6px 10px', paddingLeft: 30 }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36 }}>
                              <span style={{ minWidth: 14, color: '#8ab' }}>{currencyLabel}</span>
                              <span>{unitPriceValue === '' ? '0.00' : Number(unitPriceValue || 0).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', width: '12%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minHeight: 36 }}>
                          <span style={{ minWidth: 14, color: '#8ab' }}>{currencyLabel}</span>
                          <span>{lineTotal}</span>
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, width: '16%', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {!locked && (
                            <button
                              className="danger-button"
                              disabled={locked}
                              onClick={() => removeItem(it.id)}
                              title="Delete item"
                              aria-label="Delete item"
                              style={{ ...compactDanger, display: 'inline-flex', justifyContent: 'center', minWidth: 90 }}
                            >
                              <FaTrashAlt size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12, color: '#cfe' }}>
            <div>Subtotal: {subtotal.toFixed(2)}</div>
            <div>Discount: {discount.toFixed(2)}</div>
            <div>VAT: {vatAmount.toFixed(2)}{vatChoice === 'vat16' ? '' : ' (Exclusive)'}</div>
            <div style={{ fontWeight: 'bold' }}>Total: {total.toFixed(2)}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap:'wrap' }}>
            {!locked && (
              <button
                className="action-button"
                style={{ ...compactButton, minWidth: 140 }}
                disabled={saving}
                onClick={saveQuote}
              >
                {isEditing ? 'Update Quote' : 'Create Quote'}
              </button>
            )}
          </div>
    </div>
  );
}

function htmlToPlainPreview(html) {
  if (!html) return '';
  if (typeof document === 'undefined') return String(html).replace(/<[^>]+>/g, ' ').trim();
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || el.innerText || '').trim();
}

function QuoteDescriptionDialog({ open, value, onClose, onSave }) {
  const editorRef = React.useRef(null);

  React.useEffect(() => {
    if (!open || !editorRef.current) return;
    editorRef.current.innerHTML = value || '';
    editorRef.current.focus();
  }, [open, value]);

  const exec = (command, valueArg = null) => {
    editorRef.current?.focus();
    try {
      document.execCommand(command, false, valueArg);
    } catch {}
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="quote-desc-dialog-overlay" onClick={onClose}>
      <div className="quote-desc-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit description">
        <div className="quote-desc-dialog-toolbar">
          <button type="button" onClick={() => exec('bold')}><strong>B</strong></button>
          <button type="button" onClick={() => exec('italic')}><em>I</em></button>
          <button type="button" onClick={() => exec('underline')}><u>U</u></button>
          <button type="button" onClick={() => exec('insertUnorderedList')}>Bullets</button>
        </div>
        <div
          ref={editorRef}
          className="quote-desc-dialog-editor"
          contentEditable
          suppressContentEditableWarning
        />
        <div className="quote-desc-dialog-footer">
          <button type="button" className="quote-desc-dialog-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="quote-desc-dialog-save"
            onClick={() => onSave(editorRef.current?.innerHTML || '')}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function QuotesCustomersView({ onBackHome }) {
  const compactButton = { padding: '8px 12px', fontSize: 13, background: '#0f7fff', color: '#fff', border: '1px solid #0c6ed8', borderRadius: 6, minHeight: 32 };
  const compactDanger = { padding: '8px 12px', fontSize: 13, background: '#d64545', color: '#fff', border: '1px solid #b53434', borderRadius: 6, minHeight: 32 };
  const tableCellStyle = { border: '1px solid #c9d3df', padding: '8px 10px' };
  const canDelete = canDeleteQuotationData(readLocalUser());
  const [list, setList] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [prefix, setPrefix] = React.useState('+260');
  const [address, setAddress] = React.useState('');
  const [city, setCity] = React.useState('');
  const [country, setCountry] = React.useState('Zambia');
  const [tpin, setTpin] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState('');
  const [editingId, setEditingId] = React.useState('');
  const [loadError, setLoadError] = React.useState('');

  const DEFAULT_CURRENCY = 'K';

  const splitPhone = React.useCallback((s) => {
    const str = String(s || '');
    if (/^\+?260/.test(str)) return { prefix: '+260', phone: str.replace(/^\+?260/, '') };
    if (/^\+?243/.test(str)) return { prefix: '+243', phone: str.replace(/^\+?243/, '') };
    return { prefix: '+260', phone: str.replace(/^\+?/, '') };
  }, []);

  const load = React.useCallback(async () => {
    try {
      const cached = cacheGet(QUOTE_CUSTOMER_CATALOG_CACHE_KEY);
      if (Array.isArray(cached)) setList(cached);
    } catch {}

    let rows = null;
    let err = null;
    try {
      rows = await fetchQuotationRead('list-customers');
    } catch (readErr) {
      const { data, error } = await db.from('quote_customers').select('*').order('created_at', { ascending: false });
      rows = data || null;
      err = error || readErr;
    }

    if (Array.isArray(rows)) {
      const nextList = rows.map(r => ({ ...r, name: titleCaseWords(r.name) }));
      setList(nextList);
      try { cacheSet(QUOTE_CUSTOMER_CATALOG_CACHE_KEY, nextList, QUOTATION_CACHE_TTL_MS); } catch {}
      setLoadError('');
      return;
    }

    setLoadError(err?.message || 'Unable to load quote customers.');
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!name) return;
    setSaving(true);
    try {
      const clean = String(phone || '').replace(/\s+/g, '');
      const fullPhone = clean ? `${prefix}${clean.replace(/^\+?(260|243)/, '')}` : null;
      const normalizedName = titleCaseWords(name);
      const nameKey = canonicalName(normalizedName);
      const phoneKey = normalizePhone(fullPhone);
      const hasDupe = (list || []).some(r => {
        if (editingId && String(r.id) === String(editingId)) return false;
        const sameName = nameKey && canonicalName(r.name) === nameKey;
        const samePhone = phoneKey && normalizePhone(r.phone) === phoneKey;
        return sameName || samePhone;
      });
      if (hasDupe) {
        alert('A quote customer with this name or phone already exists.');
        setSaving(false);
        return;
      }
      const row = { name: normalizedName, phone: fullPhone, currency: DEFAULT_CURRENCY, address: address || null, city: city || null, country: country || null, tpin: tpin || null };
      if (editingId) {
        const { error } = await db.from('quote_customers').update(row).eq('id', editingId);
        if (error) throw error;
      } else {
        await fetchQuotationWrite('create-customer', row);
      }
      setEditingId(''); setSelectedId('');
      setName(''); setPhone(''); setPrefix('+260'); setAddress(''); setCity(''); setCountry('Zambia'); setTpin('');
      await load();
    } catch (e) {
      alert('Save failed: ' + (e.message || e));
    } finally { setSaving(false); }
  };

  const startEditSelected = (id) => {
    const targetId = id || selectedId;
    if (!targetId) return;
    const rec = (list || []).find(r => r.id === targetId);
    if (!rec) return;
    if (!window.confirm('Edit this customer?')) return;
    setSelectedId(targetId);
    setEditingId(targetId);
    setName(titleCaseWords(rec.name || ''));
    const ph = splitPhone(rec.phone || '');
    setPrefix(ph.prefix);
    setPhone(ph.phone);
    setAddress(rec.address || '');
    setCity(rec.city || '');
    setCountry(rec.country || 'Zambia');
    setTpin(rec.tpin || '');
  };

  const cancelEdit = () => {
    setEditingId('');
    setSelectedId('');
    setName(''); setPhone(''); setPrefix('+260'); setAddress(''); setCity(''); setCountry('Zambia'); setTpin('');
  };

  const deleteSelected = async (id) => {
    const targetId = id || selectedId;
    if (!targetId) return;
    if (!window.confirm('Delete this quote customer? This cannot be undone.')) return;
    try {
      const { error } = await db.from('quote_customers').delete().eq('id', targetId);
      if (error) throw error;
      setSelectedId('');
      setEditingId('');
      await load();
    } catch (e) {
      alert('Delete failed: ' + (e.message || e));
    }
  };

  const filtered = (list || []).filter(r => {
    const sRaw = search.trim();
    const s = sRaw.toLowerCase();
    if (!s) return true;
    const safe = (x) => String(x||'').toLowerCase();
    const digits = (x) => String(x||'').replace(/\D+/g, '');
    const sDigits = digits(sRaw);
    return (
      safe(r.name).includes(s) ||
      safe(r.phone).includes(s) ||
      (!!sDigits && digits(r.phone).includes(sDigits))
    );
  });

  return (
    <div className="quotes-page quotes-customers-page">
      <div className="quotes-header">
        <h2 className="quotes-title">Quote Customers</h2>
      </div>
      {!!loadError && (
        <div style={{ color: '#c62828', marginBottom: 8 }}>
          {loadError}
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <div style={{ color:'#64748b' }}>Showing {(list||[]).length}</div>
      </div>
      <form onSubmit={add} className="quotes-customers-form">
        <input className="quotes-input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <div className="phone-group">
          <select className="phone-prefix" value={prefix} onChange={e => setPrefix(e.target.value)}>
            <option value="+260">+260 (ZM)</option>
            <option value="+243">+243 (CD)</option>
          </select>
          <input className="phone-input" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <input className="quotes-input" placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} />
        <div className="city-group">
          <select className="city-country" value={country} onChange={e => setCountry(e.target.value)}>
            <option value="Zambia">Zambia</option>
            <option value="Congo">Congo</option>
          </select>
          <input className="city-input" placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
        </div>
        <input className="quotes-input" placeholder="TPIN" value={tpin} onChange={e => setTpin(e.target.value)} />
        <div className="quotes-customers-actions">
          {editingId ? (
            <>
              <button className="action-button" style={compactButton} disabled={saving} type="submit">Save Changes</button>
              <button type="button" className="danger-button" style={compactDanger} onClick={cancelEdit}>Cancel Edit</button>
            </>
          ) : (
            <button className="action-button" style={compactButton} disabled={saving} type="submit">Add</button>
          )}
        </div>
      </form>
      <div className="table-container quotes-table-wrap">
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap' }}>
          <div style={{ color:'#64748b' }}>Showing {filtered.length} of {list.length}</div>
          <input
            className="quotes-input"
            style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%' }}
            placeholder="Search customers (name or phone)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <table className="table quotes-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...tableCellStyle, minWidth: 180 }}>Name</th>
              <th style={tableCellStyle}>Phone</th>
              <th style={tableCellStyle}>Currency</th>
              <th style={tableCellStyle}>City</th>
              <th style={tableCellStyle}>Country</th>
              <th style={tableCellStyle}>TPIN</th>
              <th style={tableCellStyle}>Created</th>
              <th style={{ ...tableCellStyle, width: '5.5cm' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{ cursor:'pointer', background: selectedId === r.id ? 'rgba(21,101,192,0.06)' : undefined }}>
                <td style={{ ...tableCellStyle, minWidth: 180 }}>{r.name}</td>
                <td style={tableCellStyle}>{r.phone || '-'}</td>
                <td style={tableCellStyle}>{r.currency || 'K'}</td>
                <td style={tableCellStyle}>{r.city || '-'}</td>
                <td style={tableCellStyle}>{r.country || '-'}</td>
                <td style={tableCellStyle}>{r.tpin || '-'}</td>
                <td style={tableCellStyle}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ ...tableCellStyle, width: '5.5cm' }}>
                  <div className="quotes-table-actions">
                    <button className="action-button" style={compactButton} onClick={(e) => { e.stopPropagation(); startEditSelected(r.id); }}>Edit</button>
                    {canDelete && (
                      <button className="danger-button" style={compactDanger} onClick={(e) => { e.stopPropagation(); deleteSelected(r.id); }}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuoteProductsView({ onBackHome }) {
  const compactButton = { padding: '8px 12px', fontSize: 13, background: '#0f7fff', color: '#fff', border: '1px solid #0c6ed8', borderRadius: 6, minHeight: 32 };
  const compactDanger = { padding: '8px 12px', fontSize: 13, background: '#d64545', color: '#fff', border: '1px solid #b53434', borderRadius: 6, minHeight: 32 };
  const tableCellStyle = { border: '1px solid #c9d3df', padding: '8px 10px' };
  const canDelete = canDeleteQuotationData(readLocalUser());
  const [units, setUnits] = React.useState([]);
  const [products, setProducts] = React.useState([]);
  const [form, setForm] = React.useState({ name: '', description: '', price: '', currency: 'K', unit_id: '' });
  const [editingId, setEditingId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [tableSearch, setTableSearch] = React.useState('');
  const [unitName, setUnitName] = React.useState('');
  const [unitAbbr, setUnitAbbr] = React.useState('');
  const [descDialogOpen, setDescDialogOpen] = React.useState(false);
  const descriptionPreview = htmlToPlainPreview(form.description);

  React.useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const cachedUnits = cacheGet(QUOTE_UNIT_CATALOG_CACHE_KEY);
        const cachedProducts = cacheGet(QUOTE_PRODUCT_CATALOG_CACHE_KEY);
        const hasCachedProducts = Array.isArray(cachedProducts);
        if (Array.isArray(cachedUnits)) setUnits(cachedUnits);
        if (hasCachedProducts) setProducts(cachedProducts);
        setLoading(!hasCachedProducts);
      } catch {
        setLoading(true);
      }
      let u = [];
      try {
        u = await fetchQuotationRead('list-units');
      } catch {
        u = await fallbackListUnits();
      }
      if (!cancelled) {
        const nextUnits = u || [];
        setUnits(nextUnits);
        try { cacheSet(QUOTE_UNIT_CATALOG_CACHE_KEY, nextUnits, QUOTATION_CACHE_TTL_MS); } catch {}
      }
      await fetchProducts('', cancelled);
    }
    loadInitial();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { fetchProducts(tableSearch, cancelled); }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tableSearch]);

  async function fetchProducts(query, cancelled) {
    const s = String(query || '').trim();
    if (!cancelled) {
      if (!s) {
        try {
          const cachedProducts = cacheGet(QUOTE_PRODUCT_CATALOG_CACHE_KEY);
          if (Array.isArray(cachedProducts)) {
            setProducts(cachedProducts);
            setLoading(false);
          } else {
            setLoading(true);
          }
        } catch {
          setLoading(true);
        }
      } else {
        setLoading(true);
      }
    }
    try {
      let p = [];
      try {
        p = await fetchQuotationRead('list-products', { q: s, limit: '200' });
      } catch {
        p = await fallbackListProducts(s, 200);
      }
      if (!cancelled) {
        const nextProducts = p || [];
        setProducts(nextProducts);
        if (!s) {
          try { cacheSet(QUOTE_PRODUCT_CATALOG_CACHE_KEY, nextProducts, QUOTATION_CACHE_TTL_MS); } catch {}
        }
      }
    } finally { if (!cancelled) setLoading(false); }
  }

  const addUnit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!unitName.trim()) return;
    try {
      await fetchQuotationWrite('create-unit', { name: unitName.trim(), abbreviation: unitAbbr || null });
      setUnitName(''); setUnitAbbr('');
      let nextUnits = [];
      try {
        nextUnits = await fetchQuotationRead('list-units');
      } catch {
        nextUnits = await fallbackListUnits();
      }
      setUnits(nextUnits || []);
      try { cacheSet(QUOTE_UNIT_CATALOG_CACHE_KEY, nextUnits || [], QUOTATION_CACHE_TTL_MS); } catch {}
    } catch (e2) {
      alert('Add unit failed: ' + (e2.message || e2));
    }
  };

  const removeUnit = async (id) => {
    if (!window.confirm('Delete this unit?')) return;
    await db.from('quotation_units').delete().eq('id', id);
    const { data } = await db.from('quotation_units').select('*').order('name');
    setUnits(data || []);
  };

  const save = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.name) return;
    try {
      const payload = {
        name: form.name,
        price: Number(form.price || 0),
        unit_id: form.unit_id ? form.unit_id : null,
        description: form.description || null,
      };
      if (editingId) {
        await fetchQuotationWrite('update-product', { id: editingId, ...payload });
      } else {
        await fetchQuotationWrite('create-product', payload);
      }
      invalidateQuoteProductCatalogCache();
      setForm({ name: '', description: '', price: '', currency: 'K', unit_id: '' });
      setEditingId('');
      await fetchProducts(tableSearch);
    } catch (e2) {
      alert((editingId ? 'Update' : 'Save') + ' failed: ' + (e2.message || e2));
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || '',
      description: product.description || '',
      price: product.price == null ? '' : String(product.price),
      currency: 'K',
      unit_id: product.unit_id == null ? '' : String(product.unit_id),
    });
  };

  const cancelEdit = () => {
    setEditingId('');
    setForm({ name: '', description: '', price: '', currency: 'K', unit_id: '' });
  };

  const toggleActive = async (id, active) => {
    try {
      await fetchQuotationWrite('update-product', { id, active: !active });
      invalidateQuoteProductCatalogCache();
      await fetchProducts(tableSearch);
    } catch (e2) {
      alert('Update failed: ' + (e2.message || e2));
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete this quote product? This cannot be undone.')) return;
    try {
      const { error } = await db.from('quotation_products').delete().eq('id', id);
      if (error) throw error;
      invalidateQuoteProductCatalogCache();
      await fetchProducts(tableSearch);
    } catch (e) {
      alert('Delete failed. If this product is referenced by existing quotation items, deactivate it instead.\n\nDetails: ' + (e.message || e));
    }
  };

  const filteredProducts = products.filter(p => {
    const s = tableSearch.trim().toLowerCase();
    if (!s) return true;
    const unitName = units.find(u => u.id === p.unit_id)?.name || '';
    return (
      (p.name || '').toLowerCase().includes(s) ||
      (p.description || '').toLowerCase().includes(s) ||
      unitName.toLowerCase().includes(s)
    );
  });

  return (
    <div className="quotes-page quotes-products-page">
      <div className="quotes-header">
        <h2 className="quotes-title" style={{ margin: 0 }}>Quote Products</h2>
      </div>

      <div className="quotes-products-units-panel">
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <h4 style={{ margin: 0 }}>Manage Units</h4>
          <input className="quotes-input" placeholder="Unit name" value={unitName} onChange={e => setUnitName(e.target.value)} style={{ width: 180, maxWidth: '100%' }} />
          <input className="quotes-input" placeholder="Abbreviation (optional)" value={unitAbbr} onChange={e => setUnitAbbr(e.target.value)} style={{ width: 180, maxWidth: '100%' }} />
          <button className="action-button" type="button" style={compactButton} onClick={addUnit}>Add Unit</button>
        </div>
        <div className="table-container quotes-table-wrap" style={{ marginTop: 8 }}>
          <table className="table quotes-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...tableCellStyle, minWidth: 180 }}>Name</th>
                <th style={tableCellStyle}>Abbr</th>
                <th style={{ ...tableCellStyle, width: '5.5cm', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => (
                <tr key={u.id}>
                  <td style={{ ...tableCellStyle, minWidth: 180 }}>{u.name}</td>
                  <td style={tableCellStyle}>{normalizeUnitAbbreviation(u.abbreviation, u.name) || '-'}</td>
                  <td style={{ ...tableCellStyle, width: '5.5cm', textAlign: 'center' }}>
                    {canDelete && (
                      <button type="button" className="danger-button quotes-action-btn-5cm" style={compactDanger} onClick={() => removeUnit(u.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form className="quotes-products-form-row" onSubmit={save}>
        <input
          className="quotes-field-5cm"
          placeholder="Name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
        <button
          type="button"
          className={`quotes-field-5cm quotes-field-5cm--description${descriptionPreview ? '' : ' is-empty'}`}
          onClick={() => setDescDialogOpen(true)}
          aria-label="Edit description"
        >
          <span className="quotes-field-preview">
            {descriptionPreview || 'Description'}
          </span>
        </button>
        <input
          className="quotes-field-5cm"
          placeholder="Price"
          type="number"
          value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value })}
        />
        <div className="pos-currency-switch quotes-currency-switch" role="group" aria-label="Currency">
          <button
            type="button"
            className={form.currency === 'K' ? 'active' : ''}
            onClick={() => setForm({ ...form, currency: 'K' })}
            aria-pressed={form.currency === 'K'}
          >
            <span className="pos-currency-symbol">K</span>
          </button>
          <button
            type="button"
            className={form.currency === '$' ? 'active' : ''}
            onClick={() => setForm({ ...form, currency: '$' })}
            aria-pressed={form.currency === '$'}
          >
            <span className="pos-currency-symbol">$</span>
          </button>
        </div>
        <select
          className="quotes-field-5cm quotes-field-5cm--select"
          value={form.unit_id}
          onChange={e => setForm({ ...form, unit_id: e.target.value })}
        >
          <option value="">No Unit</option>
          {units.map(u => (
            <option key={u.id} value={u.id}>
              {u.name}{normalizeUnitAbbreviation(u.abbreviation, u.name) ? ` (${normalizeUnitAbbreviation(u.abbreviation, u.name)})` : ''}
            </option>
          ))}
        </select>
        <button className="action-button quotes-submit-5cm" style={compactButton} type="submit">
          {editingId ? 'Save Changes' : 'Add'}
        </button>
        {editingId ? (
          <button type="button" className="danger-button quotes-submit-5cm" style={compactDanger} onClick={cancelEdit}>
            Cancel Edit
          </button>
        ) : null}
      </form>

      <QuoteDescriptionDialog
        open={descDialogOpen}
        value={form.description}
        onClose={() => setDescDialogOpen(false)}
        onSave={(html) => {
          setForm((prev) => ({ ...prev, description: html }));
          setDescDialogOpen(false);
        }}
      />

      {(loading && products.length === 0) ? <div style={{ color: '#64748b', marginTop: 12 }}>Loading...</div> : (
        <div className="table-container quotes-table-wrap" style={{ marginTop: 12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 8, flexWrap:'wrap' }}>
            <div style={{ color:'#64748b' }}>Showing {filteredProducts.length} of {products.length}</div>
            <input
              className="quotes-input"
              style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%' }}
              placeholder="Filter table (name, unit, description)"
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
            />
          </div>
          <table className="table quotes-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={tableCellStyle}>Name</th>
                <th style={tableCellStyle}>Unit</th>
                <th style={{ ...tableCellStyle, textAlign: 'right' }}>Price</th>
                <th style={tableCellStyle}>Description</th>
                <th style={tableCellStyle}>Active</th>
                <th style={{ ...tableCellStyle, width: '5.5cm' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                  <tr key={p.id}>
                    <td style={tableCellStyle}>{p.name}</td>
                    <td style={tableCellStyle}>{(units.find(u => u.id === p.unit_id)?.name) || '-'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{Number(p.price || 0).toFixed(2)}</td>
                    <td style={tableCellStyle}>{htmlToPlainPreview(p.description) || '-'}</td>
                    <td style={tableCellStyle}>{p.active ? 'Yes' : 'No'}</td>
                    <td style={{ ...tableCellStyle, width: '5.5cm' }}>
                      <div className="quotes-table-actions">
                        <button type="button" className="action-button quotes-action-btn-5cm" style={compactButton} onClick={() => startEdit(p)}>
                          Edit
                        </button>
                        <button type="button" className="action-button quotes-action-btn-5cm" style={compactButton} onClick={() => toggleActive(p.id, p.active)}>
                          {p.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {canDelete && (
                          <button type="button" className="danger-button quotes-action-btn-5cm" style={compactDanger} onClick={() => deleteProduct(p.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

