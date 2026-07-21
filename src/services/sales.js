import { checkout as checkoutApi } from './checkout';

// Switch to the shared checkout service so sale header inserts follow the same
// API/fallback path as full checkout flows.

/**
 * Insert a sale via the shared checkout service.
 * Duplicate receipt numbers are rejected with a clear error.
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
