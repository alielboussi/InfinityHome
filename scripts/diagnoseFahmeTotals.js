/**
 * Diagnose layby row totals for both Fahme accounts.
 * Run: node --import ./scripts/lib/registerServerDb.mjs scripts/diagnoseFahmeTotals.js
 */
import 'dotenv/config';
import { fetchLaybyCustomerRows } from '../src/services/laybyCustomerRows.js';
import { FAHME_ID, FAHME_ACC2_ID } from '../src/laybyRules.js';
import { getDisplayTotalsByCurrency, computePooledLaybyTotalsByCurrency } from '../src/utils/laybyRollup.js';
import { isFahme } from '../src/laybyRules.js';

async function main() {
  const rows = await fetchLaybyCustomerRows();
  for (const id of [FAHME_ACC2_ID, FAHME_ID]) {
    const row = rows.find((r) => String(r.customerId) === String(id));
    if (!row) {
      console.log(`\n=== ${id}: NO ROW ===`);
      continue;
    }
    const display = getDisplayTotalsByCurrency(row, { isFahmeCustomer: isFahme(id) });
    const pooled = computePooledLaybyTotalsByCurrency(row.fullStatement || row.statement);
    console.log(`\n=== ${row.customer?.name || id} ===`);
    console.log('display totals:', display);
    console.log('raw totalsByCurrency:', row.totalsByCurrency);
    console.log('pooled from fullStatement:', pooled);
    console.log('statement sales:', (row.fullStatement?.sales || []).length);
    console.log('statement payments:', (row.fullStatement?.payments || []).length);
    console.log('payment sum:', (row.fullStatement?.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0));
    console.log('sale total sum:', (row.fullStatement?.sales || []).reduce((s, sale) => s + Number(sale.total_due || sale.total_amount || 0), 0));
    console.log('laybys:', (row.laybys || []).length);
    console.log('totalsDebug:', row.totalsDebug);
    if ((row.fullStatement?.sales || []).length <= 20) {
      (row.fullStatement?.sales || []).forEach((sale) => {
        console.log(`  sale ${sale.sale_id}: total=${sale.total_due || sale.total_amount} due=${sale.outstanding_amount}`);
      });
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
