# Upholstery Production (Expo Android)

Warehouse production on phones: **create packets**, **add stock**, labels via **Zebra Weblink** (no print PC).

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

## Run

```bash
npm start
```

Uses **Expo SDK 58** (matches current Expo Go from the Play Store). If you see a dev-certificate warning, use `npm start` (online), not `npm run start:offline`.

Build APK: follow `warehouse-catalog/build-apk-local.ps1` pattern with package `com.bestrest.warehouseproduction`.
