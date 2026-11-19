/** Qty for line math: blank defaults to 1; explicit 0 stays 0 unless price is set (legacy saves). */
export function resolveQuoteLineQuantity(quantity, unitPrice = 0) {
  if (quantity === '' || quantity === null || quantity === undefined) return 1;
  const n = Number(quantity);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0 && Number(unitPrice || 0) > 0) return 1;
  return n;
}