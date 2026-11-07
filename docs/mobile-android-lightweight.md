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
