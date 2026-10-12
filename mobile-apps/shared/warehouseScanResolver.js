/**
 * Warehouse barcode SKU rules (keep in sync with src/utils/warehouseScanResolver.js).
 * Self-contained for Expo Metro — do not import from repo src/.
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

function stripProductLotPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw) return '';
  if (raw.length > 14 && /^\d{14}/.test(raw)) {
    return raw.slice(14);
  }
  return raw;
}

function stripIstikbalXDigitScanPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw || raw.length < 3 || !/^X\d/i.test(raw)) return raw;
  const scanDigit = raw[1];
  let body = raw.slice(1);
  if (/^\d{2}[A-Z]/i.test(body)) return body;
  if (body.length && body[0] === scanDigit) body = body.slice(1);
  return body;
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
