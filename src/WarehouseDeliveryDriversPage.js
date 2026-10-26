import React, { useCallback, useEffect, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import { getCurrentUser, canManageCatalog } from './accessControl';
import { listDeliveryDrivers, saveDeliveryDrivers } from './services/warehouseDeliveryMobileApi';

export default function WarehouseDeliveryDriversPage() {
  const user = getCurrentUser();
  const allowed = canManageCatalog(user);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listDeliveryDrivers();
      const names = (res.drivers || []).map((d) => d.name).join('\n');
      setText(names);
    } catch (err) {
      setError(err?.message || 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const onSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const names = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      await saveDeliveryDrivers(names);
      setSuccess('Driver list saved.');
      await load();
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div style={{ padding: 24, color: '#f87171' }}>
        <BackToDashboard />
        <p>Admin catalog access required.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', color: '#e2e8f0' }}>
      <BackToDashboard />
      <h1 style={{ marginTop: 16 }}>Delivery drivers</h1>
      <p style={{ color: '#94a3b8' }}>
        One driver name per line. These names appear in the Warehouse app when sending a delivery to Kitwe.
      </p>
      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}
      {success ? <p style={{ color: '#4ade80' }}>{success}</p> : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        style={{
          width: '100%',
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          border: '1px solid #334155',
          background: '#0f172a',
          color: '#f8fafc',
          fontSize: 16,
        }}
        placeholder="John Mwansa&#10;Mary Banda"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        style={{
          marginTop: 16,
          padding: '12px 20px',
          borderRadius: 8,
          border: 'none',
          background: '#38bdf8',
          color: '#0f172a',
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving…' : 'Save drivers'}
      </button>
    </div>
  );
}
