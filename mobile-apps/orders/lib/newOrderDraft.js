import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'orders_new_quote_draft_v1';

export async function readNewOrderDraft() {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeNewOrderDraft(draft) {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* non-fatal */
  }
}

export async function clearNewOrderDraft() {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    /* non-fatal */
  }
}
