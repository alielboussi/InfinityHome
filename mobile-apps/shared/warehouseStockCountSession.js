import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_KEY = '@warehouse_floor_count/active_v1';
const SESSION_PREFIX = '@warehouse_floor_count/session_v1/';

export function createEmptySession({ catalog }) {
  const warehouseLocationId = catalog?.warehouseLocationId ?? null;
  const warehouseLocationName = catalog?.warehouseLocationName || 'Warehouse';
  const lines = {};
  (catalog?.packets || []).forEach((p) => {
    const id = String(p.id);
    lines[id] = {
      packetId: id,
      sku: String(p.sku || ''),
      name: String(p.name || ''),
      scannedQty: 0,
      lastScannedAt: null,
    };
  });
  return {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    startedAt: Date.now(),
    warehouseLocationId,
    warehouseLocationName,
    lines,
  };
}

export async function loadActiveSessionId() {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

export async function loadSession(sessionId) {
  if (!sessionId) return null;
  const raw = await AsyncStorage.getItem(SESSION_PREFIX + sessionId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  if (!session?.id) return;
  await AsyncStorage.setItem(SESSION_PREFIX + session.id, JSON.stringify(session));
  await AsyncStorage.setItem(ACTIVE_KEY, session.id);
}

export async function clearActiveSession() {
  const id = await loadActiveSessionId();
  if (id) {
    await AsyncStorage.removeItem(SESSION_PREFIX + id);
  }
  await AsyncStorage.removeItem(ACTIVE_KEY);
}

export function sessionStats(session) {
  const lines = Object.values(session?.lines || {});
  const total = lines.length;
  const scanned = lines.filter((l) => (l.scannedQty || 0) > 0).length;
  const remaining = total - scanned;
  return { total, scanned, remaining };
}

export function listScannedLines(session) {
  return Object.values(session?.lines || {})
    .filter((l) => (l.scannedQty || 0) > 0)
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

export function listRemainingLines(session) {
  return Object.values(session?.lines || {})
    .filter((l) => !(l.scannedQty || 0))
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

export function findPacketLineByScan(session, catalogPackets, normalizedScan, expandKeys) {
  if (!normalizedScan) return null;
  const scanKeys = expandKeys ? expandKeys(normalizedScan) : new Set([normalizedScan.toLowerCase()]);
  for (const p of catalogPackets || []) {
    const id = String(p.id);
    const line = session?.lines?.[id];
    if (!line) continue;
    const storedKeys = expandKeys
      ? expandKeys(String(p.sku || ''))
      : new Set([String(p.sku || '').toLowerCase()]);
    for (const k of scanKeys) {
      if (k && storedKeys.has(k)) return line;
    }
  }
  return null;
}

export function applyScanQty(session, packetId, addQty) {
  const id = String(packetId);
  const line = session?.lines?.[id];
  if (!line) return session;
  const qty = Math.max(0, Math.floor(Number(addQty) || 0));
  if (qty <= 0) return session;
  return {
    ...session,
    lines: {
      ...session.lines,
      [id]: {
        ...line,
        scannedQty: (line.scannedQty || 0) + qty,
        lastScannedAt: Date.now(),
      },
    },
  };
}
