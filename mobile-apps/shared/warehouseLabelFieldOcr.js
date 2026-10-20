/**
 * Per-field label OCR (printed text only). Keep in sync with src/utils/warehouseLabelFieldOcr.js
 */

import { extractSkuCandidatesFromLabelText } from './warehouseLabelOcrSku';
import { extractSuggestedNameFromLabelText } from './warehouseLabelOcrName';
import {
  isTuFinishedMultiUnitLabelSku,
  isWarehousePacketCartonSku,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
} from './warehouseScanResolver';

export const WAREHOUSE_LABEL_OCR_FIELD = {
  PACKET_SKU: 'packet_sku',
  PRODUCT_SKU: 'product_sku',
  PRODUCT_TURKISH: 'product_turkish',
  PACKET_NAME: 'packet_name',
};

const FIELD_HINTS = {
  [WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU]:
    'Frame the printed SKU line (Lenor numeric, Prizma TU…, or Serra …P01…). Text only — not barcodes.',
  [WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU]:
    'Frame the sellable SKU text (Lenor digits, Prizma TU…, or Serra Unite Kodu / family code). Text only — not barcodes.',
  [WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_TURKISH]:
    'Frame the Turkish title (e.g. Lenor Ortasehpa 1B). Edit after capture if needed.',
  [WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME]:
    'Frame the description line (English PRODUCT NAME, Prizma title, etc.). Text only.',
};

export function warehouseLabelOcrFieldHint(field) {
  return FIELD_HINTS[field] || 'Capture printed label text for this field.';
}

