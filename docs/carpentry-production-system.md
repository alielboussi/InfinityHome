# Carpentry production system (spec + phases)

End-to-end flow: **web Carpentry catalog** → **workshop Expo app** + **Hassan quote routing** → **material deduction** from **Carpentry Warehouse 1–3** → **Warehouse Floor 2** + **Carpentry Production report**.

## Phase 1 (shipped in repo first)

- Web **Carpentry** page (`/carpentry`): pick warehouse **products only** (no sets); list shows **SKU + name**; BOM editor (material assembly, qty, UOM, preferred carpentry warehouse).
- Seed **Carpentry Warehouse 1/2/3** locations (`scripts/seedCarpentryWarehouseLocations.js`).
- **Warehouse Floor 2** (`/warehouse-floor-2`): finished units from carpentry runs (DB table when migrated).
- **Carpentry Production report** route (reads same run data).
- Admin API `carpentry-catalog` (save/list catalog + BOM in `warehouse_assemblies.metadata.carpentry` until SQL tables are applied).
- Expo skeleton `mobile-apps/carpentry-workshop/` (auth + list products; manufacture/deduct in Phase 2).

## Phase 2 — Workshop app (manufacture tap)

- Tap product → validate BOM → deduct materials from **1 → 2 → 3** by on-hand stock (`warehouse_assembly_inventory` / packet inventory at carpentry location IDs).
- Write `carpentry_production_runs` + `carpentry_production_material_usage`; increment finished product qty (factory or dedicated floor location — TBD with owner).
- Push token registration (reuse production Expo push pattern).

## Phase 3 — Hassan quotes → carpentry (shipped)

- **Forced** choice on quote create/update (before send): **Carpentry** | **Upholstery** (`quote_production_routing.route`).
- **Send to warehouse for production** on Quotationer (`adminAction=quote-production`, op `send-to-production`) sets `sent_to_production_at`. Push notifications → Phase 4.
- Mobile `warehouse-mobile`: `production-quotes-list`, `production-quote-accept`, `production-quote-complete`, `production-quote-material-scan` (route `carpentry` | `upholstery`).
- **Carpentry app**: Workshop + **Quotes** tab (accept, timer, material scan deduct).
- **Production app**: **Upholstery quotes** tile (same flow, factory stock on material scan).

## Phase 4 — Reports & polish

- **Carpentry Production report**: union quote-order runs + floor-only manufacture runs; export/PDF like Production Report.
- Notifications when Hassan sends to production (Expo push to carpentry/upholstery grant).

## Data model

### Locations

| Name | Purpose |
|------|---------|
| Carpentry Warehouse 1 | Material stock |
| Carpentry Warehouse 2 | Material stock |
| Carpentry Warehouse 3 | Material stock |

Resolve IDs via `src/constants/carpentryWarehouses.js` (by name) after seed.

### Catalog (Phase 1 — metadata)

On each finished **warehouse product** assembly:

```json
{
  "carpentry": {
    "selected": true,
    "materials": [
      {
        "material_assembly_id": "uuid",
        "quantity": 3,
        "uom": "sheet",
        "warehouse_location_id": "optional-prefer-1-2-or-3"
      }
    ]
  }
}
```

### SQL (Phase 2+) — `docs/sql/carpentry-production-schema.sql`

Tables: `carpentry_production_runs`, `carpentry_production_material_usage`, `quote_production_routing`.

## API

| adminAction | Method | Purpose |
|-------------|--------|---------|
| `carpentry-catalog` | POST | `{ op: 'list' \| 'save-product' \| 'save-materials' \| 'list-floor-runs' }` |

Mobile (Phase 2): extend `warehouse-mobile` ops or dedicated rewrite to same handler.

## UOM

Allowed UOM codes are defined on **Materials → Units of measure** (`warehouse_material_uoms`); extend the list there (no hardcoded enum).

## Access

Catalog admin (`canManageCatalog`) for web Carpentry + Floor 2. Workshop app uses existing mobile access grant pattern (new grant `carpentry_workshop` — Phase 2).

See **`docs/factory-warehouse-flow.md`** for Floor 2 → Floor 1 → Send Delivery.
