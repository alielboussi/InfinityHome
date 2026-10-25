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
   - **SHA-1** should be listed (same hash as Factory APK if you use one keystore). Registered via CLI: `81e9f6007dc21168055e451f176fbff8943bdbd4`.
   - After Google is enabled, re-download `google-services.json` if an **Android OAuth client** (type 1) is still missing.
4. [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=bestrest-portal-system-43108) → **OAuth 2.0 Client IDs** → **Web client** (`876299148810-s0rcl…`):
   - **Authorized redirect URIs** (Expo Go): add both if Google returns `redirect_uri_mismatch`:
     - `https://auth.expo.io/@alielboussi/warehouse-production`
     - `warehouse-production://oauth`
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
