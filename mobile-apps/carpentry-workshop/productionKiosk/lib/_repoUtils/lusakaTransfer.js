export const LUSAKA_TRANSFER_FROM_ID = '454a092c-5b12-441e-b99d-216f6fa72198';
export const LUSAKA_TRANSFER_TO_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';

/** One row per product with summed qty (for inventory + transfer entries). */
export function aggregateTransferLineItems(lineItems) {
  const byProduct = new Map();
  for (const row of lineItems || []) {
    const productId = row?.product_id;
    const qty = Number(row.qty) || 0;
    if (!productId || qty <= 0) continue;
    const key = String(productId);
    const existing = byProduct.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      byProduct.set(key, { ...row, product_id: productId, qty });
    }
  }
  return Array.from(byProduct.values());
}

export function buildLusakaTransferDeliveryNumber(transferRef, capturedAt = new Date()) {
  const ref = String(transferRef || '').trim();
  if (ref) return ref;
  const d = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const datePart = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
    : d.toISOString().slice(0, 10).replace(/-/g, '');
  return `KT-LK-${datePart}`;
}
