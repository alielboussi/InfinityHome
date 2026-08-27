import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import {
  buildLedgerPeriodReportRows,
  buildLedgerPeriods,
  isPeriodCloseEntry,
  PERIOD_CLOSE_PERSON,
  PERIOD_CLOSE_REFERENCE,
} from '../utils/ledgerPeriods';
import { newUuid } from '../utils/uuid';
import { sendLedgerWhatsApp } from './whatsapp';
import { createLedgerPdfBase64 } from '../utils/ledgerPdf';

const LEDGER_CURRENCY = 'USD';
const LEDGER_PAYMENT_METHOD = 'cash';
const BALANCE_EPSILON = 0.01;

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
  return formatLedgerInputDateFromParts({
    d: d.getDate(),
    m: d.getMonth() + 1,
    y: d.getFullYear(),
  });
}

function validateLedgerDateParts({ y, m, d }) {
  const dt = new Date(y, m - 1, d);
  if (
    Number.isNaN(dt.getTime())
    || dt.getFullYear() !== y
    || dt.getMonth() !== m - 1
    || dt.getDate() !== d
  ) {
    throw new Error('Invalid transaction date');
  }
  return dt;
}

export function parseLedgerInputDate(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  }

  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return { d: Number(match[1]), m: Number(match[2]), y: Number(match[3]) };
  }

  return null;
}

export function formatLedgerInputDateFromParts({ d, m, y }) {
  return `${String(d).padStart(2, '0')}/${m}/${y}`;
}

export function formatLedgerInputDate(value) {
  const parts = parseLedgerInputDate(value);
  if (!parts) return String(value || '').trim();
  return formatLedgerInputDateFromParts(parts);
}

export function ledgerInputDateToApiDate(value) {
  const parts = parseLedgerInputDate(value);
  if (!parts) return '';
  return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
}

export function entryDateFromIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatLedgerInputDate(iso);
  return formatLedgerInputDateFromParts({
    d: d.getDate(),
    m: d.getMonth() + 1,
    y: d.getFullYear(),
  });
}

export function resolveLedgerEntryDate(entryDate, fallbackDate) {
  const raw = String(entryDate || '').trim();
  if (raw) {
    const parts = parseLedgerInputDate(raw);
    if (!parts) throw new Error('Invalid transaction date. Use dd/m/yyyy.');
    validateLedgerDateParts(parts);
    return formatLedgerInputDateFromParts(parts);
  }
  const fallback = String(fallbackDate || '').trim();
  if (fallback) {
    const parts = parseLedgerInputDate(fallback);
    if (!parts) throw new Error('Invalid transaction date. Use dd/m/yyyy.');
    validateLedgerDateParts(parts);
    return formatLedgerInputDateFromParts(parts);
  }
  return todayLocalDateString();
}

function resolveEntryCreatedAt(entryDate) {
  const raw = String(entryDate || '').trim();
  if (!raw) return new Date().toISOString();
  const parts = parseLedgerInputDate(raw);
  if (!parts) throw new Error('Invalid transaction date. Use dd/m/yyyy.');
  const now = new Date();
  const dt = validateLedgerDateParts(parts);
  dt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return dt.toISOString();
}

async function fetchOpeningBalanceAmount(currency = LEDGER_CURRENCY) {
  const { data } = await fetchLedgerOpeningBalance(currency);
  return Number(data?.amount || 0);
}

async function computeBalanceBeforeTimestamp(currency, beforeIso) {
  const cur = normalizeCurrency(currency);
  const openingBalance = await fetchOpeningBalanceAmount(cur);
  const { data, error } = await fromPublic('ledger_entries')
    .select('direction, amount, currency, created_at')
    .eq('currency', cur)
    .lt('created_at', beforeIso);
  if (error) throw error;
  return openingBalance + computeBalanceFromRows(data || []);
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
  const [openingBalance, entriesRes] = await Promise.all([
    fetchOpeningBalanceAmount(cur),
    fromPublic('ledger_entries')
      .select('direction, amount, currency, created_at')
      .eq('currency', cur),
  ]);
  const { data, error } = entriesRes;
  if (error) throw error;
  const rows = data || [];
  const balance = openingBalance + computeBalanceFromRows(rows);
  const lastEntryAt = rows.reduce((latest, row) => {
    const stamp = row.created_at || '';
    return stamp > latest ? stamp : latest;
  }, '');
  return {
    balance,
    openingBalance,
    entryCount: rows.length,
    lastEntryAt: lastEntryAt || null,
  };
}

