import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { getCurrentUser, canManageCatalog } from './accessControl';
import { listDeliveryDrivers, saveDeliveryDrivers } from './services/warehouseDeliveryMobileApi';

function normalizeName(value) {
  return String(value || '').trim();
}

export default function WarehouseDeliveryDriversPage() {
  const user = getCurrentUser();
  const allowed = canManageCatalog(user);
  const [drivers, setDrivers] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listDeliveryDrivers();
      setDrivers((res.drivers || []).map((d) => ({
        id: d.id,
        name: String(d.name || '').trim(),
      })).filter((d) => d.name));
    } catch (err) {
      setError(err?.message || 'Failed to load drivers');
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const persistNames = async (names) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await saveDeliveryDrivers(names);
      setSuccess('Driver list updated.');
      setEditingId('');
      setEditName('');
      await load();
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async (e) => {
    e?.preventDefault();
    const name = normalizeName(newName);
    if (!name) {
      setError('Enter a driver name.');
      return;
    }
    const exists = drivers.some((d) => d.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setError('This driver is already on the list.');
      return;
    }
    await persistNames([...drivers.map((d) => d.name), name]);
    setNewName('');
  };

  const onDelete = async (id) => {
    const row = drivers.find((d) => d.id === id);
    if (!row) return;
    if (!window.confirm(`Remove driver "${row.name}" from the list?`)) return;
    await persistNames(drivers.filter((d) => d.id !== id).map((d) => d.name));
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditName(row.name);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditingId('');
    setEditName('');
  };

  const saveEdit = async () => {
    const name = normalizeName(editName);
    if (!name) {
      setError('Enter a driver name.');
      return;
    }
    const duplicate = drivers.some(
      (d) => d.id !== editingId && d.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setError('Another driver already uses this name.');
      return;
    }
    const names = drivers.map((d) => (d.id === editingId ? name : d.name));
    await persistNames(names);
  };

  if (!allowed) {
    return (
      <div className="product-form" style={{ padding: 24 }}>
        <BackToDashboard />
        <p className="report-error">Admin catalog access required.</p>
      </div>
    );
  }

  return (
    <div className="product-form" style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 40px' }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Delivery drivers</h1>
      </div>
      <p style={{ color: 'var(--dash-muted)', marginTop: 8, lineHeight: 1.5 }}>
        Drivers appear in the Production app when staff send a Factory → Kitwe delivery.
      </p>
      <p style={{ marginTop: 12 }}>
        <Link to="/warehouse-production-presets" className="report-link" style={{ fontWeight: 600 }}>
          Manage Production app presets (Seater / Carpentry) →
        </Link>
      </p>

      {error ? <div className="report-error" style={{ marginTop: 12 }}>{error}</div> : null}
      {success ? <div className="report-success" style={{ marginTop: 12 }}>{success}</div> : null}

      <form
        onSubmit={onAdd}
        className="product-form-locations-section"
        style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
      >
        <label style={{ flex: '1 1 220px', display: 'block' }}>
          <span className="product-form-label" style={{ display: 'block', marginBottom: 6 }}>Driver name</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. John Mwansa"
            disabled={busy}
            autoComplete="off"
            style={{ width: '100%' }}
          />
        </label>
        <button
          type="submit"
          className="product-form-btn product-form-btn--primary"
          disabled={busy || loading}
        >
          {busy ? 'Saving…' : 'Add driver'}
        </button>
      </form>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Saved drivers</h2>
        {loading ? (
          <p style={{ color: 'var(--dash-muted)' }}>Loading…</p>
        ) : null}
        {!loading && drivers.length === 0 ? (
          <p style={{ color: 'var(--dash-muted)' }}>No drivers yet. Add a name above.</p>
        ) : null}
        {!loading && drivers.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table" style={{ width: '100%', minWidth: 320 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: '55%' }}>Name</th>
                  <th style={{ textAlign: 'right', width: '45%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {editingId === row.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          disabled={busy}
                          autoFocus
                          style={{ width: '100%', maxWidth: 280 }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                      ) : (
                        <span style={{ fontWeight: 600 }}>{row.name}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {editingId === row.id ? (
                        <>
                          <button
                            type="button"
                            className="product-form-btn product-form-btn--primary"
                            style={{ marginRight: 8 }}
                            disabled={busy}
                            onClick={saveEdit}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="report-link"
                            disabled={busy}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="report-link"
                            style={{ marginRight: 12 }}
                            disabled={busy}
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="report-link"
                            style={{ color: 'var(--dash-danger, #f87171)' }}
                            disabled={busy}
                            onClick={() => onDelete(row.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
