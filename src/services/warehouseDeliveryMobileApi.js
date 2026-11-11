import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';

async function authHeaders() {
  const token = await firebaseGetAccessToken();
  if (!token) {
    throw new Error('Authentication required — sign out and sign in again.');
  }
  return withApiHeaders({
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
}

export async function warehouseDeliveryMobileOp(op, body = {}) {
  let response;
  try {
    response = await fetch(apiUrl('/api/warehouse-mobile'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ op, ...body }),
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new Error(
        'Cannot reach the warehouse API (/api/warehouse-mobile). Wait for deploy or check connection.',
      );
    }
    throw err;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

export function listDeliveryDrivers() {
  return warehouseDeliveryMobileOp('delivery-drivers-list');
}

export function saveDeliveryDrivers(names) {
  return warehouseDeliveryMobileOp('delivery-drivers-save', { names });
}

export function listProductionPresets() {
  return warehouseDeliveryMobileOp('production-presets-list');
}

export function saveProductionPresets({ seater, carpentry }) {
  return warehouseDeliveryMobileOp('production-presets-save', { seater, carpentry });
}

export function setDeliveryEntryReceiverCheck(entryId, checked) {
  return warehouseDeliveryMobileOp('delivery-receiver-check', { entry_id: entryId, checked });
}

/** @deprecated Send-to-customer is disabled — receive into Kitwe only. */
export function setDeliveryEntrySendToCustomer(entryId, send) {
  return warehouseDeliveryMobileOp('delivery-receiver-send-to-customer', {
    entry_id: entryId,
    send,
  });
}

export function listHassanKitweQuoteInbound() {
  return warehouseDeliveryMobileOp('orders-kitwe-hassan-inbound');
}

export function acceptWarehouseDeliverySession(sessionId) {
  return warehouseDeliveryMobileOp('delivery-accept', { session_id: sessionId });
}

/** Factory → Kitwe — open or reuse draft delivery session (WHD number). */
export function openWarehouseDeliverySession(body = {}) {
  return warehouseDeliveryMobileOp('delivery-session-open', body);
}

/** Submit cart (driver_name required by API; use FULFILLMENT_WEB_DRIVER_NAME for web desk). */
export function submitWarehouseDelivery(body) {
  return warehouseDeliveryMobileOp('delivery-submit', body);
}

export const FULFILLMENT_WEB_DRIVER_NAME = 'Fulfillment desk (web)';

/** Hassan mirror / catalog admin — next mobile session gets WHD0000000001. */
export function resetWarehouseDeliveryNumberSequence() {
  return warehouseDeliveryMobileOp('delivery-number-reset');
}

export function cancelWarehouseDeliverySession({ sessionId, deliveryNumber, reason } = {}) {
  return warehouseDeliveryMobileOp('delivery-cancel', {
    session_id: sessionId,
    delivery_number: deliveryNumber,
    reason,
  });
}

/** Hard-delete a draft/cancelled delivery (no Kitwe stock received). */
export function discardWarehouseDeliveryDraft({ sessionId, deliveryNumber } = {}) {
  return warehouseDeliveryMobileOp('delivery-draft-discard', {
    session_id: sessionId,
    delivery_number: deliveryNumber,
  });
}

export function listReturnKitweProducts() {
  return warehouseDeliveryMobileOp('return-kitwe-products-list');
}

export function createReturnOrder(payload) {
  return warehouseDeliveryMobileOp('return-order-create', payload);
}

export function listReturnOrders(options = {}) {
  return warehouseDeliveryMobileOp('return-order-list', options);
}

export function listDeliveryProductionQueue() {
  return warehouseDeliveryMobileOp('delivery-production-queue-list');
}

export function listReturnQuoteCustomers() {
  return warehouseDeliveryMobileOp('return-quote-customers-list');
}

export function listPosSalesForStorage() {
  return warehouseDeliveryMobileOp('storage-pos-sales-list');
}

export function getPosSaleDetailForStorage(payload) {
  return warehouseDeliveryMobileOp('storage-pos-sale-detail', payload);
}

export function submitStorageSend(payload) {
  return warehouseDeliveryMobileOp('storage-send-submit', payload);
}

export function createManualStorageSend(payload) {
  return warehouseDeliveryMobileOp('storage-manual-create', payload);
}

export function reprintStorageSendLabels(payload) {
  return warehouseDeliveryMobileOp('storage-reprint-labels', payload);
}

export function listStorageSends(options = {}) {
  return warehouseDeliveryMobileOp('storage-send-list', options);
}

export function getStorageSendDetail(id) {
  return warehouseDeliveryMobileOp('storage-send-detail', { storage_send_id: id });
}

export function prepareStorageDeliver(payload) {
  return warehouseDeliveryMobileOp('storage-deliver-prepare', payload);
}

export function submitStorageDeliver(payload) {
  return warehouseDeliveryMobileOp('storage-deliver-submit', payload);
}
