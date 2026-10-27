export function getMaxSetQty(comboItems, productStock) {
  if (!comboItems || comboItems.length === 0) return 0;
  let minQty = Infinity;
  for (const item of comboItems) {
    const pid = String(item.product_id);
    const stock = Number(productStock[pid] ?? productStock[item.product_id] ?? 0);
    const need = Number(item.quantity) || 0;
    if (need <= 0) continue;
    if (stock < need) {
      minQty = 0;
      break;
    }
    minQty = Math.min(minQty, Math.floor(stock / need));
  }
  return minQty === Infinity ? 0 : minQty;
}
