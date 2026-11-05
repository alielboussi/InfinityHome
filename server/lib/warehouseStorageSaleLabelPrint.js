import { buildWarehouseStorageSaleLabelZpl } from './zebraWarehouseStorageSaleLabelZpl.js';
import {
  isZebraWeblinkPrintConfigured,
  sendZplToZebraPrinter,
} from './zebraSendFileToPrinter.js';

export async function printWarehouseStorageSaleLabel(db, {
  name,
  sku,
  customerName,
  customerPhone,
  qty = 1,
  saleDate,
  printedBy,
}) {
  const labelName = String(name || '').trim();
  const labelSku = String(sku || '').trim();
  const custName = String(customerName || '').trim() || '—';
  const custPhone = String(customerPhone || '').trim() || '—';
  const copies = Math.max(1, Math.floor(Number(qty) || 1));
  if (!labelName || !labelSku) throw new Error('Product name and SKU are required for label.');

  const zpl = buildWarehouseStorageSaleLabelZpl({
    name: labelName,
    sku: labelSku,
    customerName: custName,
    customerPhone: custPhone,
    copies,
    saleDate: saleDate || new Date(),
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
    job_type: 'warehouse_storage_sale',
    source: 'warehouse_storage_send',
    printed_by: String(printedBy || '').trim() || 'Warehouse Storage',
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
