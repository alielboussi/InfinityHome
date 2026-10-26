# Warehouse production — Zebra ZD621 via **Weblink** (cloud)

The **Upholstery Production** Android app prints **product name + Code 128 SKU** when staff create a packet or add stock.

With **Weblink**, the printer connects **outbound** to Zebra Data Services (no Windows print worker on the tablet). Infinity Home calls **SendFileToPrinter** after each save.

Label size defaults: **80 mm × 68 mm** face, **3 mm** gap between labels (0.3 cm), **2 mm** side margin. Override with Vercel env: `ZEBRA_LABEL_WIDTH_MM`, `ZEBRA_LABEL_HEIGHT_MM`, `ZEBRA_LABEL_GAP_MM`, `ZEBRA_LABEL_SIDE_MARGIN_MM`, `ZEBRA_PRINTER_DPI`. ZPL `^LL` uses **pitch** = height + gap.

---

## Part 1 — Zebra developer account & API

1. Create / sign in: [Zebra Developer Portal](https://developer.zebra.com/).
2. **Getting Started with Zebra Data Services** — create an application and subscribe to **SendFileToPrinter** (free tier: 100 calls/day).
3. Note your **API key** (`apikey` header).
4. Get **Tenant ID**:  
   `GET https://api.zebra.com/v2/mytenant` with header `apikey: YOUR_KEY`  
   Use the **`AccountNumber`** value as `tenant`.

---

## Part 2 — Enroll the ZD621 (Weblink config)

1. Connect the printer to **Wi‑Fi** or **Ethernet** (must reach the internet).
2. Load **80 × 68 mm** labels and **calibrate** (hold Feed ~2s or LCD → Media → Calibrate).
3. Portal → **[My Devices](https://developer.zebra.com/my-devices)** → **Add device** → copy the **enrollment code** (`r=…`).
4. Build a file `weblink-config.json` (no spaces inside `{}{}`):

```json
{}{
"weblink.logging.max_entries":"500",
"weblink.ip.conn1.location":"https://savanna-device.zpc.zebra.com/weblink/connect?r=YOUR_ENROLLMENT_CODE",
"device.reset":"1"
}
```

Replace `YOUR_ENROLLMENT_CODE` with the code from step 3 (`r` must be lowercase in the URL).

5. Send the file to the printer with **Zebra Printer Setup Utilities** (Windows/Android/iOS):  
   Printer → **Send file** → select `weblink-config.json` → **Send**.  
   The printer reboots and should connect to Savanna.

6. Verify connection (USB or web UI to printer IP):

```text
! U1 getvar "weblink.ip.conn1.location"
! U1 getvar "weblink"
```

You should see the Savanna URL and a connected state in the weblink log.

**Serial number** (needed for API): print a **configuration label** from the printer menus, or read from the web page at `http://<printer-ip>/`.

---

## Part 3 — Vercel environment (Infinity Home)

Add to the **production** Vercel project:

| Variable | Example | Purpose |
|----------|---------|---------|
| `ZEBRA_PRINT_API_KEY` | from developer portal | SendFileToPrinter |
| `ZEBRA_PRINT_TENANT` | AccountNumber from `/v2/mytenant` | SendFileToPrinter |
| `ZEBRA_PRINTER_SERIAL` | e.g. `XXZJJ174600934` | Target printer |
| `ZEBRA_LABEL_WIDTH_MM` | `80` | Label width |
| `ZEBRA_LABEL_HEIGHT_MM` | `68` | Label face height |
| `ZEBRA_LABEL_GAP_MM` | `3` | Gap between labels (0.3 cm) |
| `ZEBRA_LABEL_SIDE_MARGIN_MM` | `2` | Side margin |
| `ZEBRA_PRINTER_DPI` | `203` | ZD621 dpi |

Optional:

- `ZEBRA_PRINT_FALLBACK_QUEUE=true` — if cloud print fails, fall back to `label_print_jobs` + Windows worker.

Redeploy after setting env vars.

---

## Part 4 — Test print (curl)

Save test ZPL as `test.zpl`:

```zpl
^XA
^FO50,50^A0N,30,30^FDWeblink test^FS
^FO50,120^BY2^BCN,80,Y,N,N^FDTESTSKU12345678^FS
^PQ1
^XZ
```

```bash
curl -H "apikey: YOUR_API_KEY" -H "tenant: YOUR_TENANT" \
  -F "sn=YOUR_PRINTER_SERIAL" -F "zpl_file=@test.zpl" \
  https://api.zebra.com/v2/devices/printers/send
```

If this prints, Weblink + API are correct.

---

## Part 5 — Upholstery Production app

1. Deploy latest API (`production-packet-create` / `production-stock-increase` enqueue labels).
2. In the Android app, **create** an item (qty N → **N** labels via `^PQ` in one API call).
3. **Add stock** on an existing packet (same: one label per unit added).

No label worker PC is required when Weblink + env vars are set.

### Product photo QR (always printed)

Each label includes a **QR code** in the Photo row. It always encodes a stable link:

`https://www.infinity-home.online/api/health?action=product-photo&sku=<packet SKU>`

- The QR is printed **even when no catalog image exists yet** (scanning may show “photo not ready”).
- **Same QR after you add a photo:** the link is tied to the **SKU**, not the image file. When you add a product (or assembly) image for that SKU in the catalog, scans of **old labels** redirect to the new photo automatically.

### Create flow — required product photo (app)

When staff tap **Save production item** in the Android app:

1. The **camera opens** (required — cannot skip).
2. The photo is sent to the API; **Gemini** retouches it for **upholstered seating** on a **white catalog background** (see `PRODUCTION_SEATING_PHOTO_PROMPT` in `server/lib/productionSeatingPhotoRetouch.js`).
3. The retouched JPEG is stored on the warehouse packet (`image_url`) for the packet **SKU**.
4. **Labels print** after the photo is saved (QR on the label opens that SKU’s catalog image).

Requires **`GEMINI_API_KEY_PRODUCTION`** on Vercel (separate from `GEMINI_API_KEY` used elsewhere) — see **`docs/gemini-production-photo-vercel.md`**. For local testing only, `PRODUCTION_PHOTO_SKIP_AI=true` uploads a normalized JPEG without AI.

---

## EMEA / “secure by default” ZD621 (2025+)

If **ping works** but **TCP 9100, HTTP, and HTTPS are refused**, and Weblink commands **hang** or the **download LED stays solid**, the printer likely has **EU RED** defaults: raw TCP, web UI, and file-based config are **off** until you run Zebra’s **Security Setup Wizard**:

1. USB to a PC (Ethernet can stay unplugged for this step).
2. Open [Zebra Security Setup Wizard](https://asr.zpc.zebra.com/index.html) → **ZD621** → generate the setup script (set **Protected Mode** password, enable **TCP/IP raw port 9100**, enable **HTTPS/web** if needed, allow **config file download**).
3. Send the generated file with **Printer Setup Utilities → Send file**, or `copy /b generated-script.txt USB00x`.
4. Power-cycle, plug Ethernet back, then send enrollment JSON from **My Devices** (not hand-typed `setvar` URLs).

**Do not** use `! U1 getvar "weblink.ip.conn1.location"` on a wedged printer — it can lock USB. Confirm enrollment in **[My Devices](https://developer.zebra.com/my-devices)** only.

To clear a bad Weblink URL before re-enrolling, send `weblink-unregister.json` (repo root) the same way as `weblink-config.json`.

---

## Print without cloud (warehouse PC worker)

If Weblink enrollment is blocked, use the **Windows label worker** on the warehouse LAN PC (`label-worker/README.md`):

| Vercel env | Value |
|------------|--------|
| `WAREHOUSE_LABEL_CLOUD_ONLY` | `false` |
| `ZEBRA_PRINT_*` | unset **or** keep with `ZEBRA_PRINT_FALLBACK_QUEUE=true` |

Worker `.env`: `PRINTER_DPI=300` for **300 dpi** ZD621, `PRINTER_NAME` = exact Windows queue (USB or LAN after 9100 is enabled).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API 401/403 | API key, tenant, SendFileToPrinter subscription |
| API 404 / not registered | Weblink not enrolled — My Devices, fresh **Add device** `r=` code |
| API OK, no print | Printer offline in My Devices; avoid `getvar` weblink on USB |
| Ping OK, 9100 refused | EMEA security wizard — enable raw TCP |
| Weblink hang / solid download LED | Send `weblink-unregister.json`, unplug Ethernet, wizard + re-enroll |
| Wrong layout | `ZEBRA_LABEL_*_MM`, dpi, recalibrate media |
| Free tier limit | 100 sends/day — upgrade or batch with `^PQ` (already used) |
| Still uses worker | `WAREHOUSE_LABEL_CLOUD_ONLY=false`; worker runs if cloud unset or `ZEBRA_PRINT_FALLBACK_QUEUE=true` |

---

## References

- [Printer setup for SendFileToPrinter](https://developer.zebra.com/docs/printer-setup-sendfiletoprinter)
- [Weblink basic configuration](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-weblink-using-weblink/c-zpl-weblink-configuring-weblink/t-zpl-weblink-basic-configuration.html)
- [SendFileToPrinter blog / curl example](https://developer.zebra.com/blog/use-sendfiletoprinter-api-your-cloud-based-printing-needs)
