import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firestoreDb, firebaseStorage } from '../firebase';
import { docIdForTable, docIdFromOnConflict, pickColumns, parseSelectSpec } from './docIds.js';
import { attachRelationEmbeds } from './relationEmbeds.js';

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

function applyClientFilters(rows, filters, orExpr) {
  let out = rows;
  for (const filter of filters) {
    if (filter.op === 'eq') {
      out = out.filter((row) => row[filter.col] === filter.val || String(row[filter.col]) === String(filter.val));
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

function sortRows(rows, orderSpec) {
  if (!orderSpec) return rows;
  const { col, ascending } = orderSpec;
  return [...rows].sort((a, b) => {
    const cmp = compareValues(a[col], b[col]);
    return ascending === false ? -cmp : cmp;
  });
}

async function fetchAllDocs(table) {
  const snap = await getDocs(collection(firestoreDb, table));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function buildServerQuery(table, filters, orderSpec, limitN) {
  const colRef = collection(firestoreDb, table);
  const constraints = [];
  for (const filter of filters) {
    if (filter.op === 'eq') {
      constraints.push(where(filter.col, '==', filter.val));
    } else if (filter.op === 'in' && filter.vals?.length) {
      constraints.push(where(filter.col, 'in', filter.vals.slice(0, IN_CHUNK)));
    } else if (filter.op === 'gte') {
      constraints.push(where(filter.col, '>=', filter.val));
    } else if (filter.op === 'lte') {
      constraints.push(where(filter.col, '<=', filter.val));
    } else if (filter.op === 'gt') {
      constraints.push(where(filter.col, '>', filter.val));
    } else if (filter.op === 'lt') {
      constraints.push(where(filter.col, '<', filter.val));
    } else if (filter.op === 'neq' || (filter.op === 'not' && filter.mode === 'eq')) {
      constraints.push(where(filter.col, '!=', filter.val));
    }
  }
  if (orderSpec) {
    constraints.push(orderBy(orderSpec.col, orderSpec.ascending === false ? 'desc' : 'asc'));
  }
  if (limitN != null) {
    constraints.push(fsLimit(limitN));
  }
  return query(colRef, ...constraints);
}

function needsClientFiltering(filters, orExpr) {
  if (orExpr) return true;
  const inequality = filters.filter((f) => (
    ['gte', 'lte', 'gt', 'lt', 'neq'].includes(f.op)
    || (f.op === 'not' && f.mode === 'eq')
  ));
  return filters.some((f) => f.op === 'in' && (f.vals?.length || 0) > IN_CHUNK)
    || filters.some((f) => f.op === 'not' && f.mode === 'is' && f.val === null)
    || inequality.length > 1;
}

class FirestoreSelectQuery {
  constructor(table) {
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
        if (needsClientFiltering(this.filters, this.orExpr) || this.filters.some((f) => f.op === 'in')) {
          const rows = applyClientFilters(await fetchAllDocs(this.table), this.filters, this.orExpr);
          return { data: null, error: null, count: rows.length };
        }
        const q = buildServerQuery(this.table, this.filters, null, null);
        const aggregate = await getCountFromServer(q);
        return { data: null, error: null, count: aggregate.data().count };
      }

      let rows;
      if (needsClientFiltering(this.filters, this.orExpr)) {
        rows = applyClientFilters(await fetchAllDocs(this.table), this.filters, this.orExpr);
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
          const q = buildServerQuery(this.table, chunkFilters, this.orderSpec, null);
          const snap = await getDocs(q);
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
          const q = buildServerQuery(this.table, this.filters, this.orderSpec, this.limitN);
          const snap = await getDocs(q);
          rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (this.orExpr) {
            rows = rows.filter((row) => matchOrExpression(this.orExpr, row));
          }
          if (this.offset) rows = rows.slice(this.offset);
        } catch {
          rows = applyClientFilters(await fetchAllDocs(this.table), this.filters, this.orExpr);
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
  constructor(table, rows, opts = {}) {
    this.table = table;
    this.rows = rows;
    this.opts = opts;
  }

  select() {
    return this;
  }

  async execute() {
    try {
      const list = Array.isArray(this.rows) ? this.rows : [this.rows];
      const written = [];
      let batch = writeBatch(firestoreDb);
      let batchCount = 0;

      const flush = async () => {
        if (!batchCount) return;
        await batch.commit();
        batch = writeBatch(firestoreDb);
        batchCount = 0;
      };

      for (const row of list) {
        const id = docIdForTable(this.table, row);
        const ref = doc(firestoreDb, this.table, id);
        batch.set(ref, row, { merge: Boolean(this.opts.onConflict) });
        written.push({ ...row, id: row.id ?? id });
        batchCount += 1;
        if (batchCount >= 400) await flush();
      }
      await flush();
      return ok(this.opts.returning === 'minimal' ? null : written);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class FirestoreUpdateQuery {
  constructor(table, patch) {
    this.table = table;
    this.patch = patch;
    this.filters = [];
  }

  eq(col, val) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ op: 'in', col, vals: Array.isArray(vals) ? vals : [] });
    return this;
  }

  select() {
    return this;
  }

  async execute() {
    try {
      const select = new FirestoreSelectQuery(this.table);
      select.filters = [...this.filters];
      const { data: rows, error } = await select.execute();
      if (error) return { data: null, error };
      const targets = Array.isArray(rows) ? rows : [];
      for (const row of targets) {
        const id = docIdForTable(this.table, row);
        await updateDoc(doc(firestoreDb, this.table, id), this.patch);
      }
      return ok(targets.map((row) => ({ ...row, ...this.patch })));
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class FirestoreDeleteQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
  }

  eq(col, val) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ op: 'in', col, vals: Array.isArray(vals) ? vals : [] });
    return this;
  }

  async execute() {
    try {
      const select = new FirestoreSelectQuery(this.table);
      select.filters = [...this.filters];
      const { data: rows, error } = await select.execute();
      if (error) return { data: null, error };
      for (const row of rows || []) {
        const id = docIdForTable(this.table, row);
        await deleteDoc(doc(firestoreDb, this.table, id));
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
  constructor(table, rows, opts = {}) {
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
      for (const row of this.rows) {
        const id = docIdFromOnConflict(row, this.onConflict);
        await setDoc(doc(firestoreDb, this.table, id), row, { merge: true });
        written.push({ ...row, id: row.id ?? id });
      }
      return ok(written);
    } catch (err) {
      return fail(err?.message || String(err));
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function storagePublicUrl(bucket, objectPath) {
  const bucketName = String(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || bucket).trim();
  const encodedPath = encodeURIComponent(`${bucket}/${objectPath}`);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
}

function createStorageBucket(bucketName) {
  const root = firebaseStorage;
  return {
    async upload(objectPath, file, opts = {}) {
      try {
        const storageRef = ref(root, `${bucketName}/${objectPath}`);
        const bytes = file instanceof Blob ? file : new Blob([file]);
        await uploadBytes(storageRef, bytes, {
          contentType: opts.contentType || file?.type || 'application/octet-stream',
        });
        return { data: { path: objectPath }, error: null };
      } catch (err) {
        return { data: null, error: { message: err?.message || String(err) } };
      }
    },
    getPublicUrl(objectPath) {
      return { data: { publicUrl: storagePublicUrl(bucketName, objectPath) } };
    },
    async createSignedUrl(objectPath, _expiresSeconds, _opts = {}) {
      try {
        const storageRef = ref(root, `${bucketName}/${objectPath}`);
        const signedUrl = await getDownloadURL(storageRef);
        return { data: { signedUrl }, error: null };
      } catch (err) {
        return { data: null, error: { message: err?.message || String(err) } };
      }
    },
  };
}

function createAuthShim(getAuthApi) {
  return {
    async getSession() {
      const api = getAuthApi();
      const user = api.currentUser;
      if (!user) return { data: { session: null }, error: null };
      const token = await user.getIdToken();
      return {
        data: {
          session: {
            access_token: token,
            user: {
              id: user.uid,
              email: user.email,
              user_metadata: user.displayName ? { full_name: user.displayName } : {},
            },
          },
        },
        error: null,
      };
    },
    async refreshSession() {
      return this.getSession();
    },
    async signOut() {
      const api = getAuthApi();
      await api.signOut();
      return { error: null };
    },
    async getUser(token) {
      const api = getAuthApi();
      if (api.currentUser) {
        const u = api.currentUser;
        return {
          data: {
            user: {
              id: u.uid,
              email: u.email,
              user_metadata: u.displayName ? { full_name: u.displayName } : {},
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: { message: 'No current user' } };
    },
    onAuthStateChange(callback) {
      const api = getAuthApi();
      const unsubscribe = api.onAuthStateChanged(async (user) => {
        if (!user) {
          callback('SIGNED_OUT', null);
          return;
        }
        const token = await user.getIdToken();
        callback('SIGNED_IN', {
          access_token: token,
          user: {
            id: user.uid,
            email: user.email,
            user_metadata: user.displayName ? { full_name: user.displayName } : {},
          },
        });
      });
      return { data: { subscription: { unsubscribe } } };
    },
  };
}

export function createFirestoreClient(getAuthApi) {
  const client = {
    schema() {
      return client;
    },
    from(table) {
      return {
        select: (columns, opts) => new FirestoreSelectQuery(table).select(columns, opts),
        insert: (rows, opts) => new FirestoreInsertQuery(table, rows, opts),
        update: (patch) => new FirestoreUpdateQuery(table, patch),
        delete: () => new FirestoreDeleteQuery(table),
        upsert: (rows, opts) => new FirestoreUpsertQuery(table, rows, opts),
      };
    },
    storage: {
      from: (bucket) => createStorageBucket(bucket),
      async getBucket() {
        return { data: { name: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET }, error: null };
      },
      async createBucket() {
        return { data: null, error: null };
      },
    },
    rpc(name) {
      return Promise.resolve(fail(`Firestore backend does not support RPC "${name}" yet`));
    },
    channel() {
      const listeners = [];
      const channelObj = {
        _unsubs: [],
        on(event, params, callback) {
          if (event === 'firestore_changes' && params?.table && typeof callback === 'function') {
            listeners.push({ table: params.table, filter: params.filter, callback });
          }
          return channelObj;
        },
        subscribe() {
          listeners.forEach(({ table, filter, callback }) => {
            let colRef = collection(firestoreDb, table);
            const constraints = [];
            if (typeof filter === 'string' && filter.trim()) {
              const match = filter.trim().match(/^(\w+)=eq\.(.+)$/);
              if (match) {
                constraints.push(where(match[1], '==', match[2]));
              }
            }
            const q = constraints.length ? query(colRef, ...constraints) : colRef;
            const unsub = onSnapshot(q, () => {
              try { callback({}); } catch { /* ignore listener errors */ }
            });
            channelObj._unsubs.push(unsub);
          });
          return channelObj;
        },
      };
      return channelObj;
    },
    removeChannel(ch) {
      const unsubs = ch?._unsubs;
      if (Array.isArray(unsubs)) {
        unsubs.forEach((unsub) => {
          try { unsub(); } catch { /* ignore */ }
        });
      }
    },
    auth: createAuthShim(getAuthApi),
  };
  return client;
}

export async function getDocById(table, id) {
  const snap = await getDoc(doc(firestoreDb, table, String(id)));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
