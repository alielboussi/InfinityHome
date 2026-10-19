/**
 * Suggest a display name from Istikbal-style label OCR (packets vs product Turkish field).
 * Keep in sync with src/utils/warehouseLabelOcrName.js
 */

const IGNORE_LINE_RE = [
  /^X\d/i,
  /^YY\d/i,
  /^XX-/i,
  /^\d{10,}$/,
  /^LOT\b/i,
  /^SIPARIS\b/i,
  /^PACKAGE\b/i,
  /^TOTAL\s+PACKAGE/i,
  /^VERSIYON\b/i,
  /^MADE\s+IN\b/i,
  /^ISTIKBAL\b/i,
  /^UNITE\s+KODU/i,
  /^UNIT\s+CODE/i,
  /^KODE\s+DER\b/i,
  /^URUN\s+ADI\s*\/\s*PRODUCT/i,
  /^PRODUCT\s*NAME/i,
  /^PCK\.?\s*NO/i,
  /^TTL\.?\s*PCK/i,
  /^SIPARIS\s+NO/i,
];

const TURKISH_CHAR_RE = /[şğıüöçŞĞİÜÖÇ]/;

function cleanLine(line) {
  return String(line || '')
    .replace(/\s+/g, ' ')
    .replace(/[|]/g, ' ')
    .trim();
}

function isNoiseLine(line) {
  const t = cleanLine(line);
  if (!t || t.length < 3) return true;
  if (IGNORE_LINE_RE.some((re) => re.test(t))) return true;
  if (/^\d{2}[A-Z0-9]{6,}$/i.test(t.replace(/[\s-]/g, ''))) return true;
  if (/^[\d\s./:-]+$/.test(t)) return true;
  return false;
}

function scorePacketLine(line) {
  let score = Math.min(line.length, 80);
  if (/PCK\.?\s*NAME/i.test(line)) score += 120;
  if (/\bPK-\d/i.test(line)) score += 40;
  if (/\/\s*[A-Za-z]/.test(line)) score += 25;
  if (/^[A-Z][a-z]/.test(line)) score += 15;
  if (line.length < 6) score -= 30;
  return score;
}

function scoreProductTurkishLine(line) {
  let score = Math.min(line.length, 80);
  if (TURKISH_CHAR_RE.test(line)) score += 50;
  if (/\//.test(line) && /[A-ZÇĞİÖŞÜ]{3,}/i.test(line)) score += 35;
  if (/\b(CEVIZ|GRI|SIYAH|BEYAZ|KAHVE|ANTRASIT|VENA)\b/i.test(line)) score += 25;
  if (/\b(HOHER|NUSSBAUM|NEBELIG|WALNUT|ANTHRACITE|MISTY)\b/i.test(line)) score -= 45;
  if (/^\d{2}[A-Z]/i.test(line.replace(/\s/g, ''))) score -= 80;
  if (/^VISTA\b/i.test(line) && line.length < 24) score += 10;
  if (line.length < 5) score -= 30;
  return score;
}

function linesFromOcr(text) {
  const raw = String(text || '');
  const byNewline = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
  if (byNewline.length >= 2) return byNewline;
  return raw
    .replace(/[|\\]/g, '\n')
    .split(/\n/)
    .map(cleanLine)
    .filter(Boolean);
}

function fromPckName(text) {
  const m = text.match(/PCK\.?\s*NAME\s*:?\s*(.+?)(?:\n|$)/i);
  if (!m) return '';
  return cleanLine(m[1]).replace(/\s*\/\s*$/, '');
}

export function extractSuggestedNameFromLabelText(text, options = {}) {
  const intent = options.intent === 'product_turkish' ? 'product_turkish' : 'packet';
  const blob = String(text || '');

  if (intent === 'packet') {
    const pck = fromPckName(blob);
    if (pck) return pck;
  }

  const lines = linesFromOcr(blob).filter((line) => !isNoiseLine(line));
  if (!lines.length) return '';

  const scored = lines.map((line) => ({
    line,
    score: intent === 'packet' ? scorePacketLine(line) : scoreProductTurkishLine(line),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 5) return '';
  return best.line.slice(0, 160);
}

export function labelNameIntentForScanMode(mode, { target } = {}) {
  if (target === 'packet_search') return 'packet';
  if (mode === 'packet_carton') return 'packet';
  return 'product_turkish';
}

export const LABEL_NAME_MEMORY_KIND = {
  PACKET: 'packet',
  PRODUCT_TURKISH: 'product_turkish',
};
