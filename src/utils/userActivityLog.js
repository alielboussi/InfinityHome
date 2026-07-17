import supabase from '../supabase';
import { getCurrentUser } from '../accessControl';

async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
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

  // Without a Supabase session token the server rejects the request with 401.
  // Skip silently (e.g. not yet authenticated on this device) to avoid console noise.
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
      await fetch('/api/user-activity', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
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
