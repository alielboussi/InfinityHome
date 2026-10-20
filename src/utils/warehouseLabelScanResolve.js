/**
 * Resolve Istikbal-style warehouse labels from OCR / barcode text (full label photo).
 * Keep in sync with mobile-apps/shared/warehouseLabelScanResolve.js
 */

import { extractSkuCandidatesFromLabelText } from './warehouseLabelOcrSku.js';
import {
  extractSuggestedNameFromLabelText,
  labelNameIntentForScanMode,
} from './warehouseLabelOcrName.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from './warehouseScanResolver.js';

export const WAREHOUSE_LABEL_SCAN_MODE = {
  /** Carton / packet label — middle barcode (red box), e.g. 12VSK2600P03LCBO */
  PACKET_CARTON: 'packet_carton',
  /** Unit label on BOM product — family SKU (green / yellow text) vs YY… third barcode */
  PRODUCT_BOM_FAMILY: 'product_bom_family',
  /** Single finished unit with header SKU text — match YY… barcode (blue box) */
  PRODUCT_FINISHED_HEADER: 'product_finished_header',
  /** Finished unit without header text — purple numeric barcode */
  PRODUCT_FINISHED_NUMERIC: 'product_finished_numeric',
  /** Finished-only product: header text if present, else numeric barcode */
  PRODUCT_FINISHED_AUTO: 'product_finished_auto',
};

const BARCODE_TOKEN_RES = [
  /\bX\d[A-Z0-9]{8,}-\d{6,}\b/gi,
  /\bX\d[A-Z0-9]{10,}\b/gi,
  /\bYY\d{8,}[A-Z0-9]+\b/gi,
  /\bXX-\d{6,}\b/gi,
  /\b\d{14,20}\b/g,
];

function normalizeBlob(text) {
  return String(text || '')
    .replace(/[|\\]/g, ' ')
    .replace(/\s+/g, ' ');
}

function uniqueTokens(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const token = String(raw || '').trim().toUpperCase();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

/** Raw strings that look like label barcodes (before normalizers). */
const MAX_LABEL_BARCODE_LEN = 72;

/** OCR often inserts spaces in barcodes — search per-line and normalized blobs (not whole-label glue). */
function ocrBarcodeSearchBlobs(text) {
  const raw = String(text || '');
  const blobs = [];
  const push = (b) => {
    const s = String(b || '').trim();
    if (s.length >= 8 && s.length <= MAX_LABEL_BARCODE_LEN) blobs.push(s);
  };
  push(normalizeBlob(raw));
  raw.split(/\r?\n/).forEach((line) => {
    push(normalizeBlob(line));
    push(String(line).replace(/\s/g, '').toUpperCase());
  });
  const tightLines = raw.replace(/\r?\n/g, ' ').split(/\s{2,}/);
  tightLines.forEach((chunk) => {
    push(String(chunk).replace(/\s/g, '').toUpperCase());
  });
  return blobs;
}

function pushBoundedMatches(found, re, blob) {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = r.exec(blob)) !== null) {
    const token = m[0];
    if (token.length <= MAX_LABEL_BARCODE_LEN) found.push(token.toUpperCase());
  }
}

function collectBarcodeMatches(blob, found) {
  const spaced = normalizeBlob(blob);
  for (const re of BARCODE_TOKEN_RES) {
    pushBoundedMatches(found, re, spaced);
  }
  const tight = blob.replace(/\s/g, '');
  pushBoundedMatches(found, /YY\d{8,}[A-Z0-9]{4,40}/gi, tight);
  pushBoundedMatches(found, /X\d[A-Z0-9]{8,}-\d{6,}/gi, tight);
  pushBoundedMatches(found, /X\d[A-Z0-9]{10,48}/gi, tight);
  pushBoundedMatches(found, /\d{14,20}/g, tight);
}

export function extractBarcodeLikeTokens(text) {
  const found = [];
  for (const blob of ocrBarcodeSearchBlobs(text)) {
    collectBarcodeMatches(blob, found);
    normalizeBlob(blob).split(/\s+/).forEach((word) => {
      const w = word.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
      if (w.length >= 12 && (/^X\d/i.test(w) || /^YY\d/i.test(w))) found.push(w);
    });
  }
  return uniqueTokens(found);
}

/**
 * When strict resolve fails, ranked SKU guesses from the same OCR text (partial labels OK).
 */
