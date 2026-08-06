import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCustomerPrivateBalancesDashboard,
  formatBalances,
  formatMoney,
} from './services/customerPrivateBalances';
import { getCurrentUser } from './accessControl';
import { displayNameForEmail } from './utils/customerPrivateDisplayName';

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function MoneyRow({ totals }) {
  return (
    <div className="cpb-money-row">
      <span>{formatMoney(totals?.K || 0, 'K')}</span>
      <span className="cpb-money-divider" />
      <span>{formatMoney(totals?.$ || 0, '$')}</span>
    </div>
  );
}

function StatTile({ label, value, tone = 'default' }) {
  return (
    <div className={`cpb-stat cpb-stat--${tone}`}>
      <div className="cpb-stat-label">{label}</div>
      <div className="cpb-stat-value">{value}</div>
    </div>
  );
}

export default function CustomerPrivateBalances() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const displayName = displayNameForEmail(user?.email);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchCustomerPrivateBalancesDashboard();
      setData(next);
    } catch (err) {
      setError(err?.message || 'Failed to load customer private balances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="report-page cpb-page">
        <div className="report-blank">Loading customer private balances…</div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const outstanding = stats.totalOutstandingByCurrency || { K: 0, $: 0 };

  return (
    <div className="report-page cpb-page">
      <style>{`
        .cpb-page { max-width: 1100px; margin: 0 auto; padding: 16px 16px 32px; }
        .cpb-hero { background: linear-gradient(135deg, #1565c0, #0d47a1); color: #fff; border-radius: 16px; padding: 20px 22px; margin-bottom: 16px; }
        .cpb-hero-kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
        .cpb-hero-title { font-size: 28px; font-weight: 800; margin-top: 6px; }
        .cpb-hero-sub { margin-top: 6px; opacity: 0.9; font-size: 14px; }
        .cpb-stats-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; }
        .cpb-stat { flex: 1; min-width: 150px; background: #fff; border: 1px solid #d5dbe2; border-radius: 14px; padding: 16px; }
        .cpb-stat--warning { background: #fff3e0; border-color: #ffe0b2; }
        .cpb-stat--danger { background: #ffebee; border-color: #ffcdd2; }
        .cpb-stat--accent { background: #e8f0fb; border-color: #bfd3ef; }
        .cpb-stat-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #5b6675; }
        .cpb-stat-value { font-size: 24px; font-weight: 800; margin-top: 6px; color: #1f2733; }
        .cpb-card { background: #fff; border: 1px solid #d5dbe2; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
        .cpb-card-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #5b6675; margin-bottom: 10px; }
        .cpb-money-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 24px; font-weight: 800; color: #1565c0; }
        .cpb-money-divider { width: 1px; height: 22px; background: #bfd3ef; }
        .cpb-customer-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid #e8edf2; }
        .cpb-customer-row:first-child { border-top: none; padding-top: 0; }
        .cpb-customer-name { font-size: 16px; font-weight: 700; color: #1f2733; }
        .cpb-customer-meta { font-size: 13px; color: #5b6675; margin-top: 4px; }
        .cpb-badge { display: inline-block; margin-top: 6px; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .cpb-badge--danger { background: #ffebee; color: #c62828; }
        .cpb-badge--warning { background: #fff3e0; color: #ef6c00; }
        .cpb-note { margin-top: 12px; font-size: 13px; color: #5b6675; }
      `}</style>

      <div className="cpb-hero">
        <div className="cpb-hero-kicker">Customer Ledger Tracking</div>
        <div className="cpb-hero-title">Customer Private Balances</div>
        <div className="cpb-hero-sub">Welcome, {displayName}</div>
      </div>

      {error ? <div className="report-error" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div className="cpb-stats-row">
        <StatTile label="Pending customers" value={String(stats.pendingCount || 0)} tone="warning" />
        <StatTile label="Overdue customers" value={String(stats.overdueCount || 0)} tone="danger" />
        <div className="cpb-stat cpb-stat--accent" style={{ minWidth: 220 }}>
          <div className="cpb-stat-label">Outstanding</div>
          <div style={{ marginTop: 8 }}>
            <MoneyRow totals={outstanding} />
          </div>
        </div>
      </div>

      <div className="cpb-card">
        <div className="cpb-card-title">Total outstanding</div>
        <MoneyRow totals={outstanding} />
        <div className="cpb-note">Balances are tracked separately in Kwacha (K) and US Dollars ($).</div>
      </div>

      {data?.monthlyReport?.due ? (
        <div className="cpb-card" style={{ background: '#e8f0fb', borderColor: '#bfd3ef' }}>
          <div className="cpb-card-title" style={{ color: '#1565c0' }}>Monthly dues report</div>
          <div className="cpb-customer-meta">Generated {formatDateTime(data.monthlyReport.generatedAt)}</div>
          <div style={{ margin: '12px 0' }}>
            <MoneyRow totals={data.monthlyReport.totalOutstandingByCurrency} />
          </div>
          {data.monthlyReport.rows.map((row) => (
            <div key={row.id} className="cpb-customer-row">
              <div>
                <div className="cpb-customer-name">{row.name}</div>
                <div className="cpb-customer-meta">
                  {formatBalances(row.balanceByCurrency)}
                  {row.overdue ? ` · overdue ${Math.abs(row.daysRemaining)}d` : ` · ${row.daysRemaining}d left`}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data?.overdue?.length ? (
        <div className="cpb-card">
          <div className="cpb-card-title">Overdue warnings</div>
          {data.overdue.map((customer) => (
            <div key={customer.id} className="cpb-customer-row">
              <div>
                <div className="cpb-customer-name">{customer.name}</div>
                {customer.phone ? <div className="cpb-customer-meta">{customer.phone}</div> : null}
                <span className="cpb-badge cpb-badge--danger">Overdue {Math.abs(customer.daysRemaining)}d</span>
              </div>
              <MoneyRow totals={customer.balanceByCurrency} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="cpb-card">
        <div className="cpb-card-title">Pending balances</div>
        {data?.withBalance?.length ? (
          data.withBalance.map((customer) => (
            <div key={customer.id} className="cpb-customer-row">
              <div>
                <div className="cpb-customer-name">{customer.name}</div>
                {customer.phone ? <div className="cpb-customer-meta">{customer.phone}</div> : null}
                {!customer.overdue ? (
                  <span className="cpb-badge cpb-badge--warning">{customer.daysRemaining}d left</span>
                ) : null}
              </div>
              <MoneyRow totals={customer.balanceByCurrency} />
            </div>
          ))
        ) : (
          <div className="report-blank">No customers with outstanding balances.</div>
        )}
      </div>

      <div className="cpb-note">
        This dashboard mirrors the Customer Ledger Tracking mobile app. Record sales and payments in the mobile app to update these balances.
      </div>
    </div>
  );
}
