import { getFirestore } from './firestoreDb.js';

const TOKENS_COLLECTION = 'warehouse_production_push_tokens';

export async function registerProductionPushToken({
  userId,
  email,
  expoPushToken,
} = {}) {
  const db = getFirestore();
  if (!db) return { ok: false, skipped: true, reason: 'no_firestore' };
  const token = String(expoPushToken || '').trim();
  if (!token) throw new Error('Push token is required.');
  const uid = String(userId || email || '').trim();
  if (!uid) throw new Error('User id is required for push registration.');
  const docId = uid.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  await db.collection(TOKENS_COLLECTION).doc(docId).set({
    user_id: userId || null,
    email: String(email || '').trim().toLowerCase() || null,
    token,
    updated_at: new Date().toISOString(),
  }, { merge: true });
  return { ok: true };
}

async function loadOperatorPushTokens(db) {
  const snap = await db.collection(TOKENS_COLLECTION).get();
  const tokens = [];
  snap.forEach((doc) => {
    const t = String(doc.data()?.token || '').trim();
    if (t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken')) {
      tokens.push(t);
    }
  });
  return [...new Set(tokens)];
}

/**
 * Notify all registered Production app devices (factory operators with push enabled).
 */
export async function sendProductionOperatorPush({
  title,
  body,
  data = {},
} = {}) {
  const db = getFirestore();
  if (!db) return { ok: false, skipped: true, reason: 'no_firestore' };
  const tokens = await loadOperatorPushTokens(db);
  if (!tokens.length) return { ok: true, sent: 0, skipped: true, reason: 'no_tokens' };

  const messages = tokens.map((to) => ({
    to,
    title: String(title || 'Production').slice(0, 120),
    body: String(body || '').slice(0, 240),
    data: data && typeof data === 'object' ? data : {},
    sound: 'default',
    channelId: 'production-alerts',
    priority: 'high',
  }));

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = String(process.env.EXPO_ACCESS_TOKEN || '').trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('[productionExpoPush] Expo API error:', payload?.errors || response.status);
      continue;
    }
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    sent += rows.filter((r) => r?.status === 'ok').length;
  }
  return { ok: true, sent };
}

export async function notifyProductionNewReturnOrder(order) {
  const num = order?.return_number || order?.id || '';
  const name = order?.assembly_name || 'Product';
  return sendProductionOperatorPush({
    title: 'New return',
    body: `${num} — ${name}`.trim(),
    data: { screen: 'ReturnOrders', return_order_id: order?.id || '' },
  });
}

export async function notifyProductionNewStorageSend(row) {
  const num = row?.storage_number || row?.id || '';
  const name = row?.assembly_name || 'Product';
  const cust = row?.customer_name ? ` (${row.customer_name})` : '';
  return sendProductionOperatorPush({
    title: 'New sold item',
    body: `${num} — ${name}${cust}`.trim(),
    data: { screen: 'SoldOrders', storage_send_id: row?.id || '' },
  });
}
