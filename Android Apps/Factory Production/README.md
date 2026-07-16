# Factory Production Android App Plan

## 1) Goal
A dedicated Android APK (Kotlin + Gradle) for carpentry stock entry:
- Locked From location: 20abb7a3-9df9-45bd-885e-6440503ea728 (Carpentry)
- Locked To location: 39ffaa82-8aee-4a33-8de8-06584cbaffcf (Factory Warehouse)
- Search only products tagged with Carpentry (product_locations contains 20abb7a3-9df9-45bd-885e-6440503ea728)
- Add to cart with qty dialog
- Summary page + Approve
- Approve triggers label print job and updates inventory in Factory

Supabase:
- URL: https://xolmjpsibkwkdllqadee.supabase.co
- Anon key: provided by user

## 2) UI Theme (Carpentry / Antique Wood)
- Primary background: #2a1f16
- Secondary panels: #3a2a1f
- Accent: #b07a45 (antique wood)
- Highlights: #d7b38c
- Text: #f4e7d6

## 3) Screens

### Screen A: Stock Entry
- Locked fields:
  - From: Carpentry
  - To: Factory Warehouse
  - Date/Time: UTC+2, format dd/mm/yyyy and HH:mm
- Search input (only field at top)
- Plus button next to search (Add New Product)
- Search results only show products with Carpentry location
- Tap a product -> Qty dialog -> Add to cart
- Cart list below with qty and total
- Button: "Enter Stock" -> Summary screen

### Screen B: Summary
- Shows locked From/To, date/time, list of items, totals
- Approve button

## 4) Data Rules

### Search filter
Use product_locations to filter products that include:
- 20abb7a3-9df9-45bd-885e-6440503ea728 (Carpentry)

### New product creation
Fields only:
- Product name
- Category
- Unit
- SKU auto-generated (next numeric, leading zeros, no duplicates)
- Currency auto-set to K

Auto-format product name:
- Trim spaces
- Collapse multiple spaces
- Title case each word

Auto-check location_ids on create:
- 20abb7a3-9df9-45bd-885e-6440503ea728 (Carpentry)
- 39ffaa82-8aee-4a33-8de8-06584cbaffcf (Factory)
- 454a092c-5b12-441e-b99d-216f6fa72198 (Kitwe)
- f72aa989-3888-4a45-96ed-15dc45b5d399 (Lusaka)

After product save:
- Prompt for qty
- Add to cart

### Date/Time
- Locked to UTC+2
- Date format dd/mm/yyyy
- Time format HH:mm

## 5) Inventory Update on Approve
On Approve:
1) Create a transfer session record
2) Create transfer entries
3) Update inventory for To location (Factory)
4) If inventory row missing, insert it

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

