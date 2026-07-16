// Dev-only Supabase diagnostics to quickly surface environment issues
import supabase from '../supabase';
import { DB_SCHEMA } from '../dbSchema';

export async function probeSupabaseOnce(label = 'POS probe') {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'production') return;
  try {
    const url = process.env.REACT_APP_SUPABASE_URL || 'UNSET';
    // HEAD-like probes
    const db = typeof supabase.schema === 'function' ? supabase.schema(DB_SCHEMA) : supabase;
    const tryHead = async (table) => {
      try {
        const { error } = await db.from(table).select('*', { head: true, count: 'estimated' });
        return { table, ok: !error, error };
      } catch (e) { return { table, ok: false, error: e }; }
    };
    const [sales, salesItems, salesPayments] = await Promise.all([
      tryHead('sales'),
      tryHead('sales_items'),
      tryHead('sales_payments'),
    ]);
    // eslint-disable-next-line no-console
    console.info(`[${label}] Supabase URL:`, url);
    // eslint-disable-next-line no-console
    console.info(`[${label}] public tables availability:`, {
      sales: sales.ok ? 'OK' : (sales.error?.message || 'ERR'),
      sales_items: salesItems.ok ? 'OK' : (salesItems.error?.message || 'ERR'),
      sales_payments: salesPayments.ok ? 'OK' : (salesPayments.error?.message || 'ERR'),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[probeSupabaseOnce] failed', e);
  }
}
