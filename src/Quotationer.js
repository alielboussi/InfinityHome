import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import { openOrCreateQuotationPdf } from './QuotationerPdfService';
import generateQuotePdf from './quotespdf';
import { FaTrashAlt } from 'react-icons/fa';
import { cacheGet, cacheSet, cacheClear } from './utils/staleCache';
import { isPathAllowed, canDeleteQuotationData, canEditQuotation, isQuotationConverted, isQuotationerOnlyExperience, getUserDisplayName, isHassanAwadUser, canManageCatalog } from './accessControl';
import {
  fetchQuoteProductionRouting,
  saveQuoteProductionRoute,
  sendQuoteToWarehouseProduction,
} from './services/quoteProductionApi';
import LaybyDashboardStats from './LaybyDashboardStats';
import { logUserActivity } from './utils/userActivityLog';
import { notifyLaybyWhatsApp } from './services/whatsappNotify';
import { enrichQuotationListTotals } from './services/quotationListTotals';
import { apiUrl, withApiHeaders } from './utils/apiUrl';
import {
  applyQuotationTotalsFromItems,
  computeQuotationDisplayTotal,
  computeQuotationTotals,
  normalizeQuotationItemRow,
  resolveQuoteLineQuantity,
  quotationHasOutstandingDue,
  resolveQuoteCustomerForSelect,
  sortQuotationRows,
  sumPaymentRows,
} from './utils/quotationDisplay';
import {
  CARPENTRY_ACCESSORY_GROUPS,
  CARPENTRY_WOOD_OPTIONS,
  normalizeQuoteItemAccessories,
} from './utils/quoteProductionItemFields';

function htmlToPlainPreview(html) {
  if (!html) return '';
  if (typeof document === 'undefined') return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
}

const NAV_BUTTON_STYLE = { padding: '8px 12px', fontSize: 13, background: '#0f7fff', color: '#fff', border: '1px solid #0c6ed8', borderRadius: 6, minHeight: 32 };
const QUOTATION_LIST_CACHE_KEY = 'quotationer:list:v6';
const QUOTATION_LIST_CUSTOMER_MAP_CACHE_KEY = 'quotationer:list:customer-map:v2';
const QUOTE_CUSTOMER_CATALOG_CACHE_KEY = 'quotationer:quote-customers:v1';
const QUOTE_PRODUCT_CATALOG_CACHE_KEY = 'quotationer:quote-products:v1';
const QUOTE_UNIT_CATALOG_CACHE_KEY = 'quotationer:quote-units:v1';
const QUOTATION_CACHE_TTL_MS = 10 * 60 * 1000;
const CANONICAL_APP_ORIGIN = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');

