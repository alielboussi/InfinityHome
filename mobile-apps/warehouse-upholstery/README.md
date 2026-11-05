# Upholstery (Expo Android)

Folder: **`mobile-apps/warehouse-upholstery`**. Expo app name: **Upholstery**. Android package: **`com.bestrest.warehouseupholstery`**.

Create packets, add stock, manufacture, Hassan quote orders — **Floor 1 / upholstery** via portal API. **Kitwe delivery is only in `warehouse-delivery`.**

## App icon

From **`Upholstery Production.png`** in this folder:

```bash
npm run icons
```

Writes `assets/icon.png` and `assets/adaptive-icon.png`.

## Setup

1. `npm install` — materializes real `shared/` (not a junction).
2. **`google-services.json`** is in this folder for **`com.bestrest.warehouseupholstery`** (run `node scripts/setupWarehouseUpholsteryGoogleSignIn.mjs --create-app-only` from repo root, or see **`docs/firebase-warehouse-upholstery-android.md`**).
3. **User Access → Upholstery** on the web portal for each Google account.

## Run

```bash
cd mobile-apps/warehouse-upholstery
npm install
npx expo start -c
```

See **`docs/mobile-apps-independence.md`**.
