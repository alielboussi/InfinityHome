import React, { useCallback, useEffect, useState } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { sendTransferWhatsApp } from './services/whatsapp';
import {
  WAREHOUSE_ACCEPT_USER_ID,
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  deliveryLineQty,
  deliverySenderName,
  groupWarehouseDisplayLines,
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

function buildWarehouseDeliveryWhatsAppMessage({
  session,
  entries,
  fromName,
  toName,
  usersById,
}) {
  const display = groupWarehouseDisplayLines(entries || []);
  const productLines = [];
  let totalItems = 0;

  display.forEach((line) => {
    if (line.kind === 'set-parent') return;
    const qty = deliveryLineQty(line);
    if (qty <= 0) return;
    const name = String(line.name || line.sku || 'Item').trim();
    productLines.push(`${qty} * ${name}`);
    totalItems += qty;
  });

  const fromLabel = fromName || 'Factory Warehouse';
  const toLabel = toName || 'Kitwe Branch';
  const sentBy = deliverySenderName(session, usersById);

  const parts = [
    '📦 *_Delivery Transfer_*',
    '━━━━━━━━━━━━━━━━━━━━',
    `🏭 *From:* ${fromLabel}`,
    `📍 *To:* ${toLabel}`,
    `👤 *Sent By:* ${sentBy}`,
    '',
    '📋 *Products:*',
    '────────────────────',
  ];

  if (!productLines.length) {
    parts.push('_No products_');
    parts.push('────────────────────');
  } else {
    productLines.forEach((row) => {
      parts.push(row);
      parts.push('────────────────────');
    });
  }

  parts.push(`✅ *Total Delivery Items:* ${totalItems}`);

  return parts.join('\n');
}

const detectIpadSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const isIpad = /iPad/.test(ua) || (platform === 'MacIntel' && touchPoints > 2);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  return isIpad && isSafari;
};

