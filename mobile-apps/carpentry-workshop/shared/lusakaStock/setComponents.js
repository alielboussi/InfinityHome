export function buildProductById(products = []) {
  const map = new Map();
  (products || []).forEach((product) => {
    if (product?.id) map.set(String(product.id), product);
  });
  return map;
}

export function buildSetComponents(comboId, comboItems, productById, stockByProduct) {
  const items = (comboItems || []).filter((row) => String(row.combo_id) === String(comboId));
  return items
    .map((item) => {
      const product = productById.get(String(item.product_id));
      return {
        productId: String(item.product_id),
        name: product?.name || product?.sku || 'Product',
        sku: product?.sku || '',
        qty: stockByProduct.get(String(item.product_id)) || 0,
        requiredQty: Number(item.quantity) || 1,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
