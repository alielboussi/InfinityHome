# Local development (`npm start`)

The React app no longer uses `src/setupProxy.js`. On **localhost**, all `/api/*` calls go to your **deployed** Vercel app via `REACT_APP_API_BASE`.

## Required: `.env.local`

Create `C:\Projects\Infinity Home\.env.local` (gitignored) with at least:

```env
REACT_APP_API_BASE=https://www.infinity-home.online
```

Use the same host you deploy to (e.g. `https://infinity-home-pi.vercel.app` if that is your preview URL).

If the site uses Vercel Deployment Protection, add:

```env
REACT_APP_VERCEL_BYPASS=your-bypass-token
```

## Optional

```env
# Force server APIs even when REACT_APP_API_BASE is unset (not recommended)
REACT_APP_FORCE_API=1
```

## Production

On Vercel, `REACT_APP_API_BASE` is usually **unset**. The UI uses same-origin `/api/*` and `vercel.json` rewrites — no proxy file involved.

## Notes

- Local UI changes apply immediately; **API behavior** matches whatever is **deployed** at `REACT_APP_API_BASE` until you deploy your branch.
- **Quotationer on localhost:** Sign in as `alielboussi00@gmail.com` and open [http://localhost:3000/quotationer](http://localhost:3000/quotationer). On localhost only, that account gets Hassan Awad’s sidebar and dashboard (layby overview + quotation nav) on his routes (`/quotationer`, `/quotes-board`, `/warehouse-deliveries`, `/warehouse-returns`, `/warehouse-storage`, `/layby-management`, `/transfers`). On **`/warehouse-deliveries`**, the same account can tick packets, accept deliveries, and **Save delivery note as PDF** like Hassan. Hard-refresh (`Ctrl+F5`) if the UI looks stale after pulls. Your full admin menu returns on other paths (e.g. `/dashboard`).
- APIs send `Access-Control-Allow-Origin: *`, so browser calls from `localhost:3000` work without a dev proxy.

## Warehouse Production app (Expo)

Run from **`mobile-apps/warehouse-upholstery`** (Upholstery app, not the repo root). After pulling JS changes, clear Metro cache or you may still see the old scanner UI:

```powershell
cd mobile-apps\warehouse-upholstery
npm install
npx expo start -c
```

This app is **standalone** (factory create/stock, **upholstery quotes**, manufacture). It does **not** share folders with Delivery or Carpentry — see **`docs/mobile-apps-independence.md`**.

Optional `.env` in that folder:

```env
EXPO_PUBLIC_API_BASE=https://www.infinity-home.online
```

**Printing on Expo web (localhost):** Press `w` in the Expo terminal to open the app in the browser. Delivery note print uses **Open browser print** (not the empty network-printer list). Pick your **Windows printer** or **Microsoft Print to PDF** in the dialog. On a **physical Android device**, use **Choose printer (system list)** instead.

**Metro “Codegen didn't run for …” warnings:** In **Expo Go** with RN bridgeless, React Native may log these for `react-native-screens`, `react-native-svg`, and `react-native-safe-area-context`. They are suppressed in dev (`shared/suppressBridgelessCodegenWarnings.js`) and do not block the app. Release **EAS APK** builds use full codegen; clear Metro cache after Babel changes: `npx expo start -c`.

## Warehouse Delivery app (drivers, Expo)

Run from **`mobile-apps/warehouse-delivery`**. Uses the same Kitwe send flow as production (Code 128, packet ticks, driver signature). Catalog matches web **`/warehouse-products`** / factory stock (including carpentry manufacture output).

```powershell
cd mobile-apps\warehouse-delivery
npm install
npx expo start -c
```

Enable **User Access → Delivery → Warehouse Delivery (Android)** on the driver’s row before testing submit (legacy: Production → Send to Kitwe).

**Firebase:** add Android app **`com.bestrest.warehousedelivery`** (display name **Warehouse Delivery**) in project `bestrest-portal-system-43108`, place `google-services.json` in `mobile-apps/warehouse-delivery/`, or run `scripts/setupWarehouseDeliveryGoogleSignIn.mjs`. See `mobile-apps/warehouse-delivery/README.md`.
