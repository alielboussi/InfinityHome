# Carpentry workshop (Expo SDK 58)

Android app for tap-to-manufacture on the web **Carpentry** catalog. Uses the same Firebase sign-in and `/api/warehouse-mobile` ops as **`warehouse-upholstery`**.

## Setup

```bash
cd mobile-apps/carpentry-workshop
npm install
npx expo start -c
```

**Independence:** `npm install` materializes real **`productionKiosk/`** and **`shared/`** copies (no junction to Upholstery or `mobile-apps/shared`). See **`docs/mobile-apps-independence.md`**.

From this folder:

```bash
npm install
npm run start
```

Set `EXPO_PUBLIC_API_BASE` (defaults to production). Enable **User Access → Production → Carpentry workshop (Android)** for the operator.

## Backend (once per environment)

```bash
node scripts/seedCarpentryWarehouseLocations.js
node scripts/applyCarpentryProductionSchema.js
```

(`docs/sql/carpentry-production-schema.sql` is reference SQL only; live data uses Firestore.)

Regression: `node scripts/verifyCarpentryPhase12.js`

See `docs/carpentry-production-system.md`.
