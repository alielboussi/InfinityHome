# Hassan Awad dashboard — web portal ↔ Orders Android

Hassan’s **quotationer-only** experience on the web and the **Orders** Expo app must behave the same: same pages, same APIs, same User Access screen ids.

## Single source of truth

| Artifact | Role |
|----------|------|
| `src/mobile/ordersAppDashboardParity.js` | Canonical list of dashboard rows (web label/route + mobile stack + screen id + i18n) |
| `mobile-apps/shared/ordersAppDashboardParity.js` | **Mirror** of the file above (copy after every edit; materialize puts it in `orders/shared/`) |
| `src/mobile/mobileAccessManifest.js` → `ORDERS_APP_SCREENS` | User Access matrix ids/labels (must match parity `screenId`s) |
| `src/accessControl.js` → `HASSAN_AWAD.allowedRoutes` | Web routes Hassan may open (must cover every parity `webRoute`) |

## Consumers

- **Web sidebar:** `src/AppChrome.js` → `buildQuotationerOnlyNavGroups()` from parity module
- **Orders app tiles:** `mobile-apps/orders/screens/DashboardScreen.js` → `ORDERS_APP_DASHBOARD_PARITY`
- **Stack routes:** `mobile-apps/orders/App.js` → one screen per `mobileStack` name in parity

## When you change Hassan’s dashboard

1. Edit **`src/mobile/ordersAppDashboardParity.js`** only (add row, rename route, reorder).
2. Copy to **`mobile-apps/shared/ordersAppDashboardParity.js`**.
3. If the page is new, extend **`ORDERS_APP_SCREENS`** in `src/mobile/mobileAccessManifest.js` and sync `mobile-apps/shared/mobileAccessManifest.js`.
4. Add or update the **mobile screen** under `mobile-apps/orders/screens/` and register it in **`App.js`**.
5. Implement the **web page** (or quotationer `?view=` tab) so it calls the **same backend** as the mobile screen (prefer existing `warehouse-mobile` / `orders-*` ops).
6. Run **`node scripts/verifyOrdersApp.js`** (also runs on `npm run build` via `checkEnv.js`).

## Web-only note

**Layby Dashboard** (`/quotationer` home) is the web landing tile. The Orders APK uses the tile grid as home instead; all other parity rows exist on both.
