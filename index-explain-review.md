# Index & EXPLAIN Review

This document captures performance diagnostics for key Layby / Sales financial paths.

## Scope
Queries investigated (via prepareExplain.js & runExplains.js):
1. Layby lookup by id
2. Sales by layby_id
3. Payments by sale_id set
4. Items by sale_id set
5. (Planned) RPC canonical financial aggregation components

## Current Status
Plans not yet captured in repo (runExplains outputs placeholders until secure RPC is deployed).

## Proposed Composite Indexes
Rationale: optimize selective filters + join predicates + ordering (date recency).

```sql
-- Laybys by id already PK; add covering index for (customer_id, status) if dashboard filters.
CREATE INDEX IF NOT EXISTS idx_laybys_customer_status ON laybys(customer_id,status);
-- Sales filtered by layby_id and sale_date range (reports):
CREATE INDEX IF NOT EXISTS idx_sales_layby_date ON sales(layby_id, sale_date DESC);
-- Payments by sale_id and payment_date for chronological statements:
CREATE INDEX IF NOT EXISTS idx_sales_payments_sale_date ON sales_payments(sale_id, payment_date DESC);
-- Items by sale_id for item loads:
CREATE INDEX IF NOT EXISTS idx_sales_items_sale ON sales_items(sale_id);
-- Inventory lookups by (product_id, location):
CREATE INDEX IF NOT EXISTS idx_inventory_product_location ON inventory(product_id, location);
-- Transfer entries by session for retrieval and rollups:
CREATE INDEX IF NOT EXISTS idx_stock_transfer_entries_session ON stock_transfer_entries(session_id);
```

## Future / Conditional Indexes
```sql
-- Only if queries filter by (customer_id, status, last_payment_at desc)
CREATE INDEX IF NOT EXISTS idx_sales_customer_status_date ON sales(customer_id, status, sale_date DESC);
```

## Pending Actions
- [ ] Capture actual EXPLAIN plans (with BUFFERS) and paste below.
- [ ] Evaluate seq scan vs index scan usage; adjust indexes.
- [ ] Consider partial indexes for status='active' laybys if high proportion closed.
- [x] Added composite indexes migration script `scripts/sql/20251008_add_composite_indexes.sql`.
- [x] Gated legacy layby fallback behind `REACT_APP_ENABLE_LEGACY_LAYBY_FALLBACK` env.
- [x] Centralized inventory delta writer `src/services/inventoryAdjuster.js` (next: refactor existing scattered code to use it).
- [x] Payment inserts now route through `insertSalesPayments` ensuring `allocation_batch_uuid`.
- [ ] Replace remaining manual inventory adjustments with service & add RPC for atomic update.
- [ ] Implement secure RPC to execute EXPLAIN server-side (execute_explain) for automated plan capture.

## Captured Plans
(Insert JSON or text plans here)

## Notes
Ensure analyze after creating indexes: `VACUUM (ANALYZE)` or rely on autovacuum.
Legacy layby multi-query path scheduled for removal after 2025-10-22 if stable.
Payment batch UUID future strict phase: set requireProvided=true to enforce explicit batch context from callers.
