/**
 * Warehouse barcode SKU rules (keep in sync with src/utils/warehouseScanResolver.js).
 * Self-contained for Expo Metro — do not import from repo src/.
 *
 * Label types: (1) finished product family SKU → normalizeWarehouseProductSku;
 * (2) packet carton SKU (incl. P03…) → normalizeWarehousePacketScan;
 * (3) unknown scan / search → normalizeWarehouseCatalogSearchQuery.
 */

export function normalizeWarehouseSku(value) {
  return String(value || '').trim();
}

export function normalizeWarehouseSkuKey(value) {
  return normalizeWarehouseSku(value).toLowerCase();
}

function canonicalWarehouseSku(code) {
  return normalizeWarehouseSku(code).toUpperCase();
}

function stripFactoryLotSuffix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw) return '';
  const dash = raw.indexOf('-');
  if (dash < 0) return raw;
  const suffix = raw.slice(dash + 1);
  if (/^\d{6,}$/.test(suffix)) return raw.slice(0, dash);
  return raw;
}

const PRODUCT_LABEL_LOT_SCAN = /^\d{14}[A-Z][A-Z0-9]{5,}$/i;

function stripProductLotPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw) return '';
  if (raw.length >= 20 && PRODUCT_LABEL_LOT_SCAN.test(raw)) {
    return raw.slice(14);
  }
  return raw;
}

function stripIstikbalXDigitScanPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw || raw.length < 3 || !/^X\d/i.test(raw)) return raw;
  const wedgeDigit = raw[1];
  let body = raw.slice(1);
  if (body.length && body[0] === wedgeDigit) {
    const withoutLeadingWedge = body.slice(1);
    if (/^\d{2}[A-Z]/i.test(withoutLeadingWedge)) {
      body = withoutLeadingWedge;
    } else if (body[1] === wedgeDigit) {
      body = body.slice(1);
    }
  }
  return body;
}

export function isWarehousePacketCartonSku(sku) {
  const s = canonicalWarehouseSku(String(sku || '').trim());
  if (!s) return false;
  return /P\d{2}/i.test(s);
}

export function isTuFinishedMultiUnitLabelSku(sku) {
  const s = canonicalWarehouseSku(String(sku || '').trim());
  if (!s) return false;
  return /^TU\d{2}[A-Z0-9]{8,}$/i.test(s);
}

export function expandWarehouseSkuMatchKeys(sku) {
  const keys = new Set();
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) return keys;
  keys.add(key);
  if (key.startsWith('tu') && key.length > 2) {
    keys.add(key.slice(2));
  } else if (/^\d{2}[a-z0-9]/.test(key)) {
    keys.add(`tu${key}`);
  }
  return keys;
}

export function normalizeWarehouseProductSku(raw) {
  let code = stripFactoryLotSuffix(normalizeWarehouseSku(raw));
  if (!code) return '';
  code = stripProductLotPrefix(code);

  const yyFamily = code.match(/^YY\d+(\d{2}[A-Z0-9]+)$/i);
  if (yyFamily) {
    return canonicalWarehouseSku(yyFamily[1]);
  }

  return canonicalWarehouseSku(code);
}

export function normalizeWarehouseCatalogSearchQuery(raw) {
  const trimmed = normalizeWarehouseSku(raw);
  if (!trimmed) return '';
  if (trimmed.length > 14 && /^\d{14}/.test(trimmed)) {
    return normalizeWarehouseProductSku(trimmed);
  }
  if (/^X/i.test(trimmed)) {
    return normalizeWarehousePacketScan(trimmed);
  }
  const upper = canonicalWarehouseSku(trimmed);
  const product = normalizeWarehouseProductSku(trimmed);
  const packet = normalizeWarehousePacketScan(trimmed);
  if (product !== upper) return product;
  if (packet !== upper) return packet;
  return product;
}

export function normalizeWarehouseWedgeScanInput(raw, mode = 'auto') {
  if (mode === 'packet') return normalizeWarehousePacketScan(raw);
  if (mode === 'product') return normalizeWarehouseProductSku(raw);
  return normalizeWarehouseCatalogSearchQuery(raw);
}

export function normalizeWarehousePacketScan(raw) {
  let code = stripFactoryLotSuffix(normalizeWarehouseSku(raw));
  if (!code) return '';

  if (/^X\d/i.test(code)) {
    code = stripIstikbalXDigitScanPrefix(code);
  } else if (/^X{2,}/i.test(code)) {
    code = normalizeWarehouseSku(code.replace(/^X+/i, ''));
  }

  const yyFamily = code.match(/^YY\d+(\d{2}[A-Z0-9]+)$/i);
  if (yyFamily) {
    return canonicalWarehouseSku(yyFamily[1]);
  }

  return canonicalWarehouseSku(code);
}

export function normalizeWarehouseScan(raw) {
  return normalizeWarehousePacketScan(raw);
}

export function normalizeWarehouseCatalogSku(raw) {
  return normalizeWarehousePacketScan(raw);
}

function collectPacketScanCandidateKeys(scan) {
  const keys = new Set();
  const raw = normalizeWarehouseSku(scan);
  const normalized = normalizeWarehousePacketScan(scan);
  [raw, normalized].forEach((value) => {
    expandWarehouseSkuMatchKeys(value).forEach((k) => keys.add(k));
  });
  return keys;
}

/** True when scan text is a full packet SKU (not a name substring). */
export function isExactPacketSkuScan(scan, packet) {
  if (!packet) return false;
  const scanNorm = normalizeWarehousePacketScan(scan);
  if (!scanNorm || scanNorm.length < 4) return false;
  const pktNorm = normalizeWarehousePacketScan(packet.sku);
  if (pktNorm && scanNorm === pktNorm) return true;
  const scanKeys = collectPacketScanCandidateKeys(scanNorm);
  for (const key of scanKeys) {
    if (key && key.length >= 4 && key === scanNorm) return true;
    if (pktNorm && key === pktNorm) return true;
  }
  return false;
}

export function resolvePacketFromScan(scan, packets) {
  const candidates = collectPacketScanCandidateKeys(scan);

  for (const packet of packets || []) {
    const keys = new Set();
    expandWarehouseSkuMatchKeys(packet.sku).forEach((k) => keys.add(k));
    (packet.sku_aliases || []).forEach((alias) => {
      expandWarehouseSkuMatchKeys(alias).forEach((k) => keys.add(k));
    });
    for (const key of candidates) {
      if (key && keys.has(key)) return packet;
    }
  }
  return null;
}
