import { getCurrentUser } from '../accessControl';
import { ensureAuthSession } from './authSession';
import { firebaseGetAccessToken } from './firebaseAuthApi';

async function getAccessToken() {
  await ensureAuthSession();
  return firebaseGetAccessToken();
}

async function getAuthHeaders() {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function logUserActivity({
  actionType,
  actionLabel,
  details = '',
  reference = null,
  entityType = null,
  entityId = null,
  metadata = null,
  route = null,
} = {}) {
  const user = getCurrentUser();
  if (!user?.id && !user?.email) return;

  await ensureAuthSession();
  const token = await getAccessToken();
  if (!token) return;

  const payload = {
    actionType: String(actionType || 'action').trim(),
    actionLabel: String(actionLabel || 'Action').trim(),
    details: details ? String(details) : '',
    reference: reference != null ? String(reference) : null,
    entityType: entityType != null ? String(entityType) : null,
    entityId: entityId != null ? String(entityId) : null,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    route: route || (typeof window !== 'undefined' ? window.location.pathname : null),
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
    try {
      const response = await fetch('/api/user-activity', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      if (response.status === 401) return;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[user-activity] failed to log action', err);
  }
}

export async function fetchUserActivityLog({ limit = 250 } = {}) {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `/api/user-activity?limit=${encodeURIComponent(String(limit))}&_=${Date.now()}`,
    { headers, cache: 'no-store' },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Failed to load activity log');
  }
  return payload;
}

export async function clearUserActivityLog() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/user-activity', {
    method: 'DELETE',
    headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Failed to clear activity log');
  }
  return payload;
}
