export function reportToYMD(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function defaultReportDateRange(today = new Date()) {
  const end = reportToYMD(today);
  const startD = new Date(today);
  startD.setDate(startD.getDate() - 30);
  return { startDate: reportToYMD(startD), endDate: end };
}

export function parseReportLocalRange(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  return { start, end, startMs: start.getTime(), endMs: end.getTime() };
}

export function filterRowsByLocalDate(rows, startDate, endDate, dateField = 'created_at') {
  const range = parseReportLocalRange(startDate, endDate);
  if (!range) return rows || [];
  return (rows || []).filter((row) => {
    const t = new Date(row?.[dateField]).getTime();
    return !Number.isNaN(t) && t >= range.startMs && t <= range.endMs;
  });
}

export function rowTimestampInLocalRange(value, startDate, endDate) {
  const range = parseReportLocalRange(startDate, endDate);
  if (!range || !value) return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t >= range.startMs && t <= range.endMs;
}

export function formatReportDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}
