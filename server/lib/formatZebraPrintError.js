/**
 * User-facing message for Zebra SendFileToPrinter failures (avoid dumping raw JSON in the app).
 */
export function formatZebraPrintError(err) {
  const raw = String(err?.message || err || '').trim();
  if (!raw) return 'Label could not be sent to the printer.';

  try {
    const json = JSON.parse(raw);
    const block = json?.errorResponse || json?.error || json;
    const info = String(block?.info || block?.message || '').trim();
    const code = String(block?.code || '').trim();
    if (/invalid api key/i.test(info) || code === '401') {
      return 'Labels were not printed: Zebra API key is invalid (401). Update ZEBRA_PRINT_API_KEY on Vercel to match Zebra Data Services.';
    }
    if (info) return `Labels were not printed: ${info}${code ? ` (${code})` : ''}.`;
  } catch {
    // not JSON
  }

  if (/401|Unauthorized|Invalid API key/i.test(raw)) {
    return 'Labels were not printed: Zebra API key is invalid. Check ZEBRA_PRINT_API_KEY, ZEBRA_PRINT_TENANT, and ZEBRA_PRINTER_SERIAL on Vercel.';
  }

  return `Labels were not printed: ${raw.length > 220 ? `${raw.slice(0, 220)}…` : raw}`;
}
