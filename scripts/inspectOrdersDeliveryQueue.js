/**
 * Inspect Delivery Orders queue jobs vs quotations (ops).
 * Usage: node scripts/inspectOrdersDeliveryQueue.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { createFirestoreServerClient } from '../server/lib/firestoreServerClient.js';
import { parseWarehouseReturnMetadata } from '../src/utils/warehouseReturnOrder.js';

const TABLES = [
  ['carpentry_production_jobs', 'carpentry'],
  ['upholstery_production_jobs', 'upholstery'],
  ['painting_production_jobs', 'painting'],
];

function metaOf(row) {
  return parseWarehouseReturnMetadata(row?.metadata);
}

function normName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function main() {
  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Firebase admin not configured');

  const jobs = [];
  for (const [table, department] of TABLES) {
    const { data, error } = await sb.from(table).select('*').eq('status', 'completed').limit(500);
    if (error) {
      console.log(`LOAD ${table}: ${error.message}`);
      continue;
    }
    for (const job of data || []) {
      const meta = metaOf(job);
      const admin = meta.delivery_admin || {};
      if (String(admin.stage || '').toLowerCase() !== 'awaiting_driver') continue;
      jobs.push({ table, department, job, meta, admin });
    }
  }

  const { data: routingRows } = await sb.from('quote_production_routing').select('*').limit(800);
  const { data: quotes } = await sb.from('quotations').select('id, quote_number, customer_id, status').limit(800);
  const { data: items } = await sb.from('quotation_items').select('quotation_id, name, name_override, quantity, metadata').limit(2000);
  const { data: customers } = await sb.from('customers').select('id, name, phone').limit(800);
  const { data: qCustomers } = await sb.from('quote_customers').select('id, name, phone').limit(800);
  const { data: runs } = await sb.from('carpentry_production_runs').select('id, quote_id, assembly_id, source, metadata').limit(800);

  const quoteById = new Map((quotes || []).map((q) => [String(q.id), q]));
  const custById = new Map([...(customers || []), ...(qCustomers || [])].map((c) => [String(c.id), c]));
  const itemsByQuote = new Map();
  (items || []).forEach((it) => {
    const id = String(it.quotation_id || '');
    if (!itemsByQuote.has(id)) itemsByQuote.set(id, []);
    itemsByQuote.get(id).push(it);
  });
  const routingByQuote = new Map((routingRows || []).map((r) => [String(r.quote_id), r]));

  console.log(`AWAITING_DRIVER jobs: ${jobs.length}`);
  console.log(`quotations: ${(quotes || []).length}  items: ${(items || []).length}  routing: ${(routingRows || []).length}`);
  console.log('---');

  for (const row of jobs) {
    const { job, meta, admin, department, table } = row;
    const name = admin.assembly_name || job.product_name || job.assembly_id;
    const qty = admin.quantity || job.product_qty;
    const needle = normName(name);
    const quoteId = String(
      job.quote_id || job.carpentry_quote_id || admin.quote_id || meta.quote_id || meta.carpentry_quote_id || '',
    ).trim();
    const run = (runs || []).find((r) => String(r.id) === String(meta.production_run_id || ''));
    const itemHits = (items || []).filter((it) => {
      const n = normName(it.name_override || it.name);
      return n && (n === needle || n.includes(needle) || needle.includes(n));
    });
    const uniqueQuotes = [...new Set(itemHits.map((it) => String(it.quotation_id)))];
    const hitDetails = uniqueQuotes.slice(0, 6).map((qid) => {
      const q = quoteById.get(qid);
      const routing = routingByQuote.get(qid);
      const rmeta = routing?.metadata || {};
      const cust = custById.get(String(q?.customer_id || ''));
      return {
        quote_id: qid,
        quote_number: q?.quote_number || rmeta.quote_number || null,
        customer: rmeta.customer_name || cust?.name || null,
        route: routing?.route || null,
        sent: routing?.sent_to_production_at || null,
        completed: routing?.completed_at || null,
        delivery_stage: rmeta.delivery_admin?.stage || null,
        lines: (itemsByQuote.get(qid) || []).map((it) => `${it.name_override || it.name} x${it.quantity}`).join('; '),
      };
    });

    console.log(JSON.stringify({
      department,
      table,
      job_id: job.id,
      product: name,
      qty,
      status: job.status,
      finish_destination: meta.finish_destination || admin.finish_destination || null,
      catalog_manufacture: meta.catalog_manufacture === true,
      channel: meta.channel || null,
      delivery_stage: admin.stage,
      delivery_registered_at: admin.registered_at || null,
      stored_quote_id: quoteId || null,
      stored_quote_number: admin.quote_number || meta.quote_number || job.quote_number || null,
      stored_customer: admin.customer_name || meta.customer_name || job.customer_name || null,
      run_id: meta.production_run_id || null,
      run_quote_id: run?.quote_id || null,
      run_source: run?.source || null,
      name_match_quotes: hitDetails,
    }, null, 2));
    console.log('---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
