# Warehouse Delivery (driver app, Expo SDK 58)

Android app for **factory truck delivery** only: Code 128 scan, packet checklists, driver picker, signature, and submit — same flow as the former Production app Kitwe send screens.

## Catalog & stock

Send Delivery lists only products on the **factory warehouse catalog** (same rules as web **`/warehouse-products`**: complete products, warehouse sets, set components with leftover stock — not incomplete BOM-only rows or off-catalog items).

## Setup

```bash
cd mobile-apps/warehouse-delivery
npm install
npx expo start -c
```

`npm install` / `prestart` **materialize** real `deliveryKit/` and `shared/` copies (no junctions to production or `mobile-apps/shared`). See **`docs/mobile-apps-independence.md`**.

To refresh Kitwe code from production after a deliberate portal sync:

```bash
npm run materialize
```

**Always start Metro from this folder** (`warehouse-delivery`), not `warehouse-upholstery`. Kitwe Send “delivery number only” UI uses **`config/deliveryAppUi.js`** (Metro alias `delivery-app-ui-config`).

`npm run verify` checks peers and standalone layout. Metro pins deliveryKit peers to **this app’s** `node_modules`. After dependency changes: `npm install` and **`npx expo start -c`**.

Optional:

```env
EXPO_PUBLIC_API_BASE=https://www.infinity-home.online
```

## Access

Enable **User Access → Delivery → Warehouse Delivery (Android)** (`warehouse_delivery_app`) for the driver Google account.

## Android package & Firebase

| Item | Value |
|------|--------|
| Android package | `com.bestrest.warehousedelivery` |
| Firebase project | `bestrest-portal-system-43108` |
| Console display name | **Warehouse Delivery** |

Register a **new** Android app in Firebase (separate from **Warehouse Production**).

**Manual:** Firebase → Add app → Android → package `com.bestrest.warehousedelivery` → download `google-services.json` into `mobile-apps/warehouse-delivery/`.

**Script:** `WAREHOUSE_DELIVERY_ANDROID_SHA1=... node scripts/setupWarehouseDeliveryGoogleSignIn.mjs` (repo root, Firebase service account).

Expo Go uses the web OAuth client; the dedicated Firebase app is required for release APK Google Sign-In.

Regression (server): `node scripts/verifyWarehouseDeliveryFlow.js`

See `docs/carpentry-production-system.md` and `docs/local-development.md`.
