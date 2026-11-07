# Portal & mobile improvements rollout

Status after your selection (A1–E7, Firestore tokens). **Stock qty logic and location inventory APIs are unchanged** unless noted.

## Done in repo

### Mobile speed (A1–A4, A7, A9 partial)
- **A1** — `RunningJobElapsed` / `RunningRepairElapsed` in `mobile-apps/shared/` (copied into apps); **Upholstery Jobs** no longer re-renders the whole list every second.
- **A2** — **Upholstery Repairs**: removed duplicate `useEffect` + `useFocusEffect` load.
- **A3** — **Upholstery Jobs**: focus refresh without full-screen spinner when cached rows exist; foreground **push → `productionRefreshBus`**.
- **A4** — **90s TTL** client cache on `fetchProductionFloor2Products` (upholstery `productionApi.js`).
- **A7** — `emitProductionRefresh` on foreground notification (upholstery push hook).
- **A9** — Documented dead routes; carpentry **Finishing** tile still TODO.

### Functional (B1, B2, B10 partial — upholstery)
- **B1** — Job filters on Upholstery Jobs (All / Hassan quotes / Floor 2 / In progress).
- **B2** — Finish job warns when no `manual_material_lines`.
- **B10** — Job card thumbnail when image URL is on job payload (`floor2_push` flag on API jobs for Floor 2 filter).

### Web nav & speed (C1–C2, C4, C6, D1–D3, D6, D7, E1 partial)
- **C1** — Drawer regrouped into 5 hubs (`AppChrome.js`); **routes unchanged**.
- **C2** — Floor 1 views use `?view=` on `/warehouse-products`; legacy paths **redirect** (no stock change).
- **C4** — Renamed drawer labels (e.g. Customer factory quotes).
- **C6** — `WarehousePageContextBar` on Floor 1 catalog.
- **D1** — Coarse `Suspense` key via `routeSuspenseKey.js` (warehouse tabs stay mounted).
- **D2** — Extra preload entries for Floor 1 view paths in `lazyPages.js`.
- **D3** — Floor 1 catalog already background-refreshes when cached; context bar shows sync state.
- **D6** — Stocktake event polling skips hidden tabs.
- **D7** — `design-tokens.css` + warehouse context styles; fonts keep `display=swap` on Google import.
- **E1** — Brand CSS variables in `src/design-tokens.css`; `enterprise-theme` on body.

### Firestore push tokens
- Stale tokens **skipped** when sending (90-day `updated_at`).
- `cleanupStaleProductionPushTokens` + `node scripts/cleanupProductionPushTokens.js`.

## Phase 2 (this pass)

- **A1–A3** — Carpentry + Painting Jobs: `RunningJobElapsed`, stale focus, push refresh bus; all Repairs: `RunningRepairElapsed`, list tick removed.
- **A5** — Shared modules under `mobile-apps/shared/` (`RunningJobElapsed`, `productionRefreshBus`, `warehouseMobileApi` offline queue via `offlineScanQueue.js`); synced into each app `shared/`.
- **A6** — Carpentry `materializeCarpentryStandalone.js` vendors only a **whitelist** of `_repoUtils` files (not full `src/utils`).
- **A9** — Carpentry **Finishing** + **Scan Floor 2** dashboard tiles; legacy `StockScreen.js` marked deprecated.
- **B3** — Scan Floor 2 tile → `Manufacture` with `openScan` (upholstery + carpentry).
- **B4** — Offline queue + retry flush in `mobile-apps/shared/warehouseMobileApi.js`.
- **B7** — `WarehouseSkuWhereabouts` on Quotes board for Hassan.
- **B9** — Push `push_prefs` on token register + `event_type` on sends; filter stale tokens on send.
- **C3** — Warehouse staff (no catalog manage, not Hassan) see **Overview + Warehouse + Inventory** hubs only.
- **D8** — `@tanstack/react-query` + `QueryProvider`; `useWarehouseCatalogQuery` used on Floor 1 (`WarehouseProductsPage`) and Kitwe catalog.
- **D4** — Products list virtual tbody (`ProductsListVirtualTbody`, `react-window` v2 dynamic heights) when ≥48 rows; row UI in `ProductsListTableRow`.
- **D5** — Factory storage / image edit / adjust modals lazy-loaded via `ProductsListHeavyModals.js`.
- **Push prefs** — **Alert settings** on upholstery, carpentry, and painting dashboards; `push_prefs` sent on save + on token register.
- **Delivery Sold** — Stack wired: `SoldOrders` → `SoldOrderDetail` → `SoldDeliverSignature` → `SoldDeliverDone`; User Access screen `delivery_sold_orders`; delivery drivers allowed for storage APIs.
- **E2–E7** — Enterprise banner/drawer flatten, SKU panel styles, dashboard shadow reduction, font tokens.

## Remaining polish

| ID | Work |
|----|------|
| **A1** | Mirror timer fix on **Carpentry / Painting Jobs** + repair cards (`RunningRepairElapsed`). |
| **A2** | Remove double load on **carpentry / painting** Repairs. |
| **A3** | Stale focus on **Manufacture** + carpentry/painting Jobs. |
| **A4** | `fetchProductionFloor2Products` cache on **carpentry**; FlatList tuning on Manufacture screens. |
| **A5** | Centralize repairs/jobs in `mobile-apps/shared/` + materialize script. |
| **A6** | Trim carpentry `materializeCarpentryStandalone.js` vendored `_repoUtils` list. |
| **A7** | Push bus on **carpentry / painting** hooks. |
| **A9** | Carpentry **Finishing** dashboard tile; remove or wire **StockScreen** / delivery Sold routes. |
| **B3** | Scan-first dashboard shortcut (all workshop apps). |
| **B4** | Offline queue in `warehouseMobileApi.js` (retry `production-job-materials-save`, etc.). |
| **B7** | Hassan **SKU whereabouts** panel on `QuotesBoard` (read-only API). |
| **B9** | Per-user push prefs in Firestore + filter in `sendProductionOperatorPush`. |
| **B1** | Job filters on **carpentry** Jobs. |
| **C3** | Default drawer filter by role (extend `accessControl` + `AppChrome`). |
| **D4** | Virtualize `ProductsListPage` table rows (`react-window` or `content-visibility`). |
| **D5** | `React.lazy` heavy modals in `ProductsListPage.js`. |
| **D8** | Optional `@tanstack/react-query` provider (requires `npm install`). |
| **E2–E7** | Apply tokens to table/button classes across `global-theme.css` (incremental). |

## Verify locally

```bash
# Push token cleanup (server env / Firestore admin)
node scripts/cleanupProductionPushTokens.js

# Web
npm start
# Switch Floor 1 tabs (?view=sets) — should not flash full page reload.

# Mobile (per app)
# Jobs timer still ticks on running cards; list should not flicker.
```

## Firestore index

Push token collection: single-doc reads by `app_target` in memory after full collection scan. For large token counts, add a composite index only if you split queries by `app_target` field later.
