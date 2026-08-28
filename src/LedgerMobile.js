import React from 'react';
import {
  addLedgerEntry,
  closeLedgerBalance,
  entryDateFromIso,
  fetchLedgerBalances,
  fetchLedgerContacts,
  fetchLedgerEntries,
  fetchLedgerOpeningBalance,
  fetchLedgerPeriodReport,
  fetchLedgerPeriods,
  fetchLedgerReport,
  filterLedgerEntries,
  findPeriodByCloseEntryId,
  formatLedgerInputDate,
  isEntryInOpenPeriod,
  isPeriodCloseEntry,
  LEDGER_CURRENCY,
  LEDGER_PAYMENT_METHOD,
  ledgerInputDateToApiDate,
  resolveLedgerEntryDate,
  sendLedgerPeriodWhatsAppPdf,
  setLedgerOpeningBalance,
  updateLedgerEntry,
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

const HISTORY_FETCH_LIMIT = 200;
const HISTORY_DISPLAY_LIMIT = 5;
const LAST_ENTRY_DATE_KEY = 'ledger_last_entry_date';

function preventInputWheelScroll(event) {
  event.preventDefault();
  event.currentTarget.blur();
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
  const [entryDate, setEntryDate] = React.useState('');
  const [lastEntryDate, setLastEntryDate] = React.useState('');
  const [openingBalance, setOpeningBalance] = React.useState(0);
  const [openingBalanceDate, setOpeningBalanceDate] = React.useState('');
  const [openingBalanceNote, setOpeningBalanceNote] = React.useState('');
  const [startingBalanceAmount, setStartingBalanceAmount] = React.useState('');
  const [startingBalanceDate, setStartingBalanceDate] = React.useState('');
  const [startingBalanceNote, setStartingBalanceNote] = React.useState('');
  const [savingStartingBalance, setSavingStartingBalance] = React.useState(false);
  const [showStartingBalanceForm, setShowStartingBalanceForm] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [closingBalance, setClosingBalance] = React.useState(false);
  const [closeBalanceDate, setCloseBalanceDate] = React.useState('');
  const [periods, setPeriods] = React.useState([]);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = React.useState('');
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [sendingPeriodPdfId, setSendingPeriodPdfId] = React.useState('');
  const [editingEntryId, setEditingEntryId] = React.useState('');
  const [editDirection, setEditDirection] = React.useState('credit');
  const [editAmount, setEditAmount] = React.useState('');
  const [editPersonName, setEditPersonName] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editEntryDate, setEditEntryDate] = React.useState('');
  const [savingEdit, setSavingEdit] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = String(window.localStorage.getItem(LAST_ENTRY_DATE_KEY) || '').trim();
      if (saved) setLastEntryDate(formatLedgerInputDate(saved));
    } catch (_) {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadOpeningBalance() {
      const { data } = await fetchLedgerOpeningBalance(LEDGER_CURRENCY);
      if (!cancelled && data) {
        setOpeningBalance(Number(data.amount || 0));
        setOpeningBalanceDate(formatLedgerInputDate(data.entryDate || ''));
        setOpeningBalanceNote(data.note || '');
        setStartingBalanceAmount(
          Number(data.amount || 0) ? String(data.amount) : '',
        );
        setStartingBalanceDate(formatLedgerInputDate(data.entryDate || ''));
        setStartingBalanceNote(data.note || '');
      }
    }
    loadOpeningBalance();
    return () => { cancelled = true; };
  }, [refreshTick]);

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
        dateFrom: ledgerInputDateToApiDate(dateFrom) || undefined,
        dateTo: ledgerInputDateToApiDate(dateTo) || undefined,
        personName: personFilter || undefined,
      });
      if (!cancelled) {
        if (err) setEntries([]);
        else {
          const rows = data || [];
          setEntries(rows);
          if (rows.length > 0) {
            const latestDate = entryDateFromIso(rows[0]?.created_at);
            if (latestDate) {
              setLastEntryDate((prev) => prev || latestDate);
            }
          }
        }
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

  React.useEffect(() => {
    let cancelled = false;
    async function loadPeriods() {
      const { data } = await fetchLedgerPeriods(LEDGER_CURRENCY);
      if (!cancelled) setPeriods(data || []);
    }
    loadPeriods();
    return () => { cancelled = true; };
  }, [refreshTick]);

  const handleCloseBalance = async () => {
    setError('');
    setInfo('');
    if (Math.abs(balance) < 0.01) {
      setError('Balance is already zero.');
      return;
    }
    const action = balance > 0 ? 'paid out' : 'paid in';
    const amount = Math.abs(balance);

    let resolvedEntryDate;
    try {
      resolvedEntryDate = resolveLedgerEntryDate(closeBalanceDate, lastEntryDate);
    } catch (dateErr) {
      setError(dateErr?.message || 'Invalid closing date');
      return;
    }

    const confirmed = window.confirm(
      `Close this period by recording ${formatMoney(amount)} ${action} on ${resolvedEntryDate} to bring the balance to $ 0?\n\nA WhatsApp message will be sent to the ledger group confirming balance $ 0, followed by the period PDF.`,
    );
    if (!confirmed) return;

    setClosingBalance(true);

    const { error: err } = await closeLedgerBalance({
      entryDate: resolvedEntryDate,
      currency: LEDGER_CURRENCY,
    });
    setClosingBalance(false);
    if (err) {
      setError(err.message || 'Failed to close balance');
      return;
    }
    setInfo(`Period closed on ${resolvedEntryDate}. Balance is $ 0 — WhatsApp status sent, then period PDF.`);
    setCloseBalanceDate(resolvedEntryDate);
    setEntryDate('');
    setLastEntryDate(resolvedEntryDate);
    try {
      window.localStorage.setItem(LAST_ENTRY_DATE_KEY, resolvedEntryDate);
    } catch (_) {}
    setRefreshTick((t) => t + 1);
  };

  const beginEditEntry = (entry) => {
    setError('');
    setInfo('');
    setEditingEntryId(String(entry.id));
    setEditDirection(entry.direction === 'debit' ? 'debit' : 'credit');
    setEditAmount(String(entry.amount ?? ''));
    setEditPersonName(String(entry.person_name || ''));
    setEditDescription(String(entry.reason || ''));
    setEditEntryDate(entryDateFromIso(entry.created_at));
  };

  const cancelEditEntry = () => {
    setEditingEntryId('');
    setEditAmount('');
    setEditPersonName('');
    setEditDescription('');
    setEditEntryDate('');
  };

  const handleSaveEditEntry = async () => {
    if (!editingEntryId) return;
    setError('');
    setInfo('');
    let resolvedEntryDate;
    try {
      resolvedEntryDate = resolveLedgerEntryDate(editEntryDate, lastEntryDate);
    } catch (dateErr) {
      setError(dateErr?.message || 'Invalid transaction date');
      return;
    }
    setSavingEdit(true);
    const { error: err } = await updateLedgerEntry(editingEntryId, {
      direction: editDirection,
      amount: editAmount,
      currency: LEDGER_CURRENCY,
      personName: editPersonName,
      reason: editDescription,
      entryDate: resolvedEntryDate,
    });
    setSavingEdit(false);
    if (err) {
      setError(err.message || 'Failed to update entry');
      return;
    }
    setInfo('Entry updated.');
    cancelEditEntry();
    setRefreshTick((t) => t + 1);
  };

  const handleSendPeriodPdf = async (entry) => {
    const period = findPeriodByCloseEntryId(periods, entry.id);
    if (!period) {
      setError('Could not find the closed period for this entry.');
      return;
    }
    setError('');
    setInfo('');
    setSendingPeriodPdfId(String(entry.id));
    const { error: err } = await sendLedgerPeriodWhatsAppPdf({
      periodIndex: period.index,
      currency: LEDGER_CURRENCY,
      includeStatusMessage: false,
    });
    setSendingPeriodPdfId('');
    if (err) {
      setError(err.message || 'Failed to send period PDF on WhatsApp');
      return;
    }
    setInfo(`${period.label} PDF sent to the ledger WhatsApp group.`);
  };

  const handleDownloadPdf = async () => {
    setError('');
    setExportingPdf(true);
    try {
      if (selectedPeriodIndex !== '') {
        const { data, error: err } = await fetchLedgerPeriodReport({
          periodIndex: Number(selectedPeriodIndex),
          currency: LEDGER_CURRENCY,
        });
        if (err) throw err;
        const period = data?.period || {};
        await downloadLedgerPdf({
          openingBalance: data?.openingBalance || 0,
          rows: data?.rows || [],
          dateFrom: period.dateFrom || '',
          dateTo: period.dateTo || '',
          periodLabel: period.label || '',
        });
        return;
      }

      const { data, error: err } = await fetchLedgerReport({
        currency: LEDGER_CURRENCY,
        dateFrom: ledgerInputDateToApiDate(dateFrom) || undefined,
        dateTo: ledgerInputDateToApiDate(dateTo) || undefined,
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

  const handleSaveStartingBalance = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSavingStartingBalance(true);
    const { data, error: err } = await setLedgerOpeningBalance({
      amount: startingBalanceAmount,
      entryDate: startingBalanceDate,
      note: startingBalanceNote,
      currency: LEDGER_CURRENCY,
    });
    setSavingStartingBalance(false);
    if (err) {
      setError(err.message || 'Failed to save starting balance');
      return;
    }
    const savedAmount = Number(data?.opening_balance ?? startingBalanceAmount ?? 0);
    setInfo(`Starting balance set to ${formatMoney(savedAmount)}.`);
    setShowStartingBalanceForm(false);
    setRefreshTick((t) => t + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    let resolvedEntryDate;
    try {
      resolvedEntryDate = resolveLedgerEntryDate(entryDate, lastEntryDate);
    } catch (dateErr) {
      setError(dateErr?.message || 'Invalid transaction date');
      return;
    }
    setSaving(true);
    const { data, error: err } = await addLedgerEntry({
      direction,
      amount,
      currency: LEDGER_CURRENCY,
      personName,
      reason: description,
      entryDate: resolvedEntryDate,
    });
    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to save entry');
      return;
    }
    const savedAmount = Number(data?.amount || amount || 0);
    setInfo(
      direction === 'credit'
        ? `Paid in ${formatMoney(savedAmount)} from ${personName.trim()}.`
        : `Paid out ${formatMoney(savedAmount)} for ${personName.trim()}.`,
    );
    setAmount('');
    setDescription('');
    setPersonName('');
    setEntryDate('');
    setLastEntryDate(resolvedEntryDate);
    try {
      window.localStorage.setItem(LAST_ENTRY_DATE_KEY, resolvedEntryDate);
    } catch (_) {}
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
              {openingBalance ? ` · includes ${formatMoney(openingBalance)} starting balance` : ''}
              {balance < 0 ? ' · advance / owed (negative allowed)' : ''}
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Closing date (optional)</label>
              <input
                type="text"
                inputMode="numeric"
                value={closeBalanceDate}
                onChange={(e) => setCloseBalanceDate(e.target.value)}
                placeholder="dd/m/yyyy"
                disabled={closingBalance || Math.abs(balance) < 0.01}
                style={{ width: '100%', maxWidth: 220, padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>
                Date for the closing entry. Leave blank to use {lastEntryDate ? `the last date (${lastEntryDate})` : 'today'}.
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseBalance}
              disabled={closingBalance || loadingBalances || Math.abs(balance) < 0.01}
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                fontWeight: 800,
                background: Math.abs(balance) < 0.01 ? theme.surfaceAlt : '#c9a227',
                color: Math.abs(balance) < 0.01 ? theme.muted : '#0a0a08',
                cursor: closingBalance || Math.abs(balance) < 0.01 ? 'not-allowed' : 'pointer',
              }}
            >
              {closingBalance ? 'Closing balance…' : 'Close balance'}
            </button>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 6 }}>
              Ends the current period by paying in or out to reach $ 0. Sends WhatsApp (balance $ 0) then the period PDF.
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 16, padding: 14, background: theme.surface, border: `1px solid ${theme.borderSoft}`, borderRadius: 12, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: showStartingBalanceForm ? 10 : 0 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Starting balance</div>
            <div style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
              {openingBalance
                ? `${formatMoney(openingBalance)}${openingBalanceDate ? ` · as of ${openingBalanceDate}` : ''}`
                : 'Set the cash already in the piggy bank before you started tracking movements.'}
            </div>
            {openingBalanceNote ? (
              <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>{openingBalanceNote}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowStartingBalanceForm((open) => !open)}
            style={{ background: theme.surfaceAlt, color: theme.text, border: `1.5px solid ${theme.border}`, borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}
          >
            {showStartingBalanceForm ? 'Close' : openingBalance ? 'Edit' : 'Set starting balance'}
          </button>
        </div>

        {showStartingBalanceForm && (
          <form onSubmit={handleSaveStartingBalance} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                required
                value={startingBalanceAmount}
                onChange={(e) => setStartingBalanceAmount(e.target.value)}
                onWheel={preventInputWheelScroll}
                onWheelCapture={preventInputWheelScroll}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>As-of date (optional)</label>
              <input
                type="text"
                inputMode="numeric"
                value={startingBalanceDate}
                onChange={(e) => setStartingBalanceDate(e.target.value)}
                placeholder="dd/m/yyyy"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Note (optional)</label>
              <input
                type="text"
                value={startingBalanceNote}
                onChange={(e) => setStartingBalanceNote(e.target.value)}
                placeholder="e.g. Cash on hand when tracking started"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              disabled={savingStartingBalance}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', fontWeight: 800, background: theme.border, color: '#0a0a08' }}
            >
              {savingStartingBalance ? 'Saving…' : 'Save starting balance'}
            </button>
          </form>
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
            Paid In
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
            Paid Out
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
              onWheel={preventInputWheelScroll}
              onWheelCapture={preventInputWheelScroll}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Transaction date (optional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              placeholder="dd/m/yyyy"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>
              Leave blank to reuse {lastEntryDate ? `the last date (${lastEntryDate})` : 'today'}.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Description (optional)</label>
            <textarea
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
          {saving ? 'Saving…' : direction === 'credit' ? 'Record paid in' : 'Record paid out'}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {periods.length > 0 && (
              <select
                value={selectedPeriodIndex}
                onChange={(e) => setSelectedPeriodIndex(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1.5px solid ${theme.border}`,
                  background: theme.surfaceAlt,
                  color: theme.text,
                  fontWeight: 600,
                  maxWidth: 220,
                }}
              >
                <option value="">Custom date range</option>
                {periods.map((period) => (
                  <option key={`period-${period.index}`} value={String(period.index)}>
                    {period.label}
                    {period.dateFrom || period.dateTo
                      ? ` (${period.dateFrom || '…'} – ${period.dateTo || 'open'})`
                      : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              title="Download PDF for selected period or date/person filters"
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
            <input type="text" inputMode="numeric" placeholder="dd/m/yyyy" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
            <input type="text" inputMode="numeric" placeholder="dd/m/yyyy" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${theme.borderSoft}`, background: theme.surfaceAlt, color: theme.text }} />
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
          {!loadingEntries && displayedEntries.map((entry) => {
            const periodClose = isPeriodCloseEntry(entry);
            const closedPeriod = periodClose ? findPeriodByCloseEntryId(periods, entry.id) : null;
            const canEdit = isEntryInOpenPeriod(entry, periods);
            const isEditing = String(editingEntryId) === String(entry.id);
            const sendingPdf = String(sendingPeriodPdfId) === String(entry.id);
            return (
            <div key={entry.id} style={{ padding: 12, background: theme.surface, border: `1px solid ${periodClose ? theme.border : theme.borderSoft}`, borderRadius: 10 }}>
              {isEditing ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>Edit entry</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setEditDirection('credit')}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: `2px solid ${editDirection === 'credit' ? '#16c784' : theme.border}`,
                        background: editDirection === 'credit' ? 'rgba(22, 199, 132, 0.15)' : theme.surfaceAlt,
                        color: theme.text,
                        fontWeight: 700,
                      }}
                    >
                      Paid In
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDirection('debit')}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: `2px solid ${editDirection === 'debit' ? '#e14b4b' : theme.border}`,
                        background: editDirection === 'debit' ? 'rgba(225, 75, 75, 0.15)' : theme.surfaceAlt,
                        color: theme.text,
                        fontWeight: 700,
                      }}
                    >
                      Paid Out
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    onWheel={preventInputWheelScroll}
                    onWheelCapture={preventInputWheelScroll}
                    placeholder="Amount (USD)"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    list="ledger-contact-names"
                    value={editPersonName}
                    onChange={(e) => setEditPersonName(e.target.value)}
                    placeholder="Person"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editEntryDate}
                    onChange={(e) => setEditEntryDate(e.target.value)}
                    placeholder="dd/m/yyyy"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, boxSizing: 'border-box' }}
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    placeholder="Description (optional)"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleSaveEditEntry}
                      disabled={savingEdit}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', fontWeight: 800, background: theme.border, color: '#0a0a08' }}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditEntry}
                      disabled={savingEdit}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.text, fontWeight: 700 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
              <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800 }}>{formatMoney(entry.amount)}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {periodClose && closedPeriod ? (
                    <button
                      type="button"
                      onClick={() => handleSendPeriodPdf(entry)}
                      disabled={sendingPdf}
                      title={`Send ${closedPeriod.label} PDF to ledger WhatsApp group`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        borderRadius: 8,
                        border: `1.5px solid ${theme.border}`,
                        background: theme.surfaceAlt,
                        color: theme.text,
                        fontWeight: 700,
                        cursor: sendingPdf ? 'wait' : 'pointer',
                      }}
                    >
                      <span aria-hidden="true">📄</span>
                      {sendingPdf ? 'Sending…' : 'Send PDF'}
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => beginEditEntry(entry)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 8,
                        border: `1.5px solid ${theme.border}`,
                        background: theme.surfaceAlt,
                        color: theme.text,
                        fontWeight: 700,
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  <span style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: periodClose
                    ? 'rgba(201, 162, 39, 0.2)'
                    : entry.direction === 'credit'
                      ? 'rgba(30, 215, 168, 0.18)'
                      : 'rgba(225, 75, 75, 0.18)',
                  color: periodClose
                    ? '#e8c84a'
                    : entry.direction === 'credit'
                      ? theme.border
                      : '#ff9fa3',
                  fontWeight: 700,
                }}
                >
                  {periodClose ? 'Period close' : entry.direction === 'credit' ? 'Paid In' : 'Paid Out'}
                </span>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                {entry.person_name || entry.reference || '—'}
              </div>
              <div style={{ fontSize: 13, marginBottom: 4, wordBreak: 'break-word' }}>{entry.reason || '—'}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{entryDateFromIso(entry.created_at)} · cash</div>
              </>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
