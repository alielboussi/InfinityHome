function capitalizeSegment(segment) {
  const s = String(segment || '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function titleCaseWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word
      .split(/([-/])/)
      .map((part) => (part === '-' || part === '/' ? part : capitalizeSegment(part)))
      .join(''))
    .join(' ');
}
