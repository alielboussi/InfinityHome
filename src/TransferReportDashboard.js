import React, { useEffect, useMemo, useState } from 'react';
import supabase from './supabase';
import { FaExchangeAlt } from 'react-icons/fa';

// Simplified Transfer Report: From → To with per-product Sent/Received/Net
export default function TransferReportDashboard() {
  const [locations, setLocations] = useState([]);
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // [{ product_id, name, sku, sent, received, net }]
  // Date range (default last 30 days)
  const today = useMemo(() => new Date(), []);
  const toYMD = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const defaultEnd = useMemo(() => toYMD(today), [today]);
  const defaultStart = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return toYMD(start);
  }, [today]);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('locations').select('id, name').order('name');
      setLocations(data || []);
    })();
  }, []);

  useEffect(() => {
    if (!fromLoc || !toLoc || String(fromLoc)===String(toLoc)) { setRows([]); return; }
    if (!startDate || !endDate) { setRows([]); return; }
    // Ensure start <= end
    const sDate = new Date(`${startDate}T00:00:00`);
    const eDate = new Date(`${endDate}T23:59:59.999`);
    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime()) || sDate > eDate) { setRows([]); return; }
    const startISO = sDate.toISOString();
    const endISO = eDate.toISOString();
    setLoading(true);
    (async () => {
      // Query sessions in four parts to avoid complex OR logic with PostgREST
      const [
        a_dt,
        a_dateOnly,
        b_dt,
        b_dateOnly
      ] = await Promise.all([
        // A → B with transfer_datetime in range
        supabase
          .from('stock_transfer_sessions')
          .select('id, from_location, to_location, transfer_date, created_at, transfer_datetime')
          .eq('from_location', fromLoc)
          .eq('to_location', toLoc)
          .not('transfer_datetime', 'is', null)
          .gte('transfer_datetime', startISO)
          .lte('transfer_datetime', endISO),
        // A → B legacy rows without transfer_datetime, use transfer_date
        supabase
          .from('stock_transfer_sessions')
          .select('id, from_location, to_location, transfer_date, created_at, transfer_datetime')
          .eq('from_location', fromLoc)
          .eq('to_location', toLoc)
          .is('transfer_datetime', null)
          .gte('transfer_date', startDate)
          .lte('transfer_date', endDate),
        // B → A with transfer_datetime in range
        supabase
          .from('stock_transfer_sessions')
          .select('id, from_location, to_location, transfer_date, created_at, transfer_datetime')
          .eq('from_location', toLoc)
          .eq('to_location', fromLoc)
          .not('transfer_datetime', 'is', null)
          .gte('transfer_datetime', startISO)
          .lte('transfer_datetime', endISO),
        // B → A legacy rows without transfer_datetime
        supabase
          .from('stock_transfer_sessions')
          .select('id, from_location, to_location, transfer_date, created_at, transfer_datetime')
          .eq('from_location', toLoc)
          .eq('to_location', fromLoc)
          .is('transfer_datetime', null)
          .gte('transfer_date', startDate)
          .lte('transfer_date', endDate)
      ]);

      const sessions = [
        ...(a_dt.data || []),
        ...(a_dateOnly.data || []),
        ...(b_dt.data || []),
        ...(b_dateOnly.data || [])
      ].sort((x, y) => {
        const tx = x.transfer_datetime ? new Date(x.transfer_datetime).getTime() : new Date(x.transfer_date).getTime();
        const ty = y.transfer_datetime ? new Date(y.transfer_datetime).getTime() : new Date(y.transfer_date).getTime();
        return ty - tx; // desc
      });

      const sessionIds = sessions.map(s => s.id);
      if (!sessionIds.length) { setRows([]); setLoading(false); return; }

      const { data: entries } = await supabase
        .from('stock_transfer_entries')
        .select('session_id, product_id, quantity')
        .in('session_id', sessionIds);

      const mapA = new Map(); // product_id -> sent qty (A→B)
      const mapB = new Map(); // product_id -> received qty (B→A)
      const sessionDir = new Map(); // session_id -> 'AtoB' | 'BtoA'
      sessions.forEach(s => {
        const dir = String(s.from_location)===String(fromLoc) && String(s.to_location)===String(toLoc) ? 'AtoB' : 'BtoA';
        sessionDir.set(s.id, dir);
      });
      (entries || []).forEach(e => {
        if (!sessionDir.has(e.session_id)) return;
        const qty = Number(e.quantity)||0;
        const pid = e.product_id;
        if (sessionDir.get(e.session_id) === 'AtoB') {
          mapA.set(pid, (mapA.get(pid)||0) + qty);
        } else {
          mapB.set(pid, (mapB.get(pid)||0) + qty);
        }
      });
      const productIds = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));
      let products = [];
      if (productIds.length) {
        const { data: prodRows } = await supabase.from('products').select('id, name, sku').in('id', productIds);
        products = prodRows || [];
      }
      const prodInfo = new Map(products.map(p => [p.id, p]));
      const out = productIds.map(pid => {
        const sent = mapA.get(pid)||0;
        const received = mapB.get(pid)||0;
        const info = prodInfo.get(pid) || { name: '(unknown)', sku: '' };
        return { product_id: pid, name: info.name, sku: info.sku, sent, received, net: received - sent };
      }).sort((a,b)=> a.name.localeCompare(b.name));
      setRows(out);
      setLoading(false);
    })();
  }, [fromLoc, toLoc, startDate, endDate]);

  const nameOf = (id) => locations.find(l => String(l.id)===String(id))?.name || '';
  const totals = useMemo(()=>{
    let sent=0, received=0; rows.forEach(r=>{ sent+=r.sent; received+=r.received; });
    return { sent, received, net: received - sent };
  }, [rows]);

  // Dynamic column labels using selected location names
  const fromName = useMemo(() => {
    if (!fromLoc) return '';
    const l = locations.find(x => String(x.id) === String(fromLoc));
    return l?.name || '';
  }, [fromLoc, locations]);
  const toName = useMemo(() => {
    if (!toLoc) return '';
    const l = locations.find(x => String(x.id) === String(toLoc));
    return l?.name || '';
  }, [toLoc, locations]);
  const sentLabel = useMemo(() => {
    if (!fromName || !toName) return 'Sent (A→B)';
    return `Sent (${fromName} → ${toName})`;
  }, [fromName, toName]);
  const receivedLabel = useMemo(() => {
    if (!fromName || !toName) return 'Received (B→A)';
    return `Received (${toName} → ${fromName})`;
  }, [fromName, toName]);
  const netLabel = useMemo(() => {
    if (!fromName || !toName) return 'Net (B→A - A→B)';
    return `Net (${toName} → ${fromName} - ${fromName} → ${toName})`;
  }, [fromName, toName]);

  return (
    <div className="report-page">
      <div className="report-header">
        <h2>
          Transfers: {fromLoc && toLoc ? `${nameOf(fromLoc)} → ${nameOf(toLoc)}` : 'Select From and To'}
          {fromLoc && toLoc && startDate && endDate ? ` — ${startDate} → ${endDate}` : ''}
        </h2>
        <div className="transfer-toolbar">
          <label>From:</label>
          <select value={fromLoc} onChange={e=>setFromLoc(e.target.value)}>
            <option value="">-- From --</option>
            {locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <FaExchangeAlt className="swap-icon" />
          <label>To:</label>
          <select value={toLoc} onChange={e=>setToLoc(e.target.value)}>
            <option value="">-- To --</option>
            {locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="transfer-divider" aria-hidden="true" />
          <label>Start date:</label>
          <input type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)} />
          <label>End date:</label>
          <input type="date" value={endDate} min={startDate} onChange={e=>setEndDate(e.target.value)} />
        </div>
      </div>

      {(!fromLoc || !toLoc || String(fromLoc)===String(toLoc)) ? (
        <div className="transfer-blank-state">Choose different From and To locations to view transfers.</div>
      ) : loading ? (
        <div className="transfer-blank-state">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="transfer-blank-state">No transfers between {nameOf(fromLoc)} and {nameOf(toLoc)}.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
            <div className="card" style={{ minWidth: 220, borderLeft: '4px solid #f44336' }}>
              <div className="card-title">{sentLabel}</div>
              <div className="card-value">{totals.sent}</div>
            </div>
            <div className="card" style={{ minWidth: 220, borderLeft: '4px solid #4caf50' }}>
              <div className="card-title">{receivedLabel}</div>
              <div className="card-value">{totals.received}</div>
            </div>
            <div className="card" style={{ minWidth: 220, borderLeft: '4px solid #00b4d8' }}>
              <div className="card-title">{netLabel}</div>
              <div className="card-value">{totals.net}</div>
            </div>
          </div>

          <div className="report-section" style={{ marginTop: 24 }}>
            <div className="report-section-title">Products</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{textAlign:'left'}}>Product</th>
                  <th>SKU</th>
                  <th>{sentLabel}</th>
                  <th>{receivedLabel}</th>
                  <th>{netLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r=> (
                  <tr key={r.product_id}>
                    <td style={{textAlign:'left'}}>{r.name}</td>
                    <td>{r.sku||'-'}</td>
                    <td>{r.sent}</td>
                    <td>{r.received}</td>
                    <td>{r.net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
