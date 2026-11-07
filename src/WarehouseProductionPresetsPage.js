import React, { useCallback, useEffect, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import { getCurrentUser, canManageCatalog } from './accessControl';
import {
  listProductionPresets,
  saveProductionPresets,
} from './services/warehouseDeliveryMobileApi';

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function reorderPresetList(list, fromIndex, toIndex) {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function PresetSection({
  groupTitle,
  hint,
  items,
  onItemsChange,
  newValue,
  setNewValue,
  onAdd,
  busy,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const moveItem = (from, to) => {
    if (from == null || to == null || from === to) return;
    onItemsChange(reorderPresetList(items, from, to));
  };

  return (
    <section className="product-form-locations-section warehouse-production-presets-section">
      <h2 className="warehouse-production-presets-group-title">{groupTitle}</h2>
      <p className="warehouse-production-presets-hint">{hint}</p>
      <form className="warehouse-production-presets-add-form" onSubmit={onAdd}>
        <p className="warehouse-production-presets-add-heading">Add {groupTitle} preset</p>
        <div className="warehouse-production-presets-add-row">
          <label className="warehouse-production-presets-add-label">
            <span className="product-form-label">Preset name</span>
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              disabled={busy}
              autoComplete="off"
              placeholder={`e.g. ${groupTitle === 'Carpentry' ? 'Coffee Table' : '3 Seater'}`}
            />
          </label>
          <button
            type="submit"
            className="product-form-btn product-form-btn--primary warehouse-production-presets-add-btn"
            disabled={busy}
          >
            Add &amp; save
          </button>
        </div>
      </form>
      <p className="warehouse-production-presets-list-heading">Presets — drag to reorder</p>
      <ul className="warehouse-production-presets-list">
        {items.map((label, index) => (
          <li
            key={label}
            className={`warehouse-production-presets-row${
              dropIndex === index ? ' warehouse-production-presets-row--drop-target' : ''
            }${dragIndex === index ? ' warehouse-production-presets-row--dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropIndex !== index) setDropIndex(index);
            }}
            onDragLeave={() => {
              if (dropIndex === index) setDropIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIndex ?? Number(e.dataTransfer.getData('text/plain'));
              moveItem(from, index);
              setDragIndex(null);
              setDropIndex(null);
            }}
          >
            <button
              type="button"
              className="warehouse-production-presets-drag"
              aria-label={`Reorder ${label}`}
              disabled={busy}
              draggable={!busy}
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
            >
              ⋮⋮
            </button>
            <span className="warehouse-production-presets-label">{label}</span>
            <button
              type="button"
              className="warehouse-production-presets-remove"
              disabled={busy}
              onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
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

  const persistPresets = useCallback(async (nextSeater, nextCarpentry) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const saved = await saveProductionPresets({ seater: nextSeater, carpentry: nextCarpentry });
      setSeater(saved.seater || saved.production_presets?.seater || nextSeater);
      setCarpentry(saved.carpentry || saved.production_presets?.carpentry || nextCarpentry);
      setSuccess('Presets saved to the server. Production app picks them up after Create screen refresh.');
      return saved;
    } catch (err) {
      setError(err?.message || 'Save failed');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

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
    try {
      await persistPresets(seater, carpentry);
    } catch {
      /* error shown in persistPresets */
    }
  };

  const addSeater = async (e) => {
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
    const next = [...seater, label];
    setNewSeater('');
    try {
      await persistPresets(next, carpentry);
    } catch {
      await load();
    }
  };

  const addCarpentry = async (e) => {
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
    const next = [...carpentry, label];
    setNewCarpentry('');
    try {
      await persistPresets(seater, next);
    } catch {
      await load();
    }
  };

  const updateSeaterList = useCallback(async (nextSeater) => {
    try {
      await persistPresets(nextSeater, carpentry);
    } catch {
      await load();
    }
  }, [carpentry, load, persistPresets]);

  const updateCarpentryList = useCallback(async (nextCarpentry) => {
    try {
      await persistPresets(seater, nextCarpentry);
    } catch {
      await load();
    }
  }, [load, persistPresets, seater]);

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
        <h1 style={{ margin: 0 }}>Presets</h1>
      </div>
      <p style={{ color: 'var(--dash-muted)', marginTop: 8, lineHeight: 1.5 }}>
        Lists feed the Production app Create screen. Add, remove, or drag to reorder — each change saves to the server
        automatically. The Production app loads updates when you leave and return to Create.
      </p>
      {error ? <div className="report-error" style={{ marginTop: 12 }}>{error}</div> : null}
      {success ? <div className="report-success" style={{ marginTop: 12 }}>{success}</div> : null}

      {loading ? <p style={{ color: 'var(--dash-muted)', marginTop: 20 }}>Loading…</p> : null}

      {!loading ? (
        <>
          <PresetSection
            groupTitle="Upholstery"
            hint="Seater / upholstery group on the Production app Create screen (sofas, curtains, etc.). WhatsApp alerts use the main Production group."
            items={seater}
            onItemsChange={updateSeaterList}
            newValue={newSeater}
            setNewValue={setNewSeater}
            onAdd={addSeater}
            busy={busy}
          />
          <PresetSection
            groupTitle="Carpentry"
            hint="Wood furniture group on Create. WhatsApp alerts use WHATSAPP_PRODUCTION_CARPENTRY_GROUP_ID when set (else main Production group)."
            items={carpentry}
            onItemsChange={updateCarpentryList}
            newValue={newCarpentry}
            setNewValue={setNewCarpentry}
            onAdd={addCarpentry}
            busy={busy}
          />
          <div style={{ marginTop: 32 }}>
            <button
              type="button"
              className="product-form-btn product-form-btn--secondary"
              disabled={busy || loading}
              onClick={onSave}
            >
              {busy ? 'Saving…' : 'Save again'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
