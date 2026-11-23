import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@warehouse_production_sent_deliveries_v1';
const MAX_ITEMS = 80;

function normalizeRecord(raw) {
  const sessionId = String(raw?.session_id || '').trim();
  if (!sessionId) return null;
  return {
    session_id: sessionId,
    delivery_number: String(raw?.delivery_number || '').trim(),
    status: String(raw?.status || 'submitted').trim() || 'submitted',
    submitted_at: String(raw?.submitted_at || raw?.saved_at || '').trim(),
    driver_name: String(raw?.driver_name || '').trim(),
    dispatched_by_name: String(raw?.dispatched_by_name || raw?.supervisor_name || '').trim(),
    driver_signature_url: String(raw?.driver_signature_url || '').trim(),
    driver_signature_data_uri: String(raw?.driver_signature_data_uri || '').trim(),
    print_groups: Array.isArray(raw?.print_groups) ? raw.print_groups : [],
    saved_at: String(raw?.saved_at || new Date().toISOString()),
  };
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecord).filter(Boolean);
  } catch {
    return [];
  }
}

export async function saveLocalSentDelivery(record) {
  const row = normalizeRecord(record);
  if (!row) return;
  const list = await readAll();
  const next = [row, ...list.filter((item) => item.session_id !== row.session_id)].slice(0, MAX_ITEMS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function listLocalSentDeliveries() {
  const list = await readAll();
  return list.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
}

export async function getLocalSentDelivery(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const list = await readAll();
  return list.find((row) => row.session_id === sid) || null;
}

export function localSentToListRow(row) {
  return {
    session_id: row.session_id,
    delivery_number: row.delivery_number,
    status: row.status,
    submitted_at: row.submitted_at,
    driver_name: row.driver_name,
    dispatched_by_name: row.dispatched_by_name,
    local_only: true,
  };
}

export function localSentToDetail(row) {
  return {
    session: {
      id: row.session_id,
      delivery_number: row.delivery_number,
      status: row.status,
      submitted_at: row.submitted_at,
      driver_name: row.driver_name,
      dispatched_by_name: row.dispatched_by_name,
      driver_signature_url: row.driver_signature_url || row.driver_signature_data_uri || '',
    },
    print_groups: row.print_groups || [],
    driver_signature_data_uri: row.driver_signature_data_uri || '',
    local_only: true,
  };
}

function mergeSentLists(remoteRows, localRows, limit) {
  const byId = new Map();
  for (const row of localRows) {
    byId.set(row.session_id, localSentToListRow(row));
  }
  for (const row of remoteRows || []) {
    const sid = String(row?.session_id || '').trim();
    if (!sid) continue;
    byId.set(sid, { ...row, local_only: false });
  }
  return [...byId.values()]
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))
    .slice(0, Math.max(1, Number(limit) || 40));
}

export { mergeSentLists };
