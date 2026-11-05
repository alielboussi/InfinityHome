# Overnight handoff (2026-11-06)

## Git

- **Pushed** to `origin/sync-light`: commit `ee6973c` (workshop reports, quote production routing, returns/repairs, painting app, push targets, Quotationer UX).
- **Local fixes not yet pushed** (carpentry EAS): `App.js` import paths, `expo-notifications`, EAS `projectId` in app.config, materialize vendoring, `ProductionPressableHint` path fixes.

## Web / CI checks (passed)

- `npm run build` — success (prebuild ran all stocktake + warehouse + production verify scripts).
- `node scripts/verifyCarpentryPhase3.js` — ok
- `mobile-apps/warehouse-delivery/scripts/verifyDeliveryApp.js` — ok
- `verifyWarehouseReturnFlow`, `verifyWorkshopRepairReturnFlow`, `verifyWarehouseStorageFlow` — ok (via prebuild)

**ESLint warnings only:** unused `compactDanger` in `Quotationer.js`, unused import in `WarehouseDeliveries.js`.

## Integration sweep (code review)

| Flow | Web (Hassan / catalog) | API | Mobile |
|------|------------------------|-----|--------|
| Quote → upholstery/carpentry | `Quotationer.js` required route + line metadata + drawing | `quotation-save`, `quote-production`, `quoteProductionRouting` | Quote list/detail + push on send |
| Returns / repairs | `WarehouseReturns*`, Hassan paths in `accessControl` | `warehouseReturnOrders`, `warehouse-mobile` | Upholstery + carpentry + painting repair screens (not delivery) |
| Push notifications | N/A | `productionExpoPush.js` + `app_target` on register | upholstery, carpentry, painting hooks |
| Reports | Transfers, Upholstery, Carpentry, Painting, Repair pages | `workshopReportData.js` | N/A |

**Deploy reminder:** Vercel needs latest `sync-light` + env `FIREBASE_SERVICE_ACCOUNT` / bucket for return PDFs.

## EAS Android builds

| App | Status | Notes |
|-----|--------|--------|
| **warehouse-upholstery** | **SUCCESS** | APK: https://expo.dev/artifacts/eas/v3n5suLL4oxmN0Gbx4BDJrmKPYOj8mMeTU3pccD1SDE.apk — SHA-1 already in Firebase (`eas-android-keystore-fingerprints.txt`) |
| **carpentry-workshop** | **FAILED** then fixes in progress | First fail: bad `App.js` imports + missing `expo-notifications`. Bundle still needs full `productionKiosk` standalone (vendor `src/utils` + `src/constants` into EAS upload). Keystore **was created** on EAS — register SHA-1 after a green build. |
| **painting-workshop** | **Not started** | EAS project `206ae533-ceb2-474b-a2a1-bcad4f2704c3` linked in `app.config.js`. Add deps + export test like carpentry before build. |
| **warehouse-delivery** | **In progress / queued** | Build: https://expo.dev/accounts/alielboussi/projects/warehouse-delivery/builds/89eca996-b56f-4e4e-95a8-c0cf37a41f2c |

## Firebase SHA-1 (Google Sign-In)

Scripts (repo root, need `FIREBASE_SERVICE_ACCOUNT` or adminsdk JSON file):

```powershell
$env:CARPENTRY_WORKSHOP_ANDROID_SHA1="<from eas credentials>"
node scripts/setupCarpentryWorkshopGoogleSignIn.mjs

$env:PAINTING_WORKSHOP_ANDROID_SHA1="<from eas credentials>"
node scripts/setupPaintingWorkshopGoogleSignIn.mjs
```

Get SHA-1:

```powershell
cd mobile-apps/carpentry-workshop
eas credentials -p android --profile production
```

(Carpentry keystore created on failed build `76448c94-35da-4ff7-9fbc-45db6b89e5db`.)

## Morning to-do

1. Push follow-up commit (carpentry EAS fixes + materialize `_repoUtils`).
2. Re-run `node scripts/materializeCarpentryStandalone.js` + `npx expo export --platform android` until clean; then `eas build -p android --profile production --non-interactive`.
3. Build painting; register SHA-1 for carpentry + painting in Firebase.
4. Confirm delivery build finished; install APKs and smoke-test push + quote orders on devices.
5. Deploy Vercel from `sync-light`.
