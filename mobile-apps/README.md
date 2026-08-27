# Infinity Home Mobile Apps (Expo SDK 52)

Six Expo apps that replace the legacy `Android Apps` folder. Each runs in **Expo Go** on a phone or emulator (SDK 54 for customer-credit, lusaka-stock, and product-pricing; SDK 52 for others).

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Expo Go](https://expo.dev/go) on your device (**SDK 54** for customer-credit; SDK 52 for other apps)
- Firebase config values for the Firestore apps (copy from the main web app `.env`)

## Shared Firebase config

`shared/firebase.js` reads `EXPO_PUBLIC_FIREBASE_*` environment variables. Copy `.env.example` to `.env` in each Firestore app and fill in values.

---

## 1. Layby Shell (`layby-shell/`)

WebView wrapper for layby management.

```bash
cd mobile-apps/layby-shell
cp .env.example .env   # optional — defaults to production URL
npm install
npx expo start
```

Scan the QR code with Expo Go. The app loads `https://www.infinity-home.online/layby-management`.

---

## 2. Warehouse Transfers (`warehouse-transfers/`)

Firestore app for warehouse delivery submissions (Factory Warehouse → Kitwe Branch).

```bash
cd mobile-apps/warehouse-transfers
cp .env.example .env
# Edit .env with EXPO_PUBLIC_FIREBASE_* values
npm install
npx expo start
```

**Screens:** product list (Firestore `product_locations` + `products`), cart, submit to `warehouse_delivery_sessions` / `warehouse_delivery_entries`.

**Note:** Warehouse and factory apps require Firebase email/password sign-in on launch (session persists between opens). Layby shell uses the web login inside the WebView.

---

## 3. Factory Production (`factory-production/`)

Carpentry product picker with API submit and label history.

```bash
cd mobile-apps/factory-production
cp .env.example .env
# Edit .env with EXPO_PUBLIC_FIREBASE_* and optional EXPO_PUBLIC_API_BASE
npm install
npx expo start
```

**API endpoints:**
- `GET /api/label-print-history` — recent label jobs
- `POST /api/admin?adminAction=factory-production-approve` — approve transfer & queue labels

**Firestore:** product catalog at Carpentry location `20abb7a3-9df9-45bd-885e-6440503ea728`. Sign in with Firebase on launch (same as warehouse app).

---

## 4. Ledger (`customer-credit/`)

Standalone layby-style ledger tracker in Firebase. **Not linked to portal customers, products, or sales** — uses its own Firestore collections (`credit_app_*`).

```bash
cd mobile-apps/customer-credit
cp .env.example .env
# Edit .env with EXPO_PUBLIC_FIREBASE_* values (same project as the portal)
npm install
npx expo start
```

If `npx expo start` fails with **`TypeError: fetch failed`**, Expo cannot reach `api.expo.dev` (network/DNS/firewall). Start in offline mode instead:

```bash
npx expo start --offline
# or: npm run start:offline
```

**Expo Go + Google sign-in:** Expo Go does not include the native Google Sign-In module. The app uses email/password in Expo Go, or **Continue with Google** via the browser-based flow. If you see `RNGoogleSignin could not be found`, restart Metro with cache clear: `npx expo start --offline -c`.

**Expo Go:** EAS Update is **disabled** for Ledger. Open it only via **Scan QR code** after `npx expo start` — not from the **Projects** card. If `customer-ledger-tracking` still appears under Projects, sign out of your Expo account in Expo Go (profile icon → Sign out); QR scanning works without being signed in. For staff phones, use the **standalone APK**, not Expo Go.

Sign in with a Firebase email/password account on launch. Customers, products, sales, and payments are **shared across all signed-in users** (company-wide ledger).

**Session:** Ledger stays signed in when you switch apps or lock the phone. Use **Log out** on the dashboard to sign out. Disabled accounts are still blocked on the next login check.

**Google sign-in:** set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env` to the Firebase **Web client** OAuth ID (Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration). Enable Google sign-in in Firebase Authentication.

**Login access control:** disabled users are blocked on the portal and mobile apps via Administration → **User Login Access**.

**Firestore collections (isolated from portal):**
- `credit_app_customers` — customer profiles
- `credit_app_customers/{id}/sales` — products taken
- `credit_app_customers/{id}/payments` — payments / down payments
- `credit_app_products` — local product catalog for this app only
- `credit_app_meta/shared` — monthly report timestamp (shared)

**Features:**
- Add customers (name, phone, address, payment deadline in days)
- Maintain a local product catalog with prices
- Record products taken per customer and payments / down payments
- Dashboard with pending balances and overdue warnings
- Monthly dues report card every 30 days
- Per-customer deadline: overdue warning if balance remains after deadline (from first sale date)

**Installing on staff phones:** see [`customer-credit/INSTALL.md`](customer-credit/INSTALL.md).  
For trusted installs without sideload warnings, use **Google Play internal testing** (`npm run build:play` then `npm run submit:play`).

---

## 5. Lusaka Stock (`lusaka-stock/`)

Read-only Lusaka branch stock viewer — same data as the web kiosk at `https://www.infinity-home.online/lusaka-stock`. Shows product/set photos, standard and promo prices, and available qty in a **2-column grid**. Search by name, SKU, or price.

```bash
cd mobile-apps/lusaka-stock
cp .env.example .env
# Edit .env with EXPO_PUBLIC_FIREBASE_* values (same project as the portal)
npm install
npm start
```

**Expo Go on your phone (not web):**
1. Install **Expo Go** from the Play Store (SDK **54**).
2. Run `npm start` on your PC — a **QR code** appears in the terminal.
3. Open **Expo Go** on your phone → **Scan QR code** (do **not** press `w` in the terminal — that opens web).
4. Phone and PC must be on the **same Wi‑Fi**. If the QR fails, try: `npx expo start --offline --lan`

If `npx expo start` fails with **`Body is unusable: Body has already been read`**, use `npm start` (offline mode). Sign in with Firebase email/password or Google (Expo Go uses the browser OAuth flow). Stock refreshes every 60 seconds. Pull down to refresh manually.

**Google sign-in (APK):** uses **native Google Sign-In** (same as Ledger), not `auth.expo.io`. Before building:

```bash
# From repo root — registers EAS release SHA-1 and writes google-services.json
LUSAKA_STOCK_ANDROID_SHA1=AA:BB:... node scripts/setupLusakaStockGoogleSignIn.mjs
```

Then `npm run build:apk:prod` in `lusaka-stock/`. See `lusaka-stock/PRE_BUILD_CHECKLIST.md`.

**Google sign-in (Expo Go):** browser OAuth with scheme `lusaka-stock://oauth`. If sign-in fails, add the redirect URI shown under the Google button in Google Cloud Console → Web client. Email/password always works.

**Data:** inventory via `/api/inventory-bulk`, plus Firestore products, sets, location prices, and images for Lusaka (`f72aa989-3888-4a45-96ed-15dc45b5d399`).

---

## 6. Product Photos (`product-pricing/`)

Add and replace portal **product photos** from a phone. Prices are read-only on cards.

```bash
cd mobile-apps/product-pricing
npm install
npm start
```

**Sign-in:** Firebase email/password only (no Google).

**Screens:** products grid (two-column square cards) → product photo screen. **Scan QR** uses the SKU on price labels. No location picker — photos are global per product.

**Data:** `product_images`, `products.image_url`, Firebase Storage `productimages/…` — same as `src/ProductsListPage.js`.

**APK:** `npm run build:apk` after `npx eas-cli login` + `npx eas-cli init` (see `product-pricing/README.md`).

---

## Project layout

```
mobile-apps/
  shared/
    firebase.js       # initializeApp / getFirestore / getAuth
    AuthGate.js       # email/password sign-in for Firestore apps
    uuid.js
  layby-shell/
  warehouse-transfers/
  factory-production/
  customer-credit/
  lusaka-stock/
  product-pricing/
  README.md
```

## Tips

- Press `a` in the Expo terminal to open Android emulator, `i` for iOS simulator.
- If Metro cannot resolve `../shared/*`, restart with `npx expo start -c`.
- All apps use JavaScript (not TypeScript) and minimal UI suitable for warehouse floor use.
