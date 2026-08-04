export function splitSelectParts(spec) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of String(spec || '')) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

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

export function parseSelectSpec(selectSpec) {
  const spec = String(selectSpec || '*').trim();
  if (!spec || spec === '*') {
    return { wildcard: true, columns: [], embeds: [] };
  }

  const columns = [];
  const embeds = [];

  for (const part of splitSelectParts(spec)) {
    const aliasMatch = part.match(/^(\w+):(\w+)\((.+)\)$/);
    if (aliasMatch) {
      const [, alias, table, cols] = aliasMatch;
      embeds.push({
        type: 'belongsTo',
        table,
        cols,
        alias,
        fk: BELONGS_TO_FK[table] || `${table.replace(/s$/, '')}_id`,
      });
      continue;
    }
    const embedMatch = part.match(/^(\w+)\((.+)\)$/);
    if (embedMatch) {
      const [, table, cols] = embedMatch;
      if (BELONGS_TO_FK[table]) {
        embeds.push({
          type: 'belongsTo',
          table,
          cols,
          alias: table,
          fk: BELONGS_TO_FK[table],
        });
      } else {
        embeds.push({
          type: 'hasMany',
          table,
          cols,
          alias: table,
          fk: CHILD_FK[table] || null,
        });
      }
      continue;
    }
    columns.push(part);
  }

  return { wildcard: false, columns, embeds };
}

export function pickColumns(row, selectSpec, parsed = null) {
  const spec = parsed || parseSelectSpec(selectSpec);
  if (spec.wildcard) return { ...row };
  const out = {};
  for (const col of spec.columns) {
    if (Object.prototype.hasOwnProperty.call(row, col)) out[col] = row[col];
  }
  for (const embed of spec.embeds) {
    const key = embed.alias || embed.table;
    if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
  }
  return out;
}
