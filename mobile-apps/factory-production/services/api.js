import { API_BASE, FROM_LOCATION_ID, TO_LOCATION_ID } from '../config';
import { getFirebaseIdToken } from '../../shared/firebase';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

export async function fetchLabelPrintHistory(limit = 50) {
  const url = `${apiUrl('/api/label-print-history')}?limit=${limit}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  const raw = await response.json();
  if (!response.ok || !raw.ok) {
    throw new Error(raw.error || `Label history HTTP ${response.status}`);
  }
  return raw.jobs || [];
}

export async function approveFactoryTransfer({
  userId,
  userEmail,
  userFullName,
  capturedAt,
  transferNumber,
  items,
}) {
  const itemArray = items
    .filter((item) => Number(item.qty) > 0)
    .map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      sku: item.product.sku || '',
      qty: Number(item.qty),
    }));

  if (!itemArray.length) {
    throw new Error('No positive quantity items to process.');
  }

  const token = await getFirebaseIdToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${apiUrl('/api/admin')}?adminAction=factory-production-approve`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fromLocation: FROM_LOCATION_ID,
        toLocation: TO_LOCATION_ID,
        userId,
        userEmail,
        userFullName,
        capturedAt,
        transferNumber: transferNumber || null,
        items: itemArray,
      }),
    },
  );

  const raw = await response.json();
  if (!response.ok || !raw.ok) {
    throw new Error(raw.error || `Approve API HTTP ${response.status}`);
  }

  return {
    sessionId: raw.sessionId,
    transferNumber: raw.transferNumber || null,
    labelJobId: raw.labelJobId || null,
  };
}
