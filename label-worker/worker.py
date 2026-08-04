import json
import os
import sys
import time
from datetime import datetime

import requests
import win32print

def _base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _load_env_file():
    env_path = os.path.join(_base_dir(), ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            for line in handle:
                raw = line.strip()
                if not raw or raw.startswith("#") or "=" not in raw:
                    continue
                key, value = raw.split("=", 1)
                key = key.strip()
                value = value.strip().strip("\"").strip("'")
                if key:
                    os.environ[key] = value
    except Exception:
        return


_load_env_file()

INFINITY_API_BASE = os.getenv("INFINITY_API_BASE", "").rstrip("/")
LABEL_WORKER_SECRET = os.getenv("LABEL_WORKER_SECRET", "")
PRINTER_NAME = os.getenv("PRINTER_NAME", "")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "5"))
PRINT_RETRY_COUNT = int(os.getenv("PRINT_RETRY_COUNT", "3"))
PRINT_RETRY_DELAY_SECONDS = float(os.getenv("PRINT_RETRY_DELAY_SECONDS", "1"))
LABEL_WIDTH_MM = float(os.getenv("LABEL_WIDTH_MM", "40"))
LABEL_HEIGHT_MM = float(os.getenv("LABEL_HEIGHT_MM", "46"))
LABEL_GAP_MM = float(os.getenv("LABEL_GAP_MM", "2"))
PRINT_SPEED_IPS = float(os.getenv("PRINT_SPEED_IPS", "4"))
PRINT_DENSITY = int(os.getenv("PRINT_DENSITY", "8"))
PRINTER_LANGUAGE = os.getenv("PRINTER_LANGUAGE", "EZPL").strip().upper()

WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_MESSAGE = os.getenv(
    "WHATSAPP_MESSAGE",
    "اتطبع لابل على الطابعة ، من فضلك استلمه ولزقه.",
).strip() or "اتطبع لابل على الطابعة ، من فضلك استلمه ولزقه."
DEFAULT_WHATSAPP_RECIPIENTS = [
    "+260761331442",
    "+260765079046",
    "+260761543080",
    "+260764657389",
    "+260769082227",
    "+260767928688",
    "+260761755364",
    "+260966959595",
    "+260766200999",
    "+260966920707",
]
WHATSAPP_RECIPIENTS = [
    item.strip()
    for item in os.getenv("WHATSAPP_RECIPIENTS", "").split(",")
    if item.strip()
] or DEFAULT_WHATSAPP_RECIPIENTS
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v21.0").strip() or "v21.0"
WHATSAPP_NOTIFY_ON_RECEIVED = os.getenv("WHATSAPP_NOTIFY_ON_RECEIVED", "true").strip().lower() in ("1", "true", "yes", "on")
WHATSAPP_NOTIFY_ON_DONE = os.getenv("WHATSAPP_NOTIFY_ON_DONE", "false").strip().lower() in ("1", "true", "yes", "on")
WHATSAPP_NOTIFY_ON_FAILED = os.getenv("WHATSAPP_NOTIFY_ON_FAILED", "true").strip().lower() in ("1", "true", "yes", "on")

SUCCESS_STATUS = "done"
PROCESSING_STATUS = "processing"
FAILED_STATUS = "failed"


def _api_headers():
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Label-Worker-Secret": LABEL_WORKER_SECRET,
    }


def _safe_text(value):
    return str(value or "").strip()


def _ascii_bytes(value):
    return _safe_text(value).encode("ascii", "replace")


def _whatsapp_to_number(value):
    raw = _safe_text(value)
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits


def _mm_to_dots(mm):
    return int(round(mm * 8))


def _print_date(payload):
    raw = payload.get("print_date") if isinstance(payload, dict) else None
    if raw:
        return _safe_text(raw)
    return datetime.now().strftime("%d/%m/%Y")


def fetch_pending_jobs():
    url = f"{INFINITY_API_BASE}/api/labels"
    params = {"action": "worker-pending", "limit": "10"}
    resp = requests.get(url, headers=_api_headers(), params=params, timeout=20)
    resp.raise_for_status()
    payload = resp.json() or {}
    return payload.get("jobs") or []


def update_job(job_id, status, error_text=None):
    url = f"{INFINITY_API_BASE}/api/labels"
    params = {"action": "worker-update"}
    body = {"id": job_id, "status": status, "error": error_text}
    resp = requests.post(url, headers=_api_headers(), params=params, data=json.dumps(body), timeout=20)
    resp.raise_for_status()


