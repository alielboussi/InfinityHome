# Farm Warehouse 1

Same assembly list and Floor 2 WIP photos as **Floor 2 — WIP**; **farm on-hand** is stored on location **Farm Warehouse 1**.

## One-time setup

```bash
node scripts/ensureFarmWarehouseLocation.js
```

Deploy API changes, then confirm `locations` contains `Farm Warehouse 1`.

## User access (web `/user-access`)

| App | Screen | Purpose |
|-----|--------|---------|
| Warehouse Catalog | **Farm Warehouse 1** | View grid; optional **stock increase** per location flag |
| Delivery | **Send to Farm** | Floor 2 → Farm transfer with driver signature + FRM A4 |
| Delivery | **Send to Warehouse** | Farm → Floor 2; driver signature; **WhatsApp share only** (no A4) |

## Delivery notes

- Number sequence: **FRM0000000001** (`server/lib/warehouseFarmDeliveryNumber.js`)
- Print layout: same A4 delivery note HTML as Floor 1 send (`documentKind: farm_delivery`)
- Timestamps on print: Zambia (CAT, GMT+2) via existing `formatZambiaDate` / `formatZambiaTime`

## Send to Farm flow (Delivery app)

1. **Same Send Delivery UI** as Floor 1 (packet BOM checks, sets, cart) via `farm-delivery-catalog` (stock bound to **Floor 2**).
2. Submit uses **`farm-delivery-submit`** with `groups` — server runs the same logic as `delivery-submit`, deducting **Floor 2** packet/finished stock and crediting **Farm Warehouse 1**.
3. FRM delivery note + driver signature (no customer driver).

## Verification

```bash
node scripts/verifyFarmWarehouse.js
node scripts/syncMobileAccessManifest.js
node scripts/verifyMobileAccessManifest.js
```
