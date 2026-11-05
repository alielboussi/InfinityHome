import React, { useCallback, useEffect, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import './kitwe-catalog-page.css';
import { slugifyMaterialUomCode } from './constants/carpentryUom';
import { createMaterialUomViaApi, fetchMaterialUoms } from './services/materialUomApi';

export default function MaterialsUomPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchMaterialUoms();
      setRows(payload?.uoms || []);
    } catch (err) {
      setError(err?.message || 'Failed to load units of measure');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const trimmedLabel = label.trim();
    const normalizedCode = slugifyMaterialUomCode(code);
    if (!trimmedLabel) return;
    if (!normalizedCode) {
      setError('Enter a code (letters, numbers, e.g. pieces or sq_m).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createMaterialUomViaApi({
        label: trimmedLabel,
        code: normalizedCode,
      });
      setLabel('');
      setCode('');
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to create UOM');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kitwe-catalog-page">
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>Units of measure</h1>
      <p style={{ color: 'var(--kitwe-muted, #64748b)', marginBottom: 16, maxWidth: 720 }}>
        Define units used on storeroom materials and carpentry/upholstery BOMs (e.g. metre, kg, roll).
        Create UOMs here before adding materials in Storerooms 1–3.
      </p>

      <section className="kitwe-create-form" style={{ marginBottom: 24, maxWidth: 720 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Create UOM</h2>
        <form onSubmit={submit}>
          <div className="kitwe-component-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="kitwe-form-control kitwe-form-control--product"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Display label (e.g. Square metre)"
              required
            />
          </div>
          <div className="kitwe-component-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="kitwe-form-control"
              style={{ flex: '1 1 160px', fontFamily: 'monospace' }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code (type manually, e.g. pieces)"
              required
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="kitwe-btn-create-set"
            disabled={busy || !label.trim() || !code.trim()}
          >
            {busy ? 'Saving…' : 'Add UOM'}
          </button>
        </form>
      </section>

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      <div className="kitwe-catalog-table-wrap">
        <table className="kitwe-catalog-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id || row.code}>
                <td>{row.code}</td>
                <td>{row.label}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={2} className="kitwe-empty-hint">
                  {loading ? '…' : 'No UOMs yet — create one above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
