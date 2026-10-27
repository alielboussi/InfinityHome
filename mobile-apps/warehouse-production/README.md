# Production (Expo Android)

Warehouse production on phones: **create packets**, **add stock**, labels via **Zebra Weblink** (no print PC).

## App icon

Launcher icons are generated from repo-root **`ICON_PRODUCTION.png`** (rounded corners, safe inset for Android adaptive icon):

```bash
npm run icons
```

Writes `assets/icon.png` and `assets/adaptive-icon.png`.

## Setup

1. `npm install` (links `shared` from `mobile-apps/shared` via postinstall).
2. `google-services.json` is in this folder — see **`docs/firebase-warehouse-production-android.md`**.
3. **Google sign-in only** — staff sign in on the app first; admins grant **Production app** access on web **User Login Access**.
4. Set `EXPO_PUBLIC_API_BASE` if needed (defaults to production site).

## Parity with web kiosk

- **Arabic / EN** toggle (default Arabic), RTL layout, and **MyMemory** translation for on-screen labels (same as `/warehouse-production` web).
- **Suggest a name** — `production-suggest-base-name` picks from a fixed **girl-name pool** only (no places); duplicates blocked server-side. The app rejects any non-pool API response and uses the same local pool.

## User access

1. Staff → Production app → **Continue with Google** (first sign-in registers them).
2. Web → **User Login Access** → **Refresh** → enable login → **Production app** → allow **Production app access**.
3. Deploy Vercel with `ZEBRA_PRINT_API_KEY`, `ZEBRA_PRINT_TENANT`, `ZEBRA_PRINTER_SERIAL` (SendFileToPrinter).

## Run (local — no EAS required)

```bash
cd mobile-apps/warehouse-production
npm install   # required — includes expo-image-manipulator for photo compression
npx expo start --clear
```

If Metro says **Unable to resolve "expo-image-manipulator"**, you skipped `npm install` in this folder (not the repo root).

Open the app on your phone (**Expo Go** or a **local debug APK** with Metro connected). After pulling JS changes, press **`r`** in the terminal or shake the device → **Reload**.

Uses **Expo SDK 58** (matches current Expo Go from the Play Store). If you see a dev-certificate warning, use `npm start` (online), not `npm run start:offline`.

**Two parts to update:**

| What changed | What you need |
|--------------|----------------|
| App screens (camera, save UI, alerts) | Metro reload or restart `expo start` — **no new EAS build** if JS bundles from Metro |
| API (`warehouse-mobile`, photo AI, labels) | **Vercel deploy** — the app calls `EXPO_PUBLIC_API_BASE` (default production site) |

If save spins then stops with no label dialog, the **server** likely returned an error (photo AI timeout, Gemini key, or label printer). After the latest app JS is loaded, a failed save should show an **alert** with the message — note that text for debugging.

**Local debug APK without Metro:** embeds an old JS bundle; run `npx expo run:android` again or use Expo Go + Metro for day-to-day dev.

Build APK: follow `warehouse-catalog/build-apk-local.ps1` pattern with package `com.bestrest.warehouseproduction`.
