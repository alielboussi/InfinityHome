# WarehouseTransfers Android App

This app captures pending warehouse deliveries:
- Locked From: 39ffaa82-8aee-4a33-8de8-06584cbaffcf
- Locked To: 454a092c-5b12-441e-b99d-216f6fa72198
- Products/Sets shown only when checked for location 454a... in Products List
- No inventory changes until the receiver accepts the delivery in the web app

See WarehouseTransfers.md for full setup instructions.

## 6) Label Printing (Cloud Queue)
Use a cloud queue table in Supabase:

Table: label_print_jobs
- id (uuid)
- created_at (timestamp)
- status (text: pending, processing, done, failed)
- payload (jsonb)
- error (text)

Payload example:
{
  "job_type": "carpentry_labels",
  "transfer_id": "<session_id>",
  "to_location": "39ffaa82-8aee-4a33-8de8-06584cbaffcf",
  "items": [
    {"product_id":"...","name":"...","sku":"...","qty":5}
  ]
}

Printer worker (cloud or PC near printer):
- Poll label_print_jobs where status = 'pending'
- Render labels (ZPL/TSPL)
- Print
- Update status

## 7) Phase Plan with Tests

Phase 1: Project setup
- Create Android project folder with Gradle + manifest
- Build empty APK
Test: run app on emulator

Phase 2: Supabase connectivity
- Add Supabase client
- Load categories/units/products
Test: list loads successfully

Phase 3: Search + Cart
- Search only carpentry-tagged products
- Qty dialog and cart
Test: add/remove items

Phase 4: Add Product
- New product form
- Auto SKU (unique)
- Auto location tags
- Qty prompt -> add to cart
Test: new product appears in search

Phase 5: Summary + Approve
- Create session + entries
- Update inventory in Factory
Test: inventory rows updated

Phase 6: Print queue
- Insert label_print_jobs on approve
- Worker consumes and prints
Test: job processed end-to-end

Phase 7: APK release
- Build signed release
Test: install on device

## 8) Risks / Requirements
- RLS must allow anon key for required reads/writes
- If not, add Supabase policies or a serverless API
- Printer worker must run where printer is connected

