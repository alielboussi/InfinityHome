/** Unified workshop Orders inbox row kinds (jobs screen). */

export function isCatalogManufactureJob(job) {
  if (!job || typeof job !== 'object') return false;
  const meta = job.metadata && typeof job.metadata === 'object' ? job.metadata : {};
  return meta.catalog_manufacture === true || job.catalog_manufacture === true;
}

export function repairReceiptNumber(row) {
  if (!row || typeof row !== 'object') return '';
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return String(row.receipt_number || meta.receipt_number || '').trim();
}

export function repairInboxCustomerLabel(row, tUi, locale) {
  const customer = String(row?.customer_name || '').trim();
  const receipt = repairReceiptNumber(row);
  if (customer) {
    return receipt ? `${customer} · #${receipt}` : customer;
  }
  return tUi('badgeShowroomOrder', locale);
}

export function repairSearchBlob(row) {
  const receipt = repairReceiptNumber(row);
  const returnNo = String(row?.return_number || '').trim();
  return {
    name: String(row?.customer_name || row?.assembly_name || '').toLowerCase(),
    phone: String(row?.customer_phone || '').replace(/\D/g, ''),
    quoteKeys: [returnNo, receipt].map((v) => String(v || '').toLowerCase()).filter(Boolean),
  };
}