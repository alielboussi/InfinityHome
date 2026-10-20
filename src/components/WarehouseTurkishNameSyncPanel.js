import React, { useRef, useState } from 'react';
import {
  extractProductTurkishEntriesFromLabelMemory,
  parseLabelMemoryStore,
  readLabelMemoryStoreWeb,
} from '../utils/warehouseLabelMemoryEntries';
import { syncProductTurkishNamesToCatalog } from '../services/warehouseTurkishNameSync';

export default function WarehouseTurkishNameSyncPanel({ onSynced }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const runSync = async (entries, mode = 'overwrite') => {
    if (!entries.length) {
      setError('No Turkish product names found in that source.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage(`Uploading ${entries.length} names…`);
    try {
      const totals = await syncProductTurkishNamesToCatalog(entries, { mode });
      const summary = `Done: ${totals.updated} products updated, ${totals.unmatched} SKUs had no matching product, ${totals.skipped} skipped (already had a name).`;
      setMessage(summary);
      onSynced?.();
    } catch (err) {
      setError(err?.message || 'Sync failed');
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const syncFromBrowser = () => {
    const store = readLabelMemoryStoreWeb();
    const entries = extractProductTurkishEntriesFromLabelMemory(store);
    runSync(entries);
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const store = parseLabelMemoryStore(text);
      const entries = extractProductTurkishEntriesFromLabelMemory(store);
      await runSync(entries);
    } catch (err) {
      setError(err?.message || 'Could not read file');
    }
  };

  return (
    <div className="warehouse-turkish-sync-panel" style={{ marginBottom: 16, padding: 12, border: '1px solid rgba(148,163,184,0.35)', borderRadius: 8 }}>
      <strong style={{ display: 'block', marginBottom: 6 }}>Sync Turkish names to catalog</strong>
      <p className="warehouse-field-hint" style={{ margin: '0 0 10px' }}>
        Upload names that were saved only on Factory phones (label memory). Matches products by SKU and writes the <strong>Turkish Name</strong> field on each warehouse product.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="warehouse-catalog-action-btn" disabled={busy} onClick={syncFromBrowser}>
          Sync from this browser
        </button>
        <button
          type="button"
          className="warehouse-catalog-action-btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Import JSON backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
      </div>
      {busy ? <p style={{ marginTop: 8, opacity: 0.85 }}>{message || 'Working…'}</p> : null}
      {!busy && message ? <p style={{ marginTop: 8, color: '#86efac' }}>{message}</p> : null}
      {error ? <p role="alert" style={{ marginTop: 8, color: '#f87171' }}>{error}</p> : null}
    </div>
  );
}
