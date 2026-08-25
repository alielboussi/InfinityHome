import 'dotenv/config';
import { fetchLaybyCustomerRows } from '../src/services/laybyCustomerRows.js';
import { getDisplayTotalsByCurrency } from '../src/utils/laybyRollup.js';
import { isFahme } from '../src/laybyRules.js';

const FAHME_ID = 'd8e756ae-b8ea-4f90-b99a-70c1120f52b9';
const rows = await fetchLaybyCustomerRows();
const row = rows.find((r) => String(r.customerId) === FAHME_ID);
if (!row) {
  console.log('No row for Fahme');
  process.exit(1);
}
const display = getDisplayTotalsByCurrency(row, { isFahmeCustomer: isFahme(FAHME_ID) });
console.log('totalsByCurrency raw:', row.totalsByCurrency);
console.log('display USD:', display.USD);
console.log('totalsDebug:', row.totalsDebug);
console.log('fullStatement sales', row.fullStatement?.sales?.length, 'payments', row.fullStatement?.payments?.length);
console.log('statement sales', row.statement?.sales?.length);
