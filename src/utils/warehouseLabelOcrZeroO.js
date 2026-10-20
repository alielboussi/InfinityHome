/**
 * Istikbal-style labels: slashed circle = digit 0, open circle = letter O.
 * OCR returns plain text — normalize Unicode slash-zero glyphs, then repair O/0 in SKU tokens.
 */

/** Glyphs suppliers use for slashed zero (and common OCR misreads). */
const SLASHED_ZERO_PATTERN = /[Øø∅〇⓪]/g;
const ZERO_WITH_COMBINING_SLASH = /0[\u0335\u0336\u0337\u0338]/g;

export function normalizeSlashedZeroGlyphs(text) {
  return String(text || '')
    .replace(ZERO_WITH_COMBINING_SLASH, '0')
    .replace(SLASHED_ZERO_PATTERN, '0');
}

/**
 * Repair O vs 0 inside one warehouse SKU token (after glyphs normalized).
 * @param {string} token
 */
export function disambiguateZeroAndLetterOInSku(token) {
  let s = normalizeSlashedZeroGlyphs(token).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return s;

  // Digit run before packet marker P: …255OP03 → …2550P03
  s = s.replace(/(\d)O(P\d)/g, '$10$2');

  // Packet index after a digit (P03 / P030): O → 0 in index only — not color "POP"
  s = s.replace(/(\d)P([O0\d]{2,3})/g, (_, d, seg) => `${d}P${seg.replace(/O/g, '0')}`);

  // Single 0 between letters (L0E → LOE)
  s = s.replace(/([A-Z])0([A-Z])/g, '$1O$2');

  // Zeros misread as O before a letter color suffix (255OOPDX → 25500PDX)
  s = s.replace(/(\d)(O+)(?=[A-Z]{2,})/g, (_, d, os) => d + '0'.repeat(os.length));

  // Between digits: O → 0 (e.g. 255O0 → 25500)
  let prev = s;
  for (let i = 0; i < 6; i += 1) {
    const next = prev.replace(/(\d)O(\d)/g, '$10$2');
    if (next === prev) break;
    prev = next;
  }
  s = prev;

  // After packet index, lone slashed zero before color letters: P030POP / P03OPOP
  s = s.replace(/P(\d{2})O([A-Z]{2,})/g, 'P$10$2');

  // Letter-only runs (LOE, POP, PDX): 0 → O
  s = s.replace(/([A-Z]{2,})/g, (run) => run.replace(/0/g, 'O'));

  // Leading product/packet prefix digits (12… / 22…)
  const prefix = s.match(/^(\d{2})/);
  if (prefix) {
    const head = prefix[1];
    const tail = s.slice(2);
    const fixedTail = tail.replace(/O/g, (ch, idx, str) => {
      const left = str[idx - 1];
      const right = str[idx + 1];
      if (/\d/.test(left) && /\d/.test(right)) return '0';
      if (/[A-Z]/.test(left) && /[A-Z]/.test(right)) return 'O';
      if (/\d/.test(left) && /[A-Z]/.test(right)) return '0';
      if (/[A-Z]/.test(left) && /\d/.test(right)) return 'O';
      return ch;
    });
    s = head + fixedTail;
  }

  return s;
}

/**
 * @param {string} text Raw OCR
 * @param {'sku'|'text'} mode — sku applies token repair on alphanumeric lines
 */
export function normalizeSupplierZeroAndLetterOcrText(text, mode = 'text') {
  const normalized = normalizeSlashedZeroGlyphs(text);
  if (mode !== 'sku') return normalized;

  const lines = normalized.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let next = trimmed.replace(/\b(\d{2}[A-Z0-9]{6,26})\b/gi, (token) => disambiguateZeroAndLetterOInSku(token));
    next = next.replace(/\b(TU\d{2}[A-Z0-9]{8,24})\b/gi, (token) => disambiguateZeroAndLetterOInSku(token));
    return next;
  });
  return out.join('\n');
}
