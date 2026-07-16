/**
 * Import an Infinity Home backup JSON into a target Supabase project.
 *
 * Usage:
 *   set TARGET_SUPABASE_URL=https://xxxx.supabase.co
 *   set TARGET_SUPABASE_SERVICE_ROLE=eyJ...
 *   node scripts/importDbBackup.js [path-to-backup.json]
 *
 * Or pass via args:
 *   node scripts/importDbBackup.js backups/foo.json --url https://xxxx.supabase.co --key eyJ...
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

const BATCH = 200;
const PRIMARY_KEYS = {
  user_acl: 'user_uid',
  stocktake_location_state: 'location_id',
};

// Parent-first order. Sales and laybys form a nullable FK cycle, handled below.
const RESTORE_ORDER = [
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
  'quotation_units',
  'quotation_products',
  'sales',
  'laybys',
  'quotations',
  'quotation_items',
  'sales_items',
  'sales_payments',
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

function parseArgs(argv) {
  const out = { file: null, url: null, key: null, mode: 'replace' };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === '--url') out.url = args.shift();
    else if (a === '--key') out.key = args.shift();
    else if (a === '--mode') out.mode = args.shift();
    else if (!a.startsWith('-') && !out.file) out.file = a;
  }
  return out;
}

function latestBackup() {
  const dir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? path.join(dir, files[0].f) : null;
}

function isMissingTable(error) {
  return /relation .* does not exist|Could not find the table|schema cache/i.test(
    String(error?.message || ''),
  );
}

async function clearTable(supabase, table) {
  const primaryKey = PRIMARY_KEYS[table] || 'id';
  for (let guard = 0; guard < 5000; guard += 1) {
    const { data, error } = await supabase.from(table).select(primaryKey).limit(500);
    if (error) {
      if (isMissingTable(error)) return { skipped: true, warning: error.message };
      if (/column .* does not exist/i.test(error.message || '')) {
        return { skipped: true, warning: `No ${primaryKey} column on ${table}` };
      }
      throw error;
    }
    if (!data?.length) return { skipped: false };
    const ids = data.map((r) => r[primaryKey]).filter((id) => id != null);
    if (!ids.length) return { skipped: true, warning: `No ${primaryKey} values in ${table}` };
    const { error: delError } = await supabase.from(table).delete().in(primaryKey, ids);
    if (delError) throw delError;
  }
  return { skipped: false, warning: 'clear safety limit hit' };
}

async function insertRows(supabase, table, rows) {
  const primaryKey = PRIMARY_KEYS[table] || 'id';
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    let result = await supabase.from(table).upsert(batch, {
      onConflict: primaryKey,
      ignoreDuplicates: false,
    });
    if (result.error) {
      result = await supabase.from(table).insert(batch);
    }
    if (result.error) {
      if (isMissingTable(result.error)) {
        return { inserted, skipped: true, warning: result.error.message };
      }
      throw new Error(`${table} @${i}: ${result.error.message}`);
    }
    inserted += batch.length;
    process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');
  return { inserted, skipped: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file || latestBackup();
  const url =
    args.url ||
    process.env.TARGET_SUPABASE_URL ||
    process.env.NEW_SUPABASE_URL;
  const key =
    args.key ||
    process.env.TARGET_SUPABASE_SERVICE_ROLE ||
    process.env.NEW_SUPABASE_SERVICE_ROLE;

  if (!file || !fs.existsSync(file)) {
    console.error('Backup file not found. Pass a path or create one with exportDbBackup.js');
    process.exit(1);
  }
  if (!url || !key) {
    console.error(
      'Missing target credentials.\nSet TARGET_SUPABASE_URL and TARGET_SUPABASE_SERVICE_ROLE\nor pass --url and --key',
    );
    process.exit(1);
  }

  if (/xolmjpsibkwkdllqadee/i.test(url)) {
    console.error('Refusing to import into the OLD project URL. Use the new project URL.');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (backup.format !== 'infinity-home-db-backup') {
    console.error('Invalid backup format');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });

  console.log(`Target: ${url}`);
  console.log(`Backup: ${file}`);
  console.log(`Mode: ${args.mode}`);

  const tablesMap = backup.tables || {};
  const backupOrder = Array.isArray(backup.insertOrder) && backup.insertOrder.length
    ? backup.insertOrder
    : Object.keys(tablesMap);
  const insertOrder = [
    ...RESTORE_ORDER.filter((table) => backupOrder.includes(table)),
    ...backupOrder.filter((table) => !RESTORE_ORDER.includes(table)),
  ];
  const clearOrder = [...insertOrder].reverse();

  if (args.mode === 'replace') {
    // Break the nullable sales <-> laybys cycle before deleting either table.
    await supabase.from('quotations').update({ layby_id: null }).not('layby_id', 'is', null);
    await supabase.from('quotations').update({ sale_id: null }).not('sale_id', 'is', null);
    await supabase.from('sales').update({ layby_id: null }).not('layby_id', 'is', null);
    await supabase.from('laybys').update({ sale_id: null }).not('sale_id', 'is', null);

    console.log('\nClearing tables...');
    for (const table of clearOrder) {
      if (!Object.prototype.hasOwnProperty.call(tablesMap, table)) continue;
      process.stdout.write(`  clear ${table}...`);
      const result = await clearTable(supabase, table);
      console.log(result.skipped ? ` skipped (${result.warning || 'missing'})` : ' ok');
    }
  }

  console.log('\nImporting tables...');
  const warnings = [];
  for (const table of insertOrder) {
    const sourceRows = Array.isArray(tablesMap[table]) ? tablesMap[table] : [];
    // Insert sales first without layby_id. After laybys exist, restore these links.
    const rows = table === 'sales'
      ? sourceRows.map((row) => ({ ...row, layby_id: null }))
      : sourceRows;
    if (!rows.length) continue;
    try {
      const result = await insertRows(supabase, table, rows);
      if (result.warning) warnings.push(`${table}: ${result.warning}`);
      if (table === 'laybys') {
        const salesRows = Array.isArray(tablesMap.sales) ? tablesMap.sales : [];
        if (salesRows.length) {
          console.log('  restoring sales → layby links...');
          const linked = await insertRows(supabase, 'sales', salesRows);
          if (linked.warning) warnings.push(`sales links: ${linked.warning}`);
        }
      }
    } catch (err) {
      console.error(`\nFAILED on ${table}:`, err.message || err);
      process.exit(1);
    }
  }

  if (warnings.length) {
    console.log('\nWarnings:');
    warnings.forEach((w) => console.log(` - ${w}`));
  }
  console.log('\nImport finished.');
  console.log('Next: recreate Auth users in the new Supabase dashboard, then update Vercel env keys.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
