import { buildWarehouseProductionLabelZpl } from './zebraProductionLabelZpl.js';

const ZEBRA_SEND_URL = 'https://api.zebra.com/v2/devices/printers/send';

function zebraPrintConfig() {
  const apiKey = String(process.env.ZEBRA_PRINT_API_KEY || process.env.ZEBRA_PRINT_APIKEY || '').trim();
  const tenant = String(process.env.ZEBRA_PRINT_TENANT || '').trim();
  const serial = String(process.env.ZEBRA_PRINTER_SERIAL || process.env.ZEBRA_PRINTER_SN || '').trim();
  if (!apiKey || !tenant || !serial) return null;
  return { apiKey, tenant, serial };
}

/**
 * Print via Zebra Data Services (printer must use Weblink to Savanna — see docs).
 */
export async function sendZplToZebraPrinter({ zpl, serialNumbers } = {}) {
  const cfg = zebraPrintConfig();
  if (!cfg) {
    throw new Error('Zebra cloud print is not configured (ZEBRA_PRINT_API_KEY, ZEBRA_PRINT_TENANT, ZEBRA_PRINTER_SERIAL).');
  }
  const zplText = String(zpl || '').trim();
  if (!zplText) throw new Error('Empty ZPL');

  const sns = Array.isArray(serialNumbers) && serialNumbers.length
    ? serialNumbers.map((s) => String(s).trim()).filter(Boolean)
    : [cfg.serial];

  const form = new FormData();
  sns.forEach((sn) => form.append('sn', sn));
  form.append('zpl_file', new Blob([zplText], { type: 'text/plain' }), 'production-label.zpl');

  const response = await fetch(ZEBRA_SEND_URL, {
    method: 'POST',
    headers: {
      apikey: cfg.apiKey,
      tenant: cfg.tenant,
    },
    body: form,
  });

  const bodyText = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(bodyText || `Zebra SendFileToPrinter failed (${response.status})`);
  }
  return { ok: true, response: bodyText };
}

export async function sendWarehouseProductionLabelToZebra({
  name,
  sku,
  qty = 1,
  printedBy,
  printedAt,
  imageQrUrl,
}) {
  const at = printedAt ? new Date(printedAt) : new Date();
  const zpl = buildWarehouseProductionLabelZpl({
    name,
    sku,
    copies: qty,
    printedAt: at,
    imageQrUrl,
  });
  return sendZplToZebraPrinter({ zpl });
}

export function isZebraWeblinkPrintConfigured() {
  return Boolean(zebraPrintConfig());
}
