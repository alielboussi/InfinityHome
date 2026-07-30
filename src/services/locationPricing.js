import {
  buildComboLocationPriceUpsert,
  buildProductLocationPriceUpsert,
} from '../utils/locationPricing';

const chunkArray = (list, size) => {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
};

const PAGE_SIZE = 1000;

async function fetchAllPagedRows(client, table, columns, options = {}) {
  const {
    applyFilters,
    orderBy = [],
  } = options;
  const rows = [];
  let offset = 0;
  while (true) {
    let query = client.from(table).select(columns);
    orderBy.forEach(({ column, ascending = true }) => {
      query = query.order(column, { ascending });
    });
    if (typeof applyFilters === 'function') {
      query = applyFilters(query);
    }
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

export async function fetchProductLocationPrices(client) {
  return fetchAllPagedRows(
    client,
    'product_location_prices',
    'product_id, location_id, price, promotional_price, promo_start_date, promo_end_date',
    {
      orderBy: [
        { column: 'product_id', ascending: true },
        { column: 'location_id', ascending: true },
      ],
    },
  );
}

export async function fetchComboLocationPrices(client) {
  return fetchAllPagedRows(
    client,
    'combo_location_prices',
    'combo_id, location_id, combo_price, promotional_price, promo_start_date, promo_end_date',
    {
      orderBy: [
        { column: 'combo_id', ascending: true },
        { column: 'location_id', ascending: true },
      ],
    },
  );
}

export async function fetchProductLocationPricesForLocation(client, locationId) {
  if (!locationId) return [];
  return fetchAllPagedRows(
    client,
    'product_location_prices',
    'product_id, location_id, price, promotional_price, promo_start_date, promo_end_date',
    {
      applyFilters: (query) => query.eq('location_id', locationId),
      orderBy: [
        { column: 'product_id', ascending: true },
      ],
    },
  );
}

export async function fetchComboLocationPricesForLocation(client, locationId) {
  if (!locationId) return [];
  return fetchAllPagedRows(
    client,
    'combo_location_prices',
    'combo_id, location_id, combo_price, promotional_price, promo_start_date, promo_end_date',
    {
      applyFilters: (query) => query.eq('location_id', locationId),
      orderBy: [
        { column: 'combo_id', ascending: true },
      ],
    },
  );
}

export async function upsertProductLocationPrices(client, rows = []) {
  const payloads = (rows || []).filter((row) => row?.product_id && row?.location_id);
  if (!payloads.length) return;
  for (const chunk of chunkArray(payloads, 500)) {
    const { error } = await client
      .from('product_location_prices')
      .upsert(chunk, { onConflict: 'product_id,location_id' });
    if (error) throw error;
  }
}

export async function upsertComboLocationPrices(client, rows = []) {
  const payloads = (rows || []).filter((row) => row?.combo_id && row?.location_id);
  if (!payloads.length) return;
  for (const chunk of chunkArray(payloads, 500)) {
    const { error } = await client
      .from('combo_location_prices')
      .upsert(chunk, { onConflict: 'combo_id,location_id' });
    if (error) throw error;
  }
}

export async function saveProductLocationPrice(client, {
  productId,
  locationId,
  field,
  value,
  baseProduct,
}) {
  const existing = await fetchProductLocationPriceRow(client, productId, locationId);
  const payload = buildProductLocationPriceUpsert({
    productId,
    locationId,
    price: field === 'price'
      ? value
      : (existing?.price ?? baseProduct?.price ?? null),
    promotionalPrice: field === 'promotional_price'
      ? value
      : (existing?.promotional_price ?? baseProduct?.promotional_price ?? null),
    promoStartDate: existing?.promo_start_date ?? baseProduct?.promo_start_date ?? null,
    promoEndDate: existing?.promo_end_date ?? baseProduct?.promo_end_date ?? null,
  });
  const { data, error } = await client
    .from('product_location_prices')
    .upsert(payload, { onConflict: 'product_id,location_id' })
    .select('product_id, location_id, price, promotional_price, promo_start_date, promo_end_date')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveComboLocationPrice(client, {
  comboId,
  locationId,
  field,
  value,
  baseCombo,
}) {
  const existing = await fetchComboLocationPriceRow(client, comboId, locationId);
  const standard = baseCombo?.combo_price ?? baseCombo?.standard_price ?? null;
  const payload = buildComboLocationPriceUpsert({
    comboId,
    locationId,
    comboPrice: field === 'price'
      ? value
      : (existing?.combo_price ?? standard),
    promotionalPrice: field === 'promotional_price'
      ? value
      : (existing?.promotional_price ?? baseCombo?.promotional_price ?? null),
    promoStartDate: existing?.promo_start_date ?? baseCombo?.promo_start_date ?? null,
    promoEndDate: existing?.promo_end_date ?? baseCombo?.promo_end_date ?? null,
  });
  const { data, error } = await client
    .from('combo_location_prices')
    .upsert(payload, { onConflict: 'combo_id,location_id' })
    .select('combo_id, location_id, combo_price, promotional_price, promo_start_date, promo_end_date')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function seedProductLocationPricesForLocations(client, {
  productId,
  locationIds = [],
  price,
  promotionalPrice,
  promoStartDate,
  promoEndDate,
}) {
  const rows = (locationIds || []).map((locationId) => buildProductLocationPriceUpsert({
    productId,
    locationId,
    price,
    promotionalPrice,
    promoStartDate,
    promoEndDate,
  }));
  await upsertProductLocationPrices(client, rows);
}

export async function seedComboLocationPricesForLocations(client, {
  comboId,
  locationIds = [],
  comboPrice,
  promotionalPrice,
  promoStartDate,
  promoEndDate,
}) {
  const rows = (locationIds || []).map((locationId) => buildComboLocationPriceUpsert({
    comboId,
    locationId,
    comboPrice,
    promotionalPrice,
    promoStartDate,
    promoEndDate,
  }));
  await upsertComboLocationPrices(client, rows);
}

export async function fetchProductLocationPriceRow(client, productId, locationId) {
  if (!productId || !locationId) return null;
  const { data, error } = await client
    .from('product_location_prices')
    .select('product_id, location_id, price, promotional_price, promo_start_date, promo_end_date')
    .eq('product_id', productId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchComboLocationPriceRow(client, comboId, locationId) {
  if (!comboId || !locationId) return null;
  const { data, error } = await client
    .from('combo_location_prices')
    .select('combo_id, location_id, combo_price, promotional_price, promo_start_date, promo_end_date')
    .eq('combo_id', comboId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
