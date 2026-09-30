function rowKey(row) {
  const sku = String(row?.sku || '').trim().toLowerCase();
  const name = String(row?.name || row?.product_name || '').trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  if (name) return `name:${name}`;
  return `id:${row?.product_id || ''}`;
}

/** Merge opening & closing aggregation rows into one line per SKU/name. */
export function mergeOpeningClosingAggregationRows(openingRows = [], closingRows = []) {
  const map = new Map();

  const touch = (row, field) => {
    if (!row) return;
    const key = rowKey(row);
    if (!map.has(key)) {
      map.set(key, {
        name: row.name || row.product_name || '',
        sku: row.sku || '',
        opening_qty: 0,
        closing_qty: 0,
      });
    }
    const entry = map.get(key);
    entry[field] = Number(row.qty ?? row[field] ?? 0);
    if (!entry.name && row.name) entry.name = row.name;
    if (!entry.sku && row.sku) entry.sku = row.sku;
  };

  (openingRows || []).forEach((r) => touch(r, 'opening_qty'));
  (closingRows || []).forEach((r) => touch(r, 'closing_qty'));

  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
  );
}
