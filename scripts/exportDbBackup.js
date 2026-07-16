/**
 * Local full-database export for Infinity Home.
 * Usage: node scripts/exportDbBackup.js
 * Loads SUPABASE_URL + SUPABASE_SERVICE_ROLE from vercel.env / .env
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

loadEnvFile(path.join(__dirname, '..', 'vercel.env'));
loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', '.env.local'));

const BACKUP_TABLES = [
  'locations',
  'unit_of_measure',
  'categories',
  'users',
  'user_acl',
  'company_settings',
  'customers',
  'quote_customers',
  'products',
  'product_images',
  'product_locations',
  'inventory',
  'combos',
  'combo_items',
  'combo_locations',
  'incomplete_packages',
  'quotations',
  'quotation_items',
  'quotation_products',
  'quotation_units',
  'sales',
  'sales_items',
  'sales_payments',
  'laybys',
  'layby_payments',
  'ledger_entries',
  'factory_sold_storage_items',
  'factory_sold_storage_events',
  'stock_periods',
  'opening_stock_entries',
  'closing_stock_entries',
  'stock_transfer_sessions',
  'stock_transfer_entries',
  'stock_count_checks',
  'warehouse_delivery_sessions',
  'warehouse_delivery_entries',
  'warehouse_delivery_events',
  'label_print_jobs',
  'inventory_adjustments',
  'user_activity_log',
  'stocktake_location_state',
  'stocktake_events',
  'stocktake_counts',
  'stocktake_count_log',
  'stocktake_set_scans',
  'stocktake_gate_audit',
  'stocktakes',
  'stocktake_items',
];

const PAGE = 1000;

function isMissingTable(error) {
  return /relation .* does not exist|Could not find the table|schema cache/i.test(
    String(error?.message || ''),
  );
}

async function exportTable(supabase, table) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (isMissingTable(error)) return { exists: false, rows: [] };
      throw new Error(`${table}: ${error.message}`);
    }
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    process.stdout.write(`\r  ${table}: ${rows.length} rows`);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  process.stdout.write('\n');
  return { exists: true, rows };
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });

  console.log(`Exporting from ${url}`);
  const tables = {};
  const tableCounts = {};
  const missing = [];

  for (const table of BACKUP_TABLES) {
    const result = await exportTable(supabase, table);
    if (!result.exists) {
      missing.push(table);
      continue;
    }
    tables[table] = result.rows;
    tableCounts[table] = result.rows.length;
  }

  const backup = {
    format: 'infinity-home-db-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceProjectUrl: url,
    notes: [
      'Exported via scripts/exportDbBackup.js',
      'Does not include auth.users or Storage binary files.',
    ],
    insertOrder: BACKUP_TABLES.filter((t) => Object.prototype.hasOwnProperty.call(tables, t)),
    clearOrder: [...BACKUP_TABLES]
      .reverse()
      .filter((t) => Object.prototype.hasOwnProperty.call(tables, t)),
    tableCounts,
    missingTables: missing,
    tables,
  };

  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `infinity-home-backup-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(backup));

  const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);
  console.log(`\nWrote ${outFile}`);
  console.log(`Tables: ${Object.keys(tables).length}, rows: ${totalRows}`);
  if (missing.length) console.log(`Missing (skipped): ${missing.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
