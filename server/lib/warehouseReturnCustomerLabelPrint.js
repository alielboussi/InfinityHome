import { buildWarehouseReturnCustomerLabelZpl } from './zebraReturnCustomerLabelZpl.js';
import {
  isZebraWeblinkPrintConfigured,
  sendZplToZebraPrinter,
} from './zebraSendFileToPrinter.js';
import { formatProductionLabelBlockDate } from './warehouseProductionLabelCatTime.js';

export async function printWarehouseReturnCustomerLabel(db, {
  name,
  sku,
  customerName,
  customerPhone,
  qty = 1,
  printedBy,
  printedAt,
}) {
  const labelName = String(name || '').trim();
  const labelSku = String(sku || '').trim();
  const custName = String(customerName || '').trim();
  const custPhone = String(customerPhone || '').trim();
  const copies = Math.max(1, Math.floor(Number(qty) || 1));
  if (!labelName || !labelSku) throw new Error('Product name and SKU are required for label.');
  if (!custName) throw new Error('Customer name is required for this label.');

  const at = printedAt ? new Date(printedAt) : new Date();
  const operator = String(printedBy || '').trim() || 'Production kiosk';

  const zpl = buildWarehouseReturnCustomerLabelZpl({
    name: labelName,
    sku: labelSku,
    customerName: custName,
    customerPhone: custPhone || '—',
    copies,
    printedAt: at,
  });

  if (isZebraWeblinkPrintConfigured()) {
    await sendZplToZebraPrinter({ zpl });
    return { channel: 'zebra-weblink', copies };
  }

  const preferCloudOnly = String(process.env.WAREHOUSE_LABEL_CLOUD_ONLY || 'true').trim().toLowerCase() !== 'false';
  if (preferCloudOnly) {
    throw new Error('Zebra printer is not configured on the server.');
  }

  const payload = {
    job_type: 'warehouse_return_customer',
    source: 'warehouse_return_pickup',
    print_date: formatProductionLabelBlockDate(at),
    printed_at: at.toISOString(),
    printed_by: operator,
    items: [{
      name: labelName,
      sku: labelSku,
      qty: copies,
      zpl,
      customer_name: custName,
      customer_phone: custPhone,
    }],
  };

  const { data, error } = await db
    .from('label_print_jobs')
    .insert([{ payload }])
    .select('id')
    .single();
  if (error) throw new Error(error.message || 'Label queue failed.');
  return { channel: 'label_print_jobs', job_id: data?.id, copies };
}
