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

Run from **`mobile-apps/warehouse-production`** (not the repo root). After pulling JS changes, clear Metro cache or you may still see the old scanner UI:

```powershell
cd mobile-apps\warehouse-production
npm install
npx expo start -c
```

Open the project in **Expo Go** (or your dev build) and use **Reload** on the Kitwe Send screen. The barcode scanner should show a **red horizontal line** (not a large box). Kitwe Send loads a **delivery number** from the API when the screen opens (needs sign-in and network to `EXPO_PUBLIC_API_BASE`, default `https://www.infinity-home.online`).

Optional `.env` in that folder:

```env
EXPO_PUBLIC_API_BASE=https://www.infinity-home.online
```

## Warehouse Delivery app (drivers, Expo)

Run from **`mobile-apps/warehouse-delivery`**. Uses the same Kitwe send flow as production (Code 128, packet ticks, driver signature). Catalog matches web **`/warehouse-products`** / factory stock (including carpentry manufacture output).

```powershell
cd mobile-apps\warehouse-delivery
npm install
npx expo start -c
```

Enable **Send to Kitwe** on the driver’s User Access row before testing submit.

**Firebase:** add Android app **`com.bestrest.warehousedelivery`** (display name **Warehouse Delivery**) in project `bestrest-portal-system-43108`, place `google-services.json` in `mobile-apps/warehouse-delivery/`, or run `scripts/setupWarehouseDeliveryGoogleSignIn.mjs`. See `mobile-apps/warehouse-delivery/README.md`.
