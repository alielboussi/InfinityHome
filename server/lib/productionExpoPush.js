import { getFirestore } from './firestoreDb.js';

const TOKENS_COLLECTION = 'warehouse_production_push_tokens';

const VALID_APP_TARGETS = new Set(['upholstery', 'carpentry', 'painting']);

export function normalizePushAppTarget(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (VALID_APP_TARGETS.has(v)) return v;
  return 'upholstery';
}

export async function registerProductionPushToken({
  userId,
  email,
  expoPushToken,
  appTarget = 'upholstery',
  pushPrefs: pushPrefsInput = null,
} = {}) {
  const db = getFirestore();
  if (!db) return { ok: false, skipped: true, reason: 'no_firestore' };
  const token = String(expoPushToken || '').trim();
  if (!token) throw new Error('Push token is required.');
  const uid = String(userId || email || '').trim();
  if (!uid) throw new Error('User id is required for push registration.');
  const target = normalizePushAppTarget(appTarget);
  const docId = `${uid.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)}__${target}`;
  const pushPrefs = pushPrefsInput && typeof pushPrefsInput === 'object' ? pushPrefsInput : {
    quotes: true,
    repairs: true,
    jobs: true,
    painting_jobs: true,
  };
  await db.collection(TOKENS_COLLECTION).doc(docId).set({
    user_id: userId || null,
    email: String(email || '').trim().toLowerCase() || null,
    token,
    app_target: target,
    push_prefs: pushPrefs,
    updated_at: new Date().toISOString(),
  }, { merge: true });
  return { ok: true, app_target: target };
}

function tokenAllowsEvent(prefs, eventType) {
  const ev = String(eventType || '').trim().toLowerCase();
  if (!ev) return true;
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  if (ev === 'quote' || ev === 'quotes') return p.quotes !== false;
  if (ev === 'repair' || ev === 'repairs') return p.repairs !== false;
  if (ev === 'painting_job' || ev === 'painting_jobs') return p.painting_jobs !== false;
  if (ev === 'job' || ev === 'jobs') return p.jobs !== false;
  return true;
}

async function loadPushTokensForTargets(targets, eventType = '') {
  const db = getFirestore();
  if (!db) return [];
  const want = new Set((targets || []).map(normalizePushAppTarget));
  const snap = await db.collection(TOKENS_COLLECTION).get();
  const staleBeforeMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const tokens = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const t = String(data.token || '').trim();
    if (!t.startsWith('ExponentPushToken') && !t.startsWith('ExpoPushToken')) return;
    const updatedMs = Date.parse(String(data.updated_at || ''));
    if (Number.isFinite(updatedMs) && updatedMs < staleBeforeMs) return;
    if (!tokenAllowsEvent(data.push_prefs, eventType)) return;
    const docTarget = normalizePushAppTarget(data.app_target);
    if (want.has(docTarget)) tokens.push(t);
    else if (!data.app_target && want.has('upholstery')) tokens.push(t);
  });
  return [...new Set(tokens)];
}

export async function sendProductionOperatorPush({
  title,
  body,
  data = {},
  appTargets = ['upholstery'],
} = {}) {
  const db = getFirestore();
  if (!db) return { ok: false, skipped: true, reason: 'no_firestore' };
  const eventType = String(data?.event_type || data?.eventType || '').trim();
  const tokens = await loadPushTokensForTargets(appTargets, eventType);
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

/** Remove invalid or stale Expo tokens (run via cron or `node scripts/cleanupProductionPushTokens.js`). */
export async function cleanupStaleProductionPushTokens({ maxAgeDays = 90 } = {}) {
  const db = getFirestore();
  if (!db) return { ok: false, skipped: true, reason: 'no_firestore' };
  const cutoff = Date.now() - Math.max(1, Number(maxAgeDays) || 90) * 24 * 60 * 60 * 1000;
  const snap = await db.collection(TOKENS_COLLECTION).get();
  let deleted = 0;
  const batch = db.batch();
  let ops = 0;
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const t = String(data.token || '').trim();
    const updatedMs = Date.parse(String(data.updated_at || ''));
    const stale = Number.isFinite(updatedMs) && updatedMs < cutoff;
    const invalid = !t.startsWith('ExponentPushToken') && !t.startsWith('ExpoPushToken');
    if (!stale && !invalid) return;
    batch.delete(doc.ref);
    deleted += 1;
    ops += 1;
    if (ops >= 400) {
      throw new Error('Too many stale tokens for one batch — run cleanup again.');
    }
  });
  if (deleted > 0) await batch.commit();
  return { ok: true, deleted };
}

function repairPushTargets(order) {
  const dept = String(order?.repair_department || order?.metadata?.repair_department || '').trim().toLowerCase();
  if (dept === 'carpentry') return ['carpentry'];
  if (dept === 'painting') return ['painting'];
  return ['upholstery'];
}

export async function notifyProductionNewReturnOrder(order) {
  const num = order?.return_number || order?.id || '';
  const name = order?.assembly_name || 'Product';
  const targets = repairPushTargets(order);
  return sendProductionOperatorPush({
    title: 'New repair',
    body: `${num} — ${name}`.trim(),
    data: { screen: 'Repairs', event_type: 'repairs', return_order_id: order?.id || '' },
    appTargets: targets,
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
    appTargets: ['upholstery'],
  });
}

export async function notifyProductionQuoteOrderSent({ route, quoteNumber, customerName, quoteId } = {}) {
  const r = String(route || '').trim().toLowerCase();
  const targets = r === 'carpentry' ? ['carpentry'] : ['upholstery'];
  const label = r === 'carpentry' ? 'Carpentry' : 'Upholstery';
  return sendProductionOperatorPush({
    title: `New ${label} order`,
    body: `${quoteNumber || 'Quote'}${customerName ? ` — ${customerName}` : ''}`.trim(),
    data: {
      screen: r === 'carpentry' ? 'Quotes' : 'UpholsteryQuotes',
      quote_id: String(quoteId || '').trim(),
      event_type: 'quotes',
    },
    appTargets: targets,
  });
}

export async function notifyPaintingNewJob(job) {
  const name = job?.product_name || 'Product';
  const qty = Math.max(1, Number(job?.product_qty) || 1);
  return sendProductionOperatorPush({
    title: 'Painting job',
    body: `${name} × ${qty}`.trim(),
    data: { screen: 'Jobs', event_type: 'painting_jobs', painting_job_id: job?.job_id || job?.id || '' },
    appTargets: ['painting'],
  });
}

export async function notifyProductionManufactureJob({ channel, job } = {}) {
  const ch = String(channel || '').trim().toLowerCase();
  const targets = ch === 'carpentry' ? ['carpentry'] : ['upholstery'];
  const name = job?.product_name || job?.finished_name || job?.raw_name || 'Product';
  const qty = Math.max(1, Number(job?.product_qty) || 1);
  return sendProductionOperatorPush({
    title: 'New production job',
    body: `${name} × ${qty}`.trim(),
    data: { screen: 'Jobs', event_type: 'jobs', job_id: String(job?.job_id || job?.id || '').trim() },
    appTargets: targets,
  });
}
