import { checkout as checkoutApi } from './checkout';

// Switch to the shared checkout service so sale header inserts follow the same
// API/fallback path as full checkout flows.

/**
 * Insert a sale with robust duplicate-receipt handling.
 * If unique constraint ux_sales_receipt_unique_except_fahme blocks the insert,
 * we suffix the provided receipt_number with " (n)" where n is next occurrence count.
 * Returns { data, error, storedReceiptNumber } where storedReceiptNumber is the final value used.
 */
export async function createSale(sale) {
  const { data, error } = await checkoutApi({ sale });
  if (error || !data?.ok) {
    return {
      data: null,
      error: error || new Error('Failed to create sale'),
      storedReceiptNumber: sale?.receipt_number || null,
    };
  }
  return {
    data: data.sale,
    error: null,
    storedReceiptNumber: data.storedReceiptNumber || sale?.receipt_number || null,
  };
}