function linesFromBlob(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function tightToken(line) {
  return String(line || '').replace(/\s/g, '').toUpperCase();
}

function scorePacketSkuCandidate(token, index) {
  let score = 100 - index * 3;
  if (isTuFinishedMultiUnitLabelSku(token)) score += 85;
  if (/^\d{14,20}$/.test(token)) score += 78;
  if (isWarehousePacketCartonSku(token)) score += 80;
  if (/P\d{2}/i.test(token)) score += 40;
  if (/^X\d/i.test(token)) score -= 60;
  if (/^YY\d/i.test(token)) score -= 50;
  return score;
}

function extractPacketSkuCandidates(text) {
  const ranked = [];
  const seen = new Set();
  const add = (raw, index) => {
    const tight = tightToken(raw);
    let sku = normalizeWarehousePacketScan(raw) || normalizeWarehousePacketScan(tight);
    if (!sku && isTuFinishedMultiUnitLabelSku(tight)) {
      sku = normalizeWarehouseProductSku(tight) || tight;
    }
    if (!sku && /^\d{14,20}$/.test(tight)) sku = tight;
    if (!sku || seen.has(sku.toLowerCase())) return;
    seen.add(sku.toLowerCase());
    ranked.push({ value: sku, score: scorePacketSkuCandidate(sku, index) });
  };

  linesFromBlob(text).forEach((line, i) => {
    const tight = tightToken(line);
    if (/^TU\d{2}[A-Z0-9]{8,}$/i.test(tight)) add(tight, i);
    if (/^\d{14,20}$/.test(tight)) add(tight, i);
    if (tight.length >= 10 && /P\d{2}/i.test(tight)) add(tight, i);
  });

  extractSkuCandidatesFromLabelText(text).forEach((token, i) => {
    if (
      /P\d{2}/i.test(token)
      || isTuFinishedMultiUnitLabelSku(token)
      || /^\d{14,20}$/.test(token)
    ) {
      add(token, i);
    }
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.map((r) => r.value);
}

function extractAfterUniteKodu(text) {
  const blob = String(text || '');
  const re = /UNITE\s+KODU[^\n]*\n+([A-Z0-9][A-Z0-9\s]{5,40})/gi;
  const found = [];
  let m;
  while ((m = re.exec(blob)) !== null) {
    const tight = tightToken(m[1]);
    if (tight.length >= 8) found.push(tight);
  }
  return found;
}

function productSkuFromYyOcrLine(line) {
  const tight = tightToken(line);
  if (!/^YY\d/i.test(tight)) return '';
  const sku = normalizeWarehouseProductSku(tight);
  if (!sku || isWarehousePacketCartonSku(sku)) return '';
  return sku;
}

function scoreProductSkuCandidate(token, index) {
  let score = 90 - index * 4;
  if (/P\d{2}/i.test(token)) score -= 70;
  if (/^YY\d/i.test(token)) score -= 30;
  if (/^\d{2}[A-Z]{2,}/i.test(token)) score += 35;
  if (/^X\d/i.test(token)) score -= 55;
  return score;
}

function extractProductSkuCandidates(text) {
  const ranked = [];
  const seen = new Set();
  const add = (raw, index, bonus = 0) => {
    let sku = normalizeWarehouseProductSku(raw);
    if (!sku && /^YY\d/i.test(tightToken(raw))) {
      sku = productSkuFromYyOcrLine(raw);
    }
    if (!sku || isWarehousePacketCartonSku(sku)) return;
    const key = sku.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ranked.push({ value: sku, score: scoreProductSkuCandidate(sku, index) + bonus });
  };

  extractAfterUniteKodu(text).forEach((tight, i) => add(tight, i, 50));

  linesFromBlob(text).forEach((line, i) => {
    const tight = tightToken(line);
    if (/^YY\d/i.test(tight)) {
      add(tight, i, 10);
      return;
    }
    if (/^\d{14,20}$/.test(tight)) return;
    if (tight.length >= 8 && /^\d{2}[A-Z]/i.test(tight) && !/P\d{2}/i.test(tight)) {
      add(tight, i, 20);
    }
  });

  extractSkuCandidatesFromLabelText(text).forEach((token, i) => {
    if (!/P\d{2}/i.test(token)) add(token, i, 0);
  });

  linesFromBlob(text).forEach((line, i) => {
    const tight = tightToken(line);
    if (/^TU\d{2}[A-Z0-9]{8,}$/i.test(tight)) {
      const sku = normalizeWarehouseProductSku(tight) || tight;
      if (isTuFinishedMultiUnitLabelSku(sku)) add(sku, i, 45);
    }
    if (/^\d{14,20}$/.test(tight)) add(tight, i, 40);
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.map((r) => r.value);
}

function extractPacketNameFromOcr(text) {
  const blob = String(text || '');
  const productName = blob.match(
    /PRODUCT\s*NAME[^\n]*\n+([^\n]+)/i,
  );
  if (productName) {
    const line = productName[1].replace(/\s+/g, ' ').trim();
    if (line.length >= 3) return line;
  }
  const suggested = extractSuggestedNameFromLabelText(blob, { intent: 'packet' });
  if (suggested) return suggested;
  const lines = linesFromBlob(blob).filter((l) => !/^(X|YY)\d/i.test(tightToken(l)));
  const hit = lines.find((l) => /\bPK-\d/i.test(l) || (/\//.test(l) && /[A-Z]{4,}/i.test(l)));
  return hit ? hit.slice(0, 160) : '';
}

export function extractWarehouseLabelFieldFromOcr(text, field) {
  const blob = String(text || '').trim();
  if (!blob) return { value: '', candidates: [] };

  switch (field) {
    case WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU: {
      const candidates = extractPacketSkuCandidates(blob);
      return { value: candidates[0] || '', candidates: candidates.slice(0, 6) };
    }
    case WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU: {
      const candidates = extractProductSkuCandidates(blob);
      return { value: candidates[0] || '', candidates: candidates.slice(0, 6) };
    }
    case WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_TURKISH: {
      const value = extractSuggestedNameFromLabelText(blob, { intent: 'product_turkish' });
      return { value, candidates: value ? [value] : [] };
    }
    case WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME: {
      const value = extractPacketNameFromOcr(blob);
      return { value, candidates: value ? [value] : [] };
    }
    default:
      return { value: '', candidates: [] };
  }
}
