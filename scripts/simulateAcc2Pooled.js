/**
 * Simulate Acc(2) pooled totals from live DB (no React client).
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ACC2 = 'efb21cad-1a8d-4d64-9487-51e816fcb429';

// Load rollup helpers via transpile-free dynamic path
const rollupPath = new URL('../src/utils/laybyRollup.js', import.meta.url).href;

async function loadRollup() {
  // Use jiti-less approach: inline import with experimental flag may fail; use child process
  const { execSync } = await import('child_process');
  const code = `
    import { buildLaybySaleFinancials, computePooledLaybyTotalsByCurrency } from './src/utils/laybyRollup.js';
    const statement = JSON.parse(process.argv[1]);
    const fin = buildLaybySaleFinancials(statement);
    const pooled = computePooledLaybyTotalsByCurrency(statement);
    console.log(JSON.stringify({ finCount: fin.length, finTotal: fin.reduce((s,x)=>s+x.total,0), fin, pooled }, null, 2));
  `;
  return null;
}

async function main() {
  const db = getDataClient();
  const { data: sales } = await db.from('sales').select('*').eq('customer_id', ACC2);
  const saleIds = (sales || []).map((s) => s.id);
  const { data: items } = await db.from('sales_items').select('*').in('sale_id', saleIds);
  const { data: sp } = await db.from('sales_payments').select('*').in('sale_id', saleIds);

  const statement = {
    sales: (sales || []).map((s) => ({
      sale_id: s.id,
      sale_date: s.sale_date,
      currency: s.currency,
      total_due: s.total_amount,
      total_amount: s.total_amount,
      discount_amount: s.discount || 0,
      vat_apply: s.vat_apply,
      vat_inclusive: s.vat_inclusive,
      vat_rate: s.vat_rate,
    })),
    items: items || [],
    payments: sp || [],
  };

  console.log('Raw sale sum:', (sales || []).reduce((a, s) => a + Number(s.total_amount || 0), 0));
  console.log('Sales:', statement.sales.length, 'Items:', statement.items.length, 'Payments:', statement.payments.length);

  // Dynamic import rollup (CRA uses webpack; node may need extension)
  const rollup = await import('../src/utils/laybyRollup.js');
  const fin = rollup.buildLaybySaleFinancials(statement);
  const pooled = rollup.computePooledLaybyTotalsByCurrency(statement);
  console.log('buildLaybySaleFinancials count:', fin.length);
  console.log('fin total sum:', fin.reduce((s, x) => s + x.total, 0));
  console.log('fin due sum:', fin.reduce((s, x) => s + x.due, 0));
  fin.forEach((x) => console.log(`  #${x.saleId}: total=${x.total} paid=${x.paid} due=${x.due} subtotal=${x.subtotalBeforeDiscount}`));
  console.log('pooled:', pooled);

  // Test without vat_apply
  const statement2 = {
    ...statement,
    sales: statement.sales.map((s) => ({ ...s, vat_apply: false })),
  };
  const pooled2 = rollup.computePooledLaybyTotalsByCurrency(statement2);
  console.log('pooled without vat_apply:', pooled2);
}

main().catch((e) => { console.error(e); process.exit(1); });
