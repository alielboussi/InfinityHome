# Product Pricing (Expo)

Mobile app for updating **standard price**, **promo price**, and **product photos** on the portal `products-list`.

## Setup

```bash
cd mobile-apps/product-pricing
cp ../lusaka-stock/assets/icon.png assets/
cp ../lusaka-stock/assets/splash.png assets/
cp ../lusaka-stock/assets/adaptive-icon.png assets/
npm install
npm start
```

Use the same `EXPO_PUBLIC_FIREBASE_*` values as the portal / other mobile apps (see `mobile-apps/README.md`).

## Features

- Email + password sign-in only (Firebase, same as portal)
- Dashboard with **Kitwe / Lusaka / Factory** pricing location
- Single-column scrollable product list
- Search by name, SKU, or amount
- Filter **No image yet** to show products still missing a photo or with a broken/unreachable image URL (like portal broken thumbnails)
- **Scan QR** (price-label SKU codes) to open a product
- Edit standard price, promo price, and image (gallery or camera)
- Writes to the same Firestore collections as the web products-list:
  - `products`
  - `product_location_prices`
  - `product_images`
  - Firebase Storage `productimages/products/{id}/…`

Changes appear on the portal immediately (refresh products-list if it was already open).

## Notes

- QR codes on price labels encode the product **SKU**, not the UUID.
- Pick the same location on the dashboard that you use in products-list for location-specific prices.
