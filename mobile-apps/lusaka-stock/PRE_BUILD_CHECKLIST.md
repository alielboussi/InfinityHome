# Lusaka Stock — pre-APK checklist

**Do not run `eas build` until every item below is checked.** Each EAS build uses Expo quota.

## 1. Automated local checks (required)

```bash
cd mobile-apps/lusaka-stock
npm install
node scripts/verify-apk-ready.js
```

This must exit **0** (no BLOCKED items). It verifies assets, config, syntax, and Android bundle export.

## 2. Google sign-in (required for APK)

The installed APK must use **native Google Sign-In** (same approach as Ledger). Do **not** use `auth.expo.io` — that proxy is broken and shows “Something went wrong trying to finish signing in.”

From the repo root (with Firebase service account in `.env`):

```bash
# Option A — pass EAS release SHA-1 directly (from eas credentials → Android → Keystore)
LUSAKA_STOCK_ANDROID_SHA1=AA:BB:CC:... node scripts/setupLusakaStockGoogleSignIn.mjs

# Option B — pass the release APK URL from EAS after a build
node scripts/setupLusakaStockGoogleSignIn.mjs https://expo.dev/artifacts/eas/....apk
```

This creates/updates the Firebase Android app `com.bestrest.lusakastock`, registers the SHA-1, and writes `mobile-apps/lusaka-stock/google-services.json`.

Then rebuild the APK (`npm run build:apk:prod`).

**Expo Go (dev only):** uses browser OAuth with the app scheme (`lusaka-stock://oauth`). If Google fails in Expo Go, add the redirect URI shown under the sign-in button in Google Cloud Console → Web client.

## 3. Expo Go smoke test (required)

```bash
npm start
```

On your phone (Expo Go SDK 54), confirm:

- [ ] Google sign-in works (or use email/password in Expo Go if redirect not configured)
- [ ] Email/password sign-in works
- [ ] Stock grid loads with images, prices, qty
- [ ] Search works (name, SKU, price)
- [ ] Pull-to-refresh updates stock
- [ ] Tap image → lightbox
- [ ] Log out works
- [ ] Item count matches web `/lusaka-stock`

## 4. Catalog freshness

- [ ] New Lusaka product appears after pull-to-refresh
- [ ] New Lusaka set appears (components hidden; expand triangle works)
- [ ] Set qty matches web kiosk

## 5. Build (only when 1–4 are done)

```bash
npm run build:apk:prod
```

Bump `version` in `app.config.js` when releasing a fix (currently **1.0.2** for Google sign-in fix).

## What changed in 1.0.2

| Issue | Fix |
|-------|-----|
| `auth.expo.io` “Something went wrong” on Google sign-in | Switched APK to **native Google Sign-In** + `google-services.json` |
| Error code 10 / DEVELOPER_ERROR | Register EAS release SHA-1 via `setupLusakaStockGoogleSignIn.mjs` |

**APKs before 1.0.2** use the broken `auth.expo.io` flow. Users must install **1.0.2+** after SHA-1 is registered. Email/password still works on older builds.
