import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'dashboard_notification_badges_v1';

const counts = Object.create(null);
const listeners = new Set();
let hydratePromise = null;

function emit() {
  const snapshot = getDashboardBadgeCounts();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      /* ignore */
    }
  });
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(counts)).catch(() => {});
}

export function getDashboardBadgeCounts() {
  return { ...counts };
}

export function getDashboardBadgeCount(key) {
  const k = String(key || '').trim();
  if (!k) return 0;
  return Math.max(0, Math.floor(Number(counts[k]) || 0));
}

export async function hydrateDashboardBadges() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      Object.keys(parsed).forEach((key) => {
        const n = Math.floor(Number(parsed[key]) || 0);
        if (n > 0) counts[key] = n;
      });
      emit();
    } catch {
      /* ignore */
    }
  })();
  return hydratePromise;
}

export function subscribeDashboardBadges(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(getDashboardBadgeCounts());
  return () => listeners.delete(listener);
}

export function incrementDashboardBadge(key, delta = 1) {
  const k = String(key || '').trim();
  if (!k) return;
  const add = Math.max(1, Math.floor(Number(delta) || 1));
  counts[k] = getDashboardBadgeCount(k) + add;
  persist();
  emit();
}

export function clearDashboardBadge(key) {
  const k = String(key || '').trim();
  if (!k || !counts[k]) return;
  delete counts[k];
  persist();
  emit();
}

/** Map Expo push `data` to a dashboard tile badge key (or null). */
export function resolveDashboardBadgeKeyFromPushData(data) {
  const d = data && typeof data === 'object' ? data : {};
  const eventType = String(d.event_type || d.eventType || '').trim().toLowerCase();
  const screen = String(d.screen || '').trim();

  if (eventType === 'quotes' || eventType === 'quote') return 'quotes';
  if (eventType === 'repairs' || eventType === 'repair') return 'repairs';
  if (eventType === 'jobs' || eventType === 'job' || eventType === 'painting_jobs' || eventType === 'painting_job') {
    return 'jobs';
  }
  if (eventType === 'delivery_repairs' || screen === 'DeliveryRepairQueue') return 'delivery_repairs';
  if (eventType === 'delivery_orders' || screen === 'DeliveryOrderQueue') return 'delivery_orders';
  if (eventType === 'sold' || screen === 'SoldOrders') return 'sold';

  if (screen === 'UpholsteryQuotes' || screen === 'Quotes') return 'quotes';
  if (screen === 'Repairs') return 'repairs';
  if (screen === 'Jobs') return 'jobs';

  return null;
}

export function applyPushDataToDashboardBadge(data) {
  const key = resolveDashboardBadgeKeyFromPushData(data);
  if (key) incrementDashboardBadge(key);
  return key;
}

export function clearDashboardBadgeForPushData(data) {
  const key = resolveDashboardBadgeKeyFromPushData(data);
  if (key) clearDashboardBadge(key);
  return key;
}
