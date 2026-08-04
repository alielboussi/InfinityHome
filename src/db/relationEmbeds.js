import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { firestoreDb } from '../firebase';
import { pickColumns } from './selectSpec.js';

const IN_CHUNK = 30;

const CHILD_FK = {
  product_locations: 'product_id',
  product_images: 'product_id',
  combo_locations: 'combo_id',
  combo_items: 'combo_id',
  sale_items: 'sale_id',
  layby_payments: 'layby_id',
  quotation_items: 'quotation_id',
};

const BELONGS_TO_FK = {
  unit_of_measure: 'unit_of_measure_id',
  categories: 'category_id',
  customers: 'customer_id',
  users: 'user_id',
  locations: 'location_id',
};

async function fetchByFieldIn(table, field, values) {
  const unique = [...new Set((values || []).filter((v) => v != null && v !== '').map(String))];
  if (!unique.length) return [];
  const results = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const q = query(collection(firestoreDb, table), where(field, 'in', chunk));
    const snap = await getDocs(q);
    results.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  return results;
}

async function fetchAllDocs(table) {
  const snap = await getDocs(collection(firestoreDb, table));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

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

  let enriched = rows.map((row) => ({ ...row }));

  for (const embed of embeds) {
    if (embed.type === 'belongsTo') {
      const fk = embed.fk || BELONGS_TO_FK[embed.table];
      if (!fk) continue;
      const parentIds = enriched.map((row) => row[fk]).filter((v) => v != null && v !== '');
      const related = parentIds.length
        ? await fetchByFieldIn(embed.table, 'id', parentIds)
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
    let children = [];
    if (parentIds.length <= IN_CHUNK * 3) {
      children = await fetchByFieldIn(embed.table, childFk, parentIds);
    } else {
      const parentIdSet = new Set(parentIds.map(String));
      const allChildren = await fetchAllDocs(embed.table);
      children = allChildren.filter((row) => parentIdSet.has(String(row[childFk])));
    }
    const byParent = groupByField(children, childFk);
    const key = embed.alias || embed.table;
    enriched = enriched.map((row) => {
      const related = (byParent.get(String(row.id)) || []).map((child) => pickColumns(child, embed.cols));
      return { ...row, [key]: related };
    });
  }

  return enriched;
}

export { parseSelectSpec } from './selectSpec.js';
