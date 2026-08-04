import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  deliveryLineQty,
  deliverySenderName,
  groupWarehouseDisplayLines,
  isWarehouseCompleted,
  isWarehousePending,
} from './utils/warehouseDelivery';
import { buildWarehouseDeliveryPdf, openPdfBlob } from './utils/warehouseDeliveryPdf';

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString('en-GB', {
      timeZone: 'Africa/Lusaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toLocaleString();
  }
};

export default function WarehouseDeliveriesAdmin() {
  const theme = {
    bg: 'var(--dash-bg)',
    surface: 'var(--dash-surface)',
    surfaceAlt: 'var(--dash-surface-2)',
    border: 'var(--dash-border)',
    borderSoft: 'var(--dash-border-soft)',
    text: 'var(--dash-text)',
    muted: 'var(--dash-muted)',
    accent: 'var(--dash-accent)',
  };

  const [sessions, setSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [editQtyMap, setEditQtyMap] = useState({});
  const [destStockByProduct, setDestStockByProduct] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pdfBusyId, setPdfBusyId] = useState('');
  const [fromName, setFromName] = useState('Factory Warehouse');
  const [toName, setToName] = useState('Kitwe Branch');
  const [currentUserId, setCurrentUserId] = useState('');
  const [usersById, setUsersById] = useState(new Map());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData, error: sessErr } = await db
        .from('warehouse_delivery_sessions')
        .select('id, delivery_number, from_location, to_location, created_at, transfer_datetime, submitted_at, status, total_qty, created_by_id, created_by_email, created_by_name, applied_by, accepted_at, applied_at, completed_at, last_edited_at, pdf_url, metadata')
        .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
        .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
        .order('delivery_number', { ascending: false });
      if (sessErr) throw sessErr;

      const sessionsList = sessionData || [];
      setSessions(sessionsList);

      const ids = sessionsList.map((s) => s.id).filter(Boolean);
      if (!ids.length) {
        setEntriesBySession({});
        setEditQtyMap({});
        setDestStockByProduct(new Map());
        return;
      }

      const { data: entryRows, error: entryErr } = await db
        .from('warehouse_delivery_entries')
        .select('id, session_id, product_id, combo_id, kind, name, sku, quantity, original_quantity, edited_quantity, expected_dest_stock, per_set_qty, max_qty')
        .in('session_id', ids)
        .order('created_at', { ascending: true });
      if (entryErr) throw entryErr;

      const grouped = {};
      const nextEdit = {};
      const productIds = new Set();
      (entryRows || []).forEach((row) => {
        const sid = String(row.session_id || '');
        if (!sid) return;
        if (!grouped[sid]) grouped[sid] = [];
        grouped[sid].push(row);
        nextEdit[row.id] = String(deliveryLineQty(row));
        if (row.product_id && row.kind !== 'set-parent') productIds.add(String(row.product_id));
      });
      setEntriesBySession(grouped);
      setEditQtyMap(nextEdit);

      const creatorIds = Array.from(new Set(
        sessionsList.map((s) => s.created_by_id).filter((id) => id != null)
      ));
      if (creatorIds.length) {
        const { data: userRows } = await db
          .from('users')
          .select('id, full_name, email')
          .in('id', creatorIds);
        const map = new Map();
        (userRows || []).forEach((u) => {
          const name = String(u.full_name || '').trim();
          if (name) {
            map.set(Number(u.id), name);
            map.set(String(u.id), name);
          }
        });
        setUsersById(map);
      } else {
        setUsersById(new Map());
      }

      if (productIds.size) {
        const { data: invRows } = await db
          .from('inventory')
          .select('product_id, quantity')
          .eq('location', WAREHOUSE_TO_LOCATION_ID)
          .in('product_id', Array.from(productIds));
        const map = new Map();
        (invRows || []).forEach((row) => {
          map.set(String(row.product_id), Number(row.quantity) || 0);
        });
        setDestStockByProduct(map);
      } else {
        setDestStockByProduct(new Map());
      }
    } catch (err) {
      setError(err?.message || 'Failed to load deliveries.');
      setSessions([]);
      setEntriesBySession({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : null;
      setCurrentUserId(parsed?.id || '');
    } catch {
      setCurrentUserId('');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await db
          .from('locations')
          .select('id, name')
          .in('id', [WAREHOUSE_FROM_LOCATION_ID, WAREHOUSE_TO_LOCATION_ID]);
        const fromLoc = (data || []).find((l) => String(l.id) === String(WAREHOUSE_FROM_LOCATION_ID));
        const toLoc = (data || []).find((l) => String(l.id) === String(WAREHOUSE_TO_LOCATION_ID));
        setFromName(fromLoc?.name || 'Factory Warehouse');
        setToName(toLoc?.name || 'Kitwe Branch');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const status = String(s.status || '').toLowerCase();
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && !isWarehousePending(status)) return false;
        if (statusFilter === 'completed' && !isWarehouseCompleted(status)) return false;
        if (statusFilter !== 'pending' && statusFilter !== 'completed' && status !== statusFilter) return false;
      }
      if (!q) return true;
      const hay = `${s.delivery_number || ''} ${s.id} ${s.created_by_email || ''} ${s.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, search, statusFilter]);

  const handleSaveEdits = async (session) => {
    if (!session?.id || busyId) return;
    if (!isWarehousePending(session.status)) {
      setError('Only pending deliveries can be edited. Completed inventory cannot be changed here.');
      return;
    }
    setBusyId(session.id);
    setError('');
    try {
      const entries = entriesBySession[String(session.id)] || [];
      const items = entries.map((entry) => ({
        id: entry.id,
        quantity: Number(editQtyMap[entry.id] ?? deliveryLineQty(entry) ?? 0),
      }));
      const invalid = items.find((e) => !Number.isFinite(e.quantity) || e.quantity < 0);
      if (invalid) throw new Error('Quantities cannot be negative.');

      let userEmail = '';
      try {
        const raw = localStorage.getItem('user');
        userEmail = raw ? (JSON.parse(raw)?.email || '') : '';
      } catch {}

      const { data, error: rpcErr } = await db.rpc('update_warehouse_delivery_items', {
        p_session_id: session.id,
        p_items: items,
        p_edited_by: currentUserId || null,
        p_edited_by_email: userEmail || null,
      });
      if (rpcErr) throw rpcErr;
      if (data && data.ok === false) throw new Error(data.error || 'Save failed');
      await loadDeliveries();
    } catch (err) {
      setError(err?.message || 'Failed to save changes.');
    } finally {
      setBusyId('');
    }
  };

  const handlePdf = async (session) => {
    if (!session?.id || pdfBusyId) return;
    setPdfBusyId(session.id);
    setError('');
    try {
      const entries = entriesBySession[String(session.id)] || [];
      const blob = await buildWarehouseDeliveryPdf({
        session,
        entries: groupWarehouseDisplayLines(entries),
        fromName,
        toName,
        destStockMap: destStockByProduct,
      });
      openPdfBlob(blob, `${session.delivery_number || session.id}.pdf`);
    } catch (err) {
      setError(err?.message || 'Failed to build PDF.');
    } finally {
      setPdfBusyId('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text, padding: 24 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Warehouse Deliveries (Admin)</h1>
      </div>
      <div style={{ color: theme.muted, marginBottom: 16 }}>
        Android submissions Factory → Kitwe. Edit pending deliveries before Hassan accepts.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search delivery #, email, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            minWidth: 260,
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
            color: theme.text,
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
            color: theme.text,
          }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading && <div>Loading deliveries...</div>}
      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {!loading && filteredSessions.length === 0 && (
        <div style={{ color: theme.muted }}>No deliveries found.</div>
      )}

      {filteredSessions.map((session) => {
        const entries = entriesBySession[String(session.id)] || [];
        const displayLines = groupWarehouseDisplayLines(entries);
        const canEdit = isWarehousePending(session.status);
        const completed = isWarehouseCompleted(session.status);
        return (
          <div
            key={session.id}
            style={{
              border: `1px solid ${theme.borderSoft}`,
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              background: theme.surface,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{session.delivery_number || session.id}</div>
                <div style={{ color: theme.muted }}>
                  Submitted: {formatDateTime(session.submitted_at || session.transfer_datetime || session.created_at)}
                </div>
                <div style={{ color: theme.muted }}>By: {deliverySenderName(session, usersById)}</div>
                <div style={{ color: theme.muted }}>Status: {session.status || 'pending'}</div>
                {completed && (
                  <div style={{ color: theme.muted }}>
                    Completed: {formatDateTime(session.completed_at || session.accepted_at || session.applied_at)}
                  </div>
                )}
                {session.last_edited_at && (
                  <div style={{ color: theme.muted }}>Last edited: {formatDateTime(session.last_edited_at)}</div>
                )}
              </div>
              <div>
                <div>From: <b>{fromName}</b></div>
                <div>To: <b>{toName}</b></div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {displayLines.map((line) => {
                if (line.kind === 'set-parent') {
                  return (
                    <div key={line.id} style={{ fontWeight: 700, textDecoration: 'underline', marginTop: 8 }}>
                      {line.name} (Set)
                    </div>
                  );
                }
                const original = line.original_quantity != null ? Number(line.original_quantity) : null;
                return (
                  <div
                    key={line.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                      marginTop: 6,
                      paddingLeft: line.kind === 'set-component' ? 16 : 0,
                    }}
                  >
                    <span>
                      {line.kind === 'set-component' ? `- ${line.name}` : line.name}
                      {original != null && original !== deliveryLineQty(line) && (
                        <span style={{ color: theme.muted, marginLeft: 8, fontSize: 12 }}>
                          (submitted {original})
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editQtyMap[line.id] ?? deliveryLineQty(line)}
                      onChange={(e) => setEditQtyMap((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      disabled={!canEdit}
                      style={{
                        width: 90,
                        padding: '4px 6px',
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: theme.surfaceAlt,
                        color: theme.text,
                        opacity: canEdit ? 1 : 0.6,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handlePdf(session)}
                disabled={pdfBusyId === session.id}
                style={{
                  background: theme.surfaceAlt,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {pdfBusyId === session.id ? 'Building PDF…' : 'View PDF'}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleSaveEdits(session)}
                  disabled={busyId === session.id}
                  style={{
                    background: theme.accent || '#2a9d8f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontWeight: 700,
                    cursor: busyId === session.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busyId === session.id ? 'Saving…' : 'Save edits'}
                </button>
              )}
              {completed && (
                <span style={{ color: theme.muted, alignSelf: 'center' }}>
                  Completed — inventory already moved; editing disabled.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
