# Label Print Worker (Windows service)

Polls `label_print_jobs` from Infinity Home and prints on a **local Windows printer** (RAW/ZPL).

**Recommended warehouse setup (no Zebra cloud fees):** a small **Windows 11 PC** on the warehouse LAN, **Ethernet** to the **Zebra ZD621**, running this worker as a **Windows service** (NSSM installer below).

| Source | What prints |
|--------|-------------|
| **Warehouse production kiosk** | Create / stock increase → name + Code 128 SKU |
| **Factory / transfers** | Carpentry transfer labels (same queue) |

**Optional:** Zebra Weblink (cloud) instead of a PC — see **`docs/warehouse-production-zebra-weblink-setup.md`**. Leave `ZEBRA_PRINT_*` unset on Vercel when using this worker.

---

## Windows 11 print PC + Ethernet printer

1. **Network:** Connect the ZD621 to the warehouse switch/router with **Ethernet**. Note the printer IP (Zebra Setup Utilities → **Configure Printer Connectivity**).
2. **Driver on the print PC:** Install **ZDesigner ZD621** driver. Add printer → **TCP/IP** → enter printer IP → use **ZPL** port if offered.
3. **Windows name:** Settings → Printers → copy the exact name into `PRINTER_NAME` in `.env`.
4. **Media:** 80×68 mm labels, calibrate (Feed button ~2s).
5. **Worker:** Build `LabelPrinter.exe`, run **`install-service.bat`** (or **`LabelPrinterInstaller.exe`**) so jobs print after reboot without a logged-in user.
6. **Vercel:** `LABEL_WORKER_SECRET` set; **do not** set `ZEBRA_PRINT_API_KEY` / tenant / serial if you want the queue-only path.
7. **Test:** Kiosk create/stock, or `/price-labels` → **Print on label printer** — job should flip `pending` → `done` in `label_print_jobs`.

---

## Zebra ZD621 — Windows worker only (80 × 68 mm labels)

Your labels: **80 mm wide × 68 mm tall**, ~**2 mm** side margin. Use a **203 dpi** ZD621 (standard).

### A) Physical printer

1. Power on, open the cover, load the roll, route under the sensor, close the cover.
2. **Calibrate media:** hold **Feed/Pause** ~2s until the printer feeds and measures the label (or use the LCD: *Settings → Media → Calibrate*).
3. Confirm one label stops at the tear bar after each feed.

### B) Windows driver

