/**
 * Pull likely warehouse / Istikbal SKUs from OCR text on factory labels.
 * Finished unit codes are often printed as text (e.g. 22AYS3150ZIZI); cartons may include P01.
 */

const SKU_TOKEN_RE = /\b(\d{2}[A-Z]{2,6}\d{3,}[A-Z0-9]{0,16})\b/gi;

/** Tokens that are not product SKUs on typical Istikbal-style labels. */
const IGNORE_EXACT = new Set([
  'madeinturkey',
  'istikbal',
  'porcelain',
  'productname',
  'unitcode',
  'urunadi',
]);

function normalizeToken(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isPlausibleSku(token) {
  if (!token || token.length < 8 || token.length > 28) return false;
  if (/^\d+$/.test(token)) return false;
  if (IGNORE_EXACT.has(token.toLowerCase())) return false;
  if (!/^\d{2}[A-Z]/.test(token)) return false;
  return true;
}

function scoreSkuCandidate(token) {
  let score = token.length;
  if (/P\d{2}/.test(token)) score -= 30;
  if (token.startsWith('22')) score += 5;
  if (token.includes('AYS')) score += 10;
  return score;
}

/**
 * @param {string} text Raw OCR output
 * @returns {string[]} Unique SKU candidates, best guess first
 */
export function extractSkuCandidatesFromLabelText(text) {
  const blob = String(text || '')
    .replace(/[|\\]/g, ' ')
    .replace(/\s+/g, ' ');

  const seen = new Set();
  const candidates = [];

  let match;
  const re = new RegExp(SKU_TOKEN_RE.source, 'gi');
  while ((match = re.exec(blob)) !== null) {
    const token = normalizeToken(match[1]);
    if (!isPlausibleSku(token)) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(token);
  }

  blob.split(/\s+/).forEach((word) => {
    const token = normalizeToken(word);
    if (!isPlausibleSku(token)) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(token);
  });

  return candidates.sort((a, b) => scoreSkuCandidate(b) - scoreSkuCandidate(a));
}
