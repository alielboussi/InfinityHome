const DOC_ID_FIELDS = {
  user_acl: 'user_uid',
  stocktake_location_state: 'location_id',
  auth_user_map: 'public_user_id',
  product_location_prices: ['product_id', 'location_id'],
  combo_location_prices: ['combo_id', 'location_id'],
  product_locations: ['product_id', 'location_id'],
  combo_locations: ['combo_id', 'location_id'],
  opening_stock_entries: ['session_id', 'product_id'],
  closing_stock_entries: ['session_id', 'product_id'],
  inventory: ['product_id', 'location'],
  stock_transfer_entries: ['session_id', 'product_id'],
  product_images: 'product_id',
  shop_listings: ['product_id', 'location_id'],
};

export function docIdForTable(table, row) {
  const spec = DOC_ID_FIELDS[table];
  if (Array.isArray(spec)) {
    const parts = spec.map((key) => row[key]);
    if (parts.some((part) => part == null || part === '')) {
      throw new Error(`Missing composite key for ${table}`);
    }
    return parts.map((part) => String(part)).join('_');
  }
  if (typeof spec === 'string') {
    const value = row[spec];
    if (value == null || value === '') throw new Error(`Missing ${spec} for ${table}`);
    return String(value);
  }
  if (row.id != null && row.id !== '') return String(row.id);
  throw new Error(`No document id for ${table}`);
}

const OPTIONAL_EMPTY_CONFLICT_FIELDS = new Set([
  'reference',
  'notes',
  'color',
  'allocation_batch_uuid',
]);

export function docIdFromOnConflict(row, onConflict) {
  const keys = String(onConflict || 'id')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = keys.map((key) => {
    const val = row[key];
    if (val == null || val === '') {
      if (OPTIONAL_EMPTY_CONFLICT_FIELDS.has(key)) return '__';
      return null;
    }
    return String(val);
  });
  if (parts.some((part) => part == null)) {
    throw new Error(`Missing onConflict fields: ${keys.join(',')}`);
  }
  return parts.join('_');
}

export { pickColumns, parseSelectSpec } from './selectSpec.js';
