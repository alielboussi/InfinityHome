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

`npm install` / `prestart` junction `shared/` → `mobile-apps/shared`, overlay production helpers, and link `deliveryKit/` → `warehouse-production`. **`deliveryKit` peer dependencies** must match `warehouse-production` (see `scripts/deliveryKitPeerDependencies.js`). After dependency changes run `npm install` and `npm run verify`.

Metro pins all deliveryKit peers to **this app’s** `node_modules` (the `deliveryKit` junction would otherwise load `warehouse-production/node_modules` and crash Expo Go with **`RNCSafeAreaProvider` registered twice**). If you still see that error, stop Metro and run **`npx expo start -c`** again so the old bundle is dropped.

Optional:

```env
EXPO_PUBLIC_API_BASE=https://www.infinity-home.online
```

## Access

Enable **User Access → Production → Send to Kitwe / truck delivery** (`kitwe_send_delivery` or `warehouse_production_kitwe`) for the driver Google account.

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
