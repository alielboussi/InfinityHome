export const PERIOD_CLOSE_REFERENCE = '__period_close__';
export const PERIOD_CLOSE_PERSON = 'Period close';

export function isPeriodCloseEntry(entry) {
  return String(entry?.reference || '') === PERIOD_CLOSE_REFERENCE;
}

function entryTimestampMs(entry) {
  const ts = new Date(entry?.created_at || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function resolvePeriodStartMs({ openingBalanceDate, firstEntry }) {
  if (openingBalanceDate) {
    const parts = String(openingBalanceDate).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts) {
      const dt = new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
      const ms = dt.getTime();
      if (Number.isFinite(ms)) return ms - 1;
    }
  }
  if (firstEntry) return entryTimestampMs(firstEntry) - 1;
  return null;
}

export function buildLedgerPeriods({
  openingBalance = 0,
  openingBalanceDate = '',
  entries = [],
} = {}) {
  const sorted = [...(entries || [])].sort(
    (a, b) => entryTimestampMs(a) - entryTimestampMs(b),
  );
  const closeEntries = sorted.filter(isPeriodCloseEntry);
  const movementEntries = sorted.filter((entry) => !isPeriodCloseEntry(entry));
  const firstMovement = movementEntries[0] || null;
  const periodStartMs = resolvePeriodStartMs({
    openingBalanceDate,
    firstEntry: firstMovement,
  });

  const periods = [];
  let previousCloseMs = periodStartMs;

  closeEntries.forEach((closeEntry, index) => {
    const endMs = entryTimestampMs(closeEntry);
    periods.push({
      index,
      label: `Period ${index + 1}`,
      startMs: previousCloseMs,
      endMs,
      closed: true,
      closeEntryId: closeEntry.id,
      baseOpeningBalance: index === 0 ? Number(openingBalance || 0) : 0,
    });
    previousCloseMs = endMs;
  });

  const hasMovements = movementEntries.length > 0;
  const hasOpenActivity = hasMovements && (
    closeEntries.length === 0
    || movementEntries.some((entry) => entryTimestampMs(entry) > entryTimestampMs(closeEntries[closeEntries.length - 1]))
  );

  if (hasOpenActivity || closeEntries.length === 0) {
    periods.push({
      index: closeEntries.length,
      label: closeEntries.length ? `Period ${closeEntries.length + 1} (open)` : 'Current period',
      startMs: closeEntries.length ? previousCloseMs : periodStartMs,
      endMs: null,
      closed: false,
      closeEntryId: null,
      baseOpeningBalance: closeEntries.length === 0 ? Number(openingBalance || 0) : 0,
    });
  }

  return periods;
}

export function buildLedgerPeriodReportRows(allEntriesAsc = [], {
  startMs = null,
  endMs = null,
  baseOpeningBalance = 0,
} = {}) {
  const sorted = [...(allEntriesAsc || [])].sort(
    (a, b) => entryTimestampMs(a) - entryTimestampMs(b),
  );

  let running = Number(baseOpeningBalance || 0);
  const rows = [];

  sorted.forEach((entry) => {
    const ts = entryTimestampMs(entry);
    if (!ts) return;

    if (startMs != null && ts <= startMs) {
      const amt = Number(entry.amount || 0);
      if (entry.direction === 'credit') running += amt;
      else if (entry.direction === 'debit') running -= amt;
      return;
    }
    if (endMs != null && ts > endMs) return;

    const amt = Number(entry.amount || 0);
    if (entry.direction === 'credit') running += amt;
    else if (entry.direction === 'debit') running -= amt;
    rows.push({ ...entry, balanceAfter: running });
  });

  return {
    openingBalance: Number(baseOpeningBalance || 0),
    rows,
  };
}
