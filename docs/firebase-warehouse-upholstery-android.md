# Firebase — Upholstery Android app

Expo app package: **`com.bestrest.warehouseupholstery`**  
Firebase project: **`bestrest-portal-system-43108`**  
EAS slug: **`warehouse-upholstery`**  
EAS project ID: **`5ef60993-5974-4cc7-8d5a-283fbbf14d4b`**

## Automated setup (recommended)

From repo root (Firebase **service account** in env or `*firebase-adminsdk*.json` in project root):

```powershell
# 1) Create Firebase Android app + google-services.json (no SHA yet)
node scripts/setupWarehouseUpholsteryGoogleSignIn.mjs --create-app-only

# 2) After EAS keystore exists (first build or eas credentials → Keystore), register SHA-1:
$env:WAREHOUSE_UPHOLSTERY_ANDROID_SHA1="AA:BB:..."
node scripts/setupWarehouseUpholsteryGoogleSignIn.mjs
```

This creates/registers the app, adds the SHA-1 fingerprint, and writes  
`mobile-apps/warehouse-upholstery/google-services.json`.

## Manual (Firebase Console)

1. **Project settings** → **Add app** → Android → package **`com.bestrest.warehouseupholstery`**, display name **Upholstery**.
2. **Add fingerprint** → paste EAS keystore **SHA-1** (Expo → **warehouse-upholstery** → **Credentials** → Android → Keystore).
3. Download **`google-services.json`** into `mobile-apps/warehouse-upholstery/`.
4. **Authentication** → **Google** → **Enable**.

## EAS build

```powershell
cd mobile-apps\warehouse-upholstery
npm install
npx eas-cli build -p android --profile preview
```

Store public fingerprints in `mobile-apps/warehouse-upholstery/eas-android-keystore-fingerprints.txt` (optional reference).

Use the **Upholstery EAS project** keystore SHA-1 only (`eas credentials -p android` in this folder). Do **not** copy fingerprints from the legacy **`com.bestrest.warehouseproduction`** Firebase app — package and signing setup are separate.

## Portal access

**User Login Access** → **Upholstery** → enable **Upholstery (Android)** for each Google account.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Google Sign-In error **10** | SHA-1 for the keystore that signed **this** APK is missing in Firebase for `com.bestrest.warehouseupholstery`. |
| Wrong OAuth client | Re-run setup script after SHA-1 so `google-services.json` includes Android OAuth (type 1). |
| Expo Go | Uses web client; release APK needs SHA-1 on the Upholstery Firebase app. |

Legacy **`com.bestrest.warehouseproduction`** is a separate Firebase app; do not reuse its `google-services.json` for Upholstery builds.
