import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@warehouse_catalog/offline_ops_v1';
const KITWE_DRAFT_KEY = '@warehouse_catalog/kitwe_draft_v1';

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/** @typedef {{ id: string, op: string, body: object, created_at: string }} QueuedOp */

export async function enqueueOfflineOp(op, body = {}) {
  const queue = await readQueue();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    op,
    body,
    created_at: new Date().toISOString(),
  };
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getOfflineQueueLength() {
  return (await readQueue()).length;
}

/**
 * @param {(item: QueuedOp) => Promise<boolean>} processor — return true to remove item
 */
export async function flushOfflineQueue(processor) {
  const queue = await readQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  const kept = [];
  let flushed = 0;
  for (const item of queue) {
    try {
      const remove = await processor(item);
      if (remove) flushed += 1;
      else kept.push(item);
    } catch {
      kept.push(item);
    }
  }
  await writeQueue(kept);
  return { flushed, remaining: kept.length };
}

export async function saveKitweDraft(draft) {
  await AsyncStorage.setItem(KITWE_DRAFT_KEY, JSON.stringify(draft));
}

export async function loadKitweDraft() {
  try {
    const raw = await AsyncStorage.getItem(KITWE_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearKitweDraft() {
  await AsyncStorage.removeItem(KITWE_DRAFT_KEY);
}
