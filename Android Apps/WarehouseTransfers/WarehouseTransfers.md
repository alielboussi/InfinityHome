# WarehouseTransfers Android App

## 1) Purpose
A dedicated Android APK for warehouse transfers:
- From location (locked): 39ffaa82-8aee-4a33-8de8-06584cbaffcf
- To location (locked): 454a092c-5b12-441e-b99d-216f6fa72198
- Shows products and sets that are checked for location 454a... in Products List
- Prevents transfer when source stock is 0 or below
- Sets are expanded into components; components can only be reduced below the required amount
- No inventory updates are applied until the receiver accepts the delivery in the web page

## 2) Required Database Tables
Run the SQL file:
- supabase/sql/warehouse_delivery_tables.sql

This creates:
- warehouse_delivery_sessions
- warehouse_delivery_entries

## 3) Build/Run
Open the folder in Android Studio:
- Android Apps/WarehouseTransfers

Then:
- Sync Gradle
- Run the `app` module on a device or emulator

## 4) How It Works
- Login uses the `app_login` RPC (users table, plain email/password)
- Products are loaded from `product_locations` where location_id = 454a...
- Sets are loaded from `combo_locations` where location_id = 454a...
- Source stock is read from inventory at 39ffaa...
- Apply Transfer creates a pending delivery session and entries only

## 5) Receiver Workflow (Web)
- Receiver page: /warehouse-deliveries (user UUID 9ddb5d8a-04ab-409b-8535-b69fef65013a)
- Auto refresh every 60 seconds
- Only the receiver account can accept deliveries
- Accept Delivery applies inventory adjustments

## 6) Admin Workflow (Web)
- Admin page: /warehouse-deliveries-admin
- Adjust quantities for deliveries accepted by the receiver account
- Applying changes reverses the previously applied inventory for the delivery
- The updated quantities are then applied as a full re-apply
- Delivery entries are replaced with the updated quantities
