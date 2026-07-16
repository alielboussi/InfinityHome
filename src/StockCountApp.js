import React, { useCallback, useEffect, useState } from 'react';
import supabase from './supabase';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { fetchInventorySnapshot } from './services/inventorySnapshot';

const EXCLUDED_LOCATION_ID = '39ffaa82-8aee-4a33-8de8-06584cbaffcf';
const PERIOD_STATUS_OPEN = 'open';
const PERIOD_STATUS_LOCKED = 'open_locked';
const PRODUCT_LOOKUP_BATCH_SIZE = 80;

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const fetchProductsMap = async (productIds) => {
  const ids = Array.from(new Set((productIds || []).filter(Boolean).map((value) => String(value))));
  if (!ids.length) return { map: new Map(), hadError: false };

  const batches = [];
  for (let index = 0; index < ids.length; index += PRODUCT_LOOKUP_BATCH_SIZE) {
    batches.push(ids.slice(index, index + PRODUCT_LOOKUP_BATCH_SIZE));
  }

  const settled = await Promise.allSettled(
    batches.map(async (batchIds) => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .in('id', batchIds);
      if (error) throw error;
      return data || [];
    })
  );

  const map = new Map();
  let hadError = false;
  settled.forEach((result) => {
    if (result.status !== 'fulfilled') {
      hadError = true;
      return;
    }
    result.value.forEach((row) => {
      map.set(String(row.id), row);
    });
  });

  return { map, hadError };
};


