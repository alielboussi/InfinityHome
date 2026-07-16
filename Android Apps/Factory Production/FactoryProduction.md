# Factory Production Android App

## 1) Purpose
A dedicated Android APK for carpentry stock entry and transfer:
- From location (locked): 20abb7a3-9df9-45bd-885e-6440503ea728 (Carpentry)
- To location (locked): 39ffaa82-8aee-4a33-8de8-06584cbaffcf (Factory Warehouse)
- Search only products tagged to Carpentry via product_locations
- Add to cart with qty dialog
- Summary + Approve
- Approve updates inventory in Factory and queues label printing

## 2) Required Database Tables
The app reads/writes the following tables via Supabase REST:
- products
- product_locations
- categories
- unit_of_measure
- inventory
- stock_transfer_sessions
- stock_transfer_entries
- label_print_jobs

## 3) Build/Run
Open the folder in Android Studio:
- Android Apps/Factory Production

Then:
- Sync Gradle
- Run the app module on a device or emulator

## 4) How It Works
- Login uses the app_login RPC (users table, plain email/password)
- Products are loaded from product_locations where location_id = 20abb7a3...
- Search filters product name/SKU from the resolved product list
- Add New Product:
  - Name, category, unit, auto SKU, currency K
  - Auto-tags locations: Carpentry, Factory, Kitwe, Lusaka
  - Prompts for qty and adds to cart
- Approve creates:
  - stock_transfer_sessions (status approved)
  - stock_transfer_entries
  - inventory updates for the Factory location (insert if missing)
  - label_print_jobs payload with job_type carpentry_labels
- App retries queueing label job if there is temporary data/network interruption.
- App polls print-job status (`pending -> processing -> done|failed`) and shows print confirmation status on the success screen.
- Transfer number is generated with prefix #FacWar and a 7-digit suffix

## 6) Print Reliability
- Android side:
  - Retries sending the label command to `label_print_jobs` automatically.
  - Polls `label_print_jobs` by transfer id to confirm if printed.
  - Shows `Printed successfully`, `Print failed`, or `Confirmation pending`.
- PC service side:
  - Retries raw printer write per label (`PRINT_RETRY_COUNT`, `PRINT_RETRY_DELAY_SECONDS`).

## 7) WhatsApp Alerts (Optional)
- Worker can send WhatsApp notifications when:
  - job is received (`processing`)
  - job fails
  - optionally when job completes
- Configure in label-worker `.env`:
  - `WHATSAPP_ENABLED`
  - `WHATSAPP_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_RECIPIENTS`
  - `WHATSAPP_NOTIFY_ON_RECEIVED`
  - `WHATSAPP_NOTIFY_ON_DONE`
  - `WHATSAPP_NOTIFY_ON_FAILED`

## 5) Theme
- Buttons: red
- Backgrounds: black
- Text: white
