import Constants from 'expo-constants';
import { getFirebaseIdToken } from '../shared/firebase';

function apiBase() {
  return String(Constants.expoConfig?.extra?.apiBase || 'https://www.infinity-home.online').replace(/\/+$/, '');
}

const CLIENT_SOURCE = 'warehouse_production_app';

async function productionOp(op, body = {}) {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(`${apiBase()}/api/warehouse-mobile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ op, ...body }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

export async function fetchProductionAccess() {
  const payload = await productionOp('production-access-self');
  return {
    allowed: Boolean(payload.allowed),
    displayName: payload.display_name || null,
  };
}

export async function fetchProductionCatalog() {
  return productionOp('catalog-list');
}

export async function fetchProductionSuggestedBaseName({ preset } = {}) {
  const p = String(preset || '').trim();
  try {
    const payload = await productionOp('production-suggest-base-name', {
      preset: p || undefined,
    });
    return {
      baseName: payload.base_name || '',
      productName: payload.product_name || payload.base_name || '',
    };
  } catch {
    const {
      buildProductionItemName,
      fetchUniqueRandomProductionBaseName,
      pickRandomProductionBaseName,
    } = await import('../lib/productionItemName');
    const baseName = p
      ? await fetchUniqueRandomProductionBaseName((candidate) => isProductionPacketNameTaken(
        buildProductionItemName(candidate, p),
      ))
      : pickRandomProductionBaseName();
    return {
      baseName,
      productName: p ? buildProductionItemName(baseName, p) : baseName,
    };
  }
}

export async function isProductionPacketNameTaken(name, options = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  const payload = await productionOp('packet-name-check', {
    name: trimmed,
    exclude_packet_id: options.excludePacketId,
  });
  return Boolean(payload.taken);
}

export async function createProductionPacket({ name, warehouseLocationId, initialQuantity }) {
  const payload = await productionOp('production-packet-create', {
    name,
    warehouse_location_id: warehouseLocationId,
    initial_quantity: initialQuantity,
    packet_number: 1,
    qty_per_unit: 1,
    client_source: CLIENT_SOURCE,
  });
  return payload;
}

export async function increaseProductionStock({ packetId, warehouseLocationId, delta }) {
  return productionOp('production-stock-increase', {
    packet_id: packetId,
    warehouse_location_id: warehouseLocationId,
    delta,
    client_source: CLIENT_SOURCE,
  });
}

export async function fetchProductionLabelPreview({ name, sku, printedAt }) {
  return productionOp('production-label-preview', {
    name,
    sku,
    printed_at: printedAt,
  });
}

export async function resolveProductionScan(scan) {
  return productionOp('scan-resolve', { scan });
}
