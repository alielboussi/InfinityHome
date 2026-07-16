# Warehouse Transfers Workflow

Android employees create Factory → Kitwe deliveries. Web dashboards review, edit, accept, and report. Inventory moves only when Hassan Awad accepts a pending delivery.

## Android project path

`Android Apps/WarehouseTransfers`

Package: `com.bestrest.warehousetransfers`

## Locked locations

| Role | Name | UUID |
|------|------|------|
| From | Factory Warehouse | `39ffaa82-8aee-4a33-8de8-06584cbaffcf` |
| To | Kitwe Branch | `454a092c-5b12-441e-b99d-216f6fa72198` |

These IDs are constants in:

- `Android Apps/WarehouseTransfers/.../data/AppConfig.kt`
- `src/utils/warehouseDelivery.js`

Employees cannot change them in the Android app.

## Web routes

| Route | Purpose | Who |
|-------|---------|-----|
| `/warehouse-deliveries` | Pending deliveries, PDF, Accept Delivery | Hassan Awad |
| `/warehouse-deliveries-admin` | All deliveries, search/filter, edit pending qtys, PDF | Admins |
| `/transfers-report` | Transfers report (Reports nav) | Admins |
| `/sales-report` | Sales report (Reports nav) | Admins |
| `/All-Transfers` | Legacy web capture + PDF (route kept, **removed from side nav**) | Internal / legacy |

## Navigation

### Admin / full-access side panel

- **Overview:** Dashboard, Warehouse Deliveries (`/warehouse-deliveries-admin`)
- **Reports:** Sales Report, Transfers Report
- `/All-Transfers` link removed from the drawer

### Hassan Awad side panel

- Quotationer items (unchanged)
- **Warehouse → Warehouse Deliveries** → `/warehouse-deliveries`
- Allowlist includes `/warehouse-deliveries` (UUID `6b992ac8-8e39-4f31-a323-2271a974da8c`)

Files: `src/AppChrome.js`, `src/accessControl.js`

## Delivery status flow

```
pending  →  completed
   ↑            ↑
 Android     Hassan Accept
  submit     (atomic RPC)
```

Also supported in schema: `submitted` (treated like pending), `accepted` (legacy; migrated to `completed`), `cancelled`, `failed`.

| Status | Meaning |
|--------|---------|
| `pending` | Submitted from Android; waiting for Hassan |
| `completed` | Accepted; inventory moved Factory → Kitwe |
| `cancelled` / `failed` | Terminal non-success |

## Supabase tables

### `warehouse_delivery_sessions`

Key columns:

- `id` (uuid) — primary key
- `delivery_number` — human-readable (`WD-YYYYMMDD-####`)
- `idempotency_key` — unique; duplicate submit prevention
- `from_location`, `to_location`
- `status`, `total_qty`
- `created_by_id`, `created_by_email`
- `created_at`, `transfer_datetime`, `submitted_at`
- `accepted_by`, `accepted_at`, `completed_at`
- `applied_by`, `applied_at` (legacy compatibility)
- `pdf_url`, `sync_status`
- `last_edited_by`, `last_edited_at`
- `metadata`

### `warehouse_delivery_entries`

- `session_id`, `product_id`, `combo_id`, `kind`, `name`, `sku`
- `quantity` — working / approved quantity
- `original_quantity` — first submitted qty
- `edited_quantity` — admin/edited qty
- `dest_stock_before`, `expected_dest_stock` — set on accept

### `warehouse_delivery_events`

Audit log: `session_id`, `event_type`, `actor_id`, `actor_email`, `detail`, `created_at`

Event types: `submitted`, `edited`, `completed`

### Inventory

`inventory` rows for Factory and Kitwe are updated only inside `accept_warehouse_delivery`.

## Supabase RPCs

