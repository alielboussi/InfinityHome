# Carpentry & Painting — Firebase Android + Google Sign-In

Firebase project: `bestrest-portal-system-43108`

| App | Package | Setup script |
|-----|---------|--------------|
| Carpentry Workshop | `online.infinityhome.carpentry` | `scripts/setupCarpentryWorkshopGoogleSignIn.mjs` |
| Painting Workshop | `online.infinityhome.painting` | `scripts/setupPaintingWorkshopGoogleSignIn.mjs` |

## One-time (already run in repo)

Android apps were created in Firebase and `google-services.json` was written under each app folder.

`app.config.js` uses:

- Carpentry `mobilesdk_app_id`: `1:876299148810:android:c709c380f8fdcf669049f3`
- Painting `mobilesdk_app_id`: `1:876299148810:android:f186bd9850ff84449049f3`

## SHA-1 (after first EAS build)

1. `eas credentials -p android` in each app directory.
2. Copy SHA-1 into the matching `eas-android-keystore-fingerprints.txt`.
3. From repo root (service account in env):

```powershell
$env:CARPENTRY_WORKSHOP_ANDROID_SHA1="AA:BB:..."
node scripts/setupCarpentryWorkshopGoogleSignIn.mjs

$env:PAINTING_WORKSHOP_ANDROID_SHA1="AA:BB:..."
node scripts/setupPaintingWorkshopGoogleSignIn.mjs
```

Same web client ID as other workshop apps (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).

## Google sign-in in Expo Go

The web portal uses Firebase popup auth; Expo Go uses browser OAuth + the **Web client** above. Each workshop app needs its **auth.expo.io** redirect on that Web client ([Google Cloud Credentials](https://console.cloud.google.com/apis/credentials?project=bestrest-portal-system-43108)):

| App | Redirect URI (add exactly, no trailing slash) |
|-----|-----------------------------------------------|
| Carpentry | `https://auth.expo.io/@alielboussi/infinity-carpentry-workshop` |
| Painting | `https://auth.expo.io/@alielboussi/infinity-painting-workshop` |

Also add **Authorized JavaScript origin** `https://auth.expo.io` on the Web client if the console shows that section.

`app.config.js` sets `extra.expoProjectFullName` so the app does not fall back to `infinity-carpentry://oauth` (Google returns **400 invalid_request** for that in Expo Go).

1. Save in Google Cloud, wait 1–2 minutes.
2. On the phone, open **Expo Go** signed in as **`alielboussi`** (same Expo account as the project owner).
3. Restart Metro: `npx expo start -c` in the app folder, then **Continue with Google**.

Release **APK** builds use native Google Sign-In (SHA-1 + package), not these redirect URIs.

## Push notifications

Each app registers with `production-push-register` and `app_target`: `carpentry` | `painting` | `upholstery`.

Alerts use Android channel `production-alerts` (system tray when permission granted).
