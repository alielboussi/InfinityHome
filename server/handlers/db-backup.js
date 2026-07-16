import { createClient } from '@supabase/supabase-js';

const ALLOWED_EMAIL = 'alielboussi00@gmail.com';
const PAGE_SIZE_DEFAULT = 500;
const PAGE_SIZE_MAX = 1000;
const INSERT_BATCH = 200;

/** Parent tables first so foreign keys succeed on restore. */
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
  // legacy names (skipped automatically if missing)
  'stocktakes',
  'stocktake_items',
];

const CLEAR_ORDER = [...BACKUP_TABLES].reverse();

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const error = new Error('Supabase service environment variables missing');
    error.status = 500;
    error.details = {
      missing: [
        !url ? 'SUPABASE_URL (or REACT_APP_SUPABASE_URL)' : null,
        !serviceKey ? 'SUPABASE_SERVICE_ROLE' : null,
      ].filter(Boolean),
    };
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

function getSupabaseAnonClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const error = new Error('Supabase anon environment variables missing');
    error.status = 500;
    throw error;
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

async function getRequestUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const supabase = getSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    const authError = new Error(error.message || 'Invalid session');
    authError.status = 401;
    throw authError;
  }
  return data?.user || null;
}

function assertBackupAdmin(actor) {
  if (!actor) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  if (String(actor.email || '').trim().toLowerCase() !== ALLOWED_EMAIL) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
}

function isMissingTableError(error) {
  const msg = String(error?.message || '');
  return /relation .* does not exist|Could not find the table|schema cache/i.test(msg);
}

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return PAGE_SIZE_DEFAULT;
  return Math.max(1, Math.min(PAGE_SIZE_MAX, Math.floor(n)));
}

function parseOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeTableName(raw) {
  const name = String(raw || '').trim().toLowerCase();
  if (!BACKUP_TABLES.includes(name)) {
    const err = new Error(`Table not allowed for backup: ${raw || '(empty)'}`);
    err.status = 400;
    throw err;
  }
  return name;
}

async function probeTable(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    if (isMissingTableError(error)) {
      return { table, exists: false, count: 0 };
    }
    throw error;
  }
  return { table, exists: true, count: count || 0 };
}

async function handleManifest(req, res) {
  const actor = await getRequestUser(req);
  assertBackupAdmin(actor);
  const supabase = getSupabaseServiceClient();

  const tables = [];
  for (const table of BACKUP_TABLES) {
    tables.push(await probeTable(supabase, table));
  }

  const projectUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || null;

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    format: 'infinity-home-db-backup',
    version: 1,
    generatedAt: new Date().toISOString(),
    projectUrl,
    notes: [
      'Exports public business tables only (not auth.users or Storage files).',
      'Recreate login users in Auth on a new project before or after import.',
      'Product image files in Storage are not included; URLs may still point at the old project.',
      'Apply schema/migrations on the target project before importing.',
    ],
    tables,
    clearOrder: CLEAR_ORDER,
    insertOrder: BACKUP_TABLES,
  });
}

async function handleExportTable(req, res) {
  const actor = await getRequestUser(req);
  assertBackupAdmin(actor);

  const table = normalizeTableName(req.query?.table);
  const limit = parseLimit(req.query?.limit);
  const offset = parseOffset(req.query?.offset);
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .range(offset, offset + limit - 1);

  if (error) {
    if (isMissingTableError(error)) {
      res.status(200).json({
        ok: true,
        table,
        exists: false,
        rows: [],
        offset,
        limit,
        hasMore: false,
      });
      return;
    }
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    table,
    exists: true,
    rows,
    offset,
    limit,
    hasMore: rows.length === limit,
  });
}

