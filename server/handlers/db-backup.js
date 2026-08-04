import { requireBearerUser } from '../lib/verifyBearerUser.js';
import {
  clearFirestoreTable,
  exportFirestoreTablePage,
  getFirestoreBackupMeta,
  importFirestoreRows,
  probeFirestoreTable,
} from '../lib/firestoreBackup.js';
import { getFirestore } from '../lib/firestoreDb.js';

const ALLOWED_EMAIL = 'alielboussi00@gmail.com';
const PAGE_SIZE_DEFAULT = 500;
const PAGE_SIZE_MAX = 1000;
const INSERT_BATCH = 200;

/** Parent tables first so foreign keys succeed on restore. */
const BACKUP_TABLES = [
  'locations',
  'unit_of_measure',
  'categories',
  'variant_attribute_columns',
  'variant_attribute_values',
  'users',
  'auth_user_map',
  'user_acl',
  'company_settings',
  'customers',
  'quote_customers',
  'products',
  'product_images',
  'product_locations',
  'product_location_prices',
  'inventory',
  'combos',
  'combo_items',
  'combo_locations',
  'combo_location_prices',
  'incomplete_packages',
  'quotations',
  'quotation_items',
  'quotation_products',
  'quotation_units',
  'sales',
  'sales_items',
  'sales_items_dupe_archive',
  'sales_payments',
  'sales_payments_credit_backup',
  'laybys',
  'layby_payments',
  'ledger_entries',
  'factory_sold_storage_items',
  'factory_sold_storage_events',
  'stock_periods',
  'stocktake_user_sessions',
  'stocktake_user_entries',
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

function requireFirestore() {
  const db = getFirestore();
  if (!db) {
    const err = new Error('Firestore not configured');
    err.status = 500;
    throw err;
  }
  return db;
}

async function handleManifest(req, res) {
  const actor = await requireBearerUser(req);
  assertBackupAdmin(actor);

  const db = requireFirestore();
  const tables = [];
  for (const table of BACKUP_TABLES) {
    tables.push(await probeFirestoreTable(db, table));
  }

  const meta = getFirestoreBackupMeta();

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    ...meta,
    generatedAt: new Date().toISOString(),
    tables,
    clearOrder: CLEAR_ORDER,
    insertOrder: BACKUP_TABLES,
  });
}

async function handleExportTable(req, res) {
  const actor = await requireBearerUser(req);
  assertBackupAdmin(actor);

  const table = normalizeTableName(req.query?.table);
  const limit = parseLimit(req.query?.limit);
  const offset = parseOffset(req.query?.offset);

  const db = requireFirestore();
  const result = await exportFirestoreTablePage(db, table, limit, offset);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ...result });
}

async function handleClearTable(req, res) {
  const actor = await requireBearerUser(req);
  assertBackupAdmin(actor);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (String(body.confirm || '') !== 'CLEAR') {
    res.status(400).json({ ok: false, error: 'Send confirm: "CLEAR" to clear a table' });
    return;
  }

  const table = normalizeTableName(body.table);
  const db = requireFirestore();
  const result = await clearFirestoreTable(db, table);
  res.status(200).json({ ok: true, table, ...result });
}

async function handleImportTable(req, res) {
  const actor = await requireBearerUser(req);
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

  if (!rows.length) {
    res.status(200).json({ ok: true, table, inserted: 0, mode });
    return;
  }

  const db = requireFirestore();
  const { inserted, mode: appliedMode } = await importFirestoreRows(db, table, rows, mode);
  res.status(200).json({ ok: true, table, inserted, mode: appliedMode });
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
