# Infinity Home Mobile Apps (Expo SDK 52)

Three Expo apps that replace the legacy `Android Apps` folder. Each runs in **Expo Go** on a phone or emulator.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Expo Go](https://expo.dev/go) on your device (SDK 52)
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

Scan the QR code with Expo Go. The app loads `https://infinity-home-pi.vercel.app/layby-management`.

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
  README.md
```

## Tips

- Press `a` in the Expo terminal to open Android emulator, `i` for iOS simulator.
- If Metro cannot resolve `../shared/*`, restart with `npx expo start -c`.
- All apps use JavaScript (not TypeScript) and minimal UI suitable for warehouse floor use.
