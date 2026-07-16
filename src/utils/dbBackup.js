import supabase from '../supabase';

async function getAuthHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function apiGet(query) {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/db-backup?${query}&_=${Date.now()}`, {
    headers,
    cache: 'no-store',
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(
      'Backup API is not available on the current server yet (got a non-JSON response). Deploy the latest build, or run: node scripts/exportDbBackup.js',
    );
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Backup API failed (${response.status})`);
  }
  return payload;
}

async function apiPost(op, body) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeaders()),
  };
  const response = await fetch(`/api/db-backup?op=${encodeURIComponent(op)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(
      'Backup API is not available on the current server yet (got a non-JSON response). Deploy the latest build first.',
    );
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Backup API failed (${response.status})`);
  }
  return payload;
}

export async function fetchBackupManifest() {
  return apiGet('op=manifest');
}

export async function exportTablePage(table, { offset = 0, limit = 500 } = {}) {
  const q = new URLSearchParams({
    op: 'export',
    table: String(table),
    offset: String(offset),
    limit: String(limit),
  });
  return apiGet(q.toString());
}

export async function exportAllTables({
  onProgress,
  pageSize = 500,
} = {}) {
  const manifest = await fetchBackupManifest();
  const existing = (manifest.tables || []).filter((t) => t.exists);
  const tables = {};
  let done = 0;

  for (const entry of existing) {
    const table = entry.table;
    const rows = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await exportTablePage(table, { offset, limit: pageSize });
      const batch = Array.isArray(page.rows) ? page.rows : [];
      rows.push(...batch);
      hasMore = Boolean(page.hasMore);
      offset += pageSize;
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'export',
          table,
          tableIndex: done + 1,
          tableCount: existing.length,
          rowCount: rows.length,
          expected: entry.count || null,
        });
      }
      if (!batch.length) break;
    }

    tables[table] = rows;
    done += 1;
  }

  return {
    format: 'infinity-home-db-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceProjectUrl: manifest.projectUrl || null,
    notes: manifest.notes || [],
    insertOrder: manifest.insertOrder || existing.map((t) => t.table),
    clearOrder: manifest.clearOrder || [...existing.map((t) => t.table)].reverse(),
    tableCounts: Object.fromEntries(
      existing.map((t) => [t.table, (tables[t.table] || []).length]),
    ),
    tables,
  };
}

export function downloadBackupJson(backup, filename) {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `infinity-home-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function clearBackupTable(table) {
  return apiPost('clear', { table, confirm: 'CLEAR' });
}

export async function importTableRows(table, rows, { mode = 'upsert' } = {}) {
  return apiPost('import', {
    table,
    rows,
    mode,
    confirm: 'RESTORE',
  });
}

export async function importBackupPayload(backup, {
  mode = 'replace',
  onProgress,
  batchSize = 200,
} = {}) {
  if (!backup || backup.format !== 'infinity-home-db-backup') {
    throw new Error('Invalid backup file (expected infinity-home-db-backup format)');
  }

  const tablesMap = backup.tables && typeof backup.tables === 'object' ? backup.tables : {};
  const insertOrder = Array.isArray(backup.insertOrder) && backup.insertOrder.length
    ? backup.insertOrder
    : Object.keys(tablesMap);
  const clearOrder = Array.isArray(backup.clearOrder) && backup.clearOrder.length
    ? backup.clearOrder
    : [...insertOrder].reverse();

  const results = { cleared: [], imported: [], warnings: [] };

  if (mode === 'replace') {
    for (let i = 0; i < clearOrder.length; i += 1) {
      const table = clearOrder[i];
      if (!Object.prototype.hasOwnProperty.call(tablesMap, table)) continue;
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'clear',
          table,
          tableIndex: i + 1,
          tableCount: clearOrder.length,
        });
      }
      try {
        const cleared = await clearBackupTable(table);
        results.cleared.push({ table, ...cleared });
        if (cleared.warning) results.warnings.push(`${table}: ${cleared.warning}`);
      } catch (err) {
        results.warnings.push(`${table} clear: ${err.message || err}`);
      }
    }
  }

  for (let i = 0; i < insertOrder.length; i += 1) {
    const table = insertOrder[i];
    const rows = Array.isArray(tablesMap[table]) ? tablesMap[table] : [];
    if (!rows.length) continue;

    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'import',
          table,
          tableIndex: i + 1,
          tableCount: insertOrder.length,
          rowCount: Math.min(offset + batch.length, rows.length),
          expected: rows.length,
        });
      }
      const response = await importTableRows(
        table,
        batch,
        { mode: mode === 'merge' ? 'upsert' : 'insert' },
      );
      inserted += response.inserted || batch.length;
      if (response.warning) results.warnings.push(`${table}: ${response.warning}`);
      if (response.skipped) {
        results.warnings.push(`${table}: skipped (missing on target)`);
        break;
      }
    }
    results.imported.push({ table, inserted });
  }

  return results;
}

export function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = JSON.parse(text);
        if (parsed?.format !== 'infinity-home-db-backup') {
          reject(new Error('This file is not an Infinity Home database backup'));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error('Could not parse backup JSON'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read backup file'));
    reader.readAsText(file);
  });
}
