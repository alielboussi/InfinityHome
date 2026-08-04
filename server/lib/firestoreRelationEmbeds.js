import { getFirestore, queryWhereIn } from './firestoreDb.js';
import { pickColumns } from '../../src/db/selectSpec.js';

const BELONGS_TO_FK = {
  unit_of_measure: 'unit_of_measure_id',
  categories: 'category_id',
  customers: 'customer_id',
  users: 'user_id',
  locations: 'location_id',
  products: 'product_id',
  combos: 'combo_id',
};

const CHILD_FK = {
  product_locations: 'product_id',
  product_images: 'product_id',
  combo_locations: 'combo_id',
  combo_items: 'combo_id',
  sale_items: 'sale_id',
  layby_payments: 'layby_id',
  quotation_items: 'quotation_id',
};

function groupByField(rows, field) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row[field] ?? '');
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export async function attachRelationEmbeds(parentTable, rows, embeds) {
  if (!embeds?.length || !rows?.length) return rows;

  const db = getFirestore();
  if (!db) return rows;

  let enriched = rows.map((row) => ({ ...row }));

  for (const embed of embeds) {
    if (embed.type === 'belongsTo') {
      const fk = embed.fk || BELONGS_TO_FK[embed.table];
      if (!fk) continue;
      const parentIds = enriched.map((row) => row[fk]).filter((v) => v != null && v !== '');
      const related = parentIds.length
        ? await queryWhereIn(db, embed.table, 'id', parentIds)
        : [];
      const byId = new Map(related.map((row) => [String(row.id), row]));
      enriched = enriched.map((row) => {
        const parent = byId.get(String(row[fk]));
        const key = embed.alias || embed.table;
        if (!parent) return { ...row, [key]: null };
        return {
          ...row,
          [key]: pickColumns(parent, embed.cols),
        };
      });
      continue;
    }

    const childFk = embed.fk || CHILD_FK[embed.table];
    if (!childFk) continue;
    const parentIds = enriched.map((row) => row.id).filter((v) => v != null && v !== '');
    const children = parentIds.length
      ? await queryWhereIn(db, embed.table, childFk, parentIds)
      : [];
    const byParent = groupByField(children, childFk);
    const key = embed.alias || embed.table;
    enriched = enriched.map((row) => {
      const related = (byParent.get(String(row.id)) || []).map((child) => pickColumns(child, embed.cols));
      return { ...row, [key]: related };
    });
  }

  return enriched;
}
