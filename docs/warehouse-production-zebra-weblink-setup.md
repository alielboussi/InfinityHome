# Warehouse production — Zebra ZD621 via **Weblink** (cloud)

Production kiosk (`/warehouse-production`) prints **product name + Code 128 SKU** when staff create a packet or add stock.

With **Weblink**, the printer connects **outbound** to Zebra Data Services (no Windows print worker on the kiosk). Infinity Home calls **SendFileToPrinter** after each save.

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

## Part 5 — Production kiosk

1. Deploy latest API (`production-packet-create` / `production-stock-increase` enqueue labels).
2. On `/warehouse-production`, **create** an item (qty N → **N** labels via `^PQ` in one API call).
3. **Add stock** on an existing packet (same: one label per unit added).

No label worker PC is required when Weblink + env vars are set.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API 401/403 | API key, tenant, SendFileToPrinter subscription |
| API OK, no print | Printer offline from Savanna — `! U1 getvar "weblink"` |
| Wrong layout | `ZEBRA_LABEL_*_MM`, dpi, recalibrate media |
| Free tier limit | 100 sends/day — upgrade or batch with `^PQ` (already used) |
| Still uses worker | Remove/fallback only if `ZEBRA_PRINT_*` unset; worker runs if `ZEBRA_PRINT_FALLBACK_QUEUE=true` |

---

## References

- [Printer setup for SendFileToPrinter](https://developer.zebra.com/docs/printer-setup-sendfiletoprinter)
- [Weblink basic configuration](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-weblink-using-weblink/c-zpl-weblink-configuring-weblink/t-zpl-weblink-basic-configuration.html)
- [SendFileToPrinter blog / curl example](https://developer.zebra.com/blog/use-sendfiletoprinter-api-your-cloud-based-printing-needs)
