import React, { useEffect, useState } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';

// Simple manager for recording incomplete packages (combos missing parts) per location
export default function IncompletePackages() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  // Free-typed item name (do not force selection from existing sets/products)
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
  // Perf: only id and name needed for dropdown
  const { data: locs } = await db.from('locations').select('id, name');
      setLocations(locs || []);
      await refresh();
    })();
  }, []);

  async function refresh() {
    // Perf: restrict columns to those used in the table
    const { data, error } = await db
      .from('incomplete_packages')
      .select('id, location_id, item_name, quantity, notes')
      .order('id', { ascending: false });
    if (error) {
      console.warn('Failed to load incomplete_packages:', error);
    }
    setRows(data || []);
  }

  async function saveRow(e) {
    e.preventDefault();
    if (!locationId || !itemName.trim() || !quantity) {
      alert('Select location, type an item name and enter quantity');
      return;
    }
    setLoading(true);
    try {
      const { error } = await db.from('incomplete_packages').insert({
        location_id: locationId, // keep as-is (supports uuid or numeric)
        combo_id: null,
        item_name: itemName.trim(),
        quantity: Number(quantity),
        notes: notes || null,
      });
      if (error) {
        console.error('Insert incomplete_packages failed:', error);
        const msg = error?.message || error?.details || JSON.stringify(error);
        alert('Save failed: ' + msg);
        return;
      }
      setItemName('');
      setQuantity('');
      setNotes('');
      await refresh();
    } catch (ex) {
      console.error('Insert incomplete_packages threw:', ex);
      alert('Save failed: ' + (ex?.message || String(ex)));
    } finally {
      setLoading(false);
    }
  }

  async function updateRow(id, patch) {
  const { error } = await db.from('incomplete_packages').update(patch).eq('id', id);
    if (error) alert('Update failed: ' + error.message);
    await refresh();
  }

  async function deleteRow(id) {
    if (!window.confirm('Delete this row?')) return;
    const { error } = await db.from('incomplete_packages').delete().eq('id', id);
    if (error) alert('Delete failed: ' + error.message);
    await refresh();
  }

  return (
    <div className="products-container" style={{ maxWidth: '1000px', margin: '0 auto', padding: 16 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Incomplete Packages</h1>
      </div>

      <form onSubmit={saveRow} className="product-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'center', width: '100%', maxWidth: 1000 }}>
        <select value={locationId} onChange={e => setLocationId(e.target.value)} required style={{ width: '100%', minWidth: 220, height: 40, padding: '0 10px', marginTop: 8 }}>
          <option value="">Select Location</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Type incomplete item name" required style={{ width: '100%', minWidth: 220, height: 40, padding: '0 10px' }} />
        <input type="number" min="0" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Qty" required style={{ width: '100%', minWidth: 160, height: 40, padding: '0 10px' }} />
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ width: '100%', minWidth: 220, height: 40, padding: '0 10px' }} />
        <div style={{ gridColumn: '1 / span 4', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={loading} style={{ padding: '8px 16px', minWidth: 120 }}>
            {loading ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: 8, textAlign: 'left' }}>Location</th>
              <th style={{ padding: 8, textAlign: 'left' }}>Set</th>
              <th style={{ padding: 8 }}>Qty</th>
              <th style={{ padding: 8, textAlign: 'left' }}>Notes</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rows || [])
              .filter(r => !locationId || String(r.location_id) === String(locationId))
              .map(r => {
                const loc = locations.find(l => String(l.id) === String(r.location_id));
                return (
                  <tr key={r.id}>
                    <td style={{ padding: 8 }}>{loc ? loc.name : r.location_id}</td>
                    <td style={{ padding: 8 }}>
                      <input value={r.item_name || ''}
                        onChange={e => updateRow(r.id, { item_name: e.target.value })}
                        style={{ width: '100%', borderRadius: 4, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <input type="number" min="0" step="1" value={r.quantity}
                        onChange={e => updateRow(r.id, { quantity: Number(e.target.value) })}
                        style={{ width: 90, borderRadius: 4, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <input value={r.notes || ''} onChange={e => updateRow(r.id, { notes: e.target.value || null })}
                        style={{ width: '100%', borderRadius: 4, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <button onClick={() => deleteRow(r.id)} style={{ padding: '6px 10px', minWidth: 90 }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 12 }}>No incomplete packages recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
