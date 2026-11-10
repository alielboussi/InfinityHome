import db from '../dataClient';
import { getCurrentUser } from '../accessControl';

function resolvePrintedBy() {
  const user = getCurrentUser();
  const name = String(user?.full_name || user?.name || '').trim();
  if (name) return name;
  const email = String(user?.email || '').trim();
  return email || 'Price labels';
}

/**
 * Enqueue thermal label jobs for the Windows label worker (Zebra / Godex / TSPL).
 * @param {object} opts
 * @param {Array<{ name: string, sku: string, qty: number, standard?: number, promo?: number, currency?: string, printStandardOnly?: boolean, type?: string }>} opts.items
 * @param {string} [opts.locationName]
 */
export async function enqueuePriceLabelPrintJobs({ items, locationName = '' } = {}) {
  const cleanItems = (Array.isArray(items) ? items : [])
    .map((row) => {
      const name = String(row?.name || '').trim();
      const sku = String(row?.sku || '').trim();
      const qty = Math.max(1, Math.floor(Number(row?.qty) || 0));
      if (!name || !sku) return null;
      return {
        name,
        sku,
        qty,
        standard: row.standard,
        promo: row.promo,
        currency: row.currency,
        print_standard_only: Boolean(row.printStandardOnly),
        type: row.type || 'product',
      };
    })
    .filter(Boolean);

  if (!cleanItems.length) {
    return { ok: false, error: 'No valid items to print (name and SKU required).' };
  }

  const payload = {
    job_type: 'price_label',
    source: 'price_labels_page',
    location_name: String(locationName || '').trim(),
    print_date: new Date().toLocaleDateString('en-GB'),
    printed_by: resolvePrintedBy(),
    items: cleanItems,
  };

  const { data, error } = await db
    .from('label_print_jobs')
    .insert([{ payload }])
    .select('id,status,created_at')
    .single();

  if (error) {
    return { ok: false, error: error.message || String(error) };
  }
  return { ok: true, jobId: data?.id ? String(data.id) : null, job: data };
}