const downloadCsv = (rows) => {
  const header = ['Product', 'SKU', 'Live Balance', 'Counted', 'Difference', 'Status'];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    const diff = row.counted - row.expected;
    const status = row.counted === 0 ? 'Not counted' : 'Mismatch';
    lines.push([
      `"${String(row.name || '').replace(/"/g, '""')}"`,
      `"${String(row.sku || '').replace(/"/g, '""')}"`,
      row.expected,
      row.counted,
      diff,
      status,
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'stock_count_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function StockCountApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState([]);
  const [counts, setCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [countsError, setCountsError] = useState('');
  const [lookupWarning, setLookupWarning] = useState('');
  const [view, setView] = useState('count');
  const [summaryRows, setSummaryRows] = useState([]);

  const rtTickCounts = useRealtimeRefresh(
    period?.id ? ['stock_count_checks'] : [],
    250,
    period?.id ? { stock_count_checks: `session_id=eq.${period.id}` } : undefined
  );
  const rtTickInventory = useRealtimeRefresh(
    locationId ? ['inventory', 'stock_periods'] : [],
    300,
    locationId ? {
      inventory: { column: 'location', value: locationId },
      stock_periods: { column: 'location_id', value: locationId },
    } : undefined
  );

  const loadEntries = useCallback(async ({ silent = false, keepView = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    setLookupWarning('');
    try {
      if (!locationId) {
        setPeriod(null);
        setEntries([]);
        setCounts({});
        setSummaryRows([]);
        setLookupWarning('');
        if (!keepView) setView('count');
        if (!silent) setLoading(false);
        return;
      }
      const { data: periodRow, error: periodErr } = await supabase
        .from('stock_periods')
        .select('id, status, opened_at')
        .eq('location_id', locationId)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (periodErr) throw periodErr;
      setPeriod(periodRow || null);
      const snap = await fetchInventorySnapshot(locationId);
      if (snap.error) throw snap.error;
      const stockRows = snap.data || [];
      const productIds = Array.from(new Set(stockRows.map(row => row.product_id).filter(Boolean)));
      let productsMap = new Map();
      if (productIds.length) {
        const productLookup = await fetchProductsMap(productIds);
        productsMap = productLookup.map;
        if (productLookup.hadError) {
          setLookupWarning('Some product names could not be loaded. Showing product IDs until refresh succeeds.');
        }
      }
      const mapped = stockRows
        .map((row) => {
          const product = productsMap.get(String(row.product_id)) || {};
          return {
            product_id: row.product_id,
            qty: toNumber(row.quantity),
            name: product.name || row.product_id,
            sku: product.sku || '',
          };
        })
        .filter((entry) => entry.qty > 0);
      mapped.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setEntries(mapped);
      if (!keepView) {
        setView('count');
        setSummaryRows([]);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load stock count data.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [locationId]);

  const loadCounts = useCallback(async (sessionId, list) => {
    if (!sessionId) return;
    setCountsLoading(true);
    setCountsError('');
    try {
      const { data, error: countErr } = await supabase
        .from('stock_count_checks')
        .select('product_id, counted')
        .eq('session_id', sessionId)
        .eq('location_id', locationId);
      if (countErr) throw countErr;
      const map = {};
      (data || []).forEach((row) => {
        map[String(row.product_id)] = toNumber(row.counted);
      });
      const source = Array.isArray(list) ? list : entries;
      setCounts(() => {
        const next = {};
        source.forEach((entry) => {
          const pid = String(entry.product_id);
          next[pid] = map[pid] ?? 0;
        });
        return next;
      });
    } catch (err) {
      setCountsError(err?.message || 'Failed to sync stock counts.');
    } finally {
      setCountsLoading(false);
    }
  }, [entries, locationId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: locErr } = await supabase
        .from('locations')
        .select('id, name')
        .order('name');
      if (locErr || !mounted) return;
      const filtered = (data || []).filter(loc => loc.id !== EXCLUDED_LOCATION_ID);
      setLocations(filtered);
      if (!locationId && filtered.length > 0) {
        setLocationId(filtered[0].id);
      }
    })();
    return () => { mounted = false; };
  }, [locationId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!locationId || rtTickInventory === 0) return;
    loadEntries({ silent: true, keepView: true });
  }, [locationId, rtTickInventory, loadEntries]);

  useEffect(() => {
    if (!entries.length) return;
    if (!period?.id) {
      setCounts(() => {
        const next = {};
        entries.forEach((entry) => {
          next[String(entry.product_id)] = 0;
        });
        return next;
      });
      return;
    }
    loadCounts(period.id, entries);
  }, [entries, period?.id, loadCounts]);

  useEffect(() => {
    if (!period?.id || !entries.length) return;
    loadCounts(period.id, entries);
  }, [period?.id, entries, rtTickCounts, loadCounts]);

  const applyDelta = useCallback(async (productId, delta) => {
    if (!locationId) return;
    setCountsError('');
    try {
      if (!period?.id) {
        setCounts((prev) => ({
          ...prev,
          [productId]: Math.max(0, toNumber(prev[productId]) + delta),
        }));
        return;
      }
      const { data, error: rpcErr } = await supabase.rpc('stock_count_add', {
        p_session_id: period.id,
        p_product_id: productId,
        p_location_id: locationId,
        p_delta: delta,
      });
      if (rpcErr) throw rpcErr;
      const nextValue = Number.isFinite(Number(data)) ? Number(data) : null;
      setCounts((prev) => ({
        ...prev,
        [productId]: nextValue ?? Math.max(0, toNumber(prev[productId]) + delta),
      }));
    } catch (err) {
      setCountsError(err?.message || 'Failed to update count.');
    }
  }, [period?.id, locationId]);

  const searchTerm = String(search || '').trim().toLowerCase();
  const filteredEntries = searchTerm
    ? entries.filter((entry) => {
        const name = String(entry.name || '').toLowerCase();
        const sku = String(entry.sku || '').toLowerCase();
        return name.includes(searchTerm) || sku.includes(searchTerm);
      })
    : entries;
  const filteredSummaryRows = searchTerm
    ? summaryRows.filter((row) => {
        const name = String(row.name || '').toLowerCase();
        const sku = String(row.sku || '').toLowerCase();
        return name.includes(searchTerm) || sku.includes(searchTerm);
      })
    : summaryRows;
  const totalItems = entries.length;
  const matchedItems = entries.filter((entry) => toNumber(counts[String(entry.product_id)]) === entry.qty).length;

  const handleFinalize = () => {
    const mismatches = entries
      .map((entry) => {
        const counted = toNumber(counts[String(entry.product_id)]);
        if (counted === entry.qty) return null;
        return {
          product_id: entry.product_id,
          name: entry.name,
          sku: entry.sku,
          expected: entry.qty,
          counted,
        };
      })
      .filter(Boolean);
    setSummaryRows(mismatches);
    setView('summary');
  };

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', color: '#e0e6ed' }}>
        Loading stock count...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1.5rem', color: '#e0e6ed' }}>
        <div style={{ marginBottom: '0.75rem', color: '#ff8c8c' }}>{error}</div>
        <button type="button" onClick={loadEntries}>Retry</button>
      </div>
    );
  }

  const periodLabel = period
    ? (period.status === PERIOD_STATUS_LOCKED ? 'Locked' : period.status === PERIOD_STATUS_OPEN ? 'Open' : period.status || 'Unknown')
    : 'No period';

  return (
    <div style={{ padding: '1.5rem', color: '#e0e6ed' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>
            Stock Count - {locations.find(loc => loc.id === locationId)?.name || 'Select Location'}
          </h2>
          <div style={{ color: '#9aa4b2', marginTop: '0.4rem' }}>
            Period status: {periodLabel}
          </div>
          <div style={{ color: '#9aa4b2', marginTop: '0.2rem' }}>
            Live balance refreshes automatically for the selected location.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or SKU"
            style={{ minWidth: '220px', padding: '0.45rem 0.65rem' }}
          />
          <label style={{ color: '#9aa4b2' }}>
            Location
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={loadEntries}>Refresh</button>
        </div>
      </div>

      {countsError && (
        <div style={{ marginTop: '0.75rem', color: '#ff8c8c' }}>{countsError}</div>
      )}

      {lookupWarning && (
        <div style={{ marginTop: '0.75rem', color: '#f4d35e' }}>{lookupWarning}</div>
      )}

      {!period && (
        <div style={{ marginTop: '0.75rem', color: '#f4d35e' }}>
          No stock period found for this location. Counts are stored locally for this session.
        </div>
      )}

      {period?.status === PERIOD_STATUS_LOCKED && (
        <div style={{ marginTop: '0.75rem', color: '#f4d35e' }}>
          Opening stock is locked. Counts are still allowed and will be saved to this period.
        </div>
      )}

      {view === 'count' ? (
        <>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ color: '#9aa4b2' }}>
              Matched {matchedItems} / {totalItems}
              {countsLoading && <span style={{ marginLeft: '0.5rem' }}>Syncing...</span>}
            </div>
            {searchTerm && (
              <div style={{ color: '#9aa4b2' }}>
                Showing {filteredEntries.length} search matches
              </div>
            )}
            <button type="button" onClick={handleFinalize}>Finalize Stock Count</button>
          </div>

          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Live Balance</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Counted</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const pid = String(entry.product_id);
                  const counted = toNumber(counts[pid]);
                  const matched = counted === entry.qty;
                  const over = counted > entry.qty;
                  const bg = matched ? '#1f3b2d' : over ? '#3b1f1f' : '#1a1f27';
                  return (
                    <tr key={pid} style={{ background: bg }}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 600 }}>{entry.name}</div>
                        <div style={{ color: '#9aa4b2', fontSize: '0.85rem' }}>{entry.sku || '-'}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{entry.qty}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{counted}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => applyDelta(pid, -1)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              applyDelta(pid, -1);
                            }
                          }}
                          style={{
                            display: 'inline-block',
                            marginRight: '8px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #0af',
                            cursor: 'pointer'
                          }}
                        >-1</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => applyDelta(pid, 1)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              applyDelta(pid, 1);
                            }
                          }}
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #0af',
                            cursor: 'pointer'
                          }}
                        >+1</span>
                      </td>
                    </tr>
                  );
                })}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '12px', color: '#9aa4b2' }}>
                      No stock count items match the current search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ color: '#9aa4b2' }}>
              Unmatched items: {summaryRows.length}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setView('count')}>Back to Count</button>
              <button type="button" onClick={() => downloadCsv(summaryRows)} disabled={summaryRows.length === 0}>Export CSV</button>
            </div>
          </div>
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Product</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Live Balance</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Counted</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Diff</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '12px', color: '#9aa4b2' }}>
                      {summaryRows.length === 0 ? 'All items matched.' : 'No summary rows match the current search.'}
                    </td>
                  </tr>
                ) : (
                  filteredSummaryRows.map((row) => (
                    <tr key={String(row.product_id)}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 600 }}>{row.name}</div>
                        <div style={{ color: '#9aa4b2', fontSize: '0.85rem' }}>{row.sku || '-'}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{row.expected}</td>
                      <td style={{ textAlign: 'center' }}>{row.counted}</td>
                      <td style={{ textAlign: 'center', color: '#f4d35e' }}>{row.counted - row.expected}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
