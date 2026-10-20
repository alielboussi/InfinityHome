/**
 * Suggest a display name from Istikbal-style label OCR (packets vs product Turkish field).
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
  /^UNITE\b/i,
  /^URUN\s+ADI\s*\/\s*PRODUCT/i,
  /^PRODUCT\s*NAME/i,
  /^PCK\.?\s*NO/i,
  /^TTL\.?\s*PCK/i,
  /^SIPARIS\s+NO/i,
  /^BESTREST-Z-/i,
  /^[A-Z0-9]+-Z-\d{4}\//i,
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
  if (!t) return true;
  if (/^[0-9]{1,3}[A-Z]?$/i.test(t)) return false;
  if (t.length < 3) return true;
  if (IGNORE_LINE_RE.some((re) => re.test(t))) return true;
  const tight = t.replace(/[\s-]/g, '');
  if (/^TU\d{2}[A-Z0-9]{8,}$/i.test(tight)) return true;
  if (/^\d{2}[A-Z0-9]{6,}$/i.test(tight)) return true;
  if (/^[\d\s./:-]+$/.test(t)) return true;
  return false;
}

function scorePacketLine(line) {
  let score = Math.min(line.length, 80);
  if (/PCK\.?\s*NAME/i.test(line)) score += 120;
  if (/\bPK-\d/i.test(line)) score += 40;
  if (/\b(SANDALYE|KOLTUK|SEHPA|KOMODIN|MASA)\b/i.test(line)) score += 35;
  if (/\b\d+LI\b/i.test(line)) score += 28;
  if (/\bPKT\b/i.test(line) || /\(TEK\s*PARCA\)/i.test(line)) score -= 85;
  if (/\d\.?PKT/i.test(line)) score -= 70;
  if (/\/\s*[A-Za-z]/.test(line)) score += 25;
  if (/^[A-Z][a-z]/.test(line)) score += 15;
  if (line.length < 6) score -= 30;
  if (line.length > 55) score -= 25;
  return score;
}

function titleCasePacketHeadline(name) {
  return String(name || '')
    .split(/\s+/)
    .map((w) => {
      if (/^\d+LI$/i.test(w)) return w.toUpperCase();
      if (w.length <= 2) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function fromPacketTitleBlock(text) {
  const lines = linesFromOcr(text).map(cleanLine).filter((line) => line && !isNoiseLine(line));
  for (let i = 0; i < lines.length - 1; i += 1) {
    const a = lines[i];
    const b = lines[i + 1];
    if (/X\d/i.test(a) || /X\d/i.test(b)) continue;
    if (/PKT|TEK\s*PARCA/i.test(a) || /PKT|TEK\s*PARCA/i.test(b)) continue;
    const titleA = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9\s]{3,40}$/i.test(a) && /[A-Z]{4,}/i.test(a);
    const titleB = /^\d+LI\b/i.test(b) || /^[A-ZÇĞİÖŞÜ]{2,}(\s+[A-ZÇĞİÖŞÜ]+){0,2}$/i.test(b);
    if (titleA && titleB && a.length <= 36 && b.length <= 28) {
      return titleCasePacketHeadline(`${a} ${b}`.replace(/\s+/g, ' ').trim());
    }
  }
  const longDesc = lines.find(
    (l) => /\b(SANDALYE|KOLTUK|SEHPA)\b/i.test(l) && /\b\d+LI\b/i.test(l),
  );
  if (longDesc) {
    const trimmed = longDesc
      .replace(/\s*\d\.?PKT.*$/i, '')
      .replace(/\s*\(TEK\s*PARCA\)\s*/gi, '')
      .trim();
    if (trimmed) return titleCasePacketHeadline(trimmed);
  }
  return '';
}

function scoreProductTurkishLine(line) {
  let score = Math.min(line.length, 80);
  if (TURKISH_CHAR_RE.test(line)) score += 50;
  if (/\bORTASEHPA\b/i.test(line) || /\bLENOR\b/i.test(line)) score += 45;
  if (/\s/.test(line) && !/\/\d{8,}/.test(line)) score += 20;
  if (/\//.test(line) && /[A-ZÇĞİÖŞÜ]{3,}/i.test(line)) score += 35;
  if (/\b(CEVIZ|GRI|SIYAH|BEYAZ|KAHVE|ANTRASIT|VENA)\b/i.test(line)) score += 25;
  if (/\bGVDPKT\b/i.test(line) || /\bB\d+LENOR\b/i.test(line)) score -= 70;
  if (/\b(HOHER|NUSSBAUM|NEBELIG|WALNUT|ANTHRACITE|MISTY)\b/i.test(line)) score -= 45;
  if (/BESTREST-Z-/i.test(line)) score -= 120;
  if (/^[A-Z0-9]+-Z-\d{4}\//i.test(line.replace(/\s/g, ''))) score -= 100;
  if (/^\d{2}[A-Z]/i.test(line.replace(/\s/g, ''))) score -= 80;
  if (/^X\d/i.test(line.replace(/\s/g, ''))) score -= 90;
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

function fromFinishedProductTitleBlock(text) {
  const lines = linesFromOcr(text).map(cleanLine).filter((line) => line && !isNoiseLine(line));
  for (let i = 0; i < lines.length - 1; i += 1) {
    const a = lines[i];
    const b = lines[i + 1];
    if (/X\d/i.test(a) || /X\d/i.test(b)) continue;
    if (/GVDPKT|PKT|BESTREST/i.test(a) || /GVDPKT|PKT/i.test(b)) continue;
    const titleA = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s]{4,36}$/i.test(a) && /\b(LENOR|ORTASEHPA|SANDALYE|KOLTUK)\b/i.test(a);
    const suffixB = /^[0-9]{1,3}[A-Z]?$/i.test(b);
    if (titleA && suffixB) {
      return `${a} ${b}`.replace(/\s+/g, ' ').trim();
    }
  }
  const compact = lines.find((l) => /^LENOR\s+ORTASEHPA\b/i.test(l) && !/GVDPKT/i.test(l));
  if (compact) return compact.replace(/\s+GVDPKT.*$/i, '').trim();
  return '';
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
    const titleBlock = fromPacketTitleBlock(blob);
    if (titleBlock) return titleBlock;
  }

  if (intent === 'product_turkish') {
    const finishedTitle = fromFinishedProductTitleBlock(blob);
    if (finishedTitle) return finishedTitle;
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
