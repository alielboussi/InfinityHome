import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchWarehouseCatalog,
  saveWarehouseAccessory,
  saveWarehouseAccessorySubcategory,
} from '../services/warehouseCatalog';
import {
  listAccessorySubcategories,
} from '../utils/warehouseAccessoryCatalog';

export default function WarehouseAccessoryCreateDialog({
  open,
  floor = '1',
  onClose,
  onCreated,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assemblies, setAssemblies] = useState([]);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  const subcategories = useMemo(() => listAccessorySubcategories(assemblies), [assemblies]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const catalog = await fetchWarehouseCatalog();
      setAssemblies(catalog?.assemblies || []);
    } catch (err) {
      setError(err?.message || 'Failed to load accessories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    setName('');
    setQty('1');
    setNewSubName('');
    setImageFile(null);
    setImagePreview('');
    void load();
    return undefined;
  }, [open]);

  if (!open) return null;

  const addSubcategory = async () => {
    setSaving(true);
    setError('');
    try {
      const row = await saveWarehouseAccessorySubcategory(newSubName);
      setNewSubName('');
      await load();
      setSubcategoryId(String(row.id));
    } catch (err) {
      setError(err?.message || 'Failed to add subcategory.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const sub = subcategories.find((s) => s.id === String(subcategoryId));
    setSaving(true);
    setError('');
    try {
      await saveWarehouseAccessory({
        name,
        qty,
        subcategoryId,
        subcategoryName: sub?.name || '',
        imageFile,
        floor,
      });
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Failed to create accessory.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="warehouse-accessory-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="wh-acc-title">
      <form className="warehouse-accessory-dialog" onSubmit={handleSave}>
        <h2 id="wh-acc-title">New accessory</h2>
        <p className="quotes-muted-text">Floor {floor === '2' ? '2' : '1'} · SKU is generated automatically.</p>
        {error ? <div className="report-error" style={{ marginBottom: 8 }}>{error}</div> : null}
        {loading ? <p>Loading…</p> : null}

        <label className="warehouse-field">
          <span>Subcategory</span>
          <select
            className="quotes-select"
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
            required
          >
            <option value="">Select subcategory…</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div className="warehouse-generate-sku-row" style={{ gap: 8, marginBottom: 12 }}>
          <input
            className="quotes-input"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            placeholder="New subcategory name"
          />
          <button type="button" className="warehouse-catalog-action-btn" disabled={saving || !newSubName.trim()} onClick={addSubcategory}>
            Add subcategory
          </button>
        </div>

        <label className="warehouse-field">
          <span>Name</span>
          <input className="quotes-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold tassel fringe" />
        </label>
        <label className="warehouse-field">
          <span>Qty</span>
          <input
            className="quotes-input"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
          />
        </label>
        <label className="warehouse-field">
          <span>Photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setImageFile(file);
              setImagePreview(file ? URL.createObjectURL(file) : '');
            }}
          />
        </label>
        {imagePreview ? (
          <img src={imagePreview} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
        ) : null}

        <div className="warehouse-generate-sku-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="warehouse-catalog-action-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save accessory'}
          </button>
        </div>
      </form>
    </div>
  );
}
