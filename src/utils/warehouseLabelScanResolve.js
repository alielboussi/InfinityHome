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
export function extractBarcodeLikeTokens(text) {
  const blob = normalizeBlob(text);
  const found = [];
  for (const re of BARCODE_TOKEN_RES) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(blob)) !== null) {
      found.push(m[0].toUpperCase());
    }
  }
  blob.split(/\s+/).forEach((word) => {
    const w = word.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
    if (w.length >= 12 && (/^X\d/i.test(w) || /^YY\d/i.test(w))) found.push(w);
  });
  return uniqueTokens(found);
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

function resolveProductFinishedNumeric(text) {
  const barcodes = extractBarcodeLikeTokens(text);
  const numeric = barcodes.filter((t) => /^\d{14,20}$/.test(t));
  if (numeric.length) {
    return {
      sku: numeric.sort((a, b) => b.length - a.length)[0],
      source: 'numeric_barcode',
    };
  }
  const blob = normalizeBlob(text);
  const embedded = blob.match(/\b(\d{14,20})\b/g);
  if (embedded?.length) {
    return {
      sku: embedded.sort((a, b) => b.length - a.length)[0],
      source: 'numeric_ocr',
    };
  }
  return { sku: '', source: 'none' };
}

function resolveProductFinishedAuto(text) {
  const header = pickBestHeader(text);
  if (header && header.length >= 8) {
    return resolveProductFinishedHeader(text);
  }
  const numeric = resolveProductFinishedNumeric(text);
  if (numeric.sku) return numeric;
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
