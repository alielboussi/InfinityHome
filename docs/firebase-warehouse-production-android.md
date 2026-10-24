# Firebase — register Production Android app

Production Expo app package: **`com.bestrest.warehouseproduction`**  
Firebase project (same as portal / warehouse catalog): **`bestrest-portal-system-43108`**

## 1. Add the Android app in Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com/) → project **bestrest-portal-system-43108**.
2. **Project settings** (gear) → **Your apps** → **Add app** → **Android**.
3. **Android package name:** `com.bestrest.warehouseproduction` (must match `app.config.js`).
4. **App nickname (optional):** `Production` or `Warehouse Production`.
5. **Debug signing certificate SHA-1** (optional for now): add later if you use Google Sign-In on this app. Email/password login does **not** require SHA-1.
6. Click **Register app**.

## 2. Download `google-services.json`

1. On the same wizard step (or app settings → **google-services.json**), download the file.
2. Save it as:

   `mobile-apps/warehouse-production/google-services.json`

3. Do **not** commit secrets you do not want in git; this file is standard for Android builds (same as warehouse-catalog).

## 3. Confirm Firebase Auth

1. **Build** → **Authentication** → **Sign-in method**.
2. **Email/Password** must be **Enabled** (same users as `/user-access` create-user).
3. Each production user needs **Login enabled** + **Production app access** on the web.

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
