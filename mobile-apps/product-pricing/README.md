# Product Photos (Expo)

Mobile app for adding and replacing **product photos** on the portal `products-list`. Prices are shown read-only.

## Setup

```bash
cd mobile-apps/product-pricing
npm install
npm start
```

Use the same `EXPO_PUBLIC_FIREBASE_*` values as the portal / other mobile apps (see `mobile-apps/README.md`).

App icon and splash live in `assets/icon.png`, `assets/adaptive-icon.png`, and `assets/splash.png` (do **not** copy from `lusaka-stock`).

## Features

- Email + password sign-in only (Firebase, same as portal)
- After sign-in, opens the **products grid** directly (no dashboard)
- Two-column **square card** grid with scroll
- Search by name, SKU, or amount
- Filter **No image yet** for products missing a photo or with a broken URL
- **Scan QR** (price-label SKU codes) to open a product
- Tap card or long-press image to add/replace photo (gallery or camera)
- **Hold product name** on a card to rename (saves to Firestore `products.name`) or edit set components
- **Photo** button: take a photo to search visually for similar catalog items
- Standard and promo prices shown on cards and product screen (read-only)
- Writes to Firestore / Storage:
  - `product_images`
  - `products.image_url`
  - Firebase Storage `productimages/products/{id}/…`

Photos are **global per product** (not per location). Changes appear on the portal immediately.

### Visual photo search

- Uses `/api/product-image-search` on the portal (requires deploy).
- **No need to re-upload photos** — on first open the app queues a backfill that reads existing `image_url` / `picture_url` values and stores fingerprints in Firestore `product_image_embeddings`.
- New uploads auto-embed after save.
- Real-world camera photos are matched against white-background catalog shots using trimmed color fingerprints (suggestions only — pick the best match).

## APK build (standalone install)

Icons: `assets/icon.png` (launcher), `assets/adaptive-icon.png` (Android circle mask — padded safe zone), `assets/splash.png` (launch screen).

```bash
cd mobile-apps/product-pricing
npm install
npx eas-cli login          # once, same Expo account as lusaka-stock
npx eas-cli init           # links EAS project → writes projectId into app.config.js
npm run verify:apk
npm run build:apk          # preview APK (internal distribution)
```

When the build finishes, EAS prints a download URL for the `.apk`. Install on Android and the home-screen icon uses the teal camera/tag graphic inside the system round mask.

**Note:** Expo Go always shows the Expo icon; only a built APK shows your custom icon.

## Notes

- QR codes on price labels encode the product **SKU**, not the UUID.
- Use `npm start` (offline mode) if `npx expo start` fails with a network/cache error.
