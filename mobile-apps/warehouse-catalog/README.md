# Warehouse Catalog (Expo Go draft)

Staff app for **warehouse products / packets**, barcode capture, and **Kitwe packet deliveries** (Hassan checklist). Permissions are managed in the web portal under **User Login Access**.

## Run in Expo Go

On Windows, `npm install` creates a **`shared`** junction to `../shared` so Metro can resolve `react` and other deps. If bundling fails with “Unable to resolve react from shared”, run:

```bash
node scripts/ensureSharedLink.js
```

```bash
cd mobile-apps/warehouse-catalog
cp .env.example .env
# Same EXPO_PUBLIC_FIREBASE_* as other Infinity Home apps
npm install
npm start
```

- **Google sign-in:** use shared `GoogleSignInButton` via `AuthGate` (configure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).
- **Biometrics:** `expo-local-authentication` after Firebase login (skipped if not enrolled).

## Implementation phases

| Phase | Scope |
|-------|--------|
| **0 (now)** | Auth, biometrics, dashboard shell, `/user-access` mobile matrix, `auth-profile` returns `mobile_access` |
| **1** | Barcode scan → resolve SKU → create packet/product forms (parity with web) + duplicate SKU checks via existing catalog services |
| **1b** | **Label SKU (OCR):** align printed unit code in the **yellow box**, capture (crop + OCR that region only) → product info. Requires a **native rebuild** (`@react-native-ml-kit/text-recognition`); manual type works without OCR. |
| **2** | Kitwe scan session: packets only, group by `warehouse_assemblies`, submit `warehouse_delivery_sessions` |
| **3** | Hassan portal: line-level tick → partial Kitwe inventory (reuse `update_warehouse_delivery_items` RPC) |
| **4** | Retire bridge when `/products-list` is gone; transfers credit warehouse showrooms only |

Register every new screen in `src/mobile/mobileAccessManifest.js` (and `App.js` routes) — CI verifies via `scripts/verifyMobileAccessManifest.js`.

**Expo SDK:** 57 (matches current Expo Go from Play Store).
