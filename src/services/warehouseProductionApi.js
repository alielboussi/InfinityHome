import { canManageCatalog, getCurrentUser } from '../accessControl';
import {
  defaultMobileAccessGrant,
  isWarehouseProductionAppAllowed,
  sanitizeMobileAccessGrantForUser,
} from '../mobile/mobileAccessManifest';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';

function isUnknownWarehouseOpError(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('unknown op') || msg.includes('unknown action');
}

async function productionOp(op, body = {}) {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/warehouse-mobile'), {
    method: 'POST',
    headers: withApiHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ op, ...body }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

async function fetchAuthProfileUser() {
  const token = await firebaseGetAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await fetch(apiUrl('/api/auth-profile'), {
    method: 'GET',
    headers: withApiHeaders({ Authorization: `Bearer ${token}` }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Profile request failed (${response.status})`);
  }
  return payload?.user || null;
}

/** Kiosk access from login grant (works before production-* ops are deployed). */
async function suggestProductionBaseNameLocally(preset) {
  const {
    buildProductionItemName,
    fetchUniqueRandomProductionBaseName,
    pickRandomProductionBaseName,
  } = await import('../utils/productionItemName');
  const p = String(preset || '').trim();
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

export async function fetchProductionSuggestedBaseName({ preset } = {}) {
  const p = String(preset || '').trim();
  const { buildProductionItemName, matchProductionGirlNameFromPool } = await import('../utils/productionItemName');
  try {
    const payload = await productionOp('production-suggest-base-name', {
      preset: p || undefined,
    });
    const baseName = matchProductionGirlNameFromPool(payload.base_name || '');
    if (baseName) {
      return {
        baseName,
        productName: p ? buildProductionItemName(baseName, p) : baseName,
      };
    }
  } catch (err) {
    if (!isUnknownWarehouseOpError(err?.message)) throw err;
  }
  return suggestProductionBaseNameLocally(p);
}

export async function isProductionPacketNameTaken(name, options = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  try {
    const payload = await productionOp('packet-name-check', {
      name: trimmed,
      exclude_packet_id: options.excludePacketId,
    });
    return Boolean(payload.taken);
  } catch (err) {
    if (!isUnknownWarehouseOpError(err?.message)) throw err;
    const { isWarehousePacketNameTaken } = await import('./warehouseCatalog');
    return isWarehousePacketNameTaken(trimmed, options);
  }
}

export async function fetchProductionKioskAccess() {
  try {
    const payload = await productionOp('production-access-self');
    return {
      allowed: Boolean(payload.allowed),
      displayName: payload.display_name || null,
    };
  } catch (err) {
    if (!isUnknownWarehouseOpError(err?.message)) {
      throw err;
    }
  }

  const profileUser = await fetchAuthProfileUser();
  const email = profileUser?.email || getCurrentUser()?.email || '';
  const grant = sanitizeMobileAccessGrantForUser(
    profileUser?.mobile_access || defaultMobileAccessGrant(),
    email,
  );
  const sessionUser = getCurrentUser();
  return {
    allowed: canManageCatalog(sessionUser) || isWarehouseProductionAppAllowed(grant),
    displayName: profileUser?.mobile_display_name
      || profileUser?.display_name
      || sessionUser?.full_name
      || null,
  };
}

export async function createProductionPacket({
  name,
  warehouseLocationId,
  initialQuantity,
  sku,
}) {
  const body = {
    name,
    warehouse_location_id: warehouseLocationId,
    initial_quantity: initialQuantity,
    packet_number: 1,
    qty_per_unit: 1,
    sku: sku || undefined,
  };
  const payload = await productionOp('production-packet-create', body);
  return payload.assembly || payload.packet;
}

export async function increaseProductionPacketStock({
  packetId,
  assemblyId,
  warehouseLocationId,
  delta,
}) {
  const body = {
    warehouse_location_id: warehouseLocationId,
    delta,
  };
  if (assemblyId) {
    body.assembly_id = assemblyId;
  } else {
    body.packet_id = packetId;
  }
  try {
    return await productionOp('production-stock-increase', body);
  } catch (err) {
    if (!isUnknownWarehouseOpError(err?.message)) throw err;
    const catalog = await productionOp('catalog-list');
    const inventory = (catalog.inventory || []).find(
      (row) => String(row.packet_id) === String(packetId)
        && String(row.location_id) === String(warehouseLocationId),
    );
    const current = Math.max(0, Number(inventory?.quantity) || 0);
    const next = current + Math.max(1, Math.floor(Number(delta) || 0));
    await productionOp('packet-quantity-set', {
      packet_id: packetId,
      warehouse_location_id: warehouseLocationId,
      quantity: next,
    });
    return {
      packet_id: packetId,
      qty_before: current,
      qty_after: next,
      delta: next - current,
    };
  }
}

export async function fetchProductionCatalog() {
  const payload = await productionOp('catalog-list');
  return payload;
}

export async function fetchProductionEventsLog(options = {}) {
  const body = { limit: options.limit ?? 800 };
  if (options.startDate) body.start_date = options.startDate;
  if (options.endDate) body.end_date = options.endDate;
  try {
    return await productionOp('production-events-list', body);
  } catch (err) {
    if (isUnknownWarehouseOpError(err?.message)) {
      return { creates: [], stock_increases: [] };
    }
    throw err;
  }
}

export async function amendProductionCreateLog({ logId, name, qtyAdded }) {
  const body = { log_id: logId };
  if (name !== undefined) body.name = name;
  if (qtyAdded !== undefined) body.qty_added = qtyAdded;
  const payload = await productionOp('production-edit-create', body);
  return payload.log;
}

export async function amendProductionStockIncreaseLog({ logId, qtyAdded }) {
  const payload = await productionOp('production-edit-stock-increase', {
    log_id: logId,
    qty_added: qtyAdded,
  });
  return payload.log;
}

export async function generateProductionSku(options = {}) {
  const payload = await productionOp('generate-unique-sku', {
    exclude_packet_id: options.excludePacketId,
    exclude_assembly_id: options.excludeAssemblyId,
  });
  return payload.sku;
}

export async function resolveProductionScan(scan) {
  const payload = await productionOp('scan-resolve', { scan });
  return payload;
}