export function listWarehouseLabelSkuSuggestions(text, mode, options = {}) {
  const resolvedMode = mode || WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO;
  const isPacket = resolvedMode === WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON
    || options?.target === 'packet_search';
  const seen = new Set();
  const ranked = [];

  const add = (sku, source, score) => {
    const normalized = isPacket
      ? normalizeWarehousePacketScan(sku)
      : normalizeWarehouseProductSku(sku);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ranked.push({ sku: normalized, source, score });
  };

  const primary = resolveWarehouseLabelFromText(text, resolvedMode, options);
  if (primary.sku) {
    return [{ sku: primary.sku, source: primary.source }];
  }

  const packetCarton = resolvePacketCarton(text);
  if (packetCarton.sku && isPacketSkuShape(packetCarton.sku)) {
    add(packetCarton.sku, 'packet_carton', 92);
  }

  extractBarcodeLikeTokens(text).forEach((raw, i) => {
    if (/^\d{10,13}$/.test(raw)) return;
    let score = 80 - i;
    if (/^\d{14,20}$/.test(raw)) score += 45;
    if (/^X\d/i.test(raw)) score -= 35;
    if (isPacketSkuShape(raw)) score += 30;
    add(raw, 'barcode_ocr', score);
  });

  extractSkuCandidatesFromLabelText(text).forEach((token, i) => {
    const score = 50 - i + (isPacket && /P\d{2}/i.test(token) ? 20 : 0);
    add(token, 'text_ocr', score);
  });

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ sku, source }) => ({ sku, source }));
}

function skuKeysMatch(a, b) {
  const keysA = expandWarehouseSkuMatchKeys(a);
  const keysB = expandWarehouseSkuMatchKeys(b);
  for (const k of keysA) {
    if (keysB.has(k)) return true;
  }
  return false;
}

function isPacketSkuShape(sku) {
  return /P\d{2}/i.test(String(sku || ''));
}

function headerSkuCandidates(text) {
  return extractSkuCandidatesFromLabelText(text).filter((t) => !isPacketSkuShape(t));
}

function scoreFamilyHeader(token) {
  let score = token.length;
  if (token.startsWith('22')) score += 8;
  if (token.startsWith('23')) score += 4;
  if (isPacketSkuShape(token)) score -= 50;
  return score;
}

function pickBestHeader(text) {
  const candidates = headerSkuCandidates(text);
  if (!candidates.length) return '';
  return [...candidates].sort((a, b) => scoreFamilyHeader(b) - scoreFamilyHeader(a))[0];
}

function normalizedProductFromYyTokens(tokens) {
  return uniqueTokens(
    tokens
      .filter((t) => /^YY\d/i.test(t))
      .map((t) => normalizeWarehouseProductSku(t))
      .filter(Boolean),
  );
}

function matchYyToHeader(yyTokens, headerSku) {
  if (!headerSku) return '';
  const normalized = normalizedProductFromYyTokens(yyTokens);
  for (const sku of normalized) {
    if (skuKeysMatch(sku, headerSku)) return sku;
  }
  for (const raw of yyTokens) {
    const sku = normalizeWarehouseProductSku(raw);
    if (sku && skuKeysMatch(sku, headerSku)) return sku;
  }
  return '';
}

function resolvePacketCarton(text) {
  const barcodes = extractBarcodeLikeTokens(text);
  const packetFromBarcodes = barcodes
    .map((t) => normalizeWarehousePacketScan(t))
    .filter((sku) => sku && isPacketSkuShape(sku));

  if (packetFromBarcodes.length) {
    return {
      sku: packetFromBarcodes.sort((a, b) => b.length - a.length)[0],
      source: 'barcode_packet',
    };
  }

  const ocrPackets = extractSkuCandidatesFromLabelText(text)
    .filter(isPacketSkuShape)
    .map((t) => normalizeWarehousePacketScan(t))
    .filter(Boolean);

  if (ocrPackets.length) {
    return { sku: ocrPackets[0], source: 'ocr_packet_text' };
  }

  for (const raw of barcodes) {
    const sku = normalizeWarehousePacketScan(raw);
    if (sku) return { sku, source: 'barcode_normalized' };
  }

  return { sku: '', source: 'none' };
}

function resolveProductBomFamily(text) {
  const header = pickBestHeader(text);
  const yyRaw = extractBarcodeLikeTokens(text).filter((t) => /^YY\d/i.test(t));
  const matched = matchYyToHeader(yyRaw, header);
  if (matched) {
    return { sku: matched, source: header ? 'yy_matched_header' : 'yy_barcode' };
  }
  if (header) {
    return { sku: normalizeWarehouseProductSku(header), source: 'header_text' };
  }
  const fromYy = normalizedProductFromYyTokens(yyRaw);
  if (fromYy.length) {
    const family = fromYy.filter((s) => !isPacketSkuShape(s));
    return { sku: (family[0] || fromYy[0]), source: 'yy_barcode' };
  }
  for (const raw of extractBarcodeLikeTokens(text)) {
    const sku = normalizeWarehouseProductSku(raw);
    if (sku && !isPacketSkuShape(sku)) {
      return { sku, source: 'barcode_normalized' };
    }
  }
  return { sku: '', source: 'none' };
}

