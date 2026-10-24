# Production (Expo Android)

Warehouse production on phones: **create packets**, **add stock**, labels via **Zebra Weblink** (no print PC).

## Setup

1. `npm install` (links `shared` from `mobile-apps/shared` via postinstall).
2. Register Android app in Firebase and add `google-services.json` — see **`docs/firebase-warehouse-production-android.md`**.
3. Set `EXPO_PUBLIC_API_BASE` if needed (defaults to production site).

## Parity with web kiosk

- **Arabic / EN** toggle (default Arabic), RTL layout, and **MyMemory** translation for on-screen labels (same as `/warehouse-production` web).
- **Suggest a name** — same API as web (`production-suggest-base-name`): **Gemini** when `GEMINI_API_KEY` is on Vercel, else curated names/places; uniqueness checked server-side. Offline fallback uses local lists in the app.

## User access

1. Web → **User Login Access** → **Add user** (email + password).
2. Enable login, then **Production app** → allow **Production app access**.
3. Deploy Vercel with `ZEBRA_PRINT_API_KEY`, `ZEBRA_PRINT_TENANT`, `ZEBRA_PRINTER_SERIAL` (SendFileToPrinter).

## Run

```bash
npm run android
```

Build APK: follow `warehouse-catalog/build-apk-local.ps1` pattern with package `com.bestrest.warehouseproduction`.
