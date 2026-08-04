# Factory Sold Storage — Design Notes

_Last updated: 2025-11-19 (Firestore migration notes: 2026)_

## Goals
- Record every sold item that remains physically stored at the Factory Warehouse (UUID `39ffaa82-8aee-4a33-8de8-06584cbaffcf`).
- Keep these holdings out of the normal `inventory` / `product_locations` counts so primary stock remains accurate.
- Surface storage totals in the All Products toolbar, Product detail drawers, and the Android Stock apps.
- Support partial releases + historical auditing so staff can trace what left the warehouse, when, and by whom.
- Respect the special access rule: user `9ddb5d8a-04ab-409b-8535-b69fef65013a` must not see generic Factory stock but still needs visibility into storage holdings.

## Firestore collections

| Collection / query | Purpose |
| --- | --- |
| `factory_sold_storage_items` | One row per sale/product combination currently (or previously) held at the factory. |
| `factory_sold_storage_events` | Append-only audit log with `stored`, `released`, `adjustment`, `note` events. |
| Aggregated reads | Computed in `src/services/factoryStorage.js` (legacy Postgres views replaced). |

Key fields in `factory_sold_storage_items`:
- `sale_id` / `sale_item_id`: Back-reference to the originating sale lines for traceability.
- `product_id`: identifies the held product.
- `location_id`: FK to `locations` to allow future non-factory holds.
- `quantity` & `quantity_released`: support partial pickups; `status` derived in UI/service.
- `customer_name`, `customer_phone`, `release_reference`, `notes`, `metadata`: operator metadata.
- `created_by` / `updated_by` + legacy numeric IDs for cross-linking with `users` when needed.

## Current Implementation (Web)

- `src/services/factoryStorage.js` provides helpers to fetch summaries, list active storage rows, insert new holds, append notes, and release quantities while writing audit trail records.
- `ProductsListPage.js` renders a **Factory Holds** column and management modal.
- `FactoryStorageEntry.js` lists products with outstanding holds.
- All actions stamp `factory_sold_storage_events` for traceability while leaving `inventory` untouched.

## Data Flow Overview
1. **Create hold**: When a sale is invoiced but stays in Factory, insert into `factory_sold_storage_items` with a `stored` event.
2. **Partial/Full release**: Update `quantity_released`, `status`, and append a `released` event.
3. **Adjustments**: Store as `adjustment` events plus parent row updates.

## ACL Considerations
- Enforce access in `firestore.rules` and `accessControl.js` (e.g. `can_manage_storage`).
- The locked mobile user continues to be handled in React (`StockReportMobileLocked.js`).

## Next Steps
1. Keep `factoryStorage.js` as the single mutation/query layer.
2. Surface storage data in Expo mobile apps via Firestore reads.
3. Add smoke tests for storage CRUD once flows are stable.
4. Tighten Firestore security rules before production hardening.
