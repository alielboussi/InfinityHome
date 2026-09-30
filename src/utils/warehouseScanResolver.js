import { normalizeWarehouseSku, normalizeWarehouseSkuKey } from './warehouseAssemblyMath.js';

/**
 * Istikbal carton scan: X + duplicated leading digit + SKU body + optional "-lot".
 * e.g. X112VEM… → 12VEM…, X220AHEGEV… → 20AHEGEV…
 */
function stripIstikbalXScanPrefix(code) {
  const raw = normalizeWarehouseSku(code);
  if (!raw || raw.length < 3 || (raw[0] !== 'X' && raw[0] !== 'x')) return raw;
  const scanDigit = raw[1];
  if (!/\d/.test(scanDigit)) return raw;

  let body = raw.slice(1);
  const dash = body.indexOf('-');
  if (dash >= 0) body = body.slice(0, dash);
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
 * Normalize a raw scanner string to a canonical packet SKU candidate.
 * Supports Istikbal-style X1/X2/X3…-lot, YY…+family, and plain codes.
 */
export function normalizeWarehouseScan(raw) {
  let code = normalizeWarehouseSku(raw);
  if (!code) return '';

  if (/^X\d/i.test(code)) {
    code = stripIstikbalXScanPrefix(code);
  }

  const yyFamily = code.match(/^YY\d+(\d{2}[A-Z0-9]+)$/i);
  if (yyFamily) {
    return normalizeWarehouseSku(yyFamily[1]);
  }

  return code;
}

function collectScanCandidateKeys(scan) {
  const keys = new Set();
  const raw = normalizeWarehouseSku(scan);
  const normalized = normalizeWarehouseScan(scan);
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
  const candidates = collectScanCandidateKeys(scan);

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
