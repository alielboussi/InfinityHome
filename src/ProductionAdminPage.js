import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { canManageCatalog, getCurrentUser } from './accessControl';
import {
  amendProductionCreateLog,
  amendProductionStockIncreaseLog,
  fetchProductionEventsLog,
  isProductionPacketNameTaken,
} from './services/warehouseProductionApi';
import { formatProductionLogSource } from './utils/productionReportPdf';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function ProductionAdminEditModal({
  mode,
  row,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState(row?.name || '');
  const [qty, setQty] = useState(String(row?.qty_added ?? row?.qty_after ?? '1'));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setName(row?.name || '');
    setQty(String(row?.qty_added ?? row?.qty_after ?? '1'));
    setFormError('');
  }, [row]);

  if (!row) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const qtyNum = Math.max(0, Math.floor(Number(qty) || 0));
    if (mode === 'increase' && qtyNum < 1) {
      setFormError('Quantity added must be at least 1.');
      return;
    }
    if (mode === 'create') {
      const trimmed = String(name || '').trim();
      if (!trimmed) {
        setFormError('Name is required.');
        return;
      }
      try {
        const taken = await isProductionPacketNameTaken(trimmed, { excludePacketId: row.packet_id });
        if (taken) {
          setFormError('A packet with this name already exists.');
          return;
        }
      } catch (err) {
        setFormError(err?.message || 'Could not validate name.');
        return;
      }
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await amendProductionCreateLog({
          logId: row.id,
          name: String(name || '').trim(),
          qtyAdded: qtyNum,
        });
      } else {
        await amendProductionStockIncreaseLog({
          logId: row.id,
          qtyAdded: qtyNum,
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setFormError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="production-admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="production-admin-modal"
        role="dialog"
        aria-labelledby="production-admin-edit-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 id="production-admin-edit-title" className="production-admin-modal__title">
          {mode === 'create' ? 'Edit created item' : 'Edit stock increase'}
        </h3>
        <p className="production-admin-modal__meta">
          {row.sku ? <code>{row.sku}</code> : null}
          {row.edited_at ? (
            <span className="production-admin-modal__edited">
              Last edited {formatWhen(row.edited_at)}
            </span>
          ) : null}
        </p>
        {mode === 'increase' ? (
          <p className="production-admin-modal__hint">
            Saving replaces the logged “added” quantity and adjusts warehouse stock by the difference
            (current stock {row.qty_before ?? '—'} → {row.qty_after ?? '—'} at time of entry).
          </p>
        ) : (
          <p className="production-admin-modal__hint">
            Applies to the live warehouse packet (name on Packets / catalog) and replaces the logged
            opening quantity—warehouse stock at that location is adjusted to match.
          </p>
        )}

        <form onSubmit={onSubmit}>
          {mode === 'create' ? (
            <label className="production-admin-modal__field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                autoComplete="off"
                disabled={saving}
              />
            </label>
          ) : (
            <p className="production-admin-modal__readonly">
              <strong>{row.name || '—'}</strong>
            </p>
          )}

          <label className="production-admin-modal__field">
            <span>{mode === 'create' ? 'Qty entered' : 'Qty added'}</span>
            <input
              type="number"
              min={mode === 'increase' ? 1 : 0}
              step={1}
              value={qty}
              onChange={(ev) => setQty(ev.target.value)}
              disabled={saving}
            />
          </label>

          {formError ? <div className="report-error production-admin-modal__error">{formError}</div> : null}

          <div className="production-admin-modal__actions">
            <button type="button" className="report-link" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="production-admin-modal__save" disabled={saving}>
              {saving ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductionAdminPage() {
  const user = getCurrentUser();
  const canView = canManageCatalog(user);
  const [tab, setTab] = useState('creates');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creates, setCreates] = useState([]);
  const [increases, setIncreases] = useState([]);
  const [editState, setEditState] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProductionEventsLog();
      setCreates(data.creates || []);
      setIncreases(data.stock_increases || []);
    } catch (err) {
      setError(err?.message || 'Failed to load production log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="report-page production-admin-page">
      <header className="production-admin-head">
        <h2>Production</h2>
        <div className="production-admin-head__actions">
          <Link to="/production-report" className="report-link production-admin-report-link">
            Production Report
          </Link>
          <button type="button" className="report-link" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>
      <p className="user-access-intro">
        Upholstery Production app activity: new seating items and warehouse stock increases (Zebra labels on create/stock-in).
        Admins can edit names and quantities; warehouse stock is corrected to match. See also{' '}
        <Link to="/production-report">Production Report</Link>.
      </p>

      {error ? <div className="report-error production-admin-error">{error}</div> : null}

      <section className="report-section production-admin-panel">
        <div className="production-admin-tabs" role="tablist" aria-label="Production log">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'creates'}
            className={`production-admin-tabs__btn${tab === 'creates' ? ' is-active' : ''}`}
            onClick={() => setTab('creates')}
          >
            Newly created
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'increases'}
            className={`production-admin-tabs__btn${tab === 'increases' ? ' is-active' : ''}`}
            onClick={() => setTab('increases')}
          >
            Stock increases
          </button>
        </div>

        {loading ? <div className="report-blank production-admin-status">Loading…</div> : null}

        {!loading && tab === 'creates' ? (
          <div className="user-access-table-wrap production-admin-table-wrap">
            <table className="report-table user-access-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Qty entered</th>
                  <th>User</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {creates.length === 0 ? (
                  <tr><td colSpan={7}>No production creates logged yet.</td></tr>
                ) : creates.map((row) => (
                  <tr key={row.id}>
                    <td className="user-access-table__date">{formatWhen(row.created_at)}</td>
                    <td>
                      {row.name || '—'}
                      {row.edited_at ? <span className="production-admin-edited-badge">edited</span> : null}
                    </td>
                    <td><code>{row.sku || '—'}</code></td>
                    <td>{row.qty_added ?? row.qty_after ?? '—'}</td>
                    <td>{row.user_display_name || row.user_email || '—'}</td>
                    <td>{formatProductionLogSource(row)}</td>
                    <td className="production-admin-actions">
                      <button
                        type="button"
                        className="production-admin-edit-btn"
                        onClick={() => setEditState({ mode: 'create', row })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && tab === 'increases' ? (
          <div className="user-access-table-wrap production-admin-table-wrap">
            <table className="report-table user-access-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Item</th>
                  <th>User</th>
                  <th>Added</th>
                  <th>Warehouse qty</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {increases.length === 0 ? (
                  <tr><td colSpan={7}>No stock increases logged yet.</td></tr>
                ) : increases.map((row) => (
                  <tr key={row.id}>
                    <td className="user-access-table__date">{formatWhen(row.created_at)}</td>
                    <td>
                      {row.name || '—'} <code>{row.sku ? `(${row.sku})` : ''}</code>
                      {row.edited_at ? <span className="production-admin-edited-badge">edited</span> : null}
                    </td>
                    <td>{row.user_display_name || row.user_email || '—'}</td>
                    <td>+{row.qty_added ?? '—'}</td>
                    <td>
                      {row.qty_before ?? '—'} → {row.qty_after ?? '—'}
                    </td>
                    <td>{formatProductionLogSource(row)}</td>
                    <td className="production-admin-actions">
                      <button
                        type="button"
                        className="production-admin-edit-btn"
                        onClick={() => setEditState({ mode: 'increase', row })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <ProductionAdminEditModal
        mode={editState?.mode}
        row={editState?.row}
        onClose={() => setEditState(null)}
        onSaved={load}
      />
    </div>
  );
}
