// src/Dashboard.js

import React, { useState, useEffect, useCallback } from 'react';
import db from './dataClient';
import { useNavigate } from 'react-router-dom';
import { cacheClear } from './utils/staleCache';
import { getHomeDashboardPath, isPathAllowed, getUserDisplayName } from './accessControl';
import LaybyDashboardStats from './LaybyDashboardStats';
import {
  createdAtQueryLowerBound,
  rangeBoundsForDashboard,
  saleMatchesRange,
} from './utils/dashboardSaleRange';
import { isRealtimeEnabled } from './utils/realtimeConfig';

const DASHBOARD_REFRESH_MS = 90 * 1000;

const normalizeCurrencyCode = (raw) => {
  if (!raw) return 'K';
  const value = String(raw).trim().toUpperCase();
  if (['USD', 'US$', '$', 'US DOLLAR', 'DOLLAR'].includes(value)) return 'USD';
  return 'K';
};

const SALES_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('User');
  const [stats, setStats] = useState({
    productCost: { K: 0, USD: 0 },
    mostSoldProduct: { name: '—', qty: 0 },
  });
  const [salesRange, setSalesRange] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [salesTotals, setSalesTotals] = useState({ K: 0, USD: 0 });
  const [discountTotals, setDiscountTotals] = useState({ K: 0, USD: 0 });
  const [salesLoading, setSalesLoading] = useState(false);
  const [statsTick, setStatsTick] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const resolvedName = displayName || 'User';

  const bumpDashboardRefresh = useCallback(() => {
    setStatsTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
    else setUser(null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.pathname]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const computeMostSoldProduct = async () => {
      try {
        const { data: completedSales, error: salesErr } = await db
          .from('sales')
          .select('id')
          .eq('status', 'completed');
        if (salesErr) throw salesErr;
        const saleIds = (completedSales || []).map((sale) => sale?.id).filter((id) => id != null);
        if (!saleIds.length) return { name: '—', qty: 0 };

        const qtyByProduct = new Map();
        const qtyByName = new Map();
        const chunks = [];
        for (let i = 0; i < saleIds.length; i += 200) chunks.push(saleIds.slice(i, i + 200));

        for (const chunk of chunks) {
          const { data: items, error: itemErr } = await db
            .from('sales_items')
            .select('product_id, display_name, quantity')
            .in('sale_id', chunk);
          if (itemErr) throw itemErr;
          (items || []).forEach((item) => {
            const qty = Number(item?.quantity || 0);
            if (!Number.isFinite(qty) || qty <= 0) return;
            const productId = item?.product_id != null ? String(item.product_id) : '';
            const displayName = String(item?.display_name || '').trim();
            if (productId) {
              qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + qty);
            } else if (displayName) {
              qtyByName.set(displayName, (qtyByName.get(displayName) || 0) + qty);
            }
          });
        }

        let bestName = '—';
        let bestQty = 0;

        const productIds = Array.from(qtyByProduct.keys());
        const productNames = new Map();
        if (productIds.length) {
          for (let i = 0; i < productIds.length; i += 200) {
            const chunk = productIds.slice(i, i + 200);
            const { data: products, error: prodErr } = await db
              .from('products')
              .select('id, name')
              .in('id', chunk);
            if (prodErr) throw prodErr;
            (products || []).forEach((product) => {
              productNames.set(String(product.id), String(product.name || '').trim());
            });
          }
        }

        qtyByProduct.forEach((qty, productId) => {
          if (qty > bestQty) {
            bestQty = qty;
            bestName = productNames.get(productId) || 'Unnamed Product';
          }
        });

        qtyByName.forEach((qty, name) => {
          if (qty > bestQty) {
            bestQty = qty;
            bestName = name;
          }
        });

        return { name: bestName, qty: bestQty };
      } catch {
        return { name: '—', qty: 0 };
      }
    };

    // Total inventory cost = sum(quantity * product.cost_price) split by currency.
    const computeProductCost = async () => {
      const totals = { K: 0, USD: 0 };
      try {
        const { data: products, error: pErr } = await db
          .from('products')
          .select('id, cost_price, currency');
        if (pErr) throw pErr;
        const costById = new Map();
        (products || []).forEach(p => costById.set(String(p.id), {
          cost: Number(p.cost_price || 0),
          code: normalizeCurrencyCode(p.currency),
        }));
        const { data: inv, error: iErr } = await db
          .from('inventory')
          .select('product_id, quantity');
        if (iErr) throw iErr;
        (inv || []).forEach(row => {
          const meta = costById.get(String(row.product_id));
          if (!meta) return;
          const value = Number(row.quantity || 0) * meta.cost;
          if (!Number.isFinite(value) || value === 0) return;
          totals[meta.code] = (totals[meta.code] || 0) + value;
        });
      } catch {
        // leave zeros on failure
      }
      return totals;
    };

    (async () => {
      const [
        productCost,
        mostSoldProduct,
      ] = await Promise.all([
        computeProductCost(),
        computeMostSoldProduct(),
      ]);

      if (active) {
        setStats({
          productCost,
          mostSoldProduct,
        });
      }
    })();

    return () => { active = false; };
  }, [user, statsTick]);

  // Date-filtered total sales (separate effect so the range dropdown re-queries).
  const loadSalesTotals = useCallback(async (range, startDate, endDate) => {
    setSalesLoading(true);
    const totals = { K: 0, USD: 0 };
    const discounts = { K: 0, USD: 0 };
    try {
      const { startMs, endMs } = rangeBoundsForDashboard(range, startDate, endDate);
      let q = db
        .from('sales')
        .select('id, total_amount, discount, currency, sale_date, created_at, status')
        .eq('status', 'completed');
      const createdLower = createdAtQueryLowerBound(startMs);
      if (createdLower) q = q.gte('created_at', createdLower);
      if (range === 'custom' && endDate) {
        const e = new Date(`${endDate}T23:59:59.999`);
        if (!Number.isNaN(e.getTime())) q = q.lte('created_at', e.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      const completedSales = (data || []).filter((sale) => saleMatchesRange(sale, startMs, endMs));
      const usdSaleIds = completedSales
        .filter((sale) => normalizeCurrencyCode(sale?.currency) === 'USD')
        .map((sale) => sale?.id)
        .filter((id) => id != null);

      (completedSales || []).forEach((s) => {
        const code = normalizeCurrencyCode(s.currency);
        const discount = Number(s.discount || 0);
        if (Number.isFinite(discount) && discount > 0) {
          discounts[code] = (discounts[code] || 0) + discount;
        }
        if (code === 'USD') return;
        totals[code] = (totals[code] || 0) + Number(s.total_amount || 0);
      });

      if (usdSaleIds.length) {
        let usdPaid = 0;
        let usdPaymentDiscount = 0;
        for (let i = 0; i < usdSaleIds.length; i += 200) {
          const chunk = usdSaleIds.slice(i, i + 200);
          const { data: payRows, error: payErr } = await db
            .from('sales_payments')
            .select('sale_id, amount, discount_amount')
            .in('sale_id', chunk);
          if (payErr) throw payErr;
          for (const payment of (payRows || [])) {
            usdPaid += Number(payment?.amount || 0);
            usdPaymentDiscount += Number(payment?.discount_amount || 0);
          }
        }
        totals.USD = usdPaid;
        discounts.USD += usdPaymentDiscount;
      }
    } catch {
      // leave zeros on failure
    }
    setSalesTotals(totals);
    setDiscountTotals(discounts);
    setSalesLoading(false);
    setLastRefreshedAt(new Date());
  }, []);

  useEffect(() => {
    if (!user) return;
    if (salesRange === 'custom' && !customStart && !customEnd) return;
    loadSalesTotals(salesRange, customStart, customEnd);
  }, [user, salesRange, customStart, customEnd, loadSalesTotals, statsTick]);

  useEffect(() => {
    if (!user) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') bumpDashboardRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(bumpDashboardRefresh, DASHBOARD_REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [user, bumpDashboardRefresh]);

  useEffect(() => {
    if (!user || !isRealtimeEnabled()) return undefined;
    let timer = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(bumpDashboardRefresh, 400);
    };
    const channel = db
      .channel('dashboard-stats-rt')
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales' }, bump)
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales_payments' }, bump)
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales_items' }, bump)
      .on('firestore_changes', { event: '*', schema: 'public', table: 'inventory' }, bump)
      .on('firestore_changes', { event: '*', schema: 'public', table: 'products' }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      try { db.removeChannel(channel); } catch {}
    };
  }, [user, bumpDashboardRefresh]);

  useEffect(() => {
    if (!user) {
      setDisplayName('User');
      return;
    }
    setDisplayName(getUserDisplayName(user));
  }, [user, user?.id, user?.email, user?.full_name, user?.name]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    if (!isPathAllowed(user, '/dashboard')) {
      navigate(getHomeDashboardPath(user), { replace: true });
    }
  }, [user, navigate]);

  const handleLogout = async () => {
    setUser(null);
    try { sessionStorage.removeItem('bestrest:tabAuthed:v1'); } catch {}
    try { localStorage.removeItem('user'); } catch {}
    try { cacheClear('allsales:list:v3'); } catch {}
    try { cacheClear('dash:recentQuotes:v1'); } catch {}
    try { cacheClear('dash:recentConverted:v1'); } catch {}
    navigate('/login', { replace: true });
  };

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: 80, fontSize: 22 }}>Loading...</div>;
  }

  if (!user) return null;

  const fmtCount = (value) => (value === null || value === undefined ? '—' : value.toLocaleString());
  const fmtMoney = (code, value) => `${code === 'USD' ? '$' : 'K'} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="dashboard-container">
      <div className="dashboard-topbar">
        <div className="brand-mark">
          <span className="brand-icon" aria-hidden="true">
            <img className="brand-icon-logo" src="/bestrest-logo.png" alt="" />
          </span>
          <div>
            <div className="brand-title">Infinity Home POS</div>
            <div className="brand-subtitle">Inventory - Sales - Transfers</div>
          </div>
        </div>
      </div>

      <section className="dashboard-hero dashboard-hero-single">
        <div className="dashboard-hero-left">
          <div className="dashboard-hero-heading">
            <h1>Dashboard</h1>
            <button className="logout-btn dashboard-hero-logout" onClick={handleLogout}>Logout</button>
          </div>
          <p>One connected workspace for showroom and warehouse operations.</p>
          <div className="dashboard-meta">
            <div className="meta-card">
              <span className="meta-label">Signed in</span>
              <span className="meta-value">{resolvedName}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Today</span>
              <span className="meta-value">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <LaybyDashboardStats active={Boolean(user)} />

        <div className="dashboard-stats-group">
          <div className="dashboard-section-header">
            <h2>Sales</h2>
          </div>
          <div className="ent-stats-grid">
            <div className="ent-stat-card green">
              <div className="ent-stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>Total Sales</span>
                <select
                  value={salesRange}
                  onChange={e => setSalesRange(e.target.value)}
                  style={{ minHeight: 28, padding: '2px 6px', fontSize: '0.7rem', textTransform: 'none', letterSpacing: 0 }}
                  aria-label="Sales date range"
                >
                  {SALES_RANGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {salesRange === 'custom' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{ minHeight: 32, padding: '2px 6px', fontSize: '0.78rem', flex: '1 1 120px' }}
                    aria-label="Sales start date"
                  />
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{ minHeight: 32, padding: '2px 6px', fontSize: '0.78rem', flex: '1 1 120px' }}
                    aria-label="Sales end date"
                  />
                </div>
              )}
              <div className="ent-stat-value" style={{ fontSize: '1.3rem', opacity: salesLoading ? 0.5 : 1 }}>{fmtMoney('K', salesTotals.K)}</div>
              <div className="ent-stat-value" style={{ fontSize: '1.3rem', opacity: salesLoading ? 0.5 : 1 }}>{fmtMoney('USD', salesTotals.USD)}</div>
            </div>

            <div className="ent-stat-card">
              <div className="ent-stat-label">Total Discount</div>
              <div className="ent-stat-value" style={{ fontSize: '1.3rem', opacity: salesLoading ? 0.5 : 1 }}>{fmtMoney('K', discountTotals.K)}</div>
              <div className="ent-stat-value" style={{ fontSize: '1.3rem', opacity: salesLoading ? 0.5 : 1 }}>{fmtMoney('USD', discountTotals.USD)}</div>
            </div>

            <div className="ent-stat-card green">
              <div className="ent-stat-label">Most Sold Product</div>
              <div className="ent-stat-value" style={{ fontSize: '1rem', lineHeight: 1.25 }}>{stats.mostSoldProduct?.name || '—'}</div>
              <div className="ent-stat-value" style={{ fontSize: '0.95rem' }}>Qty {fmtCount(stats.mostSoldProduct?.qty || 0)}</div>
            </div>
          </div>
        </div>

        <div className="dashboard-stats-group">
          <div className="dashboard-section-header">
            <h2>Cost</h2>
          </div>
          <div className="ent-stats-grid">
            <div className="ent-stat-card">
              <div className="ent-stat-label">Total Product Cost</div>
              <div className="ent-stat-value" style={{ fontSize: '1.3rem' }}>{fmtMoney('K', stats.productCost.K)}</div>
              <div className="ent-stat-value" style={{ fontSize: '1.3rem' }}>{fmtMoney('USD', stats.productCost.USD)}</div>
            </div>
          </div>
        </div>

        <p style={{ marginTop: 18, color: 'var(--dash-muted, var(--ent-muted))' }}>
          Use the menu (top-left) to navigate between modules.
          {lastRefreshedAt ? (
            <span style={{ display: 'block', marginTop: 6, fontSize: '0.85rem' }}>
              Statistics updated {lastRefreshedAt.toLocaleTimeString()}.
            </span>
          ) : null}
        </p>
      </section>
    </div>
  );
}

export default Dashboard;
