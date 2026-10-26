/** Keep search behaviour aligned with src/utils/productionPacketSearch.js */

import { normalizeWarehousePacketNameKey } from './productionItemName';
import { parseProductPhotoQrSku } from './productionLabelQrScan';

const ARABIC_CHAR_TO_LATIN = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'a', ى: 'a', ة: 'a', ء: '',
  ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh',
  ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh',
  ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n',
  ه: 'h', و: 'w', ي: 'y', ئ: 'y', ؤ: 'w',
  ' ': ' ',
};

function stripDiacritics(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function latinKey(text) {
  return stripDiacritics(String(text || '').toLowerCase())
    .replace(/[^a-z0-9]/g, '');
}

export function arabicQueryToLatinApprox(query) {
  let out = '';
  const raw = String(query || '');
  for (const ch of raw) {
    if (ARABIC_CHAR_TO_LATIN[ch] !== undefined) {
      out += ARABIC_CHAR_TO_LATIN[ch];
    } else if (/[a-zA-Z0-9\s]/.test(ch)) {
      out += ch;
    }
  }
  return out.trim();
}

function latinMatchVariants(latin) {
  const base = latinKey(latin);
  if (!base) return [];
  const variants = new Set([base]);
  if (base.includes('f')) variants.add(base.replace(/f/g, 'v'));
  if (base.includes('v')) variants.add(base.replace(/v/g, 'f'));
  return Array.from(variants);
}

function nameMatchesLatinKeys(name, keys) {
  const nameKey = latinKey(name);
  if (!nameKey || !keys.length) return false;
  return keys.some((k) => {
    if (k.length < 2) return false;
    if (nameKey.includes(k)) return true;
    const probe = k.slice(0, Math.min(k.length, 5));
    return probe.length >= 3 && nameKey.includes(probe);
  });
}

function normalizeWarehouseCatalogSearchQuery(raw) {
  return String(raw || '').trim().replace(/\s+/g, '');
}

export function packetMatchesProductionSearch(packet, rawQuery) {
  const q = String(rawQuery || '').trim();
  if (!q) return false;

  const name = String(packet?.name || '');
  const sku = String(packet?.sku || '');
  const photoSku = parseProductPhotoQrSku(q);
  if (photoSku && sku.toUpperCase() === photoSku.toUpperCase()) return true;

  const nameKey = normalizeWarehousePacketNameKey(q);
  if (nameKey && normalizeWarehousePacketNameKey(name) === nameKey) return true;

  const qSku = normalizeWarehouseCatalogSearchQuery(photoSku || q).toUpperCase();
  if (qSku.length >= 3 && sku.toUpperCase().includes(qSku)) return true;

  const qLower = q.toLowerCase();
  if (name.toLowerCase().includes(qLower)) return true;

  if (/[\u0600-\u06FF]/.test(q)) {
    const latin = arabicQueryToLatinApprox(q);
    const keys = latinMatchVariants(latin);
    if (nameMatchesLatinKeys(name, keys)) return true;
  }

  const directLatin = latinKey(q);
  if (directLatin.length >= 2 && nameMatchesLatinKeys(name, [directLatin])) return true;

  return false;
}

export function filterPacketsForProductionSearch(packets, rawQuery, { limit = 25 } = {}) {
  const q = String(rawQuery || '').trim();
  if (!q) return [];
  return (packets || []).filter((p) => packetMatchesProductionSearch(p, q)).slice(0, limit);
}
