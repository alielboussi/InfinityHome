-- Optional Postgres / Supabase mirror only.
-- Infinity Home production uses Firestore collection `warehouse_return_orders`;
-- pos_sale_id / pos_sale_item_id are written on create in server code (no DDL required there).
-- Run: node scripts/applyWarehouseReturnPosSaleMigration.js (when DATABASE_URL is set)
-- Or paste into Supabase SQL editor for a Postgres copy of this table.

ALTER TABLE warehouse_return_orders
  ADD COLUMN IF NOT EXISTS pos_sale_id uuid NULL;

ALTER TABLE warehouse_return_orders
  ADD COLUMN IF NOT EXISTS pos_sale_item_id uuid NULL;

CREATE INDEX IF NOT EXISTS warehouse_return_orders_pos_sale_id_idx
  ON warehouse_return_orders (pos_sale_id)
  WHERE pos_sale_id IS NOT NULL;

COMMENT ON COLUMN warehouse_return_orders.pos_sale_id IS 'Kitwe POS sale id when return created from receipt lines';
COMMENT ON COLUMN warehouse_return_orders.pos_sale_item_id IS 'sales_items.id for the receipt line (one unit job per row)';
