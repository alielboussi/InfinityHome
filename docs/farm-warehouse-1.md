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
| Delivery | **Farm deliveries** (`delivery_farm`) | One page: **From** Farm Warehouse 1 only → **To** Floor 2 WIP (auto credit + Zebra labels) or Kitwe `/kitwe-products` (Hassan accept, Farm badge, no labels). Driver + signature. WhatsApp PDF required before leaving. |

## Delivery notes

- Number sequence: **FRM0000000001** (`server/lib/warehouseFarmDeliveryNumber.js`)
- Print layout: same A4 delivery note HTML as Floor 1 send (`documentKind: farm_delivery`)
- Timestamps on print: Zambia (CAT, GMT+2) via existing `formatZambiaDate` / `formatZambiaTime`

## Farm deliveries (Delivery app)

One dashboard tile → `WarehouseFromFarmHome`. Source is always Farm Warehouse 1. Destination is **Floor 2 WIP** or **Kitwe**.

1. Catalog is farm on-hand (`farm-return-catalog`). Cart deducts Farm stock on submit (`farm-return-submit`).
2. **Floor 2:** session completes immediately; Floor 2 WIP qty is credited (existing SKU or new assembly line); Zebra prints name, SKU, Code 128, product-image QR, send date.
3. **Kitwe:** session stays submitted until Hassan Awad accepts on Warehouse Deliveries (Farm badge). Accept credits Kitwe and mirrors `/kitwe-products` (`findOrCreateKitweProduct`). No Zebra print.
4. Fleet driver + signature required. Done screen forces system share of the A4 PDF (WhatsApp) before returning to the dashboard.

Floor 2 → Farm (old Send to Farm) is not on this tile.

## Verification

```bash
node scripts/verifyFarmWarehouse.js
node scripts/syncMobileAccessManifest.js
node scripts/verifyMobileAccessManifest.js
```
