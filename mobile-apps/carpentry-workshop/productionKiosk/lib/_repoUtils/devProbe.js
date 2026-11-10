// Dev-only Firestore diagnostics to quickly surface environment issues
import db from '../dataClient';
import { DB_SCHEMA } from '../dbSchema';

export async function probeFirestoreOnce(label = 'POS probe') {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'production') return;
  try {
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'UNSET';
    const scopedDb = typeof db.schema === 'function' ? db.schema(DB_SCHEMA) : db;
    const tryHead = async (table) => {
      try {
        const { error } = await scopedDb.from(table).select('*', { head: true, count: 'estimated' });
        return { table, ok: !error, error };
      } catch (e) { return { table, ok: false, error: e }; }
    };
    const [sales, salesItems, salesPayments] = await Promise.all([
      tryHead('sales'),
      tryHead('sales_items'),
      tryHead('sales_payments'),
    ]);
    // eslint-disable-next-line no-console
    console.info(`[${label}] Firebase project:`, projectId);
    // eslint-disable-next-line no-console
    console.info(`[${label}] collection availability:`, {
      sales: sales.ok ? 'OK' : (sales.error?.message || 'ERR'),
      sales_items: salesItems.ok ? 'OK' : (salesItems.error?.message || 'ERR'),
      sales_payments: salesPayments.ok ? 'OK' : (salesPayments.error?.message || 'ERR'),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[probeFirestoreOnce] failed', e);
  }
}