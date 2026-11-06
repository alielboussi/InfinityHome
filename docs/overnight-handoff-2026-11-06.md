# Overnight handoff (2026-11-06) — updated

## Git (`sync-light`)

| Commit | Summary |
|--------|---------|
| `ee6973c` | Quote production routing, Quotationer UX, reports, returns, painting app |
| `52cde7f` | Carpentry EAS bundle fixes, materialize vendoring, Expo project IDs |
| `515e452` | **Carpentry push fix:** `app_target: carpentry`, navigate `Quotes` / `QuoteDetail` |

## Web / CI (passed)

- `npm run build` — success (all prebuild verify scripts including stocktake locks).
- `node scripts/verifyCarpentryPhase3.js` — ok (includes carpentry push registration check).
- `mobile-apps/warehouse-delivery/scripts/verifyDeliveryApp.js` — ok.
- `verifyWarehouseStorageFlow`, return/repair verifies — ok via prebuild.

**ESLint warnings only:** unused `compactDanger` in `Quotationer.js`, unused import in `WarehouseDeliveries.js`.

## Integration sweep

| Flow | Web (Hassan) | API | Mobile / push |
|------|--------------|-----|----------------|
| Quote → upholstery/carpentry | `Quotationer.js` required route, line metadata, drawing | `quotation-save`, `quote-production`, `quoteProductionRouting` | Push via `notifyProductionQuoteOrderSent` → `appTargets` by route |
| Carpentry push (fixed `515e452`) | — | `production-push-register` | Was registering as `upholstery` — **fixed** to `carpentry` |
| Returns / repairs | Hassan returns + trackage | `warehouseReturnOrders`, repair department routing | upholstery / carpentry / painting `Repairs` + dept push |
| Storage sends | Hassan storage | warehouse storage API | upholstery `SoldOrders` push |
| Painting jobs | — | painting production jobs | painting `Jobs` push |
| Delivery | Hassan receiver | warehouse delivery mobile | delivery app (no quote push) |

**Vercel:** Latest code is on `sync-light`; production deploy was not run from this session (run `npx vercel --prod` when ready).

## EAS Android builds

| App | Status | APK / build |
|-----|--------|-------------|
| **warehouse-upholstery** | **SUCCESS** (prior) | SHA-1 in Firebase — `eas-android-keystore-fingerprints.txt` |
| **warehouse-delivery** | **SUCCESS** | https://expo.dev/artifacts/eas/Dqs5Cq7liImkHTmC0rKmsZjml38tXaCg5ozB_tmVaBI.apk — build `89eca996-…` — SHA-1 registered in Firebase (`71:DE:3E:…`) |
| **carpentry-workshop** | **SUCCESS** @ `515e452` | https://expo.dev/artifacts/eas/b2CZSWChda8kwpIxJ6tQwoW66hhdoyRGElB0351DU68.apk — SHA-1 `AD:1B:56:…` in Firebase |
| **painting-workshop** | **SUCCESS** | https://expo.dev/artifacts/eas/hBuyU88jsbPewYgHiSBnZX4LGcWf6b8muk2Z27OdkX8.apk — SHA-1 `A2:3B:87:…` in Firebase |

Local export verified: carpentry + painting `expo export --platform android` clean.

## Firebase SHA-1

Use JDK 21 for apksigner on Windows:

```powershell
$env:JAVA_HOME="C:\Program Files\Java\jdk-21"
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\Projects\Infinity Home\bestrest-portal-system-43108-firebase-adminsdk-fbsvc-b259e84074.json"
node scripts/setupWarehouseDeliveryGoogleSignIn.mjs "<apk-url>"
node scripts/setupCarpentryWorkshopGoogleSignIn.mjs "<apk-url>"
node scripts/setupPaintingWorkshopGoogleSignIn.mjs "<apk-url>"
```

Firebase Android apps ensured for carpentry + painting (`--create-app-only`).

## Morning checklist

1. ~~Carpentry + painting EAS + SHA-1~~ — **done** (see table above).
2. Install APKs; smoke-test Hassan quote send → upholstery + carpentry notifications; repair dept pushes.
3. Deploy Vercel from `sync-light` (`npx vercel --prod`).
4. Optional: remove ESLint unused vars in Quotationer / WarehouseDeliveries.
