const FLOOR1_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';

export function quoteUsesFloor1FinishedStock(quote) {
  if (!quote) return false;
  if (quote.floor1_order_fulfillment === true) return true;
  return (quote.manual_material_lines || []).some((row) => {
    const loc = String(row?.warehouse_location_id || '').trim();
    if (loc && loc === FLOOR1_LOCATION_ID) return true;
    return /floor\s*1/i.test(String(row?.storeroom_label || ''));
  });
}
