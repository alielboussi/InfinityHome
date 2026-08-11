# Installing Ledger on Android

## Important

Android does **not** let app developers turn off security scanning for sideloaded APK files.  
To get the smoothest install (trusted source, no unknown-app warnings), use **Google Play internal testing** (see below).

For direct APK installs, each phone must allow installs from the app used to open the file (Chrome, Files, WhatsApp, etc.).

---

## Option A — Google Play (recommended, trusted install)

This is the only way to install without “unknown app” / heavy Play Protect prompts for most users.

1. Create the app in [Google Play Console](https://play.google.com/console) with package name `com.bestrest.customerledger`.
2. Create a **service account** with Play Console API access and download the JSON key.
3. Save the key as `mobile-apps/customer-credit/google-play-service-account.json` (gitignored).
4. Build an App Bundle:
   ```bash
   cd mobile-apps/customer-credit
   npm run build:play
   ```
5. Submit to internal testing:
   ```bash
   npm run submit:play
   ```
6. Add tester emails in Play Console → **Internal testing** → share the opt-in link.

Testers install from the Play Store like any normal app.

---

## Option B — Direct APK (sideload)

Use the latest APK from EAS or your admin.

### 1. Allow installs from your download app

**Android 8+**

1. Open **Settings**
2. **Apps** → **Special app access** (or **Install unknown apps**)
3. Choose the app you use to open the APK (e.g. **Chrome**, **Files**, **WhatsApp**)
4. Turn on **Allow from this source**

### 2. Install the APK

1. Open the APK link or file
2. Tap **Install**
3. If **Play Protect** appears:
   - Tap **More details** → **Install anyway** (app is signed with our release key)
   - Or temporarily: Play Store → profile → **Play Protect** → **Settings** → disable **Scan apps with Play Protect** (re-enable after install)

### 3. Samsung / Xiaomi / Oppo

Some brands add an extra “security scan” step. Tap **Install anyway** or add the installer app to allowed sources in **Security** settings.

---

## Updates

- **Play Store:** updates arrive automatically.
- **APK:** uninstall the old version, then install the new APK (same package `com.bestrest.customerledger`).

---

## Troubleshooting

| Issue | What to do |
|--------|------------|
| “App not installed” | Uninstall old version first; ensure enough storage |
| Play Protect blocks install | Tap **Install anyway** or use Play internal testing |
| App opens then closes | Install the latest v1.0.3+ APK (Firebase config fix) |
| Google sign-in blocked (Error 400) | Install **v1.0.6+**; register the EAS keystore **SHA-1** in Firebase (see below) |
| Name cut off on home screen | Install **Ledger** v1.0.3+ (short name) |

### Google sign-in (Ledger v1.0.6+)

Google sign-in is **not** related to APK signing. It needs the release keystore **SHA-1** registered in Firebase for package `com.bestrest.customerledger`.

1. Open [Expo credentials](https://expo.dev/accounts/alielboussi/projects/customer-ledger-tracking/credentials) → **Android** → **Keystore** → copy **SHA-1 Certificate Fingerprint**.
2. Firebase Console → **Project settings** → **Your apps** → **Ledger** (`com.bestrest.customerledger`) → **Add fingerprint** → paste SHA-1.
3. Or from repo root (paste SHA-1 from step 1):
   ```bash
   LEDGER_ANDROID_SHA1=AA:BB:... node scripts/registerLedgerAndroidGoogleSignIn.mjs
   ```
4. Reinstall the latest APK. Email/password login works without this step.
