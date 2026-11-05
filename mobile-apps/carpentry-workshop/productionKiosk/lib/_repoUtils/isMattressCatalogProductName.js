/** Mattress / bedding names in warehouse catalog (English). Shared by web + server photo pipeline. */
export function isMattressCatalogProductName(productName) {
  const n = String(productName || '').trim().toLowerCase();
  if (!n) return false;
  return /\bmattress\b/.test(n)
    || /\b(topper|bed base|bedbase)\b/.test(n)
    || (/\bbed\b/.test(n) && !/\bbedside\b|\bbedroom set\b/.test(n));
}
