# Label Print Worker (Windows 10 Service, Xprinter XP-365B)

This worker polls `label_print_jobs` and prints labels over USB (Godex EZ120 ready).

## 1) Install Python (build only)
- Install Python 3.10+ from https://www.python.org/downloads/
- Ensure "Add Python to PATH" is checked.

## 2) Configure environment

### Firebase mode (recommended)

Set these in `.env` next to `LabelPrinter.exe`:

- `INFINITY_API_BASE=https://infinity-home-pi.vercel.app` (your deployed app URL)
- `LABEL_WORKER_SECRET=<same secret as Vercel env LABEL_WORKER_SECRET>`
- `PRINTER_NAME` (the exact Windows printer name)

The worker polls `/api/labels?action=worker-pending` and updates job status via Firestore on the server. No Supabase credentials are needed.

### Legacy Supabase mode (deprecated)

If `INFINITY_API_BASE` is not set, the worker falls back to Supabase REST:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

You only need to set:
- `PRINTER_NAME` (the exact Windows printer name)

Optional (defaults tuned for Godex EZ120, 203 dpi):
- `PRINT_SPEED_IPS` (default 4)
- `PRINT_DENSITY` (default 8)
- `PRINTER_LANGUAGE` (default EZPL; use TSPL for XP-365B)
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
- Create `.env` (if missing) with Supabase key + label size prefilled
- Prompt for the Windows printer name and save it into `.env`
- Install the Windows service `LabelPrinter`
- Start the service automatically

## Label layout (TSPL)
- Top row: Product name (TEXT)
- Lower row: Code128 barcode for SKU + print date
- Label size: 40x46 mm with 2 mm gap

Supported printer languages:
- EZPL (default, Godex EZ120)
- TSPL (for XP-365B)

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