def send_whatsapp_alert(message=None):
    if not WHATSAPP_ENABLED:
        return
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_RECIPIENTS:
        return
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    for recipient in WHATSAPP_RECIPIENTS:
        to_number = _whatsapp_to_number(recipient)
        if not to_number:
            continue
        body = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "text",
            "text": {"preview_url": False, "body": _safe_text(WHATSAPP_MESSAGE)[:3900]},
        }
        try:
            resp = requests.post(url, headers=headers, data=json.dumps(body), timeout=20)
            resp.raise_for_status()
        except Exception as err:
            print(f"WhatsApp alert failed for {recipient}: {err}")


def send_raw(printer_name, data):
    handle = win32print.OpenPrinter(printer_name)
    try:
        doc_info = ("LabelPrintJob", None, "RAW")
        job = win32print.StartDocPrinter(handle, 1, doc_info)
        win32print.StartPagePrinter(handle)
        win32print.WritePrinter(handle, data)
        win32print.EndPagePrinter(handle)
        win32print.EndDocPrinter(handle)
        return job
    finally:
        win32print.ClosePrinter(handle)


def build_tspl_label(name, sku, print_date, printed_by=None):
    name_text = _ascii_bytes(name)
    sku_text = _ascii_bytes(sku)
    date_text = _ascii_bytes(print_date)
    printed_by_text = _ascii_bytes(printed_by)
    width_dots = _mm_to_dots(LABEL_WIDTH_MM)
    height_dots = _mm_to_dots(LABEL_HEIGHT_MM)

    def wrap_text(value, max_chars=22, max_lines=2):
        words = _safe_text(value).split()
        lines = []
        current = ""
        for word in words:
            if not current:
                current = word
            elif len(current) + 1 + len(word) <= max_chars:
                current += " " + word
            else:
                lines.append(current)
                current = word
                if len(lines) >= max_lines:
                    break
        if len(lines) < max_lines and current:
            lines.append(current)
        return lines[:max_lines]

    border_offset = 4
    printable_width = max(0, width_dots - (border_offset * 2))

    def center_x(text, char_width=12):
        raw = _safe_text(text)
        text_width = len(raw) * char_width
        return max(border_offset + 6, int(border_offset + (printable_width - text_width) / 2))

    name_lines = wrap_text(name_text.decode("ascii", "replace"))

    lines = [
        f"SIZE {LABEL_WIDTH_MM} mm,{LABEL_HEIGHT_MM} mm",
        f"GAP {LABEL_GAP_MM} mm,0 mm",
        f"SPEED {PRINT_SPEED_IPS}",
        f"DENSITY {PRINT_DENSITY}",
        "DIRECTION 1",
        "CLS",
        f"BOX {border_offset},{border_offset},{width_dots - border_offset},{height_dots - border_offset},4",
        f"TEXT {center_x('Bestrest Furniture')},20,\"0\",0,1,1,\"Bestrest Furniture\"",
        f"TEXT {center_x('Product Name:')},50,\"0\",0,1,1,\"Product Name:\"",
    ]

    y_cursor = 74
    for line in name_lines:
        lines.append(f"TEXT {center_x(line)},{y_cursor},\"0\",0,1,1,\"{line}\"")
        y_cursor += 24

    lines.extend([
        f"TEXT {center_x('QR Code:')},{y_cursor + 6},\"0\",0,1,1,\"QR Code:\"",
        f"QRCODE {center_x('') + 40},{y_cursor + 30},L,4,A,0,M2,S7,\"{sku_text.decode('ascii', 'replace')}\"",
        f"TEXT {center_x('Date Printed:')},{height_dots - 70},\"0\",0,1,1,\"Date Printed: {date_text.decode('ascii', 'replace')}\"",
    ])

    if printed_by_text.strip():
        lines.append(
            f"TEXT {center_x('Printed By:')},{height_dots - 45},\"0\",0,1,1,\"Printed By: {printed_by_text.decode('ascii', 'replace')}\""
        )

    lines.append("PRINT 1,1")

    return ("\r\n".join(lines) + "\r\n").encode("ascii", "replace")