export async function fetchLedgerOpeningBalance(currency = LEDGER_CURRENCY) {
  try {
    const cur = normalizeCurrency(currency);
    const { data, error } = await fromPublic('ledger_settings')
      .select('id, currency, opening_balance, opening_balance_date, opening_balance_note, updated_at')
      .eq('currency', cur)
      .maybeSingle();
    if (error) throw error;
    return {
      data: {
        amount: Number(data?.opening_balance || 0),
        entryDate: data?.opening_balance_date || '',
        note: data?.opening_balance_note || '',
        updatedAt: data?.updated_at || null,
      },
    };
  } catch (error) {
    return { error };
  }
}

export async function setLedgerOpeningBalance({
  amount,
  entryDate,
  note,
  currency = LEDGER_CURRENCY,
} = {}) {
  const cur = normalizeCurrency(currency);
  const amt = Number(amount);
  if (!Number.isFinite(amt)) {
    return { error: new Error('Starting balance must be a number') };
  }

  let balanceDate = '';
  try {
    const rawDate = String(entryDate || '').trim();
    if (rawDate) {
      resolveEntryCreatedAt(rawDate);
      balanceDate = rawDate;
    }
  } catch (error) {
    return { error };
  }

  const trimmedNote = String(note || '').trim();
  const nowIso = new Date().toISOString();
  const payload = {
    currency: cur,
    opening_balance: amt,
    opening_balance_date: balanceDate || null,
    opening_balance_note: trimmedNote || null,
    updated_at: nowIso,
  };

  try {
    const { data: existing, error: findErr } = await fromPublic('ledger_settings')
      .select('id')
      .eq('currency', cur)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing?.id) {
      const { data, error } = await db
        .from('ledger_settings')
        .update(payload)
        .eq('id', existing.id)
        .select('id, currency, opening_balance, opening_balance_date, opening_balance_note, updated_at')
        .single();
      if (error) throw error;
      return { data };
    }

    const { data, error } = await db
      .from('ledger_settings')
      .insert([{ id: cur, ...payload, created_at: nowIso }])
      .select('id, currency, opening_balance, opening_balance_date, opening_balance_note, updated_at')
      .single();
    if (error) throw error;
    return { data };
  } catch (error) {
    return { error };
  }
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

export function buildLedgerReportRows(allEntriesAsc = [], { dateFrom, dateTo, personName, baseOpeningBalance = 0 } = {}) {
  let running = Number(baseOpeningBalance || 0);
  const withBalance = (allEntriesAsc || []).map((entry) => {
    const amt = Number(entry.amount || 0);
    if (entry.direction === 'credit') running += amt;
    else if (entry.direction === 'debit') running -= amt;
    return { ...entry, balanceAfter: running };
  });

  const startMs = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).getTime() : -Infinity;
  const endMs = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).getTime() : Infinity;
  const personKey = normalizePersonKey(personName);

  let openingBalance = Number(baseOpeningBalance || 0);
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
  const [{ data, error }, openingRes] = await Promise.all([
    fetchLedgerEntriesUpTo({ currency, dateTo }),
    fetchLedgerOpeningBalance(currency),
  ]);
  if (error) return { error };
  const report = buildLedgerReportRows(data, {
    dateFrom,
    dateTo,
    personName,
    baseOpeningBalance: Number(openingRes?.data?.amount || 0),
  });
  return { data: report };
}

