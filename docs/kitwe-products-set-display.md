# Kitwe products — set display (KITWE_PRODUCTS_SET_DISPLAY_LOCKED)

## Behaviour (`/kitwe-products`)

- **Set rows:** one line per Kitwe set with **expand/inlay** to show components, Edit set, buildable qty.
- **Product rows:** individual Kitwe products only; **never** show components that belong to a Kitwe set recipe unless `metadata.kitwe_catalog_loose === true` (POS restock / explicit loose sale).

## What counts as a Kitwe set

An assembly is a **Kitwe catalog set** when:

1. `item_kind` is a warehouse **set**, and  
2. Either `metadata.kitwe_portal_set === true` (**Create set** on `/kitwe-products`), **or** there is at least one `warehouse_set_items` row for that set at **Kitwe** location.

Factory-only set recipes (Floor 1 only) do **not** appear on `/kitwe-products` unless created there.

## Source of truth

| Concern | Module |
|--------|--------|
| Set vs product rows | `src/utils/kitweSetStock.js` — `listKitweWarehouseSets`, `filterKitweCatalogProducts`, `isKitweCatalogSetAssembly` |
| Hide components | `buildKitweCatalogSetComponentIds` + `isKitweCatalogLooseAssembly` |
| UI expand/inlay | `src/KitweProductsPage.js` — `renderCatalogRow` |
| POS mirror | `src/utils/posKitweCatalog.js` |

## Regression

```bash
node scripts/verifyKitweProductsSetDisplay.js
node scripts/verifyKitweProductsSetLockMarkers.js
node scripts/verifyKitweSetComponentVisibility.js
```

## Repair / inspect

- Missing portal flag on an existing Kitwe recipe: `node scripts/repairKitwePortalSetFlags.js` (dry-run by default; `--apply` to update).
- Diagnose name/SKU (e.g. Teddy components): `node scripts/inspectKitweSetCatalog.js "Teddy"`

## Lock

Marker tag: `KITWE_PRODUCTS_SET_DISPLAY_LOCKED`. Do not change set/component visibility rules without explicit product owner request in chat.