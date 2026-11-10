import {
  collectUsedSkuNumbersFromRows,
  fetchAllCatalogSkuRows,
  nextAutoSkuFromUsedNumbers,
} from './autoSku';

export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function isDuplicateSkuError(err) {
  const code = String(err?.code || '').toLowerCase();
  const status = String(err?.status || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  const details = String(err?.details || '').toLowerCase();
  return code === '23505'
    || code === 'pgrst409'
    || status === '409'
    || msg.includes('products_sku_key')
    || msg.includes('duplicate key')
    || details.includes('products_sku_key');
}

function parseOptionalNumber(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalString(value) {
  const raw = value == null ? '' : String(value).trim();
  return raw || null;
}

function buildHeaderIndex(headerRow) {
  const header = headerRow.map((h) => String(h || '').trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  return {
    name: idx('name'),
    sku: idx('sku'),
    sku_type: idx('sku_type'),
    cost_price: idx('cost_price'),
    price: idx('price'),
    promotional_price: idx('promotional_price'),
    promo_start_date: idx('promo_start_date'),
    promo_end_date: idx('promo_end_date'),
    currency: idx('currency'),
    category_id: idx('category_id'),
    category_name: header.includes('category_name') ? idx('category_name') : idx('category'),
    unit_of_measure_id: idx('unit_of_measure_id'),
    unit_of_measure: header.includes('unit_of_measure') ? idx('unit_of_measure') : idx('unit'),
  };
}

function resolveCategoryId(cols, headerIdx, categories) {
  if (headerIdx.category_id >= 0) {
    const raw = parseOptionalString(cols[headerIdx.category_id]);
    if (raw) return raw;
  }
  if (headerIdx.category_name >= 0) {
    const name = parseOptionalString(cols[headerIdx.category_name]);
    if (!name) return null;
    const match = (categories || []).find(
      (cat) => String(cat.name || '').trim().toLowerCase() === name.toLowerCase(),
    );
    return match?.id ?? null;
  }
  return null;
}

function resolveUnitId(cols, headerIdx, units) {
  if (headerIdx.unit_of_measure_id >= 0) {
    const raw = parseOptionalString(cols[headerIdx.unit_of_measure_id]);
    if (raw) return raw;
  }
  if (headerIdx.unit_of_measure >= 0) {
    const raw = parseOptionalString(cols[headerIdx.unit_of_measure]);
    if (!raw) return null;
    const needle = raw.toLowerCase();
    const match = (units || []).find((unit) => {
      const name = String(unit.name || '').trim().toLowerCase();
      const abbr = String(unit.abbreviation || '').trim().toLowerCase();
      return name === needle || abbr === needle;
    });
    return match?.id ?? null;
  }
  return null;
}

function shouldUseAutoSku(cols, headerIdx) {
  const skuType = headerIdx.sku_type >= 0
    ? String(cols[headerIdx.sku_type] || '').trim().toLowerCase()
    : '';
  const sku = headerIdx.sku >= 0 ? String(cols[headerIdx.sku] || '').trim() : '';
  if (skuType === 'auto') return true;
  if (skuType === 'manual') return false;
  return !sku;
}

async function insertProductWithSkuRetry(db, baseProductData, initialSku, usedSkuNumbers, usedManualSkus) {
  let attempt = 0;
  let skuCandidate = initialSku;
  let lastError = null;

  while (attempt < 8) {
    if (usedManualSkus.has(String(skuCandidate).toLowerCase())) {
      if (baseProductData.sku_type) {
        skuCandidate = nextAutoSkuFromUsedNumbers(usedSkuNumbers);
        attempt += 1;
        continue;
      }
      throw new Error(`SKU ${skuCandidate} is duplicated in the import file.`);
    }

    const { data: insertedRow, error: insertError } = await db
      .from('products')
      .insert([{ ...baseProductData, sku: skuCandidate }])
      .select('id, sku')
      .single();

    if (!insertError) {
      usedManualSkus.add(String(insertedRow.sku || skuCandidate).toLowerCase());
      return insertedRow;
    }

    lastError = insertError;
    if (isDuplicateSkuError(insertError)) {
      if (baseProductData.sku_type) {
        skuCandidate = nextAutoSkuFromUsedNumbers(usedSkuNumbers);
        attempt += 1;
        continue;
      }
      throw new Error(`SKU ${skuCandidate} already exists.`);
    }
    throw insertError;
  }

  if (lastError) throw lastError;
  throw new Error('Unable to assign a unique SKU automatically.');
}

export async function importProductsFromCsv({
  csvText,
  db,
  categories = [],
  units = [],
  locationIds = [],
  syncProductLocations,
  seedProductLocationPricesForLocations,
}) {
  const lines = String(csvText || '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV has no data rows.');
  }

  const headerIdx = buildHeaderIndex(parseCsvLine(lines[0]));
  if (headerIdx.name < 0) {
    throw new Error('CSV must include a name column.');
  }

  const cleanLocationIds = Array.from(new Set((locationIds || []).map((id) => String(id)).filter(Boolean)));
  if (!cleanLocationIds.length) {
    throw new Error('No locations are available to assign imported products.');
  }

  const existingSkuRows = await fetchAllCatalogSkuRows(db);

  const usedSkuNumbers = collectUsedSkuNumbersFromRows(existingSkuRows || []);
  const usedManualSkus = new Set(
    (existingSkuRows || [])
      .map((row) => String(row?.sku || '').trim().toLowerCase())
      .filter(Boolean),
  );

  const result = {
    imported: 0,
    skipped: 0,
    errors: [],
    productIds: [],
  };

  for (let lineNo = 2; lineNo <= lines.length; lineNo += 1) {
    const cols = parseCsvLine(lines[lineNo - 1]);
    const name = headerIdx.name >= 0 ? String(cols[headerIdx.name] || '').trim() : '';
    if (!name) {
      result.skipped += 1;
      continue;
    }

    try {
      const useAutoSku = shouldUseAutoSku(cols, headerIdx);
      const manualSku = headerIdx.sku >= 0 ? String(cols[headerIdx.sku] || '').trim() : '';
      const sku = useAutoSku ? nextAutoSkuFromUsedNumbers(usedSkuNumbers) : manualSku;
      if (!sku) {
        throw new Error('SKU is required when sku_type is manual.');
      }

      const price = parseOptionalNumber(headerIdx.price >= 0 ? cols[headerIdx.price] : null);
      const promotionalPrice = parseOptionalNumber(
        headerIdx.promotional_price >= 0 ? cols[headerIdx.promotional_price] : null,
      );
      const costPrice = parseOptionalNumber(headerIdx.cost_price >= 0 ? cols[headerIdx.cost_price] : null);
      const currency = parseOptionalString(headerIdx.currency >= 0 ? cols[headerIdx.currency] : null) || 'K';

      const baseProductData = {
        name,
        sku_type: useAutoSku,
        cost_price: costPrice == null ? 0 : costPrice,
        price: price == null ? 0 : price,
        promotional_price: promotionalPrice,
        promo_start_date: parseOptionalString(
          headerIdx.promo_start_date >= 0 ? cols[headerIdx.promo_start_date] : null,
        ),
        promo_end_date: parseOptionalString(
          headerIdx.promo_end_date >= 0 ? cols[headerIdx.promo_end_date] : null,
        ),
        currency,
        category_id: resolveCategoryId(cols, headerIdx, categories),
        unit_of_measure_id: resolveUnitId(cols, headerIdx, units),
      };

      const inserted = await insertProductWithSkuRetry(
        db,
        baseProductData,
        sku,
        usedSkuNumbers,
        usedManualSkus,
      );
      const productId = inserted.id;

      const locationRows = cleanLocationIds.map((locationId) => ({
        product_id: productId,
        location_id: locationId,
      }));
      await syncProductLocations({ rows: locationRows, replaceProductId: productId }, db);

      if (price != null || promotionalPrice != null) {
        await seedProductLocationPricesForLocations(db, {
          productId,
          locationIds: cleanLocationIds,
          price: price == null ? 0 : price,
          promotionalPrice,
          promoStartDate: baseProductData.promo_start_date,
          promoEndDate: baseProductData.promo_end_date,
        });
      }

      result.imported += 1;
      result.productIds.push(productId);
    } catch (err) {
      result.errors.push(`Row ${lineNo}: ${err?.message || err}`);
    }
  }

  if (!result.imported && !result.errors.length) {
    throw new Error('No valid product rows found in CSV.');
  }

  return result;
}
