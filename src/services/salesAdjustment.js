import { resolveSaleActor, getCurrentUser } from '../accessControl';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';

export async function applySalesAdjustment(payload) {
  const user = getCurrentUser();
  const actor = resolveSaleActor(user);

  const resp = await fetch(apiUrl('/api/sales-adjustment'), {
    method: 'POST',
    headers: withApiHeaders({ 'Content-Type': 'application/json' }),
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
