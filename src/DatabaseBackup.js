import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { canViewDatabaseBackup, getCurrentUser } from './accessControl';
import {
  downloadBackupJson,
  exportAllTables,
  fetchBackupManifest,
  importBackupPayload,
  parseBackupFile,
} from './utils/dbBackup';

function formatCount(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

export default function DatabaseBackup() {
  const user = getCurrentUser();
  const [manifest, setManifest] = useState(null);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState('replace');
  const [confirmText, setConfirmText] = useState('');

  const loadManifest = useCallback(async () => {
    setLoadingManifest(true);
    setError('');
    try {
      const payload = await fetchBackupManifest();
      setManifest(payload);
    } catch (err) {
      setError(err?.message || 'Failed to load backup manifest');
    } finally {
      setLoadingManifest(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewDatabaseBackup(user)) return;
    loadManifest();
  }, [user, loadManifest]);

  const existingTables = useMemo(
    () => (manifest?.tables || []).filter((t) => t.exists),
    [manifest],
  );

  const totalRows = useMemo(
    () => existingTables.reduce((sum, t) => sum + (t.count || 0), 0),
    [existingTables],
  );

  const handleExport = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    setProgress('Starting export…');
    try {
      const backup = await exportAllTables({
        onProgress: ({ table, tableIndex, tableCount, rowCount, expected }) => {
          setProgress(
            `Exporting ${table} (${tableIndex}/${tableCount}) — ${formatCount(rowCount)}${expected != null ? ` / ${formatCount(expected)}` : ''} rows`,
          );
        },
      });
      downloadBackupJson(backup);
      setSuccess(
        `Backup downloaded with ${Object.keys(backup.tables || {}).length} tables and ${formatCount(
          Object.values(backup.tableCounts || {}).reduce((a, b) => a + b, 0),
        )} rows.`,
      );
      setProgress('');
    } catch (err) {
      setError(err?.message || 'Export failed');
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setError('Choose a backup JSON file first');
      return;
    }
    if (confirmText.trim().toUpperCase() !== 'RESTORE') {
      setError('Type RESTORE to confirm import');
      return;
    }
    const warning = importMode === 'replace'
      ? 'This will CLEAR matching collections in the current Firebase project, then restore from the backup. Continue?'
      : 'This will upsert/merge rows into the current Firebase project. Continue?';
    if (!window.confirm(warning)) return;

    setBusy(true);
    setError('');
    setSuccess('');
    setProgress('Reading backup file…');
    try {
      const backup = await parseBackupFile(importFile);
      const results = await importBackupPayload(backup, {
        mode: importMode,
        onProgress: ({ phase, table, tableIndex, tableCount, rowCount, expected }) => {
          if (phase === 'clear') {
            setProgress(`Clearing ${table} (${tableIndex}/${tableCount})…`);
            return;
          }
          setProgress(
            `Importing ${table} (${tableIndex}/${tableCount}) — ${formatCount(rowCount)}${expected != null ? ` / ${formatCount(expected)}` : ''} rows`,
          );
        },
      });

      const importedRows = results.imported.reduce((sum, t) => sum + (t.inserted || 0), 0);
      const warnText = results.warnings?.length
        ? ` Warnings: ${results.warnings.slice(0, 5).join(' | ')}${results.warnings.length > 5 ? '…' : ''}`
        : '';
      setSuccess(
        `Import finished. ${results.imported.length} tables updated, ${formatCount(importedRows)} rows written.${warnText}`,
      );
      setProgress('');
      setConfirmText('');
      await loadManifest();
    } catch (err) {
      setError(err?.message || 'Import failed');
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  if (!canViewDatabaseBackup(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="user-activity-page db-backup-page">
      <div className="user-activity-shell">
        <section className="user-activity-panel user-activity-panel--header">
          <div className="user-activity-header-row">
            <div>
              <h1 className="user-activity-title">Database Backup</h1>
              <p className="user-activity-subtitle">
                Export a full business-data backup (products, sales, laybys, inventory, etc.) and restore it into this Firebase project or another project with the same collection layout.
              </p>
            </div>
            <div className="user-activity-header-actions">
              <button
                type="button"
                className="user-activity-refresh-btn"
                onClick={loadManifest}
                disabled={busy || loadingManifest}
              >
                {loadingManifest ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>
          <div className="db-backup-notes">
            <p><strong>Included:</strong> public app tables (products, sales, customers, laybys, quotes, stock, etc.).</p>
            <p><strong>Not included:</strong> Firebase Auth login accounts, or files in Storage (product images). Recreate Auth users on a new project; image URLs may still point at the old host.</p>
            <p><strong>New project:</strong> create the project → run schema/migrations → point the app env at it → Import here.</p>
          </div>
        </section>

        {(error || success || progress) && (
          <section className="user-activity-panel">
            {error && <p className="db-backup-error">{error}</p>}
            {success && <p className="db-backup-success">{success}</p>}
            {progress && <p className="db-backup-progress">{progress}</p>}
          </section>
        )}

        <section className="user-activity-panel">
          <h2 className="db-backup-section-title">Export</h2>
          <p className="user-activity-subtitle" style={{ marginTop: 0 }}>
            Downloads one JSON file with all existing tables ({formatCount(existingTables.length)} tables, {formatCount(totalRows)} rows).
          </p>
          <button
            type="button"
            className="user-activity-refresh-btn db-backup-primary-btn"
            onClick={handleExport}
            disabled={busy || loadingManifest || !existingTables.length}
          >
            {busy ? 'Working…' : 'Export entire database'}
          </button>
        </section>

        <section className="user-activity-panel">
          <h2 className="db-backup-section-title">Import / Restore</h2>
          <p className="user-activity-subtitle" style={{ marginTop: 0 }}>
            Restores into the <strong>currently connected</strong> Firebase project. Use Replace when migrating to an empty project, or Merge to upsert by id.
          </p>
          <div className="db-backup-import-grid">
            <label className="db-backup-field">
              <span>Backup file</span>
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </label>
            <label className="db-backup-field">
              <span>Mode</span>
              <select
                className="user-activity-select"
                value={importMode}
                disabled={busy}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="replace">Replace (clear tables, then insert)</option>
                <option value="merge">Merge (upsert by id)</option>
              </select>
            </label>
            <label className="db-backup-field">
              <span>Type RESTORE to confirm</span>
              <input
                className="user-activity-input"
                value={confirmText}
                disabled={busy}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                autoComplete="off"
              />
            </label>
          </div>
          <button
            type="button"
            className="user-activity-clear-btn db-backup-danger-btn"
            onClick={handleImport}
            disabled={busy || !importFile}
          >
            {busy ? 'Working…' : 'Import backup into current project'}
          </button>
        </section>

        <section className="user-activity-panel user-activity-panel--table">
          <div className="db-backup-table-wrap">
            <table className="user-activity-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Status</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {loadingManifest && (
                  <tr>
                    <td colSpan={3}>Loading table list…</td>
                  </tr>
                )}
                {!loadingManifest && (manifest?.tables || []).map((row) => (
                  <tr key={row.table}>
                    <td>{row.table}</td>
                    <td>{row.exists ? 'Present' : 'Missing'}</td>
                    <td>{row.exists ? formatCount(row.count) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
