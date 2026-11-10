export function matchesReportUserFilter(text, userFilter) {
  const needle = String(userFilter || '').trim().toLowerCase();
  if (!needle) return true;
  return String(text || '').toLowerCase().includes(needle);
}
