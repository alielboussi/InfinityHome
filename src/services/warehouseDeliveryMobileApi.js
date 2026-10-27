import { firebaseAuth } from '../firebase';
import { apiUrl } from '../utils/apiUrl';

async function authHeaders() {
  const user = firebaseAuth?.currentUser;
  const token = user ? await user.getIdToken() : '';
  if (!token) throw new Error('Authentication required');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function warehouseDeliveryMobileOp(op, body = {}) {
  const response = await fetch(apiUrl('/api/warehouse-mobile'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ op, ...body }),
  });
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

export function setDeliveryEntryReceiverCheck(entryId, checked) {
  return warehouseDeliveryMobileOp('delivery-receiver-check', { entry_id: entryId, checked });
}

export function acceptWarehouseDeliverySession(sessionId) {
  return warehouseDeliveryMobileOp('delivery-accept', { session_id: sessionId });
}

/** Hassan mirror / catalog admin — next mobile session gets WHD0000000001. */
export function resetWarehouseDeliveryNumberSequence() {
  return warehouseDeliveryMobileOp('delivery-number-reset');
}
