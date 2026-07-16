import React from 'react';
import { fetchLedgerBalances, fetchLedgerEntries, addLedgerEntry } from './services/ledger';
import BackToDashboard from './BackToDashboard';

const allowedCurrencies = ['USD'];

function normalizeCurrency(cur) {
  const s = (cur || '').toString().trim().toUpperCase();
  if (!s) return 'USD';
  if (['USD', 'US$', 'DOLLAR', '$', 'US DOLLAR'].includes(s)) return 'USD';
  if (['ZMW', 'ZMK', 'K', 'KWACHA', 'ZAMBIAN KWACHA'].includes(s)) return 'K';
  return s;
}

function displayCurrency(cur) {
  const normalized = normalizeCurrency(cur);
  if (normalized === 'USD') return '$';
  return normalized;
}

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return value;
  }
}

export default function LedgerMobile() {
  const theme = {
    bg: 'var(--dash-bg)',
    surface: 'var(--dash-surface)',
    surfaceAlt: 'var(--dash-surface-2)',
    border: 'var(--dash-border)',
    borderSoft: 'var(--dash-border-soft)',
    text: 'var(--dash-text)',
    muted: 'var(--dash-muted)',
    accent: 'var(--dash-accent)'
  };

  const today = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, []);

  const [direction, setDirection] = React.useState('credit');
  const [amount, setAmount] = React.useState('');
  const [currency] = React.useState('USD');
  const [reason, setReason] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [entries, setEntries] = React.useState([]);
  const [balances, setBalances] = React.useState({});
  const [loadingBalances, setLoadingBalances] = React.useState(false);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');
  const [currencyFilter, setCurrencyFilter] = React.useState('USD');
  const [dateFrom, setDateFrom] = React.useState(today);
  const [dateTo, setDateTo] = React.useState(today);
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    async function loadBalances() {
      setLoadingBalances(true);
      const { data, error: err } = await fetchLedgerBalances();
      if (!cancelled) {
        if (err) {
          setBalances({});
        } else {
          setBalances(data || {});
        }
        setLoadingBalances(false);
      }
    }
    loadBalances();
    return () => { cancelled = true; };
  }, [refreshTick]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadEntries() {
      setLoadingEntries(true);
      const opts = {
        limit: 80,
        currency: currencyFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const { data, error: err } = await fetchLedgerEntries(opts);
      if (!cancelled) {
        if (err) setEntries([]); else setEntries(data || []);
        setLoadingEntries(false);
      }
    }
    loadEntries();
    return () => { cancelled = true; };
  }, [currencyFilter, dateFrom, dateTo, refreshTick]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSaving(true);
    const { error: err } = await addLedgerEntry({
      direction,
      amount,
      currency,
      reason,
      reference,
    });
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to save entry');
      return;
    }
    setInfo(direction === 'credit' ? 'Money added to ledger.' : 'Money deducted from ledger.');
    setAmount('');
    setReason('');
    setReference('');
    setRefreshTick(t => t + 1);
  };

  const currencyOptions = allowedCurrencies;

  const filteredBalances = React.useMemo(() => {
    return Object.entries(balances || {}).filter(([cur]) => allowedCurrencies.includes(normalizeCurrency(cur)));
  }, [balances]);

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '12px 10px 40px', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BackToDashboard />
          <div style={{ fontSize: 20, fontWeight: 800 }}>Ledger</div>
        </div>
        <button
          onClick={() => setRefreshTick(t => t + 1)}
          style={{ background: theme.surface, color: theme.text, border: `1.5px solid ${theme.border}`, borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}
        >{loadingBalances || loadingEntries ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.9 }}>
        Track money added to or paid out from the remote ledger. Provide a reason for every movement.
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Current Balance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
          {loadingBalances && <div style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>Loading balances…</div>}
          {!loadingBalances && filteredBalances.length === 0 && (
            <div style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>No ledger entries yet.</div>
          )}
          {filteredBalances.map(([cur, data]) => (
            <div key={cur} style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Balance ({displayCurrency(cur)})</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: theme.border }}>{displayCurrency(cur)} {Number(data.balance || 0).toLocaleString()}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>Entries: {data.entryCount || 0}</div>
              {data.lastEntryAt && <div style={{ fontSize: 11, opacity: 0.8 }}>Last: {formatDateTime(data.lastEntryAt)}</div>}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: 14, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 12, marginBottom: 18, maxWidth: 980, marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setDirection('credit')}
            style={{ padding: 10, borderRadius: 10, border: `1.5px solid ${theme.border}`, background: direction === 'credit' ? theme.surface : theme.surfaceAlt, color: theme.text, fontWeight: 700, boxSizing: 'border-box' }}
          >Add Money</button>
          <button
            type="button"
            onClick={() => setDirection('debit')}
            style={{ padding: 10, borderRadius: 10, border: '1.5px solid #e14b4b', background: direction === 'debit' ? '#3a0c12' : theme.surfaceAlt, color: '#ffd7d7', fontWeight: 700, boxSizing: 'border-box' }}
          >Subtract Money</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Amount</label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Currency</label>
            <div style={{ padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surface, color: theme.text, fontWeight: 700, boxSizing: 'border-box' }}>
              {displayCurrency(currency)} (USD only)
            </div>
            <div style={{ fontSize: 11, marginTop: 6, color: theme.muted }}>Ledger is restricted to USD ($) entries.</div>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Reason</label>
          <textarea
            required
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, resize: 'vertical', boxSizing: 'border-box', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Reference (optional)</label>
          <input
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Receipt, person, transfer note"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
          />
        </div>

        {error && <div style={{ color: '#ff6b6b', marginBottom: 8, fontWeight: 700 }}>{error}</div>}
        {info && <div style={{ color: theme.border, marginBottom: 8, fontWeight: 700 }}>{info}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', fontWeight: 800, background: direction === 'credit' ? '#16c784' : '#d64545', color: '#fff' }}
        >{saving ? 'Saving…' : direction === 'credit' ? 'Add Money' : 'Subtract Money'}</button>
      </form>

      <div style={{ marginBottom: 10, fontWeight: 700 }}>History</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Currency</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px,1fr))', gap: 6 }}>
            {currencyOptions.map(cur => (
              <button
                key={`f-${cur}`}
                type="button"
                onClick={() => setCurrencyFilter(cur)}
                style={{ padding: 8, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: currencyFilter === cur ? theme.surface : theme.surfaceAlt, color: theme.text, fontWeight: 700, boxSizing: 'border-box' }}
              >{displayCurrency(cur)}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 980, marginLeft: 'auto', marginRight: 'auto' }}>
        {loadingEntries && <div style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>Loading entries…</div>}
        {!loadingEntries && entries.length === 0 && (
          <div style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>No entries found for this filter.</div>
        )}
        {!loadingEntries && entries.map(e => (
          <div key={e.id} style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>{displayCurrency(e.currency)} {Number(e.amount || 0).toLocaleString()}</div>
              <span style={{ padding: '4px 8px', borderRadius: 8, background: e.direction === 'credit' ? 'rgba(30, 215, 168, 0.18)' : '#331111', color: e.direction === 'credit' ? theme.border : '#ff9fa3', fontWeight: 700 }}>
                {e.direction === 'credit' ? 'Credit (+)' : 'Debit (-)'}
              </span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{e.reason}</div>
            {e.reference && <div style={{ fontSize: 12, opacity: 0.85, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>Ref: {e.reference}</div>}
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{formatDateTime(e.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
