import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { newUuid } from '../utils/uuid';
import { sendLedgerWhatsApp } from './whatsapp';

const LEDGER_CURRENCY = 'USD';
const LEDGER_PAYMENT_METHOD = 'cash';

function normalizeCurrency(cur) {
  const s = (cur || '').toString().trim().toUpperCase();
  if (!s) return LEDGER_CURRENCY;
  if (['USD', 'US$', 'US DOLLAR', 'DOLLAR', '$'].includes(s)) return 'USD';
  if (['ZMW', 'ZMK', 'K', 'KWACHA', 'ZAMBIAN KWACHA'].includes(s)) return 'K';
  return s;
}

function normalizePersonKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function todayLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveEntryCreatedAt(entryDate) {
  const raw = String(entryDate || '').trim();
  if (!raw) return new Date().toISOString();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Invalid transaction date');
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const now = new Date();
  const dt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  if (Number.isNaN(dt.getTime())) throw new Error('Invalid transaction date');
  return dt.toISOString();
}

async function computeBalanceBeforeTimestamp(currency, beforeIso) {
  const cur = normalizeCurrency(currency);
  const { data, error } = await fromPublic('ledger_entries')
    .select('direction, amount, currency, created_at')
    .eq('currency', cur)
    .lt('created_at', beforeIso);
  if (error) throw error;
  return computeBalanceFromRows(data || []);
}

function computeBalanceFromRows(rows = []) {
  return (rows || []).reduce((sum, row) => {
    const amt = Number(row.amount || 0);
    if (row.direction === 'credit') return sum + amt;
    if (row.direction === 'debit') return sum - amt;
    return sum;
  }, 0);
}

async function computeBalanceFromEntries(currency = LEDGER_CURRENCY) {
  const cur = normalizeCurrency(currency);
  const { data, error } = await fromPublic('ledger_entries')
    .select('direction, amount, currency, created_at')
    .eq('currency', cur);
  if (error) throw error;
  const rows = data || [];
  const balance = computeBalanceFromRows(rows);
  const lastEntryAt = rows.reduce((latest, row) => {
    const stamp = row.created_at || '';
    return stamp > latest ? stamp : latest;
  }, '');
  return {
    balance,
    entryCount: rows.length,
    lastEntryAt: lastEntryAt || null,
  };
}

export async function fetchLedgerBalances() {
  try {
    const { data, error } = await fromPublic('ledger_balances')
      .select('currency, balance, entry_count, last_entry_at')
      .order('currency', { ascending: true });
    if (error) throw error;
    const mapped = {};
    (data || []).forEach((row) => {
      const cur = normalizeCurrency(row.currency || LEDGER_CURRENCY);
      mapped[cur] = {
        balance: Number(row.balance || 0),
        entryCount: row.entry_count || 0,
        lastEntryAt: row.last_entry_at || null,
      };
    });

    const computed = await computeBalanceFromEntries(LEDGER_CURRENCY);
    if (!mapped.USD || (mapped.USD.entryCount || 0) < computed.entryCount) {
      mapped.USD = computed;
    }
    return { data: mapped };
  } catch (error) {
    try {
      const computed = await computeBalanceFromEntries(LEDGER_CURRENCY);
      return { data: { USD: computed } };
    } catch (fallbackErr) {
      return { error: fallbackErr };
    }
  }
}

export async function fetchLedgerContacts() {
  try {
    const { data, error } = await fromPublic('ledger_contacts')
      .select('id, name, last_used_at, created_at')
      .order('last_used_at', { ascending: false });
    if (error) throw error;
    return { data: data || [] };
  } catch (error) {
    return { error };
  }
}

export async function upsertLedgerContact(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { error: new Error('Person name is required') };
  const nameKey = normalizePersonKey(trimmed);
  const nowIso = new Date().toISOString();
  try {
    const { data: matches, error: findErr } = await fromPublic('ledger_contacts')
      .select('id, name, name_key')
      .limit(200);
    if (findErr) throw findErr;
    const existing = (matches || []).find((row) => (
      normalizePersonKey(row.name_key || row.name) === nameKey
    ));
    if (existing?.id) {
      const { data, error } = await db
        .from('ledger_contacts')
        .update({ name: trimmed, name_key: nameKey, last_used_at: nowIso })
        .eq('id', existing.id)
        .select('id, name')
        .single();
      if (error) throw error;
      return { data };
    }
    const payload = {
      id: newUuid(),
      name: trimmed,
      name_key: nameKey,
      created_at: nowIso,
      last_used_at: nowIso,
    };
    const { data, error } = await db
      .from('ledger_contacts')
      .insert([payload])
      .select('id, name')
      .single();
    if (error) throw error;
    return { data };
  } catch (error) {
    return { error };
  }
}

function filterEntriesByPerson(rows, personName) {
  const key = normalizePersonKey(personName);
  if (!key) return rows || [];
  return (rows || []).filter((row) => normalizePersonKey(row.person_name) === key);
}

