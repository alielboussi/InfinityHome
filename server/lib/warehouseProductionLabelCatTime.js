/**
 * Warehouse production label date/time — Central Africa Time (CAT, UTC+2).
 * Vercel runs in UTC; labels must show local warehouse time (Zambia).
 */

export const PRODUCTION_LABEL_TIME_ZONE = 'Africa/Lusaka';

function productionLabelCatParts(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PRODUCTION_LABEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: pick('day'),
    month: pick('month'),
    year: pick('year'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
}

export function formatProductionLabelBlockDate(date) {
  const { day, month, year } = productionLabelCatParts(date);
  return `${day}     /     ${month}     /     ${year}`;
}

export function formatProductionLabelBlockTime(date) {
  const { hour, minute } = productionLabelCatParts(date);
  return `${hour}     :     ${minute}`;
}
