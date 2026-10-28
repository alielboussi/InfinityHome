# Warehouse delivery note — print from phone or web (Canon MF237w)

No Windows print PC is required. After **Sign Delivery**, the **Production app** opens Android print automatically with a PDF that already contains **two full copies** of the A4 note. Staff can also print from **Warehouse Deliveries** in the browser.

## Canon i-SENSYS MF237w on Ethernet

1. Connect the printer to the warehouse **router/switch** with Ethernet (same network as warehouse Wi‑Fi).
2. Print a **network configuration** page from the printer and note the **IP address**.

### Option A — Print from the Production phone (recommended)

1. Install **Canon PRINT Business** or enable **Default Print Service** / **Mopria** on the Android phone.
2. **Settings → Connected devices → Connection preferences → Printing** → add the MF237w:
   - **IP address** = printer IP, or pick the printer if it appears on the LAN.
3. Connect the phone to the **same Wi‑Fi** as the warehouse (must reach the printer IP).
4. Production app → Kitwe delivery → **Sign Delivery** → confirm.
5. When the **Android print** sheet opens:
   - Select **Canon MF237w** (or the name you added).
   - Leave **Copies = 1** (the PDF already includes **2** complete delivery notes).
   - Tap **Print**.

Tap **Print delivery note** on the done screen to reprint the same way.

### Option B — Print from the web (Hassan / admin)

1. Open **Warehouse Deliveries** on a PC or tablet on the warehouse network (`/warehouse-deliveries` or Hassan’s receiver page).
2. Expand a delivery → **Print delivery note (×2)**.
3. In the browser print dialog, choose the **Canon MF237w** (add it once in Windows/macOS printer settings via **TCP/IP** and the printer IP).
4. Leave **Copies = 1** unless you need extras (the HTML already contains two copies).

**View PDF** still uses the older summary PDF layout; **Print delivery note** uses the same A4 layout as the Production app (driver signature when stored on the session).

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Print dialog never opens | Use Production **APK** (not Expo Go); allow storage/camera if prompted |
| Printer not in the list | Add MF237w by IP in Android Printing settings; same Wi‑Fi as printer |
| Only one copy prints | Set Android **Copies** to 1 — the file has two notes; do not set Copies to 2 unless you want four |
| Signature missing on web print | Sign in on the web app; signature is loaded from Firebase Storage on the session |
| Ethernet OK but phone cannot see printer | Phone Wi‑Fi must be on the same LAN/subnet as the printer IP |

## Labels (Zebra) vs delivery notes (Canon)

- **Zebra labels** — still via **Zebra Weblink** (cloud) or optional Windows label worker; unrelated to delivery A4.
- **Delivery A4** — phone or browser only; no `label_print_jobs` queue for delivery notes.
