import { resolveSaleActor, getCurrentUser } from '../accessControl';

const isLocalHost = () => {
  try {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(h);
  } catch {
    return false;
  }
};

export async function applySalesAdjustment(payload) {
  const localHost = isLocalHost();
  const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/, '');
  const apiUrl = localHost ? '/api/sales-adjustment' : (apiBase ? `${apiBase}/api/sales-adjustment` : '/api/sales-adjustment');
  const user = getCurrentUser();
  const actor = resolveSaleActor(user);

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(payload || {}),
      user_uid: payload?.user_uid ?? actor.user_uid,
      user_id: payload?.user_id ?? actor.user_id,
    }),
  });

  const text = await resp.text().catch(() => '');
  let json = {};
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }

  if (!resp.ok || !json?.ok) {
    const message = json?.error || json?.message || json?.raw || text || `Sales adjustment failed (${resp.status || 'network'})`;
    return { data: null, error: new Error(message) };
  }

  return { data: json, error: null };
}
