import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { canManageCatalog, getCurrentUser } from './accessControl';
import {
  fetchWarehouseCatalog,
  saveWarehousePacket,
} from './services/warehouseCatalog';

const emptyPacketForm = {
  sku: '',
  name: '',
  packet_number: '',
  qty_per_unit: '1',
};

export default function WarehousePacketEditPage() {
  const { packetId } = useParams();
  const navigate = useNavigate();
  const isNew = !packetId;
  const canManage = useMemo(() => canManageCatalog(getCurrentUser()), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [packets, setPackets] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [packetForm, setPacketForm] = useState(emptyPacketForm);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouseCatalog();
      setPackets(data.packets);
      setWarehouseLocationId(data.warehouseLocationId);
      setWarehouseLocationName(data.warehouseLocationName);
      if (!data.warehouseLocationId) {
        setError('No Warehouse location found. Add a location named "Warehouse".');
      }
      if (!isNew) {
        const row = (data.packets || []).find((p) => String(p.id) === String(packetId));
        if (!row) {
          setError('Packet not found.');
        } else {
          setPacketForm({
            sku: row.sku || '',
            name: row.name || '',
            packet_number: String(row.packet_number ?? ''),
            qty_per_unit: String(row.qty_per_unit ?? '1'),
          });
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to load packet');
    } finally {
      setLoading(false);
    }
  }, [isNew, packetId]);

  useEffect(() => {
    if (!canManage) {
      navigate('/warehouse-products', { replace: true });
      return;
    }
    load();
  }, [canManage, load, navigate]);

  const promptNewPacketQtyOnHand = () => {
    const label = packetForm.sku.trim() || packetForm.name.trim() || 'this packet';
    const raw = window.prompt(
      `Qty on hand at ${warehouseLocationName} for ${label}?`,
      '0',
    );
    if (raw === null) return null;
    const trimmed = String(raw).trim();
    if (!/^\d+$/.test(trimmed)) {
      setError('Enter a whole number for qty on hand.');
      return null;
    }
    return Math.max(0, parseInt(trimmed, 10));
  };

  const handleSavePacket = async (e) => {
    e.preventDefault();
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured.');
      return;
    }
    setSaving(true);
    setError('');
    setSaveNotice('');
    try {
      let initial_quantity;
      if (isNew) {
        const qty = promptNewPacketQtyOnHand();
        if (qty === null) {
          setSaving(false);
          return;
        }
        initial_quantity = qty;
      }
      const existing = !isNew
        ? (packets || []).find((p) => String(p.id) === String(packetId))
        : null;
      await saveWarehousePacket(
        {
          ...packetForm,
          qty_per_unit: 1,
          assembly_id: existing?.assembly_id ?? null,
          warehouse_location_id: warehouseLocationId,
          ...(initial_quantity != null ? { initial_quantity } : {}),
        },
        { id: isNew ? null : packetId },
      );
      const data = await fetchWarehouseCatalog();
      setPackets(data.packets);
      if (isNew) {
        setPacketForm(emptyPacketForm);
        setSaveNotice('Packet saved. You can add another below.');
      } else {
        setSaveNotice('Changes saved.');
        const row = (data.packets || []).find((p) => String(p.id) === String(packetId));
        if (row) {
          setPacketForm({
            sku: row.sku || '',
            name: row.name || '',
            packet_number: String(row.packet_number ?? ''),
            qty_per_unit: String(row.qty_per_unit ?? '1'),
          });
        }
      }
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;

  return (
    <div className="products-container warehouse-products-page" style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard
          to="/warehouse-products"
          title="Back to warehouse products"
          ariaLabel="Back to warehouse products"
        />
        <h1 className="products-title" style={{ margin: 0 }}>
          {isNew ? 'New packet' : 'Edit packet'}
        </h1>
      </div>

      <p className="stc-note" style={{ margin: '8px 0 16px', opacity: 0.85 }}>
        Packets are stored at <strong>{warehouseLocationName}</strong>. Link to a finished product from the{' '}
        <Link to="/warehouse-products">products</Link> list.
      </p>

      {error ? (
        <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>
      ) : null}
      {saveNotice ? (
        <div role="status" style={{ color: '#16a34a', marginBottom: 12 }}>{saveNotice}</div>
      ) : null}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <form onSubmit={handleSavePacket} className="product-form warehouse-form-panel warehouse-form-panel--packet">
          <h3 className="warehouse-form-title">
            <span className="warehouse-kind-badge warehouse-kind-badge--packet">Packet</span>
            {isNew ? 'New packet' : 'Edit packet'}
          </h3>
          <div className="warehouse-field">
            <label htmlFor="wh-packet-sku-edit">SKU (Code 128)</label>
            <input
              id="wh-packet-sku-edit"
              required
              placeholder="e.g. 12VEM3300P01COCZ"
              value={packetForm.sku}
              onChange={(e) => setPacketForm((f) => ({ ...f, sku: e.target.value }))}
              style={{ fontFamily: 'monospace' }}
            />
          </div>
          <div className="warehouse-field">
            <label htmlFor="wh-packet-name-edit">Name</label>
            <input
              id="wh-packet-name-edit"
              required
              value={packetForm.name}
              onChange={(e) => setPacketForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="warehouse-field" style={{ flex: '1 1 120px' }}>
              <label htmlFor="wh-packet-num-edit">Packet #</label>
              <input
                id="wh-packet-num-edit"
                required
                type="number"
                min="1"
                value={packetForm.packet_number}
                onChange={(e) => setPacketForm((f) => ({ ...f, packet_number: e.target.value }))}
              />
            </div>
            <div className="warehouse-field" style={{ flex: '1 1 120px' }}>
              <label htmlFor="wh-packet-qty-edit">Qty per product</label>
              <input
                id="wh-packet-qty-edit"
                type="number"
                min="1"
                max="1"
                value="1"
                readOnly
                disabled
                aria-readonly="true"
              />
            </div>
          </div>
          <div className="warehouse-field-hint" style={{ marginBottom: 0 }}>
            <div><strong>Packet #</strong> — Label box number (e.g. <strong>3</strong> for “03 / 4”).</div>
            <div><strong>Qty per product</strong> — Cartons of this SKU per finished unit (use <strong>2</strong> when one label slot is covered twice).</div>
          </div>
          <div className="warehouse-form-actions">
            <button type="submit" className="product-form-btn product-form-btn--primary" disabled={saving || !warehouseLocationId}>
              {saving ? 'Saving…' : 'Save packet'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
