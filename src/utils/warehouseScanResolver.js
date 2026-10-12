import { normalizeWarehouseSku, normalizeWarehouseSkuKey } from './warehouseAssemblyMath.js';

function canonicalWarehouseSku(code) {
  return normalizeWarehouseSku(code).toUpperCase();
}

/** Factory lot suffix on label barcodes, e.g. …-242813004516 */
function stripFactoryLotSuffix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw) return '';
  const dash = raw.indexOf('-');
  if (dash < 0) return raw;
  const suffix = raw.slice(dash + 1);
  if (/^\d{6,}$/.test(suffix)) return raw.slice(0, dash);
  return raw;
}

/**
 * Finished-product label: 14-digit factory lot prefix + family SKU body.
 * Only strips when the first 14 characters are digits (manual short SKUs unchanged).
 */
function stripProductLotPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw) return '';
  if (raw.length > 14 && /^\d{14}/.test(raw)) {
    return raw.slice(14);
  }
  return raw;
}

/**
 * Packet carton: X + optional duplicated leading digit + SKU body.
 * e.g. X112VEM… → 12VEM…, X213TAI… → 13TAI…
 * Packing-list SKUs like 23A9… stay as X23A9… → 23A9… (two digits + letter).
 * XX + digit → strip both X and the following single digit.
 */
function stripIstikbalXDigitScanPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw || raw.length < 3 || !/^X\d/i.test(raw)) return raw;
  const scanDigit = raw[1];
  let body = raw.slice(1);
  if (/^\d{2}[A-Z]/i.test(body)) return body;
  if (body.length && body[0] === scanDigit) body = body.slice(1);
  return body;
}

/** Extra keys so TU20… packet matches 20… scan body and vice versa. */
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

/**
 * Normalize a raw scanner string for **warehouse products** (family SKU).
 * Strips 14-digit lot prefix; does not apply packet X-prefix rules.
 */
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

/**
 * Normalize a raw scanner string for **warehouse packets** (carton SKU).
 * Uses X / XX carton rules only — never strips a 14-digit product lot prefix.
 */
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

/** @deprecated use normalizeWarehousePacketScan */
export function normalizeWarehouseScan(raw) {
  return normalizeWarehousePacketScan(raw);
}

/** @deprecated use normalizeWarehouseProductSku or normalizeWarehousePacketScan */
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

/**
 * @param {string} scan
 * @param {Array<{ id: string, sku: string, sku_aliases?: string[] }>} packets
 */
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
