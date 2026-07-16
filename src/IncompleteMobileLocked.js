/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import supabase from './supabase';

// Location-locked incomplete sets/products mobile view
// Locks to: 454a092c-5b12-441e-b99d-216f6fa72198
const LOCKED_LOCATION_ID = '454a092c-5b12-441e-b99d-216f6fa72198';

export default function IncompleteMobileLocked() {
  const [locationName, setLocationName] = React.useState('');
  const [rows, setRows] = React.useState([]);
  const [combos, setCombos] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: locs }, { data: ip, error: e1 }, { data: combosData, error: e2 }] = await Promise.all([
        supabase.from('locations').select('id, name'),
        supabase.from('incomplete_packages').select('id, location_id, combo_id, item_name, quantity, notes').order('id', { ascending: false }),
        supabase.from('combos').select('id, combo_name'),
      ]);
      const loc = (locs || []).find(l => String(l.id) === String(LOCKED_LOCATION_ID));
      setLocationName(loc ? (loc.name || '') : LOCKED_LOCATION_ID);
      if (e1) throw e1; if (e2) throw e2;
      setRows((ip || []).filter(r => String(r.location_id) === String(LOCKED_LOCATION_ID)));
      setCombos(combosData || []);
    } catch (ex) {
      console.error('Load failed:', ex);
      const msg = ex?.message || ex?.details || String(ex);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="stock-report-mobile-container">
      <div className="stock-report-mobile-filters" style={{ position: 'static' }}>
        <div className="stock-report-mobile-select" style={{ textAlign: 'center' }}>
          Location locked to {locationName || LOCKED_LOCATION_ID}
        </div>
        <div className="stock-report-mobile-select" style={{ textAlign: 'center', borderColor: '#ff9800', color: '#ffcc80', background: '#2b2416' }}>
          Incomplete Sets / Products
        </div>
      </div>

      <div className="stock-report-mobile-list">
        {error && (
          <div className="stock-report-mobile-card" style={{ border: '2px solid #ff6b6b', background: '#2b1616', color: '#fff' }}>
            Failed to load: {error}
          </div>
        )}

        <div className="stock-report-mobile-card" style={{ border: '2px dashed #ff9800', background: '#2b2416' }}>
          <div style={{ fontWeight: 'bold', color: '#ffcc80', marginBottom: 6 }}>Incomplete Packages</div>
          {loading ? (
            <div style={{ color: '#e0f7fa' }}>Loading…</div>
          ) : (rows && rows.length > 0 ? (
            <div style={{ color: '#fff' }}>
              {rows.map(r => {
                const combo = combos.find(c => String(c.id) === String(r.combo_id));
                return (
                  <div key={r.id} style={{ marginBottom: 6 }}>
                    <b>{(r.item_name && r.item_name.trim()) ? r.item_name : (combo ? combo.combo_name : r.combo_id)}</b>
                    <span> — Qty {r.quantity}</span>
                    {r.notes ? <span> ({r.notes})</span> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#e0f7fa', opacity: 0.85 }}>No incomplete items recorded for this location.</div>
          ))}
        </div>

        <div className="stock-report-mobile-card" style={{ background: '#0f1720', borderColor: '#00bfff' }}>
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button onClick={refresh} disabled={loading} style={{ flex: 1, background: '#00bfff', color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700 }}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