function resolveProductFinishedHeader(text) {
  const header = pickBestHeader(text);
  const yyRaw = extractBarcodeLikeTokens(text).filter((t) => /^YY\d/i.test(t));
  const matched = matchYyToHeader(yyRaw, header);
  if (matched) return { sku: matched, source: 'yy_matched_header' };
  if (header) return { sku: normalizeWarehouseProductSku(header), source: 'header_text' };
  return { sku: '', source: 'none' };
}

function numericsEmbeddedInYyBarcodes(text) {
  const embedded = new Set();
  extractBarcodeLikeTokens(text)
    .filter((t) => /^YY/i.test(t))
    .forEach((yy) => {
      const body = String(yy).replace(/^YY/i, '');
      const re = /\d{14,20}/g;
      let m;
      while ((m = re.exec(body)) !== null) {
        embedded.add(m[0]);
      }
    });
  return embedded;
}

function numericsFromOwnOcrLines(text) {
  const found = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    const tight = String(line).replace(/\s/g, '').trim();
    if (/^\d{14,20}$/.test(tight)) found.push(tight);
  });
  return found;
}

function resolveProductFinishedNumeric(text) {
  const yyEmbedded = numericsEmbeddedInYyBarcodes(text);

  const fromLines = numericsFromOwnOcrLines(text);
  if (fromLines.length) {
    return {
      sku: fromLines.sort((a, b) => b.length - a.length)[0],
      source: 'numeric_barcode_line',
    };
  }

  const barcodes = extractBarcodeLikeTokens(text);
  const numeric = barcodes
    .filter((t) => /^\d{14,20}$/.test(t))
    .filter((t) => !yyEmbedded.has(t));
  if (numeric.length) {
    return {
      sku: numeric.sort((a, b) => b.length - a.length)[0],
      source: 'numeric_barcode',
    };
  }
  const blob = normalizeBlob(text);
  const embedded = (blob.match(/\b(\d{14,20})\b/g) || [])
    .filter((t) => !yyEmbedded.has(t));
  if (embedded.length) {
    return {
      sku: embedded.sort((a, b) => b.length - a.length)[0],
      source: 'numeric_ocr',
    };
  }
  return { sku: '', source: 'none' };
}

/**
 * Finished-product labels (e.g. Lenor): catalog SKU is the 14–20 digit Code 128
 * (3002780951000060), not factory X… carton barcodes or BESTREST lot text.
 */
function resolveProductFinishedAuto(text) {
  const numeric = resolveProductFinishedNumeric(text);
  if (numeric.sku) {
    return numeric;
  }
  return resolveProductFinishedHeader(text);
}

/**
 * @param {string} text OCR and/or barcode values from a label image
 * @param {string} mode One of WAREHOUSE_LABEL_SCAN_MODE
 * @param {{ target?: string }} [options] e.g. target `packet_search` for BOM packet add
 * @returns {{ sku: string, source: string, mode: string, suggestedName: string, nameIntent: string }}
 */
export function resolveWarehouseLabelFromText(text, mode, options = {}) {
  const resolvedMode = mode || WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO;
  let result = { sku: '', source: 'none' };

  switch (resolvedMode) {
    case WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON:
      result = resolvePacketCarton(text);
      break;
    case WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY:
      result = resolveProductBomFamily(text);
      break;
    case WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_HEADER:
      result = resolveProductFinishedHeader(text);
      break;
    case WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_NUMERIC:
      result = resolveProductFinishedNumeric(text);
      break;
    case WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO:
    default:
      result = resolveProductFinishedAuto(text);
      break;
  }

  const nameIntent = labelNameIntentForScanMode(resolvedMode, options);
  const suggestedName = extractSuggestedNameFromLabelText(text, { intent: nameIntent });

  return {
    sku: result.sku || '',
    source: result.source || 'none',
    mode: resolvedMode,
    suggestedName,
    nameIntent,
  };
}

/** Mobile / web form helper for product SKU capture. */
export function warehouseLabelScanModeForProductForm({
  finishedOnly = false,
  bomEditMode = false,
  target = 'family_sku',
} = {}) {
  if (target === 'packet_search') {
    return WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON;
  }
  if (finishedOnly) {
    return WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO;
  }
  if (bomEditMode) {
    return WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY;
  }
  return WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY;
}
