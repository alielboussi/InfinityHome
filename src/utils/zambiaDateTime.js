/** Kitwe / Zambia — Africa/Lusaka (UTC+2, no DST). */
export const ZAMBIA_TIME_ZONE = 'Africa/Lusaka';

const ZAMBIA_OFFSET = '+02:00';

function parseInstantMs(value) {
  if (value == null || value === '') return Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value.seconds != null) {
    return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  const s = String(value).trim();
  if (!s) return Date.now();
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : Date.now();
  }
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const withOffset = normalized.length <= 10
    ? `${normalized}T00:00:00${ZAMBIA_OFFSET}`
    : `${normalized}${ZAMBIA_OFFSET}`;
  const t = Date.parse(withOffset);
  return Number.isFinite(t) ? t : Date.now();
}

function formatWithTimeZone(ms, options) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: ZAMBIA_TIME_ZONE, ...options }).format(ms);
  } catch {
    const z = new Date(ms + 2 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    if (options.hour !== undefined && options.minute !== undefined) {
      return `${pad(z.getUTCHours())}:${pad(z.getUTCMinutes())}`;
    }
    return `${pad(z.getUTCDate())}/${pad(z.getUTCMonth() + 1)}/${z.getUTCFullYear()}`;
  }
}

export function formatZambiaDate(value) {
  return formatWithTimeZone(parseInstantMs(value), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatZambiaTime(value) {
  return formatWithTimeZone(parseInstantMs(value), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Date · time with Zambia zone (for delivery note header). */
export function formatZambiaDateTimeLine(value) {
  return `${formatZambiaDate(value)} · ${formatZambiaTime(value)} (Zambia)`;
}

export { parseInstantMs };
