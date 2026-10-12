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

- **Google sign-in (Expo Go):** browser OAuth — set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Firebase Web client). Email/password always works.
- **Google sign-in (installed APK):** **native** Google Sign-In (not `auth.expo.io`). You must register the **EAS release keystore SHA-1** in Firebase and commit/build with `google-services.json` (see below). Error code **10 / DEVELOPER_ERROR** means SHA-1 or `google-services.json` is missing for this APK.
- **Biometrics:** `expo-local-authentication` after Firebase login (skipped if not enrolled).

### Google Sign-In before an EAS APK

1. Copy **SHA-1** from [Expo credentials](https://expo.dev/accounts/alielboussi/projects/warehouse-catalog/credentials) → **Android** → **Keystore** → *SHA-1 Certificate Fingerprint* (use the **release** keystore used for `preview` / `production` builds).
2. From **repo root** (needs a Firebase Admin service account JSON in the project root, same as other setup scripts):

```bash
WAREHOUSE_CATALOG_ANDROID_SHA1=AA:BB:CC:... node scripts/setupWarehouseCatalogGoogleSignIn.mjs
```

This creates/updates the Firebase Android app `com.bestrest.warehousecatalog`, registers the fingerprint, and writes `mobile-apps/warehouse-catalog/google-services.json`.

3. Rebuild and install a new APK:

```bash
cd mobile-apps/warehouse-catalog
npm run eas:build:android
```

`npm run verify:apk` checks for `google-services.json` before EAS upload. **Email/password** works on builds that skip this step; **Continue with Google** does not until SHA-1 is registered and the app is rebuilt.

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

## App icon

Launcher assets live in `assets/icon.png` and `assets/adaptive-icon.png` (rounded tile, red border). Regenerate after changing art:

```bash
npm run icons
# or from repo root: node scripts/applyIconKitchenToWarehouseCatalog.js
```

**Expo Go** always shows the Expo logo on the home screen. Install a **development build** or release APK/AAB to see this app’s icon (`app.config.js` → `icon` / `android.adaptiveIcon`).

## EAS Build (Expo cloud)

Project: [@alielboussi/warehouse-catalog](https://expo.dev/accounts/alielboussi/projects/warehouse-catalog)

On Windows, replace the `shared` junction before upload (included in the npm script):

```bash
cd mobile-apps/warehouse-catalog
npm run eas:build:android
```

Profiles in `eas.json`: `preview` (internal APK), `production`, `production-play` (AAB).

After a local EAS build, restore the dev junction if needed: `node scripts/ensureSharedLink.js`
