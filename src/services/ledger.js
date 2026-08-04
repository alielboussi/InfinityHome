import db from '../dataClient';
import { fromPublic } from '../dbSchema';

function normalizeCurrency(cur) {
  const s = (cur || '').toString().trim().toUpperCase();
  if (!s) return 'K';
  if (['USD', 'US$', 'US DOLLAR', 'DOLLAR', '$'].includes(s)) return 'USD';
  if (['ZMW', 'ZMK', 'K', 'KWACHA', 'ZAMBIAN KWACHA'].includes(s)) return 'K';
  return s;
}

export async function fetchLedgerBalances() {
  try {
    const { data, error } = await fromPublic('ledger_balances')
      .select('currency, balance, entry_count, last_entry_at')
      .order('currency', { ascending: true });
    if (error) throw error;
    const mapped = {};
    (data || []).forEach(r => {
      const cur = normalizeCurrency(r.currency || 'K');
      mapped[cur] = {
        balance: Number(r.balance || 0),
        entryCount: r.entry_count || 0,
        lastEntryAt: r.last_entry_at || null,
      };
    });
    return { data: mapped };
  } catch (error) {
    return { error };
  }
}

export async function fetchLedgerEntries({ limit = 50, currency, dateFrom, dateTo } = {}) {
  try {
    let q = fromPublic('ledger_entries')
      .select('id, direction, amount, currency, reason, reference, location_id, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (currency) q = q.eq('currency', normalizeCurrency(currency));
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
    const { data, error } = await q;
    if (error) throw error;
    return { data: data || [] };
  } catch (error) {
    return { error };
  }
}

export async function addLedgerEntry({ direction, amount, currency = 'K', reason, reference = '', location_id = null }) {
  const dir = (direction || '').toLowerCase();
  const cur = normalizeCurrency(currency);
  const amt = Number(amount || 0);
  if (!['credit', 'debit'].includes(dir)) {
    return { error: new Error('Direction must be credit or debit') };
  }
  if (!(amt > 0)) {
    return { error: new Error('Amount must be greater than zero') };
  }
  if (!reason || !reason.trim()) {
    return { error: new Error('Reason is required') };
  }
  try {
    const payload = {
      direction: dir,
      amount: amt,
      currency: cur,
      reason: reason.trim(),
      reference: reference ? reference.trim() : null,
      location_id: location_id || null,
    };
    const { data, error } = await db
      .from('ledger_entries')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return { data };
  } catch (error) {
    return { error };
  }
}
