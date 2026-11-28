# Android APKs — light weight and old-phone friendly

Employee phones are often **slow, low-RAM, 32-bit ARM**. Every Infinity Home Expo app shares the same release settings.

## What we enable

| Layer | Setting |
|-------|---------|
| **Native (EAS release)** | R8 minify + shrink resources, Hermes, **New Architecture off**, `minSdk` 24 (Android 7+) |
| **CPU ABIs** | Default APK: `armeabi-v7a` + `arm64-v8a`. Optional smaller build: **32-bit only** (see below) |
| **OTA** | Expo Updates **disabled** (no extra startup work) |
| **JS bundle** | Metro `inlineRequires` where `metro.config.js` uses `applyMetroLightweightBundle` |
| **Runtime** | `react-native-screens` enabled via `shared/lightweightRuntime.js` |
| **Navigation** | Short fade transitions in `shared/theme.js` |

Config helper: `mobile-apps/shared/expoAndroidLightweight.js` → `finalizeExpoConfig()` in each `app.config.js`.

## EAS upload size (monorepo tarball)

`eas build` uploads a **git archive**, not only the app folder. Without `.easignore`, the whole Infinity Home repo (~200MB+) is compressed and uploaded — slow and prone to `ECONNRESET` on poor links.

Each staff app uses the same template (only **that app folder** + `mobile-apps/shared/` in the EAS upload):

| App | Folder | Build |
|-----|--------|-------|
| Orders | `mobile-apps/orders` | `npm run eas:build:android` |
| Delivery | `mobile-apps/warehouse-delivery` | `npm run eas:build:android` |
| Carpentry | `mobile-apps/carpentry-workshop` | `npm run eas:build:android` |
| Upholstery | `mobile-apps/warehouse-upholstery` | `npm run eas:build:android` |
| Painting | `mobile-apps/painting-workshop` | `npm run eas:build:android` |

`eas:build:android` runs `ensureEasignoreFor.js` first. Regenerate all `.easignore` files after editing `mobile-apps/shared/renderEasignoreContent.js`:

```powershell
node mobile-apps/scripts/syncEasignore.js
```

When compression finishes, EAS should report a **much smaller** archive than ~231 MB. `ensureEasignoreFor.js` also writes **repo-root** `.easignore` (gitignored) because eas-cli ignores the copy inside the app folder. A ~230 MB upload is the whole monorepo and often dies with `ECONNRESET`.

## Build profiles (EAS)

| Profile | Use |
|---------|-----|
| `preview` / `production` | Normal APK for all current staff phones (32 + 64-bit ARM) |
| `preview-legacy` | **Smaller APK** — only `armeabi-v7a` for very old 32-bit devices |

```powershell
cd mobile-apps\warehouse-delivery
npm install
eas build --platform android --profile preview-legacy --non-interactive
```

After changing `expo-build-properties`, run a **new EAS build**; settings do not apply to already-installed APKs.

## Dependency

Each app `package.json` includes `expo-build-properties` (~0.14). Run `npm install` in the app folder before `eas build`.

## Verify

```powershell
node scripts/verifyMobileAndroidLightweight.js
```
