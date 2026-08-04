import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { applyInventoryBulk } from './utils/inventoryApi';

const PASSWORD = 'Lebanon1111$';

const chunkArray = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

export default function ZeroStockLocationReset() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [inventoryRows, setInventoryRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await db
        .from('locations')
        .select('id, name')
        .order('name');
      if (!mounted) return;
      if (error) {
        setLocations([]);
        return;
      }
      setLocations(data || []);
    })();
    return () => { mounted = false; };
  }, []);

  const loadInventory = useCallback(async (locId) => {
    if (!locId) {
      setInventoryRows([]);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { data, error } = await db
        .from('inventory')
        .select('id, product_id, quantity, products(name, sku)')
        .eq('location', locId);
      if (error) throw error;
      const mapped = (data || []).map(row => ({
        id: row.id,
        product_id: row.product_id,
        quantity: Number(row.quantity) || 0,
        name: row.products?.name || row.product_id,
        sku: row.products?.sku || ''
      }));
      mapped.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setInventoryRows(mapped);
    } catch (err) {
      setMessage(err?.message || 'Failed to load inventory.');
      setInventoryRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventory(locationId);
  }, [locationId, loadInventory]);

  const totals = useMemo(() => {
    const totalItems = inventoryRows.length;
    const totalQty = inventoryRows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    return { totalItems, totalQty };
  }, [inventoryRows]);

  const handleReset = async () => {
    if (!locationId || busy) return;
    const typed = window.prompt('Enter password to set all stock to 0 for this location.');
    if (typed !== PASSWORD) {
      alert('Incorrect password.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const nowIso = new Date().toISOString();
      if (inventoryRows.length > 0) {
        const updates = inventoryRows.map(row => ({
          id: row.id,
          quantity: 0,
          updated_at: nowIso,
        }));
        await applyInventoryBulk({ updates }, db);
      }

      if (inventoryRows.length > 0) {
        const adjustmentRows = inventoryRows.map(row => ({
          product_id: row.product_id,
          location_id: locationId,
          quantity: 0,
          adjustment_type: 'Location Zero Reset',
          adjusted_at: nowIso,
          metadata: {
            prior_quantity: Number(row.quantity) || 0,
            reason: 'Location zero reset'
          }
        }));
        const chunks = chunkArray(adjustmentRows, 200);
        for (const chunk of chunks) {
          const { error: adjErr } = await db
            .from('inventory_adjustments')
            .insert(chunk);
          if (adjErr) throw adjErr;
        }
      }

      await loadInventory(locationId);
      setMessage('All stock quantities for this location are now 0.');
    } catch (err) {
      setMessage(err?.message || 'Failed to reset stock quantities.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', paddingTop: '1.5rem', color: '#e0e6ed', minHeight: '100vh', background: '#0f141c' }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Zero Stock by Location</h1>
      </div>
      <p style={{ color: '#9fb3c8', marginTop: 0, maxWidth: 720 }}>
        Select a location and set every product stock in that location to 0. This only changes quantities
        for the selected location. A password is required.
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="zero-stock-location" style={{ display: 'block', marginBottom: 6 }}>Location</label>
          <select
            id="zero-stock-location"
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1.5px solid #00b4d8',
              borderRadius: 8,
              background: '#23272f',
              color: '#e0e6ed'
            }}
          >
            <option value="">Select location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 12px', border: '1px solid #2c3e50', borderRadius: 8, background: '#111826' }}>
            Products: {totals.totalItems}
          </div>
          <div style={{ padding: '8px 12px', border: '1px solid #2c3e50', borderRadius: 8, background: '#111826' }}>
            Total Qty: {totals.totalQty.toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={!locationId || busy || inventoryRows.length === 0}
          style={{
            background: '#e63946',
            color: '#fff',
            border: '1px solid #e63946',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 'bold',
            cursor: (!locationId || busy || inventoryRows.length === 0) ? 'not-allowed' : 'pointer'
          }}
        >
          {busy ? 'Setting to 0…' : 'Set all stock to 0'}
        </button>
      </div>

      {message && (
        <div style={{ marginBottom: '1rem', color: message.includes('Failed') ? '#ff8c8c' : '#7cf3ff' }}>
          {message}
        </div>
      )}

      <div style={{ border: '1px solid #1f2a3a', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: '#1a1f27', borderBottom: '1px solid #1f2a3a' }}>
          Inventory in selected location
        </div>
        {loading ? (
          <div style={{ padding: '16px' }}>Loading inventory...</div>
        ) : inventoryRows.length === 0 ? (
          <div style={{ padding: '16px', color: '#9fb3c8' }}>No inventory rows for this location.</div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#101722' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #1f2a3a' }}>Product</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #1f2a3a' }}>SKU</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #1f2a3a' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map(row => (
                  <tr key={row.id}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #1f2a3a' }}>{row.name}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #1f2a3a', color: '#9fb3c8' }}>{row.sku || '-'}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #1f2a3a', textAlign: 'right' }}>{row.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
