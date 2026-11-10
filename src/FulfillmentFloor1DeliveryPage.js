import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { useWarehouseCatalogQuery } from './hooks/useWarehouseCatalogQuery';
import { invalidateWarehouseCatalogCache } from './services/warehouseCatalog';
import db from './dataClient';
import {
  FULFILLMENT_WEB_DRIVER_NAME,
  openWarehouseDeliverySession,
  submitWarehouseDelivery,
} from './services/warehouseDeliveryMobileApi';
import {
  buildFulfillmentDeliverySubmitGroup,
  buildFulfillmentSetSubmitGroup,
} from './utils/buildFulfillmentDeliverySubmitGroup';
import {
  filterFulfillmentFloor1DeliveryProducts,
  searchFulfillmentDeliveryProducts,
} from './utils/fulfillmentFloor1DeliveryCatalog';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from './utils/warehouseDelivery';

const formatWhen = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' });
  } catch {
    return d.toLocaleString();
  }
};

export default function FulfillmentFloor1DeliveryPage() {
  const user = getCurrentUser();
  const allowed = canManageCatalog(user);
  const { data: catalog, isLoading: catalogLoading, refetch: refetchCatalog } = useWarehouseCatalogQuery({
    enabled: allowed,
  });

  const [sessionId, setSessionId] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);

  const [sentSessions, setSentSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedId, setExpandedId] = useState('');

  const { products, packetsByAssembly } = useMemo(
    () => filterFulfillmentFloor1DeliveryProducts(catalog),
    [catalog],
  );

  const searchHits = useMemo(
    () => searchFulfillmentDeliveryProducts(products, search),
    [products, search],
  );

  const openSession = useCallback(async () => {
    setSessionBusy(true);
    setError('');
    try {
      const body = sessionId ? { session_id: sessionId } : {};
      const res = await openWarehouseDeliverySession(body);
      const sid = String(res?.session_id || '').trim();
      const dnum = String(res?.delivery_number || '').trim();
      if (!sid || !dnum) throw new Error('Could not open delivery session.');
      setSessionId(sid);
      setDeliveryNumber(dnum);
      return { sid, dnum };
    } catch (err) {
      setError(err?.message || 'Could not open delivery session.');
      return null;
    } finally {
      setSessionBusy(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!allowed) return;
    openSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: sessions, error: sessErr } = await db
        .from('warehouse_delivery_sessions')
        .select('id, delivery_number, status, submitted_at, created_at, total_qty, metadata, created_by_name, created_by_email')
        .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
        .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .limit(60);
      if (sessErr) throw sessErr;
      const list = sessions || [];
      setSentSessions(list);
      const ids = list.map((s) => s.id).filter(Boolean);
      if (!ids.length) {
        setEntriesBySession({});
        return;
      }
      const { data: entries, error: entErr } = await db
        .from('warehouse_delivery_entries')
        .select('id, session_id, name, sku, quantity, metadata, kind')
        .in('session_id', ids);
      if (entErr) throw entErr;
      const bySession = {};
      (entries || []).forEach((row) => {
        const key = String(row.session_id);
        if (!bySession[key]) bySession[key] = [];
        bySession[key].push(row);
      });
      setEntriesBySession(bySession);
    } catch (err) {
      setError(err?.message || 'Failed to load delivery history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) loadHistory();
  }, [allowed, loadHistory]);

  const addToCart = (row) => {
    const id = String(row.assembly.id);
    const lineKind = row.kind === 'set' ? 'set' : 'product';
    setCart((prev) => {
      const hit = prev.find((c) => String(c.assembly_id) === id && c.lineKind === lineKind);
      if (hit) {
        return prev.map((c) => (
          String(c.assembly_id) === id && c.lineKind === lineKind
            ? { ...c, units: Math.min(row.onHand, (Number(c.units) || 1) + 1) }
            : c
        ));
      }
      return [...prev, {
        lineKind,
        assembly_id: id,
        assembly_name: row.assembly.name,
        family_sku: row.assembly.family_sku,
        maxUnits: row.onHand,
        units: 1,
      }];
    });
    setNotice('');
  };

  const updateCartUnits = (assemblyId, raw) => {
    const id = String(assemblyId);
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    setCart((prev) => prev.map((c) => {
      if (String(c.assembly_id) !== id) return c;
      const cap = Math.max(1, Number(c.maxUnits) || 1);
      return { ...c, units: Math.min(cap, n) };
    }));
  };

  const removeCartLine = (assemblyId) => {
    setCart((prev) => prev.filter((c) => String(c.assembly_id) !== String(assemblyId)));
  };

  const handleSubmit = async () => {
    if (!cart.length) {
      setError('Add at least one product.');
      return;
    }
    setSubmitBusy(true);
    setError('');
    setNotice('');
    try {
      let sid = String(sessionId || '').trim();
      if (!sid) {
        const opened = await openSession();
        if (!opened?.sid) return;
        sid = opened.sid;
      }

      const groups = cart.map((line) => {
        const assembly = (catalog?.assemblies || []).find(
          (a) => String(a.id) === String(line.assembly_id),
        );
        if (!assembly) throw new Error(`Unknown product: ${line.assembly_name}`);
        if (line.lineKind === 'set') {
          return buildFulfillmentSetSubmitGroup(
            assembly,
            line.units,
            catalog?.setItems || [],
            catalog?.assemblies || [],
            packetsByAssembly,
          );
        }
        const pktList = packetsByAssembly.get(String(line.assembly_id)) || [];
        return buildFulfillmentDeliverySubmitGroup(assembly, pktList, line.units);
      });

      const result = await submitWarehouseDelivery({
        session_id: sid,
        driver_name: FULFILLMENT_WEB_DRIVER_NAME,
        groups,
        fulfillment_web: true,
      });

      const dnum = String(result?.delivery_number || deliveryNumber || '').trim();
      setNotice(dnum
        ? `Delivery ${dnum} sent to Hassan (Kitwe).`
        : 'Delivery submitted.');
      setCart([]);
      setSessionId('');
      setDeliveryNumber('');
      invalidateWarehouseCatalogCache();
      await refetchCatalog();
      await loadHistory();
      await openSession();
    } catch (err) {
      setError(err?.message || 'Submit failed.');
    } finally {
      setSubmitBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <BackToDashboard />
        <p>Catalog admin access is required for this temporary fulfillment page.</p>
      </div>
    );
  }

  return (
    <div className="warehouse-deliveries-page" style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px 40px' }}>
      <BackToDashboard />
      <div>
        <h1 style={{ margin: '12px 0 4px' }}>Floor 1 → Kitwe (temporary)</h1>
        <p style={{ color: 'var(--br-text-muted, #666)', marginTop: 0 }}>
          Send warehouse deliveries to Hassan Awad without driver selection or signature.
          {' '}
          <Link to="/warehouse-deliveries-admin">Deliveries (receive + admin)</Link>
        </p>
      </div>

      {error ? (
        <div style={{ background: '#ffeaea', border: '1px solid #f5a', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div style={{ background: '#e8f8ef', border: '1px solid #8c8', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {notice}
        </div>
      ) : null}

      <section className="kitwe-card" style={{ marginBottom: 20, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>New delivery</h2>
        <p style={{ margin: '0 0 12px', color: 'var(--br-text-muted, #666)' }}>
          Delivery #{' '}
          <strong>{deliveryNumber || (sessionBusy ? '…' : '—')}</strong>
          {' · '}
          Factory warehouse → Kitwe branch
        </p>

        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Search Floor 1 products</label>
        <input
          type="search"
          className="kitwe-cell-input"
          style={{ width: '100%', marginBottom: 10 }}
          placeholder="Name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={catalogLoading || submitBusy}
        />
        {catalogLoading ? <p>Loading catalog…</p> : null}
        {search.trim() ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', maxHeight: 220, overflow: 'auto' }}>
            {searchHits.length === 0 ? (
              <li style={{ color: '#888' }}>No matching in-stock products.</li>
            ) : (
              searchHits.map((row) => (
                <li
                  key={row.assembly.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--dash-border-soft, #eee)',
                  }}
                >
                  <span>
                    <strong>{row.assembly.name}</strong>
                    {row.kind === 'set' ? (
                      <span style={{ marginLeft: 8, color: '#38bdf8', fontWeight: 700, fontSize: 12 }}>
                        Set
                      </span>
                    ) : null}
                    <span style={{ color: '#666', marginLeft: 8, fontFamily: 'monospace', fontSize: 12 }}>
                      {row.assembly.family_sku}
                    </span>
                    <span style={{ marginLeft: 8, color: '#069506', fontWeight: 700 }}>
                      On hand {row.onHand}{row.kind === 'set' ? ' set(s)' : ''}
                    </span>
                  </span>
                  <button type="button" className="kitwe-btn kitwe-btn-secondary kitwe-btn-compact" onClick={() => addToCart(row)}>
                    Add
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <p style={{ color: '#888', marginBottom: 16, fontSize: 14 }}>
            Type to search products or sets with Floor 1 stock (set qty = Change qty on Warehouse Sets).
          </p>
        )}

        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Cart ({cart.length})</h3>
        {cart.length === 0 ? (
          <p style={{ color: '#888' }}>No products yet.</p>
        ) : (
          <table className="kitwe-table" style={{ width: '100%', marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Product</th>
                <th>Units</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.assembly_id}>
                  <td>
                    {line.assembly_name}
                    {line.lineKind === 'set' ? (
                      <span style={{ marginLeft: 6, color: '#38bdf8', fontSize: 11, fontWeight: 700 }}>Set</span>
                    ) : null}
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{line.family_sku}</div>
                  </td>
                  <td style={{ width: 100 }}>
                    <input
                      type="number"
                      min={1}
                      max={line.maxUnits}
                      className="kitwe-cell-input"
                      style={{ width: 72, textAlign: 'center' }}
                      value={line.units}
                      onChange={(e) => updateCartUnits(line.assembly_id, e.target.value)}
                      disabled={submitBusy}
                    />
                    <small style={{ display: 'block', color: '#888' }}>max {line.maxUnits}</small>
                  </td>
                  <td style={{ width: 72 }}>
                    <button
                      type="button"
                      className="kitwe-btn kitwe-btn-secondary kitwe-btn-compact"
                      onClick={() => removeCartLine(line.assembly_id)}
                      disabled={submitBusy}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button
          type="button"
          className="kitwe-btn kitwe-btn-primary"
          disabled={submitBusy || !cart.length || sessionBusy}
          onClick={handleSubmit}
        >
          {submitBusy ? 'Sending…' : 'Send to Kitwe (no signature)'}
        </button>
      </section>

      <section className="kitwe-card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Sent deliveries</h2>
        <p style={{ color: 'var(--br-text-muted, #666)', fontSize: 14 }}>
          Submitted and completed Factory → Kitwe deliveries (Hassan receives on{' '}
          <Link to="/warehouse-deliveries">Warehouse deliveries</Link>
          ).
        </p>
        {historyLoading ? <p>Loading history…</p> : null}
        {!historyLoading && sentSessions.length === 0 ? (
          <p style={{ color: '#888' }}>No sent deliveries yet.</p>
        ) : null}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sentSessions.map((sess) => {
            const lines = entriesBySession[String(sess.id)] || [];
            const open = expandedId === String(sess.id);
            const meta = sess.metadata || {};
            return (
              <li
                key={sess.id}
                style={{
                  borderBottom: '1px solid var(--dash-border-soft, #eee)',
                  padding: '10px 0',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? '' : String(sess.id))}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                  }}
                >
                  <strong style={{ fontFamily: 'monospace' }}>{sess.delivery_number}</strong>
                  <span style={{ marginLeft: 10, color: '#666' }}>{sess.status}</span>
                  <span style={{ marginLeft: 10, color: '#666' }}>{formatWhen(sess.submitted_at || sess.created_at)}</span>
                  <span style={{ marginLeft: 10 }}>
                    {meta.driver_name || meta.dispatched_by_name || sess.created_by_name || '—'}
                  </span>
                  <span style={{ marginLeft: 10, fontWeight: 700 }}>Qty {sess.total_qty ?? '—'}</span>
                </button>
                {open && lines.length > 0 ? (
                  <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 14 }}>
                    {lines.map((e) => (
                      <li key={e.id}>
                        {e.name || e.metadata?.assembly_name || '—'}
                        {' · '}
                        {e.quantity}
                        {e.sku ? ` · ${e.sku}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
