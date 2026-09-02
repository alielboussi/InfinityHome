import db from '../dataClient';
import { fetchLaybyStatement } from '../services/laybyStatement';
import { computePooledLaybyTotalsByCurrency } from './laybyRollup';
import { applyStartingDueToTotalsByCurrency, getStartingDueBalance } from './startingDueBalance';
import { normalizeLaybyStatement } from './laybyStatementNormalize';

/** Pooled Total Due — same rules as Layby Management (laybyColumnTotals.js). */
export async function computeCustomerLaybyDueTotal(customerId) {
  if (!customerId) return 0;
  try {
    const { data: customerRow } = await db
      .from('customers')
      .select('starting_due_balance, starting_due_balance_date, currency')
      .eq('id', customerId)
      .maybeSingle();
    const customer = customerRow || {};
    const startingOnly = getStartingDueBalance(customer);

    const { data: statement, error } = await fetchLaybyStatement(customerId);
    if (error || !statement) return startingOnly;

    const normalized = normalizeLaybyStatement({
      sales: statement.sales || [],
      items: statement.items || [],
      payments: statement.payments || [],
    });

    const totalsByCurrency = applyStartingDueToTotalsByCurrency(
      computePooledLaybyTotalsByCurrency(normalized),
      customer,
    );

    return Object.values(totalsByCurrency || {}).reduce(
      (sum, bucket) => sum + Math.max(0, Number(bucket?.due || 0)),
      0,
    );
  } catch {
    return 0;
  }
}
