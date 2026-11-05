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

## Push notifications

Each app registers with `production-push-register` and `app_target`: `carpentry` | `painting` | `upholstery`.

Alerts use Android channel `production-alerts` (system tray when permission granted).