def build_ezpl_label(name, sku, print_date, printed_by=None):
    width_dots = _mm_to_dots(LABEL_WIDTH_MM)
    height_dots = _mm_to_dots(LABEL_HEIGHT_MM)
    border_offset = 4
    inner_width = max(0, width_dots - 32)

    name_text = _safe_text(name)
    sku_text = _safe_text(sku)
    date_text = _safe_text(print_date)
    printed_by_text = _safe_text(printed_by)

    def wrap_text(value, max_chars=26, max_lines=2):
        words = _safe_text(value).split()
        lines = []
        current = ""
        for word in words:
            if not current:
                current = word
            elif len(current) + 1 + len(word) <= max_chars:
                current += " " + word
            else:
                lines.append(current)
                current = word
                if len(lines) >= max_lines:
                    break
        if len(lines) < max_lines and current:
            lines.append(current)
        return lines[:max_lines]

    name_lines = wrap_text(name_text)
    first_line = name_lines[0] if name_lines else ""
    second_line = name_lines[1] if len(name_lines) > 1 else ""

    lines = [
        "^XA",
        f"^PW{width_dots}",
        f"^LL{height_dots}",
        "^LS0",
        f"^FO{border_offset},{border_offset}^GB{width_dots - (border_offset * 2)},{height_dots - (border_offset * 2)},4^FS",
        f"^FO16,20^A0N,24,24^FB{inner_width},1,0,C,0^FDBestrest Furniture^FS",
        f"^FO16,50^A0N,18,18^FB{inner_width},1,0,C,0^FDProduct Name:^FS",
        f"^FO16,70^A0N,20,20^FB{inner_width},1,0,C,0^FD{first_line}^FS",
        f"^FO16,92^A0N,20,20^FB{inner_width},1,0,C,0^FD{second_line}^FS",
        f"^FO{int((width_dots - 100) / 2)},150^BQN,2,4^FDLA,{sku_text}^FS",
        f"^FO16,290^A0N,18,18^FB{inner_width},1,0,C,0^FDDate Printed: {date_text}^FS",
    ]

    if printed_by_text:
        lines.append(f"^FO16,312^A0N,18,18^FB{inner_width},2,0,C,0^FDPrinted By: {printed_by_text}^FS")

    lines.append("^PQ1")
    lines.append("^XZ")

    return ("\r\n".join(lines) + "\r\n").encode("ascii", "replace")


def process_job(job):
    job_id = job.get("id")
    payload = job.get("payload") or {}
    items = payload.get("items") if isinstance(payload, dict) else []
    if not isinstance(items, list) or not items:
        update_job(job_id, FAILED_STATUS, "No items to print.")
        return

    update_job(job_id, PROCESSING_STATUS, None)

    transfer_id = _safe_text(payload.get("transfer_id"))
    item_count = 0
    try:
        item_count = len(items)
    except Exception:
        item_count = 0
    if WHATSAPP_NOTIFY_ON_RECEIVED:
        send_whatsapp_alert()

    print_date = _print_date(payload)
    printed_by = _safe_text(
        payload.get("printed_by")
        or payload.get("user_full_name")
        or payload.get("full_name")
        or payload.get("user_name")
    )

    for item in items:
        name = _safe_text(item.get("name"))
        sku = _safe_text(item.get("sku"))
        qty = int(item.get("qty") or 1)
        qty = max(qty, 1)
        for _ in range(qty):
            if PRINTER_LANGUAGE == "TSPL":
                label_payload = build_tspl_label(name, sku, print_date, printed_by)
            else:
                label_payload = build_ezpl_label(name, sku, print_date, printed_by)
            last_err = None
            for attempt in range(1, max(1, PRINT_RETRY_COUNT) + 1):
                try:
                    send_raw(PRINTER_NAME, label_payload)
                    last_err = None
                    break
                except Exception as err:
                    last_err = err
                    if attempt < max(1, PRINT_RETRY_COUNT):
                        time.sleep(max(0.0, PRINT_RETRY_DELAY_SECONDS))
            if last_err is not None:
                raise last_err

    update_job(job_id, SUCCESS_STATUS, None)
    if WHATSAPP_NOTIFY_ON_DONE:
        send_whatsapp_alert()


def main():
    if not INFINITY_API_BASE or not LABEL_WORKER_SECRET:
        raise SystemExit("Configure INFINITY_API_BASE and LABEL_WORKER_SECRET in .env")
    if not PRINTER_NAME:
        raise SystemExit("Missing PRINTER_NAME.")

    while True:
        try:
            jobs = fetch_pending_jobs()
            for job in jobs:
                try:
                    process_job(job)
                except Exception as err:
                    job_id = job.get("id")
                    if job_id:
                        update_job(job_id, FAILED_STATUS, str(err))
                    if WHATSAPP_NOTIFY_ON_FAILED:
                        send_whatsapp_alert()
        except KeyboardInterrupt:
            return
        except Exception as err:
            print(f"Worker error: {err}")
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