export default function WarehouseDeliveries() {
  const [sessions, setSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [destStockByProduct, setDestStockByProduct] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pdfBusyId, setPdfBusyId] = useState('');
  const [fromName, setFromName] = useState('Factory Warehouse');
  const [toName, setToName] = useState('Kitwe Branch');
  const [currentUserId, setCurrentUserId] = useState('');
  const [usersById, setUsersById] = useState(new Map());
  const [isIpadSafari, setIsIpadSafari] = useState(() => detectIpadSafari());
  const canAccept = currentUserId === WAREHOUSE_ACCEPT_USER_ID;

  useEffect(() => {
    const onResize = () => setIsIpadSafari(detectIpadSafari());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData, error: sessErr } = await db
        .from('warehouse_delivery_sessions')
        .select('id, delivery_number, from_location, to_location, created_at, transfer_datetime, submitted_at, status, total_qty, created_by_id, created_by_email, created_by_name, accepted_at, applied_at, completed_at, pdf_url, metadata')
        .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
        .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
        .in('status', ['pending', 'submitted'])
        .order('delivery_number', { ascending: false });
      if (sessErr) throw sessErr;

      const sessionsList = sessionData || [];
      setSessions(sessionsList);

      const ids = sessionsList.map((s) => s.id).filter(Boolean);
      if (!ids.length) {
        setEntriesBySession({});
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
      const productIds = new Set();
      (entryRows || []).forEach((row) => {
        const sid = String(row.session_id || '');
        if (!sid) return;
        if (!grouped[sid]) grouped[sid] = [];
        grouped[sid].push(row);
        if (row.product_id && row.kind !== 'set-parent') productIds.add(String(row.product_id));
      });
      setEntriesBySession(grouped);

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
    const id = setInterval(() => loadDeliveries(), 60000);
    return () => clearInterval(id);
  }, [loadDeliveries]);

  const expectedForLine = (line) => {
    if (line.expected_dest_stock != null) return Number(line.expected_dest_stock);
    if (!line.product_id || line.kind === 'set-parent') return null;
    const before = Number(destStockByProduct.get(String(line.product_id)) || 0);
    return before + deliveryLineQty(line);
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

  const handleAccept = async (sessionId) => {
    if (!sessionId || busyId) return;
    if (currentUserId && currentUserId !== WAREHOUSE_ACCEPT_USER_ID) {
      setError('Only the receiver account can accept deliveries.');
      return;
    }
    setBusyId(sessionId);
    setError('');
    try {
      let userEmail = '';
      try {
        const raw = localStorage.getItem('user');
        userEmail = raw ? (JSON.parse(raw)?.email || '') : '';
      } catch {}

      const session = sessions.find((s) => String(s.id) === String(sessionId));
      const entries = entriesBySession[String(sessionId)] || [];

      const { data, error: rpcErr } = await db.rpc('accept_warehouse_delivery', {
        p_session_id: sessionId,
        p_accepted_by: currentUserId || WAREHOUSE_ACCEPT_USER_ID,
        p_accepted_by_email: userEmail || null,
      });
      if (rpcErr) throw rpcErr;
      if (data && data.ok === false) throw new Error(data.error || 'Accept failed');

      // Notify WhatsApp group after inventory accept succeeds (non-blocking for reload).
      try {
        const message = buildWarehouseDeliveryWhatsAppMessage({
          session: data?.session || session,
          entries,
          fromName,
          toName,
          usersById,
        });
        const wa = await sendTransferWhatsApp({ message });
        if (!wa.ok) {
          console.warn('Warehouse delivery WhatsApp failed:', wa.error);
        }
      } catch (waErr) {
        console.warn('Warehouse delivery WhatsApp error:', waErr);
      }

      await loadDeliveries();
    } catch (err) {
      setError(err?.message || 'Failed to accept delivery.');
    } finally {
      setBusyId('');
    }
  };

  const containerStyle = {
    minHeight: isIpadSafari ? '100dvh' : '100vh',
    background: '#0b0f14',
    color: '#e0e6ed',
    padding: 'max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))',
    boxSizing: 'border-box',
    width: '100%',
    overflowX: 'hidden',
  };

  return (
    <div style={containerStyle}>
      <div style={{ width: 'min(1200px, 100%)', margin: '0 auto' }}>
        <div className="page-header-row" style={{ gap: isIpadSafari ? 14 : 10 }}>
          <BackToDashboard />
          <h1 style={{ margin: 0, fontSize: isIpadSafari ? 'clamp(1.35rem, 2.2vw, 2rem)' : undefined }}>
            Warehouse Deliveries
          </h1>
        </div>
        <div style={{ color: '#9fb3c8', marginBottom: 16 }}>
          Pending Factory → Kitwe deliveries from the Android app. Auto-refresh every 60 seconds.
        </div>
        {!canAccept && currentUserId && (
          <div style={{ color: '#ffb020', marginBottom: 12 }}>
            Only the receiver account can accept deliveries.
          </div>
        )}
        {loading && <div>Loading deliveries...</div>}
        {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
        {!loading && sessions.length === 0 && (
          <div style={{ color: '#9fb3c8' }}>No pending deliveries.</div>
        )}

        {sessions.map((session) => {
          const entries = entriesBySession[String(session.id)] || [];
          const displayLines = groupWarehouseDisplayLines(entries);
          const pending = isWarehousePending(session.status);
          return (
            <div
              key={session.id}
              style={{
                border: '1px solid #1f3b4d',
                borderRadius: 10,
                padding: isIpadSafari ? 18 : 16,
                marginBottom: 16,
                background: '#121826',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: isIpadSafari ? 'repeat(auto-fit, minmax(260px, 1fr))' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {session.delivery_number || session.id}
                  </div>
                  <div style={{ color: '#9fb3c8' }}>Status: {session.status}</div>
                  <div style={{ color: '#9fb3c8' }}>
                    Submitted: {formatDateTime(session.submitted_at || session.transfer_datetime || session.created_at)}
                  </div>
                  <div style={{ color: '#9fb3c8' }}>By: {deliverySenderName(session, usersById)}</div>
                </div>
                <div>
                  <div>From: <b>{fromName}</b></div>
                  <div>To: <b>{toName}</b></div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px', gap: 8, color: '#9fb3c8', fontSize: 13, marginBottom: 6 }}>
                  <span>Product</span>
                  <span style={{ textAlign: 'right' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Expected @ dest</span>
                </div>
                {displayLines.map((line) => {
                  if (line.kind === 'set-parent') {
                    return (
                      <div key={line.id} style={{ fontWeight: 700, textDecoration: 'underline', marginTop: 8 }}>
                        {line.name} (Set)
                      </div>
                    );
                  }
                  const expected = expectedForLine(line);
                  return (
                    <div
                      key={line.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 110px',
                        gap: 8,
                        paddingLeft: line.kind === 'set-component' ? 16 : 0,
                        marginTop: 6,
                        color: line.kind === 'set-component' ? '#cbd5e1' : undefined,
                      }}
                    >
                      <span>{line.kind === 'set-component' ? `- ${line.name}` : line.name}</span>
                      <span style={{ textAlign: 'right' }}>{deliveryLineQty(line)}</span>
                      <span style={{ textAlign: 'right' }}>{expected == null ? '—' : expected}</span>
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
                    background: '#1f3b4d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: isIpadSafari ? '10px 20px' : '8px 16px',
                    minHeight: isIpadSafari ? 44 : undefined,
                    fontWeight: 700,
                    cursor: pdfBusyId === session.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {pdfBusyId === session.id ? 'Building PDF…' : 'View PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => handleAccept(session.id)}
                  disabled={busyId === session.id || !canAccept || !pending}
                  style={{
                    background: '#2a9d8f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: isIpadSafari ? '10px 20px' : '8px 16px',
                    minHeight: isIpadSafari ? 44 : undefined,
                    fontWeight: 700,
                    cursor: busyId === session.id || !canAccept ? 'not-allowed' : 'pointer',
                    opacity: busyId === session.id || !canAccept ? 0.6 : 1,
                  }}
                >
                  {busyId === session.id ? 'Accepting…' : 'Accept Delivery'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