async function uploadQuoteProductionDrawing(quoteId, file) {
  const safeName = String(file.name || 'drawing.jpg').replace(/[^\w.-]+/g, '_');
  const path = `production-drawings/${quoteId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage.from('Quotations').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (upErr) throw new Error(upErr.message || 'Drawing upload failed');
  const { data: pub } = db.storage.from('Quotations').getPublicUrl(path);
  return pub?.publicUrl || null;
}

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
    apiUrl(relQuotationRead),
    apiUrl(relAdminRead),
    canonicalQuotationRead,
  ];

  let lastError = null;
  for (const url of attempts) {
    const resp = await fetch(url, headers ? { headers: withApiHeaders(headers) } : undefined);
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

  const attempts = [apiUrl(relQuotationRead), apiUrl(relAdminRead), canonicalQuotationRead];
  let lastError = null;
  for (const url of attempts) {
    const resp = await fetch(url, headers ? { headers: withApiHeaders(headers) } : undefined);
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
  const bypass = String(process.env.REACT_APP_VERCEL_BYPASS || '').trim();
  if (bypass) authHeaders['x-vercel-protection-bypass'] = bypass;

  const attempts = [
    apiUrl('/api/quotation-save'),
    apiUrl('/api/admin?adminAction=quotation-save'),
    `${CANONICAL_APP_ORIGIN}/api/quotation-save`,
  ];

  let lastError = null;
  for (const url of attempts) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: withApiHeaders({
          'Content-Type': 'application/json',
          ...authHeaders,
        }),
        body: JSON.stringify({
          ...(action ? { action } : {}),
          ...payload,
        }),
      });
      const out = await resp.json().catch(() => ({}));
      if (resp.ok && out?.ok) return out;
      lastError = out?.error || `quotation-write failed (${resp.status})`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
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
  const isQuotationerOnly = isQuotationerOnlyExperience(localUser, location.pathname);
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
          let nextQuotes = sortQuotationRows(data || []);
          try {
            nextQuotes = await enrichQuotationListTotals(nextQuotes);
          } catch (enrichErr) {
            console.warn('Quote list total enrichment failed:', enrichErr?.message || enrichErr);
          }
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
  const [productionRoute, setProductionRoute] = React.useState('');
  const [productionRoutingLocked, setProductionRoutingLocked] = React.useState(false);
  const [productionSendBusy, setProductionSendBusy] = React.useState(false);
  const [productionDrawingUrl, setProductionDrawingUrl] = React.useState('');
  const [productionDrawingPendingFile, setProductionDrawingPendingFile] = React.useState(null);
  const [productionDrawingUploadBusy, setProductionDrawingUploadBusy] = React.useState(false);
  const [openAccessoryLineId, setOpenAccessoryLineId] = React.useState('');
  const [accessorySearchByLine, setAccessorySearchByLine] = React.useState({});
  const productionDrawingInputRef = React.useRef(null);
  const isIpadProLayout = useIpadProLayout();
  const quoteUser = React.useMemo(() => readLocalUser(), []);
  const canManageProductionRouting = React.useMemo(
    () => isHassanAwadUser(quoteUser) || canManageCatalog(quoteUser),
    [quoteUser],
  );

  const normalizeDescription = (text) => {
    const plain = htmlToPlainPreview(text);
    const parts = String(plain || '')
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
    setProductionRoute('');
    setProductionRoutingLocked(false);
    setProductionDrawingUrl('');
    setProductionDrawingPendingFile(null);
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
            const normalizedLines = (lines || []).map(normalizeQuotationItemRow);
            const loadedQuote = applyQuotationTotalsFromItems(resolved.header || hdr, normalizedLines);
            setQuote(loadedQuote);
            setCurrentQuoteId(loadedQuote.id || quoteId || '');
            setVatChoice(loadedQuote.vat_apply ? 'vat16' : 'exclusive');
            if (!cancelled) setItems(normalizedLines);
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
      }
    }
    load();
    return () => { cancelled = true; };
  }, [quoteId, resetToNewQuote]);

  React.useEffect(() => {
    if (!canManageProductionRouting || !currentQuoteId) {
      setProductionRoute('');
      setProductionRoutingLocked(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const routing = await fetchQuoteProductionRouting(currentQuoteId);
        if (cancelled) return;
        setProductionRoute(routing?.route || '');
        setProductionRoutingLocked(Boolean(routing?.sent_to_production_at));
        setProductionDrawingUrl(routing?.metadata?.drawing_url || '');
      } catch {
        if (!cancelled) {
          setProductionRoute('');
          setProductionRoutingLocked(false);
          setProductionDrawingUrl('');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [canManageProductionRouting, currentQuoteId]);

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

  const productionRouteRequired = canManageProductionRouting && !locked && !productionRoutingLocked;
  const productionRouteMissing = productionRouteRequired && !productionRoute;

  const addItemFromQuoteProduct = (qp) => {
    if (locked) return;
    if (productionRouteMissing) {
      alert('Select Upholstery or Carpentry before adding products.');
      return;
    }
    setItems(prev => [...prev, {
      id: 'local-' + Math.random().toString(36).slice(2),
      quote_product_id: qp.id,
      name: qp.name,
      description: normalizeDescription(qp.description),
      unit_id: qp.unit_id,
      quantity: 1,
      unit_price: Number(qp.price || 0),
      image_url: qp.image_url,
      qr_code_url: qp.qr_code_url,
    }]);
    setAddSearch('');
  };

  const updateItem = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  const addAccessoryToItem = (lineId, accName) => {
    if (locked) return;
    const clean = String(accName || '').trim();
    if (!clean) return;
    setItems(prev => prev.map(it => {
      if (it.id !== lineId) return it;
      const current = normalizeQuoteItemAccessories(it.accessories);
      if (current.some(a => a.toLowerCase() === clean.toLowerCase())) return it;
      return { ...it, accessories: [...current, clean] };
    }));
  };
  const removeAccessoryFromItem = (lineId, accName) => {
    if (locked) return;
    const clean = String(accName || '').trim().toLowerCase();
    setItems(prev => prev.map(it => {
      if (it.id !== lineId) return it;
      const current = normalizeQuoteItemAccessories(it.accessories);
      return { ...it, accessories: current.filter(a => a.toLowerCase() !== clean) };
    }));
  };
  const removeItem = (id) => {
    if (locked) return;
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const onProductionDrawingSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      alert('Please choose an image file (JPEG, PNG, etc.).');
      return;
    }
    if (!productionRoute) {
      alert('Choose Upholstery or Carpentry before attaching a drawing.');
      return;
    }
    if (productionRoutingLocked) return;
    if (!currentQuoteId) {
      setProductionDrawingPendingFile(file);
      return;
    }
    setProductionDrawingUploadBusy(true);
    try {
      const url = await uploadQuoteProductionDrawing(currentQuoteId, file);
      await saveQuoteProductionRoute(currentQuoteId, productionRoute, { drawing_url: url });
      setProductionDrawingUrl(url);
      setProductionDrawingPendingFile(null);
    } catch (err) {
      alert(err?.message || 'Drawing upload failed.');
    } finally {
      setProductionDrawingUploadBusy(false);
    }
  };
  const getNormalizedItems = () => items.map(it => ({
    ...it,
    name: it.name || '',
    description: normalizeDescription(it.description || ''),
    quantity: resolveQuoteLineQuantity(it.quantity, it.unit_price),
    unit_id: it.unit_id ? Number(it.unit_id) : null,
    unit_price: it.unit_price === '' ? 0 : Number(it.unit_price || 0),
  }));

  const computeTotals = () => {
    const effectiveItems = getNormalizedItems();
    const subtotal = effectiveItems.reduce((s, it) => (
      s + resolveQuoteLineQuantity(it.quantity, it.unit_price) * Number(it.unit_price || 0)
    ), 0);
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
    if (canManageProductionRouting && !productionRoute) {
      alert('Choose Carpentry or Upholstery before saving this quote.');
      return;
    }
    if (locked) return;
    setSaving(true);
    try {
      const payload = { id: currentQuoteId || undefined, quote, items: getNormalizedItems(), vatChoice };
      const out = await fetchQuotationWrite(null, payload);
      const createdQuoteId = out.id;
      if (!createdQuoteId) throw new Error('Quote saved but no id returned');
      if (createdQuoteId && !currentQuoteId) setCurrentQuoteId(createdQuoteId);

      if (canManageProductionRouting && productionRoute) {
        try {
          await saveQuoteProductionRoute(createdQuoteId, productionRoute);
          if (productionDrawingPendingFile) {
            const drawingUrl = await uploadQuoteProductionDrawing(createdQuoteId, productionDrawingPendingFile);
            await saveQuoteProductionRoute(createdQuoteId, productionRoute, { drawing_url: drawingUrl });
            setProductionDrawingUrl(drawingUrl);
            setProductionDrawingPendingFile(null);
          }
        } catch (routeErr) {
          console.warn('Production route save failed:', routeErr?.message || routeErr);
        }
      }

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
        if (freshItems) setItems(freshItems.map(normalizeQuotationItemRow));

        const quoteForPdf = freshQuote || { ...quote, id: createdQuoteId, quote_number: out?.quote?.quote_number }; // fallback to current quote state
        const normalizedLocalItems = getNormalizedItems();
        const itemsForPdf = freshItems
          ? freshItems.map((row, idx) => ({
              ...(normalizedLocalItems[idx] || {}),
              ...normalizeQuotationItemRow(row),
            }))
          : normalizedLocalItems;

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
      if (isQuotationerOnlyExperience(quoteUser, location.pathname || '/quotationer')) {
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
        {canManageProductionRouting ? (
          <div
            className={`quotes-production-panel quotes-production-panel--top${productionRouteMissing ? ' quotes-production-panel--missing' : ''}`}
          >
            <div className="quotes-production-heading">
              Workshop route <span className="quotes-production-required">Required</span>
            </div>
            <p className="quotes-production-lead">
              Select Upholstery or Carpentry before adding lines or saving this quote.
            </p>
            <div className="quotes-production-route" role="group" aria-label="Production route">
              <button
                type="button"
                className={`quotes-production-route-btn${productionRoute === 'upholstery' ? ' active' : ''}`}
                disabled={locked || productionRoutingLocked}
                onClick={() => setProductionRoute('upholstery')}
                aria-pressed={productionRoute === 'upholstery'}
              >
                Upholstery
              </button>
              <button
                type="button"
                className={`quotes-production-route-btn${productionRoute === 'carpentry' ? ' active' : ''}`}
                disabled={locked || productionRoutingLocked}
                onClick={() => setProductionRoute('carpentry')}
                aria-pressed={productionRoute === 'carpentry'}
              >
                Carpentry
              </button>
            </div>
            {productionRouteMissing ? (
              <p className="quotes-production-hint" role="status">
                Choose a workshop to continue.
              </p>
            ) : null}
            {!productionRoutingLocked && productionRoute ? (
              <div className="quotes-production-drawing">
                <div className="quotes-production-drawing-label">Production drawing (optional)</div>
                <div className="quotes-production-drawing-actions">
                  <input
                    ref={productionDrawingInputRef}
                    type="file"
                    accept="image/*"
                    className="quotes-production-drawing-input"
                    disabled={locked || productionDrawingUploadBusy}
                    onChange={onProductionDrawingSelected}
                  />
                  <button
                    type="button"
                    className="action-button quotes-production-drawing-btn"
                    style={compactButton}
                    disabled={locked || productionDrawingUploadBusy}
                    onClick={() => productionDrawingInputRef.current?.click()}
                  >
                    {productionDrawingUploadBusy ? 'Uploading…' : 'Attach drawing'}
                  </button>
                  {productionDrawingUrl ? (
                    <a
                      className="quotes-production-drawing-link"
                      href={productionDrawingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View attached drawing
                    </a>
                  ) : productionDrawingPendingFile ? (
                    <span className="quotes-production-drawing-pending">
                      {productionDrawingPendingFile.name} — saves with quote
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {productionRoutingLocked ? (
              <p className="quotes-production-locked-note">
                Already sent to production — route is locked.
                {productionDrawingUrl ? (
                  <>
                    {' '}
                    <a href={productionDrawingUrl} target="_blank" rel="noopener noreferrer">View drawing</a>
                  </>
                ) : null}
              </p>
            ) : null}
            {currentQuoteId && productionRoute && !productionRoutingLocked ? (
              <button
                type="button"
                className="action-button quotes-production-send-btn"
                style={compactButton}
                disabled={productionSendBusy || locked}
                onClick={async () => {
                  setProductionSendBusy(true);
                  try {
                    await sendQuoteToWarehouseProduction(currentQuoteId);
                    setProductionRoutingLocked(true);
                    alert('Quote sent to warehouse for production.');
                  } catch (err) {
                    alert(err?.message || 'Send to production failed.');
                  } finally {
                    setProductionSendBusy(false);
                  }
                }}
              >
                {productionSendBusy ? 'Sending…' : 'Send to warehouse for production'}
              </button>
            ) : null}
          </div>
        ) : null}

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
              placeholder={productionRouteMissing ? 'Select Upholstery or Carpentry first' : 'Search products to add (name/description)'}
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              aria-label="Search products to add"
              disabled={locked || productionRouteMissing}
              style={{ width: '100%', maxWidth: 480, opacity: productionRouteMissing ? 0.65 : 1 }}
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
                      <button className="action-button" style={compactButton} disabled={locked || productionRouteMissing} onClick={() => addItemFromQuoteProduct(p)}>Add</button>
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
            <table className="table quotes-table quotes-table--create-lines" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: tableLayoutMode, minWidth: isIpadProLayout ? 900 : undefined }}>
              <thead>
                <tr>
                  <th style={{ ...tableCellStyle, width: '44%' }}>Item &amp; description</th>
                  <th style={{ ...tableCellStyle, width: '13%', textAlign: 'center' }}>Qty / unit</th>
                  <th style={{ ...tableCellStyle, width: '16%', textAlign: 'center' }}>Price</th>
                  <th style={{ ...tableCellStyle, width: '11%', textAlign: 'right' }}>Amount</th>
                  <th style={{ ...tableCellStyle, width: '8%', textAlign: 'center' }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const currencyLabel = quote.currency || 'K';
                  const qtyValue = it.quantity === '' ? '' : it.quantity;
                  const unitPriceValue = it.unit_price === '' || it.unit_price == null ? '' : it.unit_price;
                  const lineTotal = (
                    resolveQuoteLineQuantity(it.quantity, it.unit_price) * Number(it.unit_price || 0)
                  ).toFixed(2);
                  const showUpholsteryMeta = canManageProductionRouting && productionRoute === 'upholstery';
                  const showCarpentryMeta = canManageProductionRouting && productionRoute === 'carpentry';
                  return (
                    <tr key={it.id} className="quotes-line-row">
                      <td style={{ ...tableCellStyle, width: '44%' }} className="quotes-line-item-cell">
                        <div className="quotes-line-cell">
                          <input
                            className="quotes-input quotes-input--slim quotes-line-name"
                            value={it.name || ''}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { name: e.target.value })}
                            placeholder="Item name"
                          />
                          <textarea
                            className="quotes-textarea quotes-textarea--slim quotes-line-desc"
                            rows={2}
                            value={it.description || ''}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { description: normalizeDescription(e.target.value) })}
                            placeholder="Description"
                          />
                          {showUpholsteryMeta ? (
                            <div className="quotes-line-meta-grid quotes-line-meta-grid--one">
                              <label className="quotes-line-meta-field">
                                <span className="quotes-line-meta-label">Leather</span>
                                <input
                                  className="quotes-input quotes-input--slim"
                                  value={it.leather_code || ''}
                                  disabled={locked}
                                  onChange={e => updateItem(it.id, { leather_code: e.target.value })}
                                  placeholder="Optional"
                                  aria-label="Leather code optional"
                                />
                              </label>
                            </div>
                          ) : null}
                          {showCarpentryMeta ? (
                            <>
                              <div className="quotes-line-meta-grid quotes-line-meta-grid--carpentry">
                                <label className="quotes-line-meta-field">
                                  <span className="quotes-line-meta-label">L (cm)</span>
                                  <input
                                    className="quotes-input quotes-input--slim quotes-line-meta-control"
                                    type="text"
                                    inputMode="decimal"
                                    value={it.dim_l_cm || ''}
                                    disabled={locked}
                                    onChange={e => updateItem(it.id, { dim_l_cm: e.target.value, dimensions_lwh: '' })}
                                    placeholder="L"
                                    aria-label="Length cm optional"
                                  />
                                </label>
                                <label className="quotes-line-meta-field">
                                  <span className="quotes-line-meta-label">W (cm)</span>
                                  <input
                                    className="quotes-input quotes-input--slim quotes-line-meta-control"
                                    type="text"
                                    inputMode="decimal"
                                    value={it.dim_w_cm || ''}
                                    disabled={locked}
                                    onChange={e => updateItem(it.id, { dim_w_cm: e.target.value, dimensions_lwh: '' })}
                                    placeholder="W"
                                    aria-label="Width cm optional"
                                  />
                                </label>
                                <label className="quotes-line-meta-field">
                                  <span className="quotes-line-meta-label">H (cm)</span>
                                  <input
                                    className="quotes-input quotes-input--slim quotes-line-meta-control"
                                    type="text"
                                    inputMode="decimal"
                                    value={it.dim_h_cm || ''}
                                    disabled={locked}
                                    onChange={e => updateItem(it.id, { dim_h_cm: e.target.value, dimensions_lwh: '' })}
                                    placeholder="H"
                                    aria-label="Height cm optional"
                                  />
                                </label>
                                <label className="quotes-line-meta-field">
                                  <span className="quotes-line-meta-label">Color</span>
                                  <input
                                    className="quotes-input quotes-input--slim quotes-line-meta-control"
                                    value={it.color_code || ''}
                                    disabled={locked}
                                    onChange={e => updateItem(it.id, { color_code: e.target.value })}
                                    placeholder="RAL 9010"
                                    aria-label="Color code optional"
                                  />
                                </label>
                                <label className="quotes-line-meta-field">
                                  <span className="quotes-line-meta-label">Wood</span>
                                  <select
                                    className="quotes-select quotes-select--slim quotes-line-meta-control"
                                    value={it.wood || ''}
                                    disabled={locked}
                                    onChange={e => updateItem(it.id, { wood: e.target.value })}
                                    aria-label="Wood type optional"
                                  >
                                    <option value="">—</option>
                                    {CARPENTRY_WOOD_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="quotes-line-accessories-block">
                                <div className="quotes-line-accessories-head">
                                  <span className="quotes-line-meta-label">Accessories</span>
                                  <button
                                    type="button"
                                    className={`quotes-accessories-toggle-btn${openAccessoryLineId === it.id ? ' active' : ''}`}
                                    disabled={locked}
                                    onClick={() => setOpenAccessoryLineId(prev => prev === it.id ? '' : it.id)}
                                  >
                                    {openAccessoryLineId === it.id
                                      ? 'Hide Accessories ▲'
                                      : `Select Accessories (${normalizeQuoteItemAccessories(it.accessories).length}) ▼`}
                                  </button>
                                </div>
                                {normalizeQuoteItemAccessories(it.accessories).length > 0 ? (
                                  <div className="quotes-accessories-chips">
                                    {normalizeQuoteItemAccessories(it.accessories).map((acc) => (
                                      <span key={acc} className="quotes-accessory-chip">
                                        <span>{acc}</span>
                                        {!locked ? (
                                          <button
                                            type="button"
                                            className="quotes-accessory-chip-remove"
                                            onClick={() => removeAccessoryFromItem(it.id, acc)}
                                            aria-label={`Remove ${acc}`}
                                            title={`Remove ${acc}`}
                                          >
                                            ×
                                          </button>
                                        ) : null}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {openAccessoryLineId === it.id && !locked ? (
                                  <div className="quotes-accessories-dropdown-panel">
                                    <input
                                      type="text"
                                      className="quotes-input quotes-input--slim quotes-accessories-search"
                                      placeholder="Search accessories (e.g. Granite, Sink, Mixer, Lock, LED)…"
                                      value={accessorySearchByLine[it.id] || ''}
                                      onChange={(e) => setAccessorySearchByLine(prev => ({ ...prev, [it.id]: e.target.value }))}
                                    />
                                    <div className="quotes-accessories-groups">
                                      {CARPENTRY_ACCESSORY_GROUPS.map((group) => {
                                        const q = String(accessorySearchByLine[it.id] || '').trim().toLowerCase();
                                        const selectedSet = new Set(
                                          normalizeQuoteItemAccessories(it.accessories).map(a => a.toLowerCase()),
                                        );
                                        const visibleItems = group.items.filter((item) =>
                                          !q
                                          || item.toLowerCase().includes(q)
                                          || group.category.toLowerCase().includes(q),
                                        );
                                        if (!visibleItems.length) return null;
                                        return (
                                          <div key={group.category} className="quotes-accessories-group">
                                            <div className="quotes-accessories-group-title">{group.category}</div>
                                            <div className="quotes-accessories-group-list">
                                              {visibleItems.map((acc) => {
                                                const isAdded = selectedSet.has(acc.toLowerCase());
                                                return (
                                                  <div
                                                    key={acc}
                                                    className={`quotes-accessory-option${isAdded ? ' is-added' : ''}`}
                                                  >
                                                    <span className="quotes-accessory-option-name">{acc}</span>
                                                    <button
                                                      type="button"
                                                      className={`quotes-accessory-add-btn${isAdded ? ' added' : ''}`}
                                                      onClick={() => (
                                                        isAdded
                                                          ? removeAccessoryFromItem(it.id, acc)
                                                          : addAccessoryToItem(it.id, acc)
                                                      )}
                                                      title={isAdded ? `Remove ${acc}` : `Include ${acc}`}
                                                      aria-label={isAdded ? `Remove ${acc}` : `Include ${acc}`}
                                                    >
                                                      {isAdded ? '✓' : '+'}
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, width: '13%', textAlign: 'center' }} className="quotes-line-qty-cell">
                        <div className="quotes-line-qty-row">
                          <input
                            className="quotes-input quotes-input--slim quotes-line-qty"
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*"
                            value={qtyValue}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { quantity: e.target.value })}
                            onWheel={e => e.preventDefault()}
                            onWheelCapture={e => e.preventDefault()}
                            placeholder="Qty"
                            aria-label="Quantity"
                          />
                          <select
                            className="quotes-select quotes-select--slim quotes-line-unit"
                            value={it.unit_id || ''}
                            disabled={locked}
                            onChange={e => updateItem(it.id, { unit_id: e.target.value })}
                            aria-label="Unit"
                          >
                            <option value="">Unit</option>
                            {units.map(u => (
                              <option key={u.id} value={u.id}>{normalizeUnitAbbreviation(u.abbreviation, u.name)}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'center', width: '16%' }} className="quotes-line-price-cell">
                        {!locked ? (
                          <div className="quotes-line-price-wrap">
                            <span className="quotes-line-price-prefix">{currencyLabel}</span>
                            <input
                              className="quotes-input quotes-input--slim price-inline-input quotes-line-price"
                              type="number"
                              value={unitPriceValue}
                              disabled={locked}
                              onChange={e => updateItem(it.id, { unit_price: e.target.value })}
                              onWheelCapture={e => e.preventDefault()}
                              placeholder="0.00"
                              aria-label="Unit price"
                            />
                          </div>
                        ) : (
                          <div className="quotes-line-amount-readonly">
                            <span className="quotes-line-price-prefix">{currencyLabel}</span>
                            <span>{unitPriceValue === '' ? '0.00' : Number(unitPriceValue || 0).toFixed(2)}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', width: '11%' }}>
                        <div className="quotes-line-amount-readonly quotes-line-amount-total">
                          <span className="quotes-line-price-prefix">{currencyLabel}</span>
                          <span>{lineTotal}</span>
                        </div>
                      </td>
                      <td style={{ ...tableCellStyle, width: '8%', textAlign: 'center' }}>
                        {!locked ? (
                          <button
                            type="button"
                            className="danger-button quotes-line-delete"
                            disabled={locked}
                            onClick={() => removeItem(it.id)}
                            title="Remove line"
                            aria-label="Remove line"
                          >
                            <FaTrashAlt size={12} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="quotes-totals-bar" role="status" aria-live="polite">
            <div className="quotes-totals-bar-inner">
              <span><span className="quotes-totals-label">Subtotal</span> {subtotal.toFixed(2)}</span>
              <span className="quotes-totals-sep" aria-hidden="true" />
              <span><span className="quotes-totals-label">Discount</span> {discount.toFixed(2)}</span>
              <span className="quotes-totals-sep" aria-hidden="true" />
              <span>
                <span className="quotes-totals-label">VAT</span> {vatAmount.toFixed(2)}
                {vatChoice === 'vat16' ? '' : ' (excl.)'}
              </span>
              <span className="quotes-totals-sep" aria-hidden="true" />
              <span className="quotes-totals-total">
                <span className="quotes-totals-label">Total</span> {total.toFixed(2)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap:'wrap' }}>
            {!locked && (
              <button
                className="action-button"
                style={{ ...compactButton, minWidth: 140 }}
                disabled={saving || productionRouteMissing}
                title={productionRouteMissing ? 'Select Upholstery or Carpentry first' : undefined}
                onClick={saveQuote}
              >
                {isEditing ? 'Update Quote' : 'Create Quote'}
              </button>
            )}
          </div>
    </div>
  );
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
      const { data, error } = await db
        .from('quote_customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (dbErr) {
      err = dbErr;
      try {
        rows = await fetchQuotationRead('list-customers');
      } catch (readErr) {
        err = readErr;
      }
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

