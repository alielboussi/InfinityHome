# Factory warehouse flow (Floor 2 → Floor 1 → delivery)

## Locations (portal **Warehouses** sidebar)

| Floor | Web route | Purpose |
|-------|-----------|---------|
| **Storeroom 1–3** | `/carpentry-warehouse/1–3` | **Create** materials (name, SKU, qty + UOM); BOM stock for carpentry/upholstery |
| **Warehouse Floor 2** | `/warehouse-floor-2` | Carpentry **output** WIP (after manufacture; before upholstery or painting) |
| **Warehouse Floor 1** | `/warehouse-products` | Finished factory stock **ready for Send Delivery** (Kitwe truck) |

Run once (per environment):

```text
node scripts/seedCarpentryWarehouseLocations.js
node scripts/seedWarehouseFloor2Location.js
```

## Production sequence

1. **Storeroom pages** — create materials in Storerooms 1–3 (random or manual 16-char SKU, qty, `metadata.storeroom.default_uom`).
2. **Web Carpentry** (`/carpentry`) — pick products from **Warehouse Floor 1** (`/warehouse-products` catalog scope); define BOM using **storeroom stock only**. Workshop apps can also create new products (AI names + presets); those land on Floor 1 and are auto-added here.
3. **Carpentry workshop app — Manufacture** — products on **`/carpentry`**; BOM → Storerooms 1–3; **unfinished WIP → Warehouse Floor 2**.
4. **Carpentry workshop app — Finishing** — pick **unfinished** stock on Floor 2; tap finish → **same SKU credits Warehouse Floor 1** (`/warehouse-products`) for storage and Send Delivery.
5. **Web Upholstery** (`/upholstery`) — Floor 1 product scope; link finished SKU to raw on Floor 2 when upholstery follows carpentry WIP; storeroom BOM per row.
6. **Production app — Upholstery manufacture** — deduct **raw from Floor 2** + storeroom BOM → credit **finished SKU at Floor 1** (when upholstery applies).
7. **Warehouse Delivery app — Send Delivery** — **Floor 1** catalog only.

## Send Delivery catalog (mobile)

- **Allowed:** Warehouse Floor 1 rules (complete products, sets, set-component leftover, packet-BOM products) — aligned with web `/warehouse-products` and packets list.
- **Not allowed:** Kitwe branch catalog, POS, storerooms, or Floor 2 WIP (until moved to Floor 1).

## Related docs

- `docs/carpentry-production-system.md` — carpentry catalog, runs, quotes
- `docs/stocktake-pdf-pipeline.md` — stocktake (separate; locked)
