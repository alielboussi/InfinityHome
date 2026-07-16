# Factory Sold Storage — Design Notes

_Last updated: 2025-11-19_

## Goals
- Record every sold item that remains physically stored at the Factory Warehouse (UUID `39ffaa82-8aee-4a33-8de8-06584cbaffcf`).
- Keep these holdings out of the normal `inventory` / `product_locations` counts so primary stock remains accurate.
- Surface storage totals in the All Products toolbar, Product detail drawers, and the Android Stock apps.
- Support partial releases + historical auditing so staff can trace what left the warehouse, when, and by whom.
- Respect the special access rule: user `9ddb5d8a-04ab-409b-8535-b69fef65013a` must not see generic Factory stock but still needs visibility into storage holdings.

## Schema Additions (patch `012_factory_sold_storage.sql`)

| Object | Purpose |
| --- | --- |
| `factory_sold_storage_items` | One row per sale/product combination currently (or previously) held at the factory. Tracks total stored quantity, quantity released, customer/contact metadata, and lifecycle timestamps. |
| `factory_sold_storage_events` | Append-only audit log with `stored`, `released`, `adjustment`, `note` events for each holding row. |
| `v_factory_sold_storage_summary` | Aggregated rollup per product/location for dashboards and API feeds. |
| `v_factory_sold_storage_active` | Convenience view that returns only rows still in `stored`/`partial` status.

Key columns in `factory_sold_storage_items`:
- `sale_id` / `sale_item_id`: Back-reference to the originating sale lines for traceability.
- `product_id`: identifies the held product.
- `location_id`: enforced FK to `locations` to allow future non-factory holds (defaults handled in UI logic).
- `quantity` & `quantity_released`: support partial pickups; `status` derived in UI/service based on these counts.
- `customer_name`, `customer_phone`, `release_reference`, `notes`, `metadata`: free-form operators metadata.
- `created_by` / `updated_by` + legacy numeric IDs for cross-linking with the `users` table when needed.

Indexes are optimized for the queries we’ll issue (`product_id`, `sale_id`, `status`, `storage_id`). RLS is currently permissive (`authenticated` role) so the front-end can iterate quickly; once storage screens ship we can tighten the policies to dedicated roles.

## Current Implementation (Web)

- `src/services/factoryStorage.js` now provides typed helpers to fetch summaries, list active storage rows, insert new holds, append notes, and release quantities while writing audit trail records.
- `ProductsListPage.js` renders a **Factory Holds** column sourced from `v_factory_sold_storage_summary`, plus a management modal where operators can:
   - Capture new holds with expected release dates and customer contact fields (always pinned to the factory location constant).
   - Review active rows, see per-row metadata, and trigger partial or full releases with references/notes.
   - Keep the summary in sync via the realtime tick so counts update without a page refresh.
- `FactoryStorageEntry.js` exposes a lightweight landing page (linked from the Dashboard) that lists products with outstanding holds, offers search/filter tooling, and deep-links into the Products List manager for a selected SKU.
- All actions automatically stamp the Supabase `factory_sold_storage_events` table for traceability while leaving `inventory` untouched, preserving the “sold storage” separation.

## Data Flow Overview
1. **Create hold**: When a sale is invoiced but stays in Factory, insert a row into `factory_sold_storage_items` with the sold quantity. Also insert a `factory_sold_storage_events` row of type `stored`.
2. **Partial/Full release**: When items leave the factory, update `quantity_released`, `status` (`partial` vs `released`), set `released_at`/`release_reference`, and append a `released` event capturing the quantity.
3. **Adjustments**: Corrections (e.g., damaged) are stored as `adjustment` events plus a direct update to the parent row (which may move the row to `lost` or `cancelled`).

No triggers were added yet—the POS/portal layer will own the consistency rules so we can reuse existing transaction flows.

## API & UI Integration Plan

1. **Supabase client helper**: add a shared query that joins `factory_sold_storage_items` with `products`, `sales`, and `sales_items` for the Product list drawer. Include aggregated quantity from `v_factory_sold_storage_summary`.
2. **All Products page (`ProductsListPage.js`)**:
   - Fetch the summary view for the currently selected location.
   - Show a "Factory Holds" pill/column that opens a modal listing storage rows (table + actions to mark as released or print handover forms).
   - Provide a quick action near the Adjust modal to jump into the storage dialog for the chosen SKU.
3. **Mobile Stock apps**:
   - Extend their data bootstrap call to pull `v_factory_sold_storage_summary` and attach per-product `storage_on_hold` counts.
   - For the locked user (`9ddb5d8a-04ab-409b-8535-b69fef65013a`), mask Factory location inventory but still show the storage chip sourced from the summary view.
4. **Backend API (Node functions under `api/`)**:
   - Add a lightweight endpoint `/api/storage` (or extend an existing diagnostics route) that proxies filtered Supabase queries with service-level auth for batch downloads / PDF exports.

## ACL Considerations
- RLS currently allows every authenticated session to read/write; once the UI is wired, add stricter policies (e.g., only roles with `can_manage_storage` flag in `users` table) and downgrade others to read-only.
- The locked mobile user continues to be handled in React (see `StockReportMobileLocked.js`). We’ll simply feed storage counts separately so we don’t have to re-open access to the Factory inventory table.

## Next Steps
1. Build repository helpers (`src/services/factoryStorage.js`) to encapsulate Supabase queries + mutations, including optimistic UI updates.
2. Update All Products toolbar & detail panels to display hold counts and expose a modal for storage CRUD.
3. Surface storage data inside Android apps (React Native WebViews) via existing JSON payload or a new REST endpoint.
4. Add regression tests / smoke scripts once CRUD flows are in place (`scripts/laybyBenchBatch.js` can host a quick probe for storage rows).
5. Tighten RLS policies before production deployment.
