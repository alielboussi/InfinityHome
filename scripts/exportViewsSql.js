/**
 * Export CREATE VIEW statements from a Supabase Postgres project.
 *
 * Usage:
 *   set SOURCE_SUPABASE_URL=https://xxxx.supabase.co
 *   set SOURCE_SUPABASE_SERVICE_ROLE=eyJ...
 *   node scripts/exportViewsSql.js > supabase/sql/create_reporting_views.sql
 *
 * Requires exec_sql or execute_sql RPC on the source project.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

const url =
  process.env.SOURCE_SUPABASE_URL ||
  process.env.OLD_SUPABASE_URL ||
  'https://xolmjpsibkwkdllqadee.supabase.co';
const key = process.env.SOURCE_SUPABASE_SERVICE_ROLE || process.env.OLD_SUPABASE_SERVICE_ROLE;

if (!key) {
  console.error('Set SOURCE_SUPABASE_SERVICE_ROLE (old project service role key)');
  process.exit(1);
}

const VIEW_NAMES = [
  'v_sales_pdf_totals',
  'v_sales_financials',
  'v_sales_financials_canonical',
  'v_sales_totals_canonical',
  'v_customer_layby_outstanding',
  'v_payments_non_credit',
  'v_factory_sold_storage_summary',
  'v_factory_sold_storage_active',
  'v_location_transfer_totals',
  'v_negative_inventory',
  'v_transfer_sessions_totals',
  'ledger_balances',
];

async function runSql(sb, query) {
  for (const fn of ['exec_sql', 'execute_sql']) {
    const { data, error } = await sb.rpc(fn, { query });
    if (!error) return data;
  }
  throw new Error('Neither exec_sql nor execute_sql RPC is available on source project');
}

async function main() {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const inList = VIEW_NAMES.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
  const query = `
    SELECT
      c.relname AS view_name,
      pg_get_viewdef(c.oid, true) AS view_sql
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname IN (${inList})
    ORDER BY c.relname;
  `;

  const rows = await runSql(sb, query);
  const list = Array.isArray(rows) ? rows : rows?.rows || rows?.data || [];
  if (!list.length) {
    console.error('No views returned from source project');
    process.exit(1);
  }

  console.log('-- Exported reporting views from', url);
  console.log('-- Run in Supabase SQL Editor on the NEW project\n');
  for (const row of list) {
    const name = row.view_name || row.table_name;
    const sql = String(row.view_sql || '').trim();
    if (!name || !sql) continue;
    console.log(`-- ${name}`);
    console.log(`CREATE OR REPLACE VIEW public.${name} AS`);
    console.log(sql.endsWith(';') ? sql : `${sql};`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
