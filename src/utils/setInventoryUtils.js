// Centralized utility for set (combo) inventory calculation and price selection

/**
 * Calculate the maximum possible sets from product stock
 * @param {Array} comboItems - [{product_id, quantity}]
 * @param {Object} productStock - {product_id: qty}
 * @returns {number}
 */
export function getMaxSetQty(comboItems, productStock) {
  if (!comboItems || comboItems.length === 0) return 0;
  let minQty = Infinity;
  for (const item of comboItems) {
    const stock = productStock[item.product_id] || 0;
    if (stock < item.quantity) {
      minQty = 0;
      break;
    }
    minQty = Math.min(minQty, Math.floor(stock / item.quantity));
  }
  return minQty === Infinity ? 0 : minQty;
}

/**
 * Select price for reporting (prefer promotional, fallback to standard)
 * @param {number|string|null} promo
 * @param {number|string|null} standard
 * @returns {number}
 */
export function selectPrice(promo, standard) {
  const p = Number(promo);
  if (promo !== undefined && promo !== null && promo !== '' && !isNaN(p) && p > 0) {
    return p;
  }
  const s = Number(standard);
  if (standard !== undefined && standard !== null && standard !== '' && !isNaN(s) && s > 0) {
    return s;
  }
  return 0;
}

/**
 * Round and format a number to 2 decimal places
 * @param {number} value
 * @returns {string}
 */
export function formatAmount(value) {
  return (Math.round(Number(value) * 100) / 100).toFixed(2);
}
