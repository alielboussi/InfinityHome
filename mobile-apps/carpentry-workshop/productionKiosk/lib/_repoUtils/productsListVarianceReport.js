import { sumInventoryAdjustmentsByProduct } from './inventoryVarianceAdjustments';
import { sumSales, sumTransfers } from './stocktakeCountSheetRows';

const CHUNK_SIZE = 200;

function mapQty(map, productId) {
  if (!map || productId == null) return 0;
  const key = String(productId);
  if (map.has(key)) return Number(map.get(key) || 0);
  if (map.has(productId)) return Number(map.get(productId) || 0);
  return 0;
}

/**
 * Period stock rows for products-list (filtered product IDs at one location + stock period).
 */
export async function buildProductsListVarianceRows(sb, {
  period,
  locationId,
  productIds,
  getCurrentQty,
}) {
  const ids = [...new Set((productIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length || !period?.id || !locationId) return [];

  const startISO = period.begin_period_date || period.opened_at;
  const endISO = period.end_period_date || period.closed_at || new Date().toISOString();
  const sessionId = period.id;

  const { data: opening } = await sb
    .from('opening_stock_entries')
    .select('product_id, qty')
    .eq('session_id', sessionId);
  const openingMap = new Map((opening || []).map((r) => [String(r.product_id), Number(r.qty || 0)]));

  const transfersIn = await sumTransfers(sb, locationId, startISO, endISO, 'in');
  const salesMap = await sumSales(sb, locationId, startISO, endISO);
  const { inMap: inventoryIn } = await sumInventoryAdjustmentsByProduct(sb, {
    locationId,
    startISO,
    endISO,
  });

  const productMap = new Map();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { data: products } = await sb
      .from('products')
      .select('id, name, sku')
      .in('id', chunk);
    (products || []).forEach((p) => productMap.set(String(p.id), p));
  }

  const rows = ids.map((productId) => {
    const pid = String(productId);
    const p = productMap.get(pid) || {};
    const openingQty = mapQty(openingMap, pid);
    const tin = mapQty(transfersIn, pid);
    const invIn = mapQty(inventoryIn, pid);
    const sales = mapQty(salesMap, pid);
    const currentQty = typeof getCurrentQty === 'function'
      ? Number(getCurrentQty(productId) || 0)
      : 0;
    const stockIn = invIn + tin;

    return {
      sku: p.sku || '',
      product_name: p.name || pid,
      opening_stock_qty: openingQty,
      stock_in: stockIn,
      sales,
      current_stock_qty: currentQty,
    };
  });

  return rows.sort((a, b) => String(a.product_name).localeCompare(String(b.product_name), undefined, {
    sensitivity: 'base',
    numeric: true,
  }));
}