export async function fetchLedgerPeriods(currency = LEDGER_CURRENCY) {
  try {
    const [entriesRes, openingRes] = await Promise.all([
      fetchLedgerEntriesUpTo({ currency }),
      fetchLedgerOpeningBalance(currency),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    const periods = buildLedgerPeriods({
      openingBalance: Number(openingRes?.data?.amount || 0),
      openingBalanceDate: openingRes?.data?.entryDate || '',
      entries: entriesRes.data || [],
    }).map((period) => ({
      ...period,
      dateFrom: period.startMs != null && Number.isFinite(period.startMs) && period.startMs > 0
        ? entryDateFromIso(new Date(period.startMs + 1).toISOString())
        : (openingRes?.data?.entryDate ? formatLedgerInputDate(openingRes.data.entryDate) : ''),
      dateTo: period.endMs ? entryDateFromIso(new Date(period.endMs).toISOString()) : '',
    }));
    return { data: periods };
  } catch (error) {
    return { error };
  }
}

export async function fetchLedgerPeriodReport({ periodIndex, currency = LEDGER_CURRENCY } = {}) {
  try {
    const idx = Number(periodIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return { error: new Error('Invalid period') };
    }

    const [entriesRes, periodsRes] = await Promise.all([
      fetchLedgerEntriesUpTo({ currency }),
      fetchLedgerPeriods(currency),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    if (periodsRes.error) throw periodsRes.error;

    const period = (periodsRes.data || [])[idx];
    if (!period) return { error: new Error('Period not found') };

    const report = buildLedgerPeriodReportRows(entriesRes.data || [], {
      startMs: period.startMs,
      endMs: period.endMs,
      baseOpeningBalance: period.baseOpeningBalance,
    });

    return {
      data: {
        ...report,
        period,
      },
    };
  } catch (error) {
    return { error };
  }
}

export async function closeLedgerBalance({
  entryDate,
  currency = LEDGER_CURRENCY,
} = {}) {
  const cur = normalizeCurrency(currency);
  const { balance } = await computeBalanceFromEntries(cur);
  if (Math.abs(balance) < BALANCE_EPSILON) {
    return { error: new Error('Balance is already zero') };
  }

  const direction = balance > 0 ? 'debit' : 'credit';
  const amount = Math.round(Math.abs(balance) * 100) / 100;

  const result = await addLedgerEntry({
    direction,
    amount,
    currency: cur,
    personName: PERIOD_CLOSE_PERSON,
    reason: 'Period close — balance zeroed',
    reference: PERIOD_CLOSE_REFERENCE,
    entryDate,
  });

  if (!result.error) {
    sendClosedPeriodWhatsAppPdf(cur).catch(() => {});
  }

  return result;
}

async function sendClosedPeriodWhatsAppPdf(currency = LEDGER_CURRENCY) {
  const periodsRes = await fetchLedgerPeriods(currency);
  if (periodsRes.error) return;

  const closedPeriods = (periodsRes.data || []).filter((period) => period.closed);
  const period = closedPeriods[closedPeriods.length - 1];
  if (!period) return;

  const reportRes = await fetchLedgerPeriodReport({
    periodIndex: period.index,
    currency,
  });
  if (reportRes.error) return;

  const rows = reportRes.data?.rows || [];
  const openingBalance = Number(reportRes.data?.openingBalance || 0);
  const closingBalance = rows.length
    ? Number(rows[rows.length - 1].balanceAfter || 0)
    : openingBalance;

  const { base64, fileName } = await createLedgerPdfBase64({
    openingBalance,
    rows,
    dateFrom: period.dateFrom || '',
    dateTo: period.dateTo || '',
    periodLabel: period.label || '',
  });

  await sendLedgerWhatsApp({
    periodClose: true,
    periodLabel: period.label || '',
    dateFrom: period.dateFrom || '',
    dateTo: period.dateTo || '',
    closingBalance,
    pdfBase64: base64,
    pdfFilename: fileName,
  });
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
      reason: trimmedReason || null,
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
      reason: trimmedReason || null,
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

export {
  isPeriodCloseEntry,
  LEDGER_CURRENCY,
  LEDGER_PAYMENT_METHOD,
  PERIOD_CLOSE_PERSON,
  PERIOD_CLOSE_REFERENCE,
};
