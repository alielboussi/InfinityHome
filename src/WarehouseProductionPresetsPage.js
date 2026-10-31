import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { getCurrentUser, canManageCatalog } from './accessControl';
import {
  listProductionPresets,
  saveProductionPresets,
} from './services/warehouseDeliveryMobileApi';

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function PresetSection({
  title,
  hint,
  items,
  setItems,
  newValue,
  setNewValue,
  onAdd,
  busy,
}) {
  return (
    <div className="product-form-locations-section" style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>{title}</h2>
      <p style={{ color: 'var(--dash-muted)', marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>{hint}</p>
      <form
        onSubmit={onAdd}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}
      >
        <label style={{ flex: '1 1 220px', display: 'block' }}>
          <span className="product-form-label" style={{ display: 'block', marginBottom: 6 }}>New preset</span>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            disabled={busy}
            autoComplete="off"
            style={{ width: '100%' }}
          />
        </label>
        <button type="submit" className="product-form-btn product-form-btn--primary" disabled={busy}>
          Add
        </button>
      </form>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((label, index) => (
          <li key={`${label}-${index}`} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, flex: 1 }}>{label}</span>
            <button
              type="button"
              className="report-link"
              style={{ color: 'var(--dash-danger, #f87171)' }}
              disabled={busy}
              onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WarehouseProductionPresetsPage() {
  const user = getCurrentUser();
  const allowed = canManageCatalog(user);
  const [seater, setSeater] = useState([]);
  const [carpentry, setCarpentry] = useState([]);
  const [newSeater, setNewSeater] = useState('');
  const [newCarpentry, setNewCarpentry] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listProductionPresets();
      setSeater(res.seater || res.production_presets?.seater || []);
      setCarpentry(res.carpentry || res.production_presets?.carpentry || []);
    } catch (err) {
      setError(err?.message || 'Failed to load presets');
      setSeater([]);
      setCarpentry([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const onSave = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await saveProductionPresets({ seater, carpentry });
      setSuccess('Presets saved. The Production app loads these on next catalog refresh (no rebuild).');
      await load();
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const addSeater = (e) => {
    e.preventDefault();
    const label = normalizeLabel(newSeater);
    if (!label) {
      setError('Enter a preset name.');
      return;
    }
    if (seater.some((s) => s.toLowerCase() === label.toLowerCase())) {
      setError('That seater preset already exists.');
      return;
    }
    setError('');
    setSeater((prev) => [...prev, label]);
    setNewSeater('');
  };

  const addCarpentry = (e) => {
    e.preventDefault();
    const label = normalizeLabel(newCarpentry);
    if (!label) {
      setError('Enter a preset name.');
      return;
    }
    if (carpentry.some((s) => s.toLowerCase() === label.toLowerCase())) {
      setError('That carpentry preset already exists.');
      return;
    }
    setError('');
    setCarpentry((prev) => [...prev, label]);
    setNewCarpentry('');
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
        <h1 style={{ margin: 0 }}>Production app presets</h1>
      </div>
      <p style={{ color: 'var(--dash-muted)', marginTop: 8, lineHeight: 1.5 }}>
        Seater and Carpentry dropdowns on the Production app Create screen read this list from the server.
        Save here when you add types — staff get updates after the app refreshes catalog (pull to refresh or reopen Create).
      </p>
      <p style={{ marginTop: 8 }}>
        <Link to="/warehouse-delivery-drivers" className="report-link">← Delivery drivers</Link>
      </p>

      {error ? <div className="report-error" style={{ marginTop: 12 }}>{error}</div> : null}
      {success ? <div className="report-success" style={{ marginTop: 12 }}>{success}</div> : null}

      {loading ? <p style={{ color: 'var(--dash-muted)', marginTop: 20 }}>Loading…</p> : null}

      {!loading ? (
        <>
          <PresetSection
            title="Seater / upholstery"
            hint="Upholstery group on Create (sofas, curtains, etc.). WhatsApp alerts use the main Production group."
            items={seater}
            setItems={setSeater}
            newValue={newSeater}
            setNewValue={setNewSeater}
            onAdd={addSeater}
            busy={busy}
          />
          <PresetSection
            title="Carpentry"
            hint="Wood furniture group on Create. WhatsApp alerts use WHATSAPP_PRODUCTION_CARPENTRY_GROUP_ID when set (else main Production group)."
            items={carpentry}
            setItems={setCarpentry}
            newValue={newCarpentry}
            setNewValue={setNewCarpentry}
            onAdd={addCarpentry}
            busy={busy}
          />
          <div style={{ marginTop: 32 }}>
            <button
              type="button"
              className="product-form-btn product-form-btn--primary"
              disabled={busy || (!seater.length && !carpentry.length)}
              onClick={onSave}
            >
              {busy ? 'Saving…' : 'Save presets'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
