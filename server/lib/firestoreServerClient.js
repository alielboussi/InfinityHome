import { allocateNumericId, docIdForRow, ensureSequenceInitialized, getFirestore } from './firestoreDb.js';
import { attachRelationEmbeds } from './firestoreRelationEmbeds.js';
import { docIdFromOnConflict } from '../../src/db/docIds.js';
import { pickColumns, parseSelectSpec } from '../../src/db/selectSpec.js';
import { newUuid } from './uuid.js';

const NUMERIC_ID_TABLES = new Set([
  'combos',
  'combo_items',
  'inventory',
  'sales',
  'sales_items',
  'stock_periods',
  'quotation_units',
]);

const UUID_ID_TABLES = new Set([
  'products',
  'customers',
  'quotations',
  'quotation_items',
  'quote_customers',
  'quotation_products',
  'inventory_adjustments',
  'laybys',
  'sales_payments',
  'layby_payments',
  'label_print_jobs',
  'user_activity_log',
  'stock_transfer_sessions',
  'stocktake_events',
  'stocktake_counts',
  'stocktake_count_log',
  'stocktake_gate_audit',
  'stocktake_set_scans',
]);

const IN_CHUNK = 30;

function ok(data) {
  return { data, error: null };
}

function fail(message, code) {
  return { data: null, error: { message, code: code || 'firestore' } };
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function matchOrExpression(expr, row) {
  return String(expr || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      if (part.endsWith('.not.is.null')) {
        const col = part.replace(/\.not\.is\.null$/, '');
        return row[col] != null && row[col] !== '';
      }
      if (part.endsWith('.is.null')) {
        const col = part.replace(/\.is\.null$/, '');
        return row[col] == null || row[col] === '';
      }
      const ilikeMatch = part.match(/^(.+)\.ilike\.(.+)$/);
      if (ilikeMatch) {
        const [, col, pattern] = ilikeMatch;
        const needle = String(pattern).replace(/^%+|%+$/g, '').toLowerCase();
        if (!needle) return true;
        return String(row[col] ?? '').toLowerCase().includes(needle);
      }
      const eqMatch = part.match(/^(.+)\.eq\.(.+)$/);
      if (eqMatch) {
        const [, col, val] = eqMatch;
        return row[col] === val || String(row[col]) === String(val);
      }
      return false;
    });
}

function applyClientFilters(rows, filters, orExpr) {
  let out = rows;
  for (const filter of filters) {
    if (filter.op === 'eq') {
      out = out.filter((row) => row[filter.col] === filter.val || String(row[filter.col]) === String(filter.val));
    } else if (filter.op === 'ilike') {
      const pattern = String(filter.val || '');
      const needle = pattern.replace(/^%+|%+$/g, '').toLowerCase();
      const startsWith = pattern.startsWith('%') || pattern.endsWith('%');
      out = out.filter((row) => {
        const hay = String(row[filter.col] ?? '').toLowerCase();
        if (!needle) return true;
        if (startsWith) return hay.includes(needle);
        return hay === needle;
      });
    } else if (filter.op === 'in') {
      out = out.filter((row) => (filter.vals || []).some(
        (val) => val === row[filter.col] || String(val) === String(row[filter.col]),
      ));
    } else if (filter.op === 'gte') {
      out = out.filter((row) => compareValues(row[filter.col], filter.val) >= 0);
    } else if (filter.op === 'lte') {
      out = out.filter((row) => compareValues(row[filter.col], filter.val) <= 0);
    } else if (filter.op === 'gt') {
      out = out.filter((row) => compareValues(row[filter.col], filter.val) > 0);
    } else if (filter.op === 'lt') {
      out = out.filter((row) => compareValues(row[filter.col], filter.val) < 0);
    } else if (filter.op === 'neq') {
      out = out.filter((row) => row[filter.col] !== filter.val && String(row[filter.col]) !== String(filter.val));
    } else if (filter.op === 'not') {
      if (filter.mode === 'is' && filter.val === null) {
        out = out.filter((row) => row[filter.col] != null);
      } else if (filter.mode === 'eq') {
        out = out.filter((row) => row[filter.col] !== filter.val);
      }
    }
  }
  if (orExpr) {
    out = out.filter((row) => matchOrExpression(orExpr, row));
  }
  return out;
}