| Function | Purpose |
|----------|---------|
| `submit_warehouse_delivery(...)` | Atomic create session + items; idempotent |
| `accept_warehouse_delivery(p_session_id, p_accepted_by, p_accepted_by_email)` | Atomic inventory move + mark completed |
| `update_warehouse_delivery_items(p_session_id, p_items, p_edited_by, p_edited_by_email)` | Admin edit pending qtys |
| `next_warehouse_delivery_number()` | Generates `WD-YYYYMMDD-####` |

All inventory-moving / submit functions are `SECURITY DEFINER`.

## Row Level Security

Policies on sessions/entries/events allow select/insert for `anon` + `authenticated` (Android uses anon key today). Session updates restricted to pending/submitted statuses for client updates. Inventory changes go through RPCs, not direct client writes for accept.

## Android login and dashboard

1. Login via `rpc/app_login` (`AuthRepository`)
2. Dashboard with two large buttons: **Create Transfer**, **Completed Deliveries**
3. No location pickers; no advanced settings on the dashboard

## Android create-transfer flow

1. Open Create Transfer → scanner starts (Code 128)
2. Scan product → qty dialog (product name, positive whole numbers only)
3. Confirm → merge into cart → scanner opens again
4. Open Cart → review, +/- (min 1), long-press delete with confirm
5. **Submit Delivery** (disabled if empty / while busy)
6. Success → clear cart → dashboard
7. Failure → keep cart → Retry with same idempotency key

Cart + idempotency key persist in SharedPreferences (`CartStorage`).

## Submission behaviour

- Calls `submit_warehouse_delivery` with locked from/to IDs
- Status `pending`
- Does **not** move inventory
- Unique `idempotency_key` + unique index → retries never create duplicates

## Hassan Awad acceptance

Page: `/warehouse-deliveries`

Shows pending Factory→Kitwe deliveries with:

- Delivery number, status, submitter, times, from/to
- Product list, transfer qty, expected destination stock
- View PDF
- Accept Delivery → `accept_warehouse_delivery`

### WhatsApp on accept

After a successful accept, the web app posts this template to `/api/whatsapp-transfer`:

```
📦 *_Delivery Transfer_*
━━━━━━━━━━━━━━━━━━━━
🏭 *From:* Factory Warehouse
📍 *To:* Kitwe Branch
👤 *Sent By:* John Mwansa

📋 *Products:*
────────────────────
2 * Product Name
────────────────────
1 * Another Product
────────────────────
✅ *Total Delivery Items:* 3
```

**Sent By** uses the employee **name**, not email:

1. Android login returns `users.full_name` via `app_login`
2. Submit stores it on `warehouse_delivery_sessions.created_by_name`
3. If name is missing at submit time, the RPC looks up `users.full_name` by `created_by_id`
4. Email is only a last-resort fallback

Set each Android employee’s name in Supabase on the `public.users` table:

```sql
UPDATE public.users
SET full_name = 'John Mwansa'
WHERE email = 'john@example.com';
```

Also apply:

- `supabase/sql/migrations/20260711_warehouse_deliveries_workflow.sql`
- `supabase/sql/migrations/20260711_warehouse_delivery_created_by_name.sql`

#### Vercel environment variables

| Variable | Value |
|----------|--------|
| `WHATSAPP_PROVIDER` | `whapi` |
| `WHATSAPP_API_TOKEN` | Your Whapi token (channel `GRNLTR-WEWZ3`) |
| `WHATSAPP_TRANSFER_GROUP_ID` | `120363410583418058@g.us` |

Optional fallbacks already used by other flows: `WHATSAPP_LAYBY_GROUP_ID`, `WHATSAPP_SALES_GROUP_ID`, `WHATSAPP_FAHME_GROUP_ID`.

Inventory accept still succeeds even if WhatsApp fails (failure is logged only).

Expected destination stock:

`existing Kitwe qty + final transfer qty`

PDF columns (no Factory remaining qty):

1. Product Name  
2. Transfer Quantity  
3. Expected Stock at Destination  

Implementation: `src/utils/warehouseDeliveryPdf.js`

## Admin editing

Page: `/warehouse-deliveries-admin`

