# Mobile apps — independent packages

## Three apps

| Folder | APK name | Role |
|--------|----------|------|
| **`mobile-apps/warehouse-upholstery`** | **Upholstery** | Create, stock, manufacture, Hassan quotes (Floor 1) |
| **`mobile-apps/warehouse-delivery`** | **Delivery** | Kitwe truck send |
| **`mobile-apps/carpentry-workshop`** | **Carpentry** | Floor 2, finishing, carpentry quotes |

There is **no** `warehouse-production` folder anymore — it was renamed to **`warehouse-upholstery`**.

## Rules

- No junctions between apps; `npm run materialize` / postinstall copies real `shared/` and kiosk trees.
- Business data from the **portal API** only (`EXPO_PUBLIC_API_BASE`).

## Commands

```powershell
cd mobile-apps\warehouse-upholstery
npm run materialize
npm run icons

cd ..\warehouse-delivery
npm run materialize

cd ..\carpentry-workshop
npm run materialize
```

Launcher icon source: **`Upholstery Production.png`** in the upholstery app folder.