function formatEntryDateForSearch(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).toLowerCase();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} ${d.toLocaleDateString()} ${d.toLocaleString()}`.toLowerCase();
}

export function matchesLedgerSearch(entry, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;

  const directionText = entry?.direction === 'credit'
    ? 'deposit deposit in credit in'
    : 'payment pay out payout withdrawal debit out';

  const haystack = [
    entry?.person_name,
    entry?.reason,
    entry?.reference,
    entry?.amount,
    formatEntryDateForSearch(entry?.created_at),
    directionText,
  ].join(' ').toLowerCase();

  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

export function filterLedgerEntries(entries, query) {
  return (entries || []).filter((entry) => matchesLedgerSearch(entry, query));
}

export function buildLedgerReportRows(allEntriesAsc = [], { dateFrom, dateTo, personName } = {}) {
  let running = 0;
  const withBalance = (allEntriesAsc || []).map((entry) => {
    const amt = Number(entry.amount || 0);
    if (entry.direction === 'credit') running += amt;
    else if (entry.direction === 'debit') running -= amt;
    return { ...entry, balanceAfter: running };
  });

  const startMs = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).getTime() : -Infinity;
  const endMs = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).getTime() : Infinity;
  const personKey = normalizePersonKey(personName);

  let openingBalance = 0;
  const displayRows = [];

  withBalance.forEach((row) => {
    const ts = new Date(row.created_at || 0).getTime();
    if (!Number.isFinite(ts)) return;
    if (ts < startMs) openingBalance = row.balanceAfter;
    const inRange = ts >= startMs && ts <= endMs;
    const matchesPerson = !personKey || normalizePersonKey(row.person_name) === personKey;
    if (inRange && matchesPerson) displayRows.push(row);
  });

  return { openingBalance, rows: displayRows };
}

export async function fetchLedgerEntriesUpTo({ currency, dateTo } = {}) {
  try {
    let q = fromPublic('ledger_entries')
      .select('id, direction, amount, currency, reason, reference, person_name, person_id, payment_method, location_id, created_at, created_by')
      .order('created_at', { ascending: true });
    if (currency) q = q.eq('currency', normalizeCurrency(currency));
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
    const { data, error } = await q;
    if (error) throw error;
    return { data: data || [] };
  } catch (error) {
    return { error };
  }
}

export async function fetchLedgerReport({ currency, dateFrom, dateTo, personName } = {}) {
  const { data, error } = await fetchLedgerEntriesUpTo({ currency, dateTo });
  if (error) return { error };
  const report = buildLedgerReportRows(data, { dateFrom, dateTo, personName });
  return { data: report };
}

export async function fetchLedgerEntries({ limit = 50, currency, dateFrom, dateTo, personName } = {}) {
  try {
    let q = fromPublic('ledger_entries')
      .select('id, direction, amount, currency, reason, reference, person_name, person_id, payment_method, location_id, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (currency) q = q.eq('currency', normalizeCurrency(currency));
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
    const { data, error } = await q;
    if (error) throw error;
    const filtered = filterEntriesByPerson(data, personName);
    return { data: filtered };
  } catch (error) {
    return { error };
  }
}

export async function addLedgerEntry({
  direction,
  amount,
  currency = LEDGER_CURRENCY,
  reason,
  reference = '',
  personName,
  personId = null,
  location_id = null,
  entryDate,
}) {
  const dir = (direction || '').toLowerCase();
  const cur = normalizeCurrency(currency);
  const amt = Number(amount || 0);
  const trimmedPerson = String(personName || '').trim();
  const trimmedReason = String(reason || '').trim();

  if (!['credit', 'debit'].includes(dir)) {
    return { error: new Error('Direction must be credit or debit') };
  }
  if (cur !== LEDGER_CURRENCY) {
    return { error: new Error('Ledger is USD ($) only') };
  }
  if (!(amt > 0)) {
    return { error: new Error('Amount must be greater than zero') };
  }
  if (!trimmedPerson) {
    return { error: new Error('Person name is required') };
  }
  if (!trimmedReason) {
    return { error: new Error('Description is required') };
  }

  try {
    const createdAt = resolveEntryCreatedAt(entryDate);
    const previousBalance = await computeBalanceBeforeTimestamp(cur, createdAt);

    let resolvedPersonId = personId || null;
    const contactRes = await upsertLedgerContact(trimmedPerson);
    if (contactRes.error) throw contactRes.error;
    resolvedPersonId = contactRes.data?.id || resolvedPersonId;

    const payload = {
      direction: dir,
      amount: amt,
      currency: cur,
      payment_method: LEDGER_PAYMENT_METHOD,
      person_name: trimmedPerson,
      person_id: resolvedPersonId,
      reason: trimmedReason,
      reference: reference ? String(reference).trim() : null,
      location_id: location_id || null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const { data, error } = await db
      .from('ledger_entries')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;

    const newBalance = dir === 'credit' ? previousBalance + amt : previousBalance - amt;
    sendLedgerWhatsApp({
      direction: dir,
      amount: amt,
      personName: trimmedPerson,
      reason: trimmedReason,
      previousBalance,
      newBalance,
      currency: cur,
      entryDate,
      createdAt,
    }).catch(() => {});

    return { data: { ...data, previousBalance, newBalance } };
  } catch (error) {
    return { error };
  }
}

export { LEDGER_CURRENCY, LEDGER_PAYMENT_METHOD };