- Search, status filter, sort by `delivery_number` desc
- Edit quantities on **pending** only via `update_warehouse_delivery_items`
- Stores `original_quantity`; writes audit event
- Completed deliveries: editing disabled (inventory already moved)
- View PDF uses the same builder as Hassan

## Completed deliveries (Android)

- Lists `status in (completed, accepted)` for locked from/to
- Cards: delivery #, status, dates, product count, total qty
- PDF button opens `pdf_url` when present; otherwise shows a message that PDF is generated on web

## Important source files

### Web

- `src/AppChrome.js` — navigation
- `src/accessControl.js` — Hassan allowlist
- `src/WarehouseDeliveries.js` — Hassan page
- `src/WarehouseDeliveriesAdmin.js` — admin page
- `src/utils/warehouseDelivery.js` — constants + helpers
- `src/utils/warehouseDeliveryPdf.js` — PDF
- `src/WarehouseTransferSummary.js` — legacy All-Transfers PDF (unchanged route)

### Android

- `.../MainActivity.kt` — UI flow
- `.../data/ProductRepository.kt` — catalog + submit + completed list
- `.../data/CartStorage.kt` — cart persistence
- `.../data/AppConfig.kt` — locations + Supabase URL/key
- `.../data/AuthRepository.kt` — login
- `.../data/SupabaseClient.kt` — REST client

### SQL

- `supabase/sql/migrations/20260711_warehouse_deliveries_workflow.sql`

## Setup instructions

1. Apply the migration in the Supabase SQL editor (or your migration runner):
   `supabase/sql/migrations/20260711_warehouse_deliveries_workflow.sql`
2. Confirm RPCs exist: `submit_warehouse_delivery`, `accept_warehouse_delivery`, `update_warehouse_delivery_items`
3. Deploy / restart the web app so nav + pages pick up changes
4. Rebuild the Android APK from `Android Apps/WarehouseTransfers`
5. Ensure Hassan’s web account UUID is `6b992ac8-8e39-4f31-a323-2271a974da8c` (accept gate)

### Environment / secrets

- Web: existing Supabase client env (`src/supabase.js`)
- Android: URL + anon key currently in `AppConfig.kt` (move to BuildConfig / secrets for production hardening)
- WhatsApp (Vercel): set `WHATSAPP_TRANSFER_GROUP_ID=120363410583418058@g.us` and a real `WHATSAPP_API_TOKEN` (Whapi channel e.g. `GRNLTR-WEWZ3`)

## Testing checklist

- [ ] Android login → dashboard
- [ ] Create Transfer forces scanner → qty → cart
- [ ] +/- and long-press delete
- [ ] Empty cart cannot submit
- [ ] Successful submit appears on Hassan page before physical arrival
- [ ] Kill network mid-submit → cart kept → Retry does not duplicate
- [ ] Admin edits pending qty → Hassan PDF/UI update
- [ ] Hassan PDF shows name, transfer qty, expected dest (not Factory remaining)
- [ ] Accept moves inventory once; second accept is idempotent / no double move
- [ ] Completed deliveries list on Android
- [ ] Nav: no All-Transfers; Reports header; Warehouse Deliveries under Overview; Hassan link present

## Known assumptions / limitations

- Android authenticates via `app_login` and continues using the anon key for REST (same as before). Hardening to user JWTs is a follow-up.
- PDF blob is generated client-side on web; `pdf_url` on the session is optional and may be empty until a future upload step stores it.
- Set/combo building was removed from the employee guided Android flow (products only). Schema still supports set kinds for compatibility.
- Completed inventory corrections require a separate controlled adjustment process (admin edit is blocked after complete).
- Legacy `/All-Transfers` web capture still exists for internal/PDF history but is not linked in the side panel.

## Status of implementation phases

1. Inspect existing systems — done  
2. Database + RLS + RPCs — migration file ready (apply manually)  
3. Android guided flow — done  
4. Hassan page + accept + PDF — done  
5. Admin page — done  
6. Navigation / Reports — done  
7. This documentation — done  
