# Orders app — Firebase Android + Google Sign-In

Firebase project: `bestrest-portal-system-43108`  
Package: `online.infinityhome.orders`  
Expo slug: `infinity-orders`

## One-time setup

From repo root (Firebase service account JSON in project root):

```bash
node scripts/setupOrdersGoogleSignIn.mjs --create-app-only
node scripts/addOrdersExpoRedirectUri.mjs --apply
```

After the first EAS Android build, register the release SHA-1:

```bash
ORDERS_ANDROID_SHA1=AA:BB:... node scripts/setupOrdersGoogleSignIn.mjs
```

(`eas credentials -p android` in `mobile-apps/orders` → copy SHA-1.)

## Expo Go (browser OAuth)

| Setting | Value |
|---------|--------|
| Redirect URI | `https://auth.expo.io/@alielboussi/infinity-orders` |
| Custom scheme (APK) | `infinity-orders://oauth` |
| Web client ID | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (shared portal web client) |

`app.config.js` sets `extra.expoProjectFullName: '@alielboussi/infinity-orders'` so Expo Go does not fall back to an unregistered custom scheme.

## Release APK

Native `@react-native-google-signin/google-signin` uses:

- `android.googleServicesFile` → `./google-services.json`
- Package-matched **Android OAuth** client from Firebase (after SHA-1 is registered)
- **Web client ID** as `webClientId` for Firebase `signInWithCredential`

Email + password sign-in uses the same Firebase project (enabled in Firebase Authentication).

## User access

Staff need **Orders** in User Access Management (`orders` app target). Hassan tiles use `orders-access-self`.
