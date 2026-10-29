# Firebase — register Production Android app

Production Expo app package: **`com.bestrest.warehouseproduction`**  
Firebase project (same as portal / warehouse catalog): **`bestrest-portal-system-43108`**

## 1. Firebase Android app (registered)

| Field | Value |
|-------|--------|
| **App display name** | Warehouse Production |
| **Package** | `com.bestrest.warehouseproduction` |
| **Firebase App ID** | `1:876299148810:android:9cb085a252a1f4939049f3` |

`google-services.json` lives in `mobile-apps/warehouse-production/` (download again from Firebase if you recreate the app).

## 2. Download `google-services.json`

1. On the same wizard step (or app settings → **google-services.json**), download the file.
2. Save it as:

   `mobile-apps/warehouse-production/google-services.json`

3. Do **not** commit secrets you do not want in git; this file is standard for Android builds (same as warehouse-catalog).

## 3. Firebase Auth + Google Sign-In

1. [Firebase Console](https://console.firebase.google.com/) → **bestrest-portal-system-43108** → **Build** → **Authentication** → **Sign-in method**.
2. **Google** → **Enable** → set support email → **Save** (required for `signInWithCredential` from the app).
3. **Project settings** → **Your apps** → **Warehouse Production** (`com.bestrest.warehouseproduction`):
   - **SHA-1** must include the **EAS preview/production keystore** fingerprint (native Google Sign-In on installed APK). Error code **10 / DEVELOPER_ERROR** means this SHA-1 is missing.
   - **EAS (Oct 2026 preview APK):** `96:89:20:EC:D4:0E:43:D3:FB:AD:F1:45:B1:D2:BD:82:42:BC:49:B1` — register via:
     ```bash
     WAREHOUSE_PRODUCTION_ANDROID_SHA1=96:89:20:EC:... node scripts/setupWarehouseProductionGoogleSignIn.mjs
     ```
     Or Expo → [warehouse-production credentials](https://expo.dev/accounts/alielboussi/projects/warehouse-production/credentials) → Android → Keystore → SHA-1, then Firebase Console → add fingerprint manually.
   - Older doc hash `81e9f600…` was a previous/local keystore; keep both SHA-1 entries if you still ship builds signed with that key.
   - After Google is enabled, re-download `google-services.json` if an **Android OAuth client** (type 1) is still missing.
4. [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=bestrest-portal-system-43108) → **OAuth 2.0 Client IDs** → open the **Web client** (same ID as `googleWebClientId` / `876299148810-s0rcl…` — **not** the Android client):
   - **Authorized redirect URIs** → **+ ADD URI** → paste exactly (no trailing slash):
     - `https://auth.expo.io/@alielboussi/warehouse-production`
   - Under **Authorized JavaScript origins**, add: `https://auth.expo.io` (if that section exists on the Web client).
   - Save. Wait 1–2 minutes, then retry Google sign-in in **Expo Go**.
   - In the **Expo Go** app on your phone, sign in with the same Expo account as the project owner (`alielboussi`).
   - If you see **“Something went wrong trying to finish signing in”** on `auth.expo.io`, Google accepted the login but Expo’s proxy could not return to the app (common on Android). Use a **preview APK** (native Google Sign-In, no proxy) — see **§5 Build APK**.
   - **Expo Go does not require an APK** for Google sign-in; `redirect_uri_mismatch` means this Web client is missing the URI above (or you edited the wrong OAuth client).
   - For the **installed APK** (EAS build), native Google Sign-In uses SHA-1 + package name; you can also add `warehouse-production://oauth` on the Web client if you ever use browser OAuth in that build.
5. Staff sign in on **Upholstery Production** with Google; on **User Login Access**, refresh, enable login, then **Upholstery Production** access.

**App OAuth IDs (in `app.config.js` / Expo extra):**

| Key | Value |
|-----|--------|
| Web client (Expo Go + Firebase) | `876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com` |
| Android client | From `google-services.json` when present; otherwise same web client for Expo Go |

## 4. Expo / `app.config.js`

The production app already uses the same Firebase **web** config keys as the catalog (`EXPO_PUBLIC_FIREBASE_*`). After registering the Android app:

- Firebase may show a new **mobile app id** (`1:876299148810:android:…`). You only need to set `EXPO_PUBLIC_FIREBASE_APP_ID` if you switch to that id for analytics; **Auth with email/password works** with the shared project keys once `google-services.json` is present for native builds.

Optional in `mobile-apps/warehouse-production/.env` (or EAS secrets):

```env
EXPO_PUBLIC_API_BASE=https://www.infinity-home.online
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=bestrest-portal-system-43108.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=bestrest-portal-system-43108
```

## 5. Build APK (local pattern)

From `mobile-apps/warehouse-production`:

```powershell
npm install
# ensure google-services.json is in this folder
npx expo prebuild --platform android --clean
cd android
.\gradlew assembleRelease
```

Or mirror `mobile-apps/warehouse-catalog/build-apk-local.ps1` with package `com.bestrest.warehouseproduction`.

## 6. Smoke test

1. Install APK on a phone.
2. Sign in with a user created on **User Login Access** (email + password).
3. Confirm dashboard → **Create new** / **Production stock**.
4. Toggle **العربية / EN** — labels and AI-translated fields should match the web kiosk.
5. After Zebra Weblink is configured (next step), create an item and confirm the printer receives ZPL.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| `CONFIGURATION_NOT_FOUND` on sign-in | Wrong Firebase project or Auth not enabled; check `app.config.js` and Console. |
| Access denied after login | Enable **Production app access** for that user on `/user-access`. |
| Build: missing `google-services.json` | Complete step 2; file must sit next to `app.config.js`. |
| `auth.expo.io` “Something went wrong…” after Google | Redirect URI is OK; Expo Go proxy failed. In **dev** (Expo Go), use **email + password** on the login screen (same Firebase account as the portal). Release APK uses Google only. Or install a **preview APK** for native Google. |
| **Continue with Google** → “not configured for this APK” / error **10** | Register **EAS release SHA-1** for `com.bestrest.warehouseproduction` (see §3). Wait 2–5 minutes; **same installed APK** usually works without reinstall. |
