import { dedupeInventoryRows } from './inventoryApi';

/** product_id -> positive on-hand qty at location (after deduping inventory rows). */
export function positiveInventoryByProductAtLocation(inventoryRows, locationId) {
  const loc = String(locationId || '');
  const filtered = dedupeInventoryRows(
    (inventoryRows || []).filter((row) => String(row.location) === loc),
  );
  const byProduct = new Map();
  filtered.forEach((row) => {
    if (!row?.product_id) return;
    const qty = Number(row.quantity) || 0;
    if (qty <= 0) return;
    const key = String(row.product_id);
    byProduct.set(key, (byProduct.get(key) || 0) + qty);
  });
  return byProduct;
}

export async function fetchStocktakeProductRowsAtLocation(sb, locationId) {
  const loc = String(locationId || '');
  if (!loc) return [];

  const { data: invRows, error: invErr } = await sb
    .from('inventory')
    .select('product_id, quantity, location')
    .eq('location', loc);
  if (invErr) throw invErr;

  const byProduct = positiveInventoryByProductAtLocation(invRows, loc);
  const ids = [...byProduct.keys()];
  if (!ids.length) return [];

  const productMap = new Map();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: products, error: pErr } = await sb
      .from('products')
      .select('id, name, sku')
      .in('id', chunk);
    if (pErr) throw pErr;
    (products || []).forEach((p) => productMap.set(String(p.id), p));
  }

  return ids
    .map((productId) => {
      const p = productMap.get(productId) || {};
      return {
        product_id: productId,
        qty: byProduct.get(productId) || 0,
        name: p.name || productId,
        sku: p.sku || '',
      };
    })
    .filter((row) => row.qty > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
