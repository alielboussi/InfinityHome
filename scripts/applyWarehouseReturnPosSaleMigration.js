#!/usr/bin/env node
/**
 * Applies docs/sql/warehouse_return_orders_pos_sale.sql when a Postgres URL is configured.
 * Production Infinity Home stores warehouse_return_orders in Firestore — pos_sale_id /
 * pos_sale_item_id are written on create in server/lib/warehouseReturnOrders.js (no DDL required).
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), override: false });
} catch {
  /* optional */
}

const sqlPath = path.join(__dirname, '..', 'docs', 'sql', 'warehouse_return_orders_pos_sale.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const dbUrl = String(
  process.env.SUPABASE_DATABASE_URL
  || process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || '',
).trim();

async function runPostgres() {
  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('[pos_sale] pg module not installed — run: npm install pg --no-save');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: dbUrl, ssl: dbUrl.includes('supabase') ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    await client.query(sql);
    console.log('[pos_sale] Postgres migration applied successfully.');
  } finally {
    await client.end();
  }
}

(async () => {
  if (!dbUrl) {
    console.log('[pos_sale] No SUPABASE_DATABASE_URL / DATABASE_URL in env.');
    console.log('[pos_sale] Skipped SQL — warehouse_return_orders uses Firestore; pos_sale_id fields are set on insert in API code.');
    console.log('[pos_sale] To run against Postgres, set DATABASE_URL and re-run: node scripts/applyWarehouseReturnPosSaleMigration.js');
    process.exit(0);
  }
  await runPostgres();
})().catch((err) => {
  console.error('[pos_sale] Migration failed:', err?.message || err);
  process.exit(1);
});