function sortRows(rows, orderSpec) {
  if (!orderSpec) return rows;
  const { col, ascending } = orderSpec;
  return [...rows].sort((a, b) => {
    const cmp = compareValues(a[col], b[col]);
    return ascending === false ? -cmp : cmp;
  });
}

async function fetchAllDocs(db, table) {
  const snap = await db.collection(table).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function buildServerQuery(db, table, filters, orderSpec, limitN) {
  let q = db.collection(table);
  for (const filter of filters) {
    if (filter.op === 'eq') {
      q = q.where(filter.col, '==', filter.val);
    } else if (filter.op === 'in' && filter.vals?.length) {
      q = q.where(filter.col, 'in', filter.vals.slice(0, IN_CHUNK));
    } else if (filter.op === 'gte') {
      q = q.where(filter.col, '>=', filter.val);
    } else if (filter.op === 'lte') {
      q = q.where(filter.col, '<=', filter.val);
    } else if (filter.op === 'gt') {
      q = q.where(filter.col, '>', filter.val);
    } else if (filter.op === 'lt') {
      q = q.where(filter.col, '<', filter.val);
    } else if (filter.op === 'neq' || (filter.op === 'not' && filter.mode === 'eq')) {
      q = q.where(filter.col, '!=', filter.val);
    }
  }
  if (orderSpec) {
    q = q.orderBy(orderSpec.col, orderSpec.ascending === false ? 'desc' : 'asc');
  }
  if (limitN != null) {
    q = q.limit(limitN);
  }
  return q;
}

function needsClientFiltering(filters, orExpr) {
  if (orExpr) return true;
  if (filters.some((f) => f.op === 'ilike')) return true;
  const inequality = filters.filter((f) => (
    ['gte', 'lte', 'gt', 'lt', 'neq'].includes(f.op)
    || (f.op === 'not' && f.mode === 'eq')
  ));
  return filters.some((f) => f.op === 'in' && (f.vals?.length || 0) > IN_CHUNK)
    || filters.some((f) => f.op === 'not' && f.mode === 'is' && f.val === null)
    || inequality.length > 1;
}

class FirestoreSelectQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.orExpr = null;
    this.orderSpec = null;
    this.limitN = null;
    this.offset = 0;
    this.selectSpec = '*';
    this.headOnly = false;
    this.countExact = false;
    this.wantSingle = false;
    this.wantMaybeSingle = false;
  }

  select(columns, opts = {}) {
    this.selectSpec = columns || '*';
    if (opts.head) this.headOnly = true;
    if (opts.count === 'exact') this.countExact = true;
    return this;
  }

  eq(col, val) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ op: 'in', col, vals: Array.isArray(vals) ? vals : [] });
    return this;
  }

  not(col, mode, val) {
    this.filters.push({ op: 'not', col, mode, val });
    return this;
  }

  neq(col, val) {
    this.filters.push({ op: 'neq', col, val });
    return this;
  }

  ilike(col, val) {
    this.filters.push({ op: 'ilike', col, val });
    return this;
  }

  gte(col, val) {
    this.filters.push({ op: 'gte', col, val });
    return this;
  }

  lte(col, val) {
    this.filters.push({ op: 'lte', col, val });
    return this;
  }

  gt(col, val) {
    this.filters.push({ op: 'gt', col, val });
    return this;
  }

  lt(col, val) {
    this.filters.push({ op: 'lt', col, val });
    return this;
  }

  or(expr) {
    this.orExpr = expr;
    return this;
  }

  order(col, opts = {}) {
    this.orderSpec = { col, ascending: opts.ascending !== false };
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  range(from, to) {
    this.offset = from;
    this.limitN = to - from + 1;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  async execute() {
    try {
      if (this.headOnly && this.countExact) {
        const select = new FirestoreSelectQuery(this.db, this.table);
        select.filters = [...this.filters];
        select.orExpr = this.orExpr;
        const { data: rows, error } = await select.execute();
        if (error) return { data: null, error, count: null };
        return { data: null, error: null, count: (rows || []).length };
      }

      let rows;
      if (needsClientFiltering(this.filters, this.orExpr)) {
        rows = applyClientFilters(await fetchAllDocs(this.db, this.table), this.filters, this.orExpr);
        rows = sortRows(rows, this.orderSpec);
        if (this.offset) rows = rows.slice(this.offset);
        if (this.limitN != null) rows = rows.slice(0, this.limitN);
      } else if (this.filters.some((f) => f.op === 'in' && (f.vals?.length || 0) > IN_CHUNK)) {
        const filter = this.filters.find((f) => f.op === 'in');
        const merged = [];
        const vals = filter.vals || [];
        for (let i = 0; i < vals.length; i += IN_CHUNK) {
          const chunkFilters = this.filters.map((f) => (
            f.op === 'in' ? { ...f, vals: vals.slice(i, i + IN_CHUNK) } : f
          ));
          const q = buildServerQuery(this.db, this.table, chunkFilters, this.orderSpec, null);
          const snap = await q.get();
          merged.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
        const seen = new Set();
        rows = merged.filter((row) => {
          const id = row.id;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        if (this.orExpr) {
          rows = rows.filter((row) => matchOrExpression(this.orExpr, row));
        }
        rows = sortRows(rows, this.orderSpec);
        if (this.offset) rows = rows.slice(this.offset);
        if (this.limitN != null) rows = rows.slice(0, this.limitN);
      } else {
        try {
          const q = buildServerQuery(this.db, this.table, this.filters, this.orderSpec, this.limitN);
          const snap = await q.get();
          rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (this.orExpr) {
            rows = rows.filter((row) => matchOrExpression(this.orExpr, row));
          }
          if (this.offset) rows = rows.slice(this.offset);
        } catch {
          rows = applyClientFilters(await fetchAllDocs(this.db, this.table), this.filters, this.orExpr);
          rows = sortRows(rows, this.orderSpec);
          if (this.offset) rows = rows.slice(this.offset);
          if (this.limitN != null) rows = rows.slice(0, this.limitN);
        }
      }

      const parsedSelect = parseSelectSpec(this.selectSpec);
      if (parsedSelect.embeds.length) {
        rows = await attachRelationEmbeds(this.table, rows, parsedSelect.embeds);
      }
      rows = rows.map((row) => pickColumns(row, this.selectSpec, parsedSelect));

      if (this.wantSingle) {
        if (rows.length !== 1) return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
        return ok(rows[0]);
      }
      if (this.wantMaybeSingle) {
        if (rows.length > 1) return fail('JSON object requested, multiple rows returned', 'PGRST116');
        return ok(rows[0] || null);
      }

      return ok(rows);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class FirestoreInsertQuery {
  constructor(db, table, rows, opts = {}) {
    this.db = db;
    this.table = table;
    this.rows = rows;
    this.opts = opts;
    this.selectSpec = '*';
    this.wantSingle = false;
    this.wantMaybeSingle = false;
  }

  select(columns) {
    this.selectSpec = columns || '*';
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  async resolveRowId(row) {
    if (row.id != null && row.id !== '') return row;
    if (UUID_ID_TABLES.has(this.table)) {
      return { ...row, id: newUuid() };
    }
    if (NUMERIC_ID_TABLES.has(this.table)) {
      await ensureSequenceInitialized(this.db, this.table);
      const nextId = await this.db.runTransaction(async (tx) => allocateNumericId(this.db, this.table, tx));
      return { ...row, id: nextId };
    }
    try {
      docIdForRow(this.table, row);
      return row;
    } catch {
      return { ...row, id: newUuid() };
    }
  }

  async execute() {
    try {
      const list = Array.isArray(this.rows) ? this.rows : [this.rows];
      const written = [];
      let batch = this.db.batch();
      let batchCount = 0;

      const flush = async () => {
        if (!batchCount) return;
        await batch.commit();
        batch = this.db.batch();
        batchCount = 0;
      };

      for (const rawRow of list) {
        const row = await this.resolveRowId(rawRow);
        const id = docIdForRow(this.table, row);
        const ref = this.db.collection(this.table).doc(id);
        batch.set(ref, row, { merge: Boolean(this.opts.onConflict) });
        written.push({ ...row, id: row.id ?? id });
        batchCount += 1;
        if (batchCount >= 400) await flush();
      }
      await flush();

      const parsedSelect = parseSelectSpec(this.selectSpec);
      let rows = written.map((row) => pickColumns(row, this.selectSpec, parsedSelect));
      if (this.wantSingle) {
        if (rows.length !== 1) return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
        return ok(rows[0]);
      }
      if (this.wantMaybeSingle) {
        if (rows.length > 1) return fail('JSON object requested, multiple rows returned', 'PGRST116');
        return ok(rows[0] || null);
      }
      return ok(this.opts.returning === 'minimal' ? null : rows);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class FirestoreUpdateQuery {
  constructor(db, table, patch) {
    this.db = db;
    this.table = table;
    this.patch = patch;
    this.filters = [];
    this.selectSpec = '*';
    this.wantSingle = false;
    this.wantMaybeSingle = false;
  }

  eq(col, val) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ op: 'in', col, vals: Array.isArray(vals) ? vals : [] });
    return this;
  }

  select(columns) {
    this.selectSpec = columns || '*';
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  async execute() {
    try {
      const select = new FirestoreSelectQuery(this.db, this.table);
      select.filters = [...this.filters];
      const { data: rows, error } = await select.execute();
      if (error) return { data: null, error };
      const targets = Array.isArray(rows) ? rows : [];
      const updated = [];
      for (const row of targets) {
        const id = docIdForRow(this.table, row);
        const next = { ...row, ...this.patch };
        await this.db.collection(this.table).doc(id).set(next, { merge: true });
        updated.push(next);
      }

      const parsedSelect = parseSelectSpec(this.selectSpec);
      let resultRows = updated.map((row) => pickColumns(row, this.selectSpec, parsedSelect));
      if (this.wantSingle) {
        if (resultRows.length !== 1) return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
        return ok(resultRows[0]);
      }
      if (this.wantMaybeSingle) {
        if (resultRows.length > 1) return fail('JSON object requested, multiple rows returned', 'PGRST116');
        return ok(resultRows[0] || null);
      }
      return ok(resultRows);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class FirestoreDeleteQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.selectSpec = null;
  }

  eq(col, val) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ op: 'in', col, vals: Array.isArray(vals) ? vals : [] });
    return this;
  }

  neq(col, val) {
    this.filters.push({ op: 'neq', col, val });
    return this;
  }

  select(columns) {
    this.selectSpec = columns || '*';
    return this;
  }

  async execute() {
    try {
      const select = new FirestoreSelectQuery(this.db, this.table);
      select.filters = [...this.filters];
      const { data: rows, error } = await select.execute();
      if (error) return { data: null, error };
      const targets = rows || [];
      for (const row of targets) {
        const id = docIdForRow(this.table, row);
        await this.db.collection(this.table).doc(id).delete();
      }
      if (this.selectSpec) {
        const parsedSelect = parseSelectSpec(this.selectSpec);
        const picked = targets.map((row) => pickColumns(row, this.selectSpec, parsedSelect));
        return ok(picked);
      }
      return ok(null);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class FirestoreUpsertQuery {
  constructor(db, table, rows, opts = {}) {
    this.db = db;
    this.table = table;
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts.onConflict || 'id';
  }

  select() {
    return this;
  }

  async execute() {
    try {
      const written = [];
      let batch = this.db.batch();
      let batchCount = 0;

      const flush = async () => {
        if (!batchCount) return;
        await batch.commit();
        batch = this.db.batch();
        batchCount = 0;
      };

      for (const row of this.rows) {
        const id = docIdFromOnConflict(row, this.onConflict);
        const ref = this.db.collection(this.table).doc(id);
        batch.set(ref, row, { merge: true });
        written.push({ ...row, id: row.id ?? id });
        batchCount += 1;
        if (batchCount >= 400) await flush();
      }
      await flush();
      return ok(written);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

export function createFirestoreServerClient() {
  const db = getFirestore();
  if (!db) return null;

  return {
    from(table) {
      return {
        select: (columns, opts) => new FirestoreSelectQuery(db, table).select(columns, opts),
        insert: (rows, opts) => new FirestoreInsertQuery(db, table, rows, opts),
        update: (patch) => new FirestoreUpdateQuery(db, table, patch),
        delete: () => new FirestoreDeleteQuery(db, table),
        upsert: (rows, opts) => new FirestoreUpsertQuery(db, table, rows, opts),
      };
    },
  };
}
