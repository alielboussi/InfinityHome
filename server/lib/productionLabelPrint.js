/**
 * Warehouse production labels: Zebra Weblink (SendFileToPrinter) when configured,
 * otherwise Windows label worker via label_print_jobs (pre-built ZPL per item).
 */
import {
  isZebraWeblinkPrintConfigured,
  sendWarehouseProductionLabelToZebra,
} from './zebraSendFileToPrinter.js';
import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import { buildWarehouseProductionLabelZpl } from './zebraProductionLabelZpl.js';
import { formatProductionLabelBlockDate } from './warehouseProductionLabelCatTime.js';

export async function enqueueWarehouseProductionLabelJob(db, {
  name,
  sku,
  qty = 1,
  printedBy,
  source = 'warehouse_production_kiosk',
  printedAt: printedAtInput,
  color,
  boxUnitsPerCarton,
}) {
  const labelName = String(name || '').trim();
  const labelSku = String(sku || '').trim();
  const copies = Math.max(1, Math.floor(Number(qty) || 0));
  if (!labelName || !labelSku) return null;

  const printedAt = printedAtInput ? new Date(printedAtInput) : new Date();
  if (Number.isNaN(printedAt.getTime())) {
    throw new Error('Invalid printedAt');
  }
  const operator = String(printedBy || '').trim() || 'Production kiosk';
  const imageQrUrl = buildProductPhotoQrUrl(labelSku);

  const preferCloudOnly = String(process.env.WAREHOUSE_LABEL_CLOUD_ONLY || 'true').trim().toLowerCase() !== 'false';

  if (isZebraWeblinkPrintConfigured()) {
    try {
      await sendWarehouseProductionLabelToZebra({
        name: labelName,
        sku: labelSku,
        qty: copies,
        printedBy: operator,
        printedAt,
        imageQrUrl,
        color,
        boxUnitsPerCarton,
      });
      return 'zebra-weblink';
    } catch (err) {
      console.warn('[productionLabelPrint] Zebra Weblink print failed:', err?.message || err);
      if (String(process.env.ZEBRA_PRINT_FALLBACK_QUEUE || '').trim().toLowerCase() !== 'true') {
        throw err;
      }
    }
  }

  if (preferCloudOnly && !isZebraWeblinkPrintConfigured()) {
    console.warn('[productionLabelPrint] Zebra Weblink not configured; label skipped (set ZEBRA_PRINT_* on Vercel).');
    return null;
  }

  const zpl = buildWarehouseProductionLabelZpl({
    name: labelName,
    sku: labelSku,
    printedAt,
    imageQrUrl,
    color,
    boxUnitsPerCarton,
    copies: 1,
  });

  const payload = {
    job_type: 'warehouse_production',
    source,
    print_date: formatProductionLabelBlockDate(printedAt),
    printed_at: printedAt.toISOString(),
    printed_by: operator,
    items: [{ name: labelName, sku: labelSku, qty: copies, zpl, image_qr_url: imageQrUrl }],
  };

  const { data, error } = await db
    .from('label_print_jobs')
    .insert([{ payload }])
    .select('id')
    .single();
  if (error) {
    console.warn('[productionLabelPrint] enqueue failed:', error.message || error);
    return null;
  }
  return data?.id ? String(data.id) : null;
}
