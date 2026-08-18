export function parseSkuNumber(sku) {
  const raw = String(sku || '').trim();
  const match = raw.match(/^#?(\d+)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isNaN(num) ? null : num;
}

export function formatAutoSku(num) {
  return `#${String(num).padStart(5, '0')}`;
}

export function collectUsedSkuNumbersFromRows(rows = []) {
  const used = new Set();
  (rows || []).forEach((row) => {
    const num = parseSkuNumber(row?.sku);
    if (num !== null) used.add(num);
  });
  return used;
}

export function nextAutoSkuFromUsedNumbers(usedNumbers) {
  let i = 1;
  while (usedNumbers.has(i)) i += 1;
  usedNumbers.add(i);
  return formatAutoSku(i);
}

export async function fetchAllCatalogSkuRows(db) {
  const [productsRes, combosRes] = await Promise.all([
    db.from('products').select('sku'),
    db.from('combos').select('sku'),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (combosRes.error) throw combosRes.error;
  return [...(productsRes.data || []), ...(combosRes.data || [])];
}

/** Smallest unused #00001-style SKU across both products and sets. */
export async function getNextAutoSku(db) {
  const rows = await fetchAllCatalogSkuRows(db);
  const used = collectUsedSkuNumbersFromRows(rows);
  return nextAutoSkuFromUsedNumbers(used);
}

export async function skuExistsInCatalog(db, sku, { excludeProductId, excludeComboId } = {}) {
  const normalized = String(sku || '').trim();
  if (!normalized) return false;

  const [combosRes, productsRes] = await Promise.all([
    db.from('combos').select('id').eq('sku', normalized).limit(5),
    db.from('products').select('id').eq('sku', normalized).limit(5),
  ]);

  const comboHit = (combosRes.data || []).some(
    (row) => excludeComboId == null || String(row.id) !== String(excludeComboId),
  );
  const productHit = (productsRes.data || []).some(
    (row) => excludeProductId == null || String(row.id) !== String(excludeProductId),
  );

  return comboHit || productHit;
}