async function clearTable(supabase, table) {
  // Delete in batches by primary key `id` when present.
  for (let guard = 0; guard < 5000; guard += 1) {
    const { data, error } = await supabase.from(table).select('id').limit(500);
    if (error) {
      if (isMissingTableError(error)) return { cleared: 0, skipped: true };
      // Table may not have `id` — try deleting everything with a broad filter.
      if (/column .* does not exist/i.test(error.message || '')) {
        const del = await supabase.from(table).delete().neq('created_at', '1970-01-01T00:00:00.000Z');
        if (del.error && !isMissingTableError(del.error)) {
          // last resort: fail soft so import can still try upserts
          return { cleared: 0, skipped: true, warning: del.error.message };
        }
        return { cleared: -1, skipped: false };
      }
      throw error;
    }
    if (!data?.length) return { cleared: 0, skipped: false };

    const ids = data.map((row) => row.id).filter((id) => id != null);
    if (!ids.length) {
      return { cleared: 0, skipped: true, warning: `No deletable id values in ${table}` };
    }

    const { error: delError } = await supabase.from(table).delete().in('id', ids);
    if (delError) throw delError;
  }
  return { cleared: -1, skipped: false, warning: 'Clear stopped after safety limit' };
}

async function handleClearTable(req, res) {
  const actor = await getRequestUser(req);
  assertBackupAdmin(actor);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (String(body.confirm || '') !== 'CLEAR') {
    res.status(400).json({ ok: false, error: 'Send confirm: "CLEAR" to clear a table' });
    return;
  }

  const table = normalizeTableName(body.table);
  const supabase = getSupabaseServiceClient();
  const result = await clearTable(supabase, table);
  res.status(200).json({ ok: true, table, ...result });
}

async function handleImportTable(req, res) {
  const actor = await getRequestUser(req);
  assertBackupAdmin(actor);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (String(body.confirm || '') !== 'RESTORE') {
    res.status(400).json({ ok: false, error: 'Send confirm: "RESTORE" to import rows' });
    return;
  }

  const table = normalizeTableName(body.table);
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows) {
    res.status(400).json({ ok: false, error: 'rows must be an array' });
    return;
  }
  if (rows.length > INSERT_BATCH) {
    res.status(400).json({
      ok: false,
      error: `Too many rows in one request (max ${INSERT_BATCH}). Split the batch.`,
    });
    return;
  }

  const mode = String(body.mode || 'upsert').toLowerCase() === 'insert' ? 'insert' : 'upsert';
  const supabase = getSupabaseServiceClient();

  if (!rows.length) {
    res.status(200).json({ ok: true, table, inserted: 0, mode });
    return;
  }

  let result;
  if (mode === 'insert') {
    result = await supabase.from(table).insert(rows);
  } else {
    result = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
  }

  if (result.error) {
    if (isMissingTableError(result.error)) {
      res.status(200).json({
        ok: true,
        table,
        inserted: 0,
        skipped: true,
        warning: `Table missing on target: ${table}`,
      });
      return;
    }
    // Upsert can fail when there is no unique `id` constraint — fall back to insert.
    if (mode === 'upsert') {
      const fallback = await supabase.from(table).insert(rows);
      if (fallback.error) {
        throw fallback.error;
      }
      res.status(200).json({
        ok: true,
        table,
        inserted: rows.length,
        mode: 'insert-fallback',
      });
      return;
    }
    throw result.error;
  }

  res.status(200).json({ ok: true, table, inserted: rows.length, mode });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const op = String(
      req.query?.op ||
        req.query?.action ||
        req.body?.op ||
        req.body?.action ||
        ''
    )
      .trim()
      .toLowerCase();

    if (req.method === 'GET') {
      if (op === 'manifest' || op === '' || op === 'list') {
        await handleManifest(req, res);
        return;
      }
      if (op === 'export') {
        await handleExportTable(req, res);
        return;
      }
      res.status(400).json({ ok: false, error: 'Unknown GET op. Use op=manifest or op=export' });
      return;
    }

    if (req.method === 'POST') {
      if (op === 'import') {
        await handleImportTable(req, res);
        return;
      }
      if (op === 'clear') {
        await handleClearTable(req, res);
        return;
      }
      res.status(400).json({ ok: false, error: 'Unknown POST op. Use op=import or op=clear' });
      return;
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      ok: false,
      error: err?.message || 'Unexpected error',
      details: err?.details || err?.hint || null,
    });
  }
}