1. Connect **USB** (or install Wi‑Fi/Ethernet per Zebra guide).
2. Install **Zebra Setup Utilities** or the **ZDesigner ZD621** driver from [Zebra support](https://www.zebra.com/us/en/support-downloads/printers/desktop/zd621.html).
3. Open **Settings → Bluetooth & devices → Printers & scanners** and note the exact name (e.g. `ZDesigner ZD621-203dpi ZPL`).
4. **Printer preferences → Advanced → Printing Defaults:** set stock to your label size (**80 × 68 mm**), disable “fit to page”.

### C) Test print (ZPL)

1. In Zebra Setup Utilities, send a test label, or create a `.zpl` file and print **RAW** to the printer.
2. If the print is shifted, re-run **calibrate** and check that width is **80 mm** (not A4).

### D) Label worker `.env` (next to `LabelPrinter.exe`)

```env
INFINITY_API_BASE=https://www.infinity-home.online
LABEL_WORKER_SECRET=<same as Vercel env LABEL_WORKER_SECRET>
PRINTER_NAME=ZDesigner ZD621-203dpi ZPL
PRINTER_LANGUAGE=ZPL
LABEL_WIDTH_MM=80
LABEL_HEIGHT_MM=68
LABEL_GAP_MM=3
LABEL_SIDE_MARGIN_MM=2
PRINTER_DPI=203
POLL_INTERVAL_SECONDS=5
```

### E) Build and run the worker

See sections below (`build-exe.bat`, `install-service.bat`). The PC running the worker must stay on and logged in (or run as a service).

### F) Verify end-to-end

1. Deploy the latest API (production label enqueue on create/stock).
2. On the kiosk, create a test item or add stock — check `label_print_jobs` in the database or watch the worker console/service log.
3. Labels should print: **product name** + **Code 128** of the SKU (human-readable under the barcode).

---

## Godex / Xprinter (legacy)

Godex EZ120 ready (EZPL); XP-365B use `PRINTER_LANGUAGE=TSPL` and smaller `LABEL_WIDTH_MM` / `LABEL_HEIGHT_MM`.

## 1) Install Python (build only)
- Install Python 3.10+ from https://www.python.org/downloads/
- Ensure "Add Python to PATH" is checked.

## 2) Configure environment

### Firebase mode (recommended)

Set these in `.env` next to `LabelPrinter.exe`:

- `INFINITY_API_BASE=https://www.infinity-home.online` (your deployed app URL)
- `LABEL_WORKER_SECRET=<same secret as Vercel env LABEL_WORKER_SECRET>`
- `PRINTER_NAME` (the exact Windows printer name)

The worker polls `/api/labels?action=worker-pending` and updates job status via Firestore on the server.

Required env vars in `.env` next to `LabelPrinter.exe`:

- `INFINITY_API_BASE=https://www.infinity-home.online` (your deployed app URL)
- `LABEL_WORKER_SECRET=<same secret as Vercel env LABEL_WORKER_SECRET>`
- `PRINTER_NAME` (the exact Windows printer name)

Optional (defaults tuned for Godex EZ120, 203 dpi):
- `PRINT_SPEED_IPS` (default 4)
- `PRINT_DENSITY` (default 8)
- `PRINTER_LANGUAGE` (default **ZPL** for Zebra; use EZPL for Godex, TSPL for XP-365B)
- `LABEL_WIDTH_MM` / `LABEL_HEIGHT_MM` / `LABEL_SIDE_MARGIN_MM` / `PRINTER_DPI`
- `PRINT_RETRY_COUNT` (default 3)
- `PRINT_RETRY_DELAY_SECONDS` (default 1)

WhatsApp alerts (optional):
- `WHATSAPP_ENABLED=true`
- `WHATSAPP_TOKEN=<Meta WhatsApp Cloud API token>`
- `WHATSAPP_PHONE_NUMBER_ID=<phone number id>`
- `WHATSAPP_MESSAGE=اتطبع لابل على الطابعة ، من فضلك استلمه ولزقه.`
- `WHATSAPP_RECIPIENTS=<comma-separated E.164 numbers>`
- `WHATSAPP_NOTIFY_ON_RECEIVED=true`
- `WHATSAPP_NOTIFY_ON_DONE=false`
- `WHATSAPP_NOTIFY_ON_FAILED=false`

## 3) Build LabelPrinter.exe
```bat
cd "c:\Projects\Infinity Home Point Of Sale\label-worker"
build-exe.bat
```
The executable will be created at:
`dist\LabelPrinter.exe`

## 4) Install Windows Service (NSSM)
1. Download NSSM and place `nssm.exe` in this folder.
2. Double click:
   `install-service.bat`

This creates a Windows Service named **LabelPrinter** (Local System) and starts it.

## 5) Uninstall Windows Service
Double click:
`uninstall-service.bat`

## Optional: Single installer EXE (bundles NSSM + LabelPrinter.exe)
1. Install Inno Setup and ensure `ISCC` is in PATH.
2. Place `nssm.exe` in this folder.
3. Build the EXE and installer:
```bat
build-exe.bat
build-installer.bat
```
The installer EXE will be created at:
`installer\dist-installer\LabelPrinterInstaller.exe`

The installer will:
- Copy `LabelPrinter.exe` and `nssm.exe`
- Create `.env` (if missing) with API base URL, worker secret, and label size prefilled
- Prompt for the Windows printer name and save it into `.env`
- Install the Windows service `LabelPrinter`
- Start the service automatically

## Label layout

| Language | Printer | Barcode |
|----------|---------|---------|
| **ZPL** | Zebra ZD621 | Code 128 SKU |
| EZPL | Godex EZ120 | QR (legacy) |
| TSPL | XP-365B | QR (legacy) |

Warehouse production uses **ZPL + Code 128** when `PRINTER_LANGUAGE=ZPL`.

## Reliability behavior
- Worker retries printer write failures per label (`PRINT_RETRY_COUNT`).
- Job status progresses: `pending -> processing -> done|failed`.
- Android app can poll `label_print_jobs` to confirm if a transfer label is done.

## WhatsApp setup (Cloud API)
1. Create a Meta app and add WhatsApp product.
2. Get a permanent access token (System User token recommended for production).
3. Get your `phone_number_id` from WhatsApp API setup.
4. Add recipient numbers (E.164 format) and ensure they are allowed (or approved template/channel for production).
5. Set `.env` values above and restart the LabelPrinter service.

Current configured message body:
- `اتطبع لابل على الطابعة ، من فضلك استلمه ولزقه.`
