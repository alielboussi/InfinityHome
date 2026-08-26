import React from 'react';
import {
  addLedgerEntry,
  fetchLedgerBalances,
  fetchLedgerContacts,
  fetchLedgerEntries,
  fetchLedgerReport,
  filterLedgerEntries,
  LEDGER_CURRENCY,
  LEDGER_PAYMENT_METHOD,
  todayLocalDateString,
} from './services/ledger';
import { downloadLedgerPdf } from './utils/ledgerPdf';
import BackToDashboard from './BackToDashboard';

function formatMoney(amount) {
  const n = Number(amount || 0);
  const formatted = n % 1 === 0
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$ ${formatted}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return value;
  }
}

const HISTORY_FETCH_LIMIT = 200;
const HISTORY_DISPLAY_LIMIT = 5;


export default function LedgerMobile() {
  const theme = {
    bg: 'var(--dash-bg)',
    surface: 'var(--dash-surface)',
    surfaceAlt: 'var(--dash-surface-2)',
    border: 'var(--dash-border)',
    borderSoft: 'var(--dash-border-soft)',
    text: 'var(--dash-text)',
    muted: 'var(--dash-muted)',
    accent: 'var(--dash-accent)',
  };

  const [direction, setDirection] = React.useState('credit');
  const [amount, setAmount] = React.useState('');
  const [personName, setPersonName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [entries, setEntries] = React.useState([]);
  const [contacts, setContacts] = React.useState([]);
  const [balance, setBalance] = React.useState(0);
  const [entryCount, setEntryCount] = React.useState(0);
  const [loadingBalances, setLoadingBalances] = React.useState(false);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [personFilter, setPersonFilter] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [entryDate, setEntryDate] = React.useState(() => todayLocalDateString());
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const contactNames = React.useMemo(
    () => (contacts || []).map((row) => row.name).filter(Boolean),
    [contacts],
  );

  const projectedBalance = React.useMemo(() => {
    const amt = Number(amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) return balance;
    return direction === 'credit' ? balance + amt : balance - amt;
  }, [amount, balance, direction]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadBalances() {
      setLoadingBalances(true);
      const { data, error: err } = await fetchLedgerBalances();
      if (!cancelled) {
        if (err) {
          setBalance(0);
          setEntryCount(0);
        } else {
          const usd = data?.[LEDGER_CURRENCY] || {};
          setBalance(Number(usd.balance || 0));
          setEntryCount(Number(usd.entryCount || 0));
        }
        setLoadingBalances(false);
      }
    }
    loadBalances();
    return () => { cancelled = true; };
  }, [refreshTick]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadContacts() {
      const { data } = await fetchLedgerContacts();
      if (!cancelled) setContacts(data || []);
    }
    loadContacts();
    return () => { cancelled = true; };
  }, [refreshTick]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadEntries() {
      setLoadingEntries(true);
      const { data, error: err } = await fetchLedgerEntries({
        limit: HISTORY_FETCH_LIMIT,
        currency: LEDGER_CURRENCY,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        personName: personFilter || undefined,
      });
      if (!cancelled) {
        if (err) setEntries([]);
        else setEntries(data || []);
        setLoadingEntries(false);
      }
    }
    loadEntries();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, personFilter, refreshTick]);

  const displayedEntries = React.useMemo(() => {
    const filtered = filterLedgerEntries(entries, searchQuery);
    return filtered.slice(0, HISTORY_DISPLAY_LIMIT);
  }, [entries, searchQuery]);

  const totalMatchingEntries = React.useMemo(
    () => filterLedgerEntries(entries, searchQuery).length,
    [entries, searchQuery],
  );

  const handleDownloadPdf = async () => {
    setError('');
    setExportingPdf(true);
    try {
      const { data, error: err } = await fetchLedgerReport({
        currency: LEDGER_CURRENCY,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        personName: personFilter || undefined,
      });
      if (err) throw err;
      await downloadLedgerPdf({
        openingBalance: data?.openingBalance || 0,
        rows: data?.rows || [],
        dateFrom,
        dateTo,
        personFilter: personFilter.trim(),
      });
    } catch (e) {
      setError(e?.message || 'Failed to generate PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSaving(true);
    const { data, error: err } = await addLedgerEntry({
      direction,
      amount,
      currency: LEDGER_CURRENCY,
      personName,
      reason: description,
      entryDate,
    });
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to save entry');
      return;
    }
    const savedAmount = Number(data?.amount || amount || 0);
    setInfo(
      direction === 'credit'
        ? `Deposited ${formatMoney(savedAmount)} from ${personName.trim()}.`
        : `Paid ${formatMoney(savedAmount)} for ${personName.trim()}.`,
    );
    setAmount('');
    setDescription('');
    setPersonName('');
    setEntryDate(todayLocalDateString());
    setRefreshTick((t) => t + 1);
  };

  const balanceColor = balance < 0 ? '#ff8a8a' : theme.border;
  const projectedColor = projectedBalance < 0 ? '#ff8a8a' : theme.muted;

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', color: theme.text, padding: '12px 10px 40px', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BackToDashboard />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Overseas Piggy Bank</div>
            <div style={{ fontSize: 12, color: theme.muted }}>USD cash held abroad — separate from POS & quotes</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRefreshTick((t) => t + 1)}
          style={{ background: theme.surface, color: theme.text, border: `1.5px solid ${theme.border}`, borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}
        >
          {loadingBalances || loadingEntries ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 14, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ fontSize: 12, color: theme.muted, marginBottom: 4 }}>Current balance (USD cash)</div>
        {loadingBalances ? (
          <div>Loading…</div>
        ) : (
          <>
            <div style={{ fontSize: 32, fontWeight: 900, color: balanceColor, lineHeight: 1.1 }}>
              {formatMoney(balance)}
            </div>
            <div style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>
              {entryCount} movement{entryCount === 1 ? '' : 's'}
              {balance < 0 ? ' · advance / owed (negative allowed)' : ''}
            </div>
          </>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          padding: 14,
          background: theme.surface,
          border: `1px solid ${theme.borderSoft}`,
          borderRadius: 12,
          marginBottom: 18,
          maxWidth: 720,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setDirection('credit')}
            style={{
              padding: 12,
              borderRadius: 10,
              border: `2px solid ${direction === 'credit' ? '#16c784' : theme.border}`,
              background: direction === 'credit' ? 'rgba(22, 199, 132, 0.15)' : theme.surfaceAlt,
              color: theme.text,
              fontWeight: 800,
            }}
          >
            Deposit in
          </button>
          <button
            type="button"
            onClick={() => setDirection('debit')}
            style={{
              padding: 12,
              borderRadius: 10,
              border: `2px solid ${direction === 'debit' ? '#e14b4b' : theme.border}`,
              background: direction === 'debit' ? 'rgba(225, 75, 75, 0.15)' : theme.surfaceAlt,
              color: theme.text,
              fontWeight: 800,
            }}
          >
            Pay out
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Person</label>
            <input
              type="text"
              list="ledger-contact-names"
              required
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="e.g. Mary, Lloyd"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
            />
            <datalist id="ledger-contact-names">
              {contactNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>
              Saved people are remembered for next time (not linked to POS customers).
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Transaction date</label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>
              Use the actual date of the movement if you are entering it later.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Description</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={direction === 'credit' ? 'e.g. Cash handed over for deposit' : 'e.g. Transport payment'}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ fontSize: 12, color: projectedColor }}>
            After this entry: <b>{formatMoney(projectedBalance)}</b>
            {' · '}
            Payment method: <b>{LEDGER_PAYMENT_METHOD}</b>
          </div>
        </div>

        {error && <div style={{ color: '#ff6b6b', marginBottom: 8, fontWeight: 700 }}>{error}</div>}
        {info && <div style={{ color: theme.border, marginBottom: 8, fontWeight: 700 }}>{info}</div>}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 10,
            border: 'none',
            fontWeight: 800,
            background: direction === 'credit' ? '#16c784' : '#d64545',
            color: '#fff',
          }}
        >
          {saving ? 'Saving…' : direction === 'credit' ? 'Record deposit' : 'Record payment'}
        </button>
      </form>

      {contactNames.length > 0 && (
        <div style={{ maxWidth: 720, margin: '0 auto 16px', fontSize: 12, color: theme.muted }}>
          <span style={{ fontWeight: 700, color: theme.text }}>Saved people: </span>
          {contactNames.slice(0, 12).join(' · ')}
          {contactNames.length > 12 ? ` · +${contactNames.length - 12} more` : ''}
        </div>
      )}

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700 }}>History</div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>
              Latest {HISTORY_DISPLAY_LIMIT}
              {searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ''}
              {totalMatchingEntries > HISTORY_DISPLAY_LIMIT ? ` · ${totalMatchingEntries} found` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={exportingPdf}
            title="Download PDF for selected date/person filters"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1.5px solid ${theme.border}`,
              background: theme.surface,
              color: theme.text,
              fontWeight: 700,
              cursor: exportingPdf ? 'wait' : 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16 }}>📄</span>
            {exportingPdf ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Search transactions</label>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Person, amount, date, deposit, pay out…"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Person</label>
            <input
              type="text"
              list="ledger-filter-names"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              placeholder="All people"
              style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }}
            />
            <datalist id="ledger-filter-names">
              {contactNames.map((name) => (
                <option key={`filter-${name}`} value={name} />
              ))}
            </datalist>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setPersonFilter(''); setSearchQuery(''); }}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surface, color: theme.text, fontWeight: 600 }}
            >
              Clear filters
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loadingEntries && <div style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>Loading entries…</div>}
          {!loadingEntries && displayedEntries.length === 0 && (
            <div style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>
              {searchQuery.trim() ? 'No transactions match your search.' : 'No movements yet.'}
            </div>
          )}
          {!loadingEntries && displayedEntries.map((entry) => (
            <div key={entry.id} style={{ padding: 12, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800 }}>{formatMoney(entry.amount)}</div>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: entry.direction === 'credit' ? 'rgba(30, 215, 168, 0.18)' : 'rgba(225, 75, 75, 0.18)',
                  color: entry.direction === 'credit' ? theme.border : '#ff9fa3',
                  fontWeight: 700,
                }}
                >
                  {entry.direction === 'credit' ? 'Deposit' : 'Payment'}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                {entry.person_name || entry.reference || '—'}
              </div>
              <div style={{ fontSize: 13, marginBottom: 4, wordBreak: 'break-word' }}>{entry.reason}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{formatDateTime(entry.created_at)} · cash</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
