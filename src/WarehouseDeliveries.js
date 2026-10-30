import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { sendTransferWhatsApp } from './services/whatsapp';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  deliveryLineQty,
  deliverySenderName,
  groupWarehouseDisplayLines,
  isWarehousePending,
  isWarehouseCompleted,
  WAREHOUSE_RECEIVER_LIST_STATUSES,
  anyDeliveryPacketsReceiverConfirmed,
  deliveryEntryReceiverProgress,
  deliveryEntryReceived,
  warehousePacketDisplayLabel,
} from './utils/warehouseDelivery';
import { buildWarehouseDeliveryPdf, openPdfBlob } from './utils/warehouseDeliveryPdf';
import {
  buildWarehouseDeliveryNoteHtml,
  downloadWarehouseDeliveryNotePdf,
} from './utils/warehouseDeliveryNotePrint';
import {
  acceptWarehouseDeliverySession,
  setDeliveryEntryReceiverCheck,
} from './services/warehouseDeliveryMobileApi';
import { getCurrentUser, canPerformWarehouseKitweReceiver } from './accessControl';

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

/** Match enterprise dashboard tokens (readable inside AppChrome). */
const PAGE_THEME = {
  bg: 'var(--dash-bg, #ffffff)',
  surface: 'var(--dash-surface, #ffffff)',
  surfaceAlt: 'var(--dash-surface-2, #f4f6f9)',
  border: 'var(--dash-border, #1565c0)',
  borderSoft: 'var(--dash-border-soft, #d5dbe2)',
  text: 'var(--dash-text, #1f2733)',
  muted: 'var(--dash-muted, #5b6675)',
  accent: 'var(--dash-accent, #1565c0)',
};

/**
 * Hassan Awad — Factory → Kitwe deliveries (receive + history on iPad).
 */
export default function WarehouseDeliveries() {
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [destStockByProduct, setDestStockByProduct] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pdfBusyId, setPdfBusyId] = useState('');
  const [printBusyId, setPrintBusyId] = useState('');
  const [fromName, setFromName] = useState('Factory Warehouse');
  const [toName, setToName] = useState('Kitwe Branch');
  const [usersById, setUsersById] = useState(new Map());
  const [isIpadSafari, setIsIpadSafari] = useState(() => detectIpadSafari());
  const [openSessionId, setOpenSessionId] = useState('');
  const sessionUser = useMemo(() => {
    try {
      return getCurrentUser();
    } catch {
      return null;
    }
  }, []);
  const canAccept = canPerformWarehouseKitweReceiver(sessionUser, location.pathname);
  const refreshSeconds = canAccept ? 15 : 60;

  useEffect(() => {
    const onResize = () => setIsIpadSafari(detectIpadSafari());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadDeliveries = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const { data: sessionData, error: sessErr } = await db
        .from('warehouse_delivery_sessions')
        .select('id, delivery_number, from_location, to_location, created_at, transfer_datetime, submitted_at, status, total_qty, created_by_id, created_by_email, created_by_name, accepted_at, applied_at, completed_at, pdf_url, metadata')
        .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
        .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
        .in('status', WAREHOUSE_RECEIVER_LIST_STATUSES)
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
        .select('id, session_id, product_id, combo_id, kind, name, sku, quantity, original_quantity, edited_quantity, expected_dest_stock, per_set_qty, max_qty, metadata')
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
      if (!silent) setLoading(false);
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
    const ms = canAccept ? 15000 : 60000;
    const id = setInterval(() => {
      if (busyId || printBusyId || pdfBusyId) return;
      loadDeliveries({ silent: true });
    }, ms);
    return () => clearInterval(id);
  }, [loadDeliveries, canAccept, busyId, printBusyId, pdfBusyId]);

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

  const handleSaveDeliveryNotePdf = async (session) => {
    if (!session?.id || printBusyId) return;
    setPrintBusyId(session.id);
    setError('');
    try {
      const entries = entriesBySession[String(session.id)] || [];
      const html = await buildWarehouseDeliveryNoteHtml({
        session,
        entries,
        copies: 1,
      });
      const base = session.delivery_number || session.id || 'delivery-note';
      await downloadWarehouseDeliveryNotePdf(html, `${base}-delivery-note.pdf`);
    } catch (err) {
      setError(err?.message || 'Failed to save delivery note PDF.');
    } finally {
      setPrintBusyId('');
    }
  };

  const handleAccept = async (sessionId) => {
    if (!sessionId || busyId) return;
    if (!canAccept) {
      setError('Only Hassan Awad can accept deliveries.');
      return;
    }
    setBusyId(sessionId);
    setError('');
    try {
      const session = sessions.find((s) => String(s.id) === String(sessionId));
      const entries = entriesBySession[String(sessionId)] || [];
      if (!anyDeliveryPacketsReceiverConfirmed(entries)) {
        throw new Error('Tick at least one received packet, then accept.');
      }

      const data = await acceptWarehouseDeliverySession(sessionId);
      if (data && data.ok === false) throw new Error(data.error || 'Accept failed');

      const updatedSession = data?.session || session;
      if (updatedSession?.id) {
        setSessions((prev) => prev.map((s) => (
          String(s.id) === String(sessionId) ? { ...s, ...updatedSession } : s
        )));
      }

      void (async () => {
        try {
          const message = buildWarehouseDeliveryWhatsAppMessage({
            session: updatedSession,
            entries,
            fromName,
            toName,
            usersById,
          });
          const wa = await sendTransferWhatsApp({ message });
          if (!wa.ok) console.warn('Warehouse delivery WhatsApp failed:', wa.error);
        } catch (waErr) {
          console.warn('Warehouse delivery WhatsApp error:', waErr);
        }
      })();

      await loadDeliveries({ silent: true });
    } catch (err) {
      setError(err?.message || 'Failed to accept delivery.');
    } finally {
      setBusyId('');
    }
  };

  const toggleReceiverCheck = async (entryId, checked) => {
    if (!canAccept) return;
    setError('');
    const checkedAt = checked ? new Date().toISOString() : null;
    setEntriesBySession((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((sid) => {
        next[sid] = next[sid].map((row) => {
          if (String(row.id) !== String(entryId)) return row;
          return {
            ...row,
            metadata: { ...(row.metadata || {}), receiver_checked_at: checkedAt },
          };
        });
      });
      return next;
    });
    try {
      await setDeliveryEntryReceiverCheck(entryId, checked);
    } catch (err) {
      await loadDeliveries({ silent: true });
      setError(err?.message || 'Failed to update packet confirmation.');
    }
  };

  const containerStyle = {
    minHeight: isIpadSafari ? '100dvh' : '100vh',
    padding: 'max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))',
    boxSizing: 'border-box',
    width: '100%',
    overflowX: 'hidden',
  };

  return (
    <div className="dashboard-container warehouse-deliveries-page" style={containerStyle}>
      <div style={{ width: 'min(1200px, 100%)', margin: '0 auto' }}>
        <div className="page-header-row" style={{ gap: isIpadSafari ? 14 : 10 }}>
          <BackToDashboard />
          <h1
            style={{
              margin: 0,
              color: PAGE_THEME.text,
              fontSize: isIpadSafari ? 'clamp(1.35rem, 2.2vw, 2rem)' : undefined,
            }}
          >
            Warehouse Deliveries
          </h1>
        </div>
        <p style={{ color: PAGE_THEME.muted, marginBottom: 16, lineHeight: 1.5, marginTop: 0 }}>
          Factory → Kitwe deliveries from the Production app. Accepted deliveries stay on this list for PDFs and review. Auto-refresh every {refreshSeconds} seconds.
        </p>
        {!canAccept && sessionUser && (
          <div style={{ color: '#b45309', marginBottom: 12, fontWeight: 600 }}>
            Packet confirmation is limited to Hassan Awad (Kitwe), login-access admin, or localhost testing on this page (
            <code>/warehouse-deliveries</code>
            ). Inventory → Deliveries is the admin list only.
          </div>
        )}
        {loading && <div style={{ color: PAGE_THEME.muted }}>Loading deliveries...</div>}
        {error && <div className="report-error" style={{ marginBottom: 12 }}>{error}</div>}
        {!loading && sessions.length === 0 && (
          <div style={{ color: PAGE_THEME.muted, fontWeight: 500 }}>No deliveries yet.</div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
        >
          {sessions.map((session) => {
            const entries = entriesBySession[String(session.id)] || [];
            const { total, confirmed } = deliveryEntryReceiverProgress(entries);
            const packetLines = (entries || []).filter((e) => e?.metadata?.packet_id);
            const receivedCount = packetLines.filter((e) => deliveryEntryReceived(e)).length;
            const completed = isWarehouseCompleted(session.status);
            const driver = session?.metadata?.driver_name;
            const progressLabel = completed || (total > 0 && receivedCount === total)
              ? `Packets received: ${receivedCount}/${total}`
              : `Packets confirmed: ${confirmed}/${total}`;
            const progressColor = completed || (total > 0 && receivedCount === total) ? '#4ade80' : '#fbbf24';
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => setOpenSessionId(String(session.id))}
                style={{
                  textAlign: 'left',
                  border: openSessionId === String(session.id)
                    ? `2px solid ${PAGE_THEME.accent}`
                    : `1px solid ${completed ? '#4ade8055' : PAGE_THEME.borderSoft}`,
                  borderRadius: 12,
                  padding: 16,
                  background: PAGE_THEME.surfaceAlt,
                  color: PAGE_THEME.text,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: PAGE_THEME.text }}>
                    {session.delivery_number || session.id}
                  </div>
                  {completed ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 999 }}>
                      Completed
                    </span>
                  ) : null}
                </div>
                <div style={{ color: PAGE_THEME.muted, marginTop: 6 }}>{fromName} → {toName}</div>
                <div style={{ color: PAGE_THEME.muted, marginTop: 4 }}>
                  Sent: {formatDateTime(session.submitted_at || session.created_at)}
                </div>
                {completed ? (
                  <div style={{ color: PAGE_THEME.muted }}>
                    Accepted: {formatDateTime(session.completed_at || session.accepted_at)}
                  </div>
                ) : null}
                <div style={{ color: PAGE_THEME.muted }}>By: {deliverySenderName(session, usersById)}</div>
                {driver ? <div style={{ color: PAGE_THEME.text, marginTop: 4 }}>Driver: {driver}</div> : null}
                <div style={{ marginTop: 10, fontWeight: 700, color: progressColor }}>
                  {progressLabel}
                </div>
              </button>
            );
          })}
        </div>

        {openSessionId && sessions.filter((s) => String(s.id) === openSessionId).map((session) => {
          const entries = entriesBySession[String(session.id)] || [];
          const displayLines = groupWarehouseDisplayLines(entries);
          const pending = isWarehousePending(session.status);
          const completed = isWarehouseCompleted(session.status);
          const canAcceptSession = anyDeliveryPacketsReceiverConfirmed(entries);
          const toAcceptCount = entries.filter(
            (e) => e?.metadata?.packet_id
              && e?.metadata?.receiver_checked_at
              && !deliveryEntryReceived(e),
          ).length;
          return (
            <div
              key={`detail-${session.id}`}
              style={{
                border: `1px solid ${PAGE_THEME.accent}`,
                borderRadius: 12,
                padding: isIpadSafari ? 18 : 16,
                marginBottom: 24,
                background: PAGE_THEME.surface,
                color: PAGE_THEME.text,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: PAGE_THEME.text }}>{session.delivery_number}</h2>
                  {completed ? (
                    <div style={{ color: PAGE_THEME.muted, marginTop: 4, fontSize: 14 }}>
                      Completed — accepted {formatDateTime(session.completed_at || session.accepted_at)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenSessionId('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: PAGE_THEME.muted,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
              </div>
              {displayLines.map((line) => {
                if (line.kind === 'assembly-header') {
                  return (
                    <div key={line.id} style={{ fontWeight: 700, marginTop: 14, color: PAGE_THEME.text }}>
                      {line.name}
                    </div>
                  );
                }
                if (line.kind !== 'packet-line') return null;
                const checked = Boolean(line?.metadata?.receiver_checked_at);
                const received = deliveryEntryReceived(line);
                return (
                  <label
                    key={line.id}
                    className="warehouse-packet-check-row"
                    style={{
                      border: `1px solid ${checked || received ? PAGE_THEME.borderSoft : PAGE_THEME.border}`,
                      background: checked || received ? PAGE_THEME.surfaceAlt : PAGE_THEME.surface,
                      color: received ? PAGE_THEME.muted : PAGE_THEME.text,
                      cursor: canAccept && !received && pending ? 'pointer' : 'default',
                    }}
                  >
                    <input
                      type="checkbox"
                      className="warehouse-packet-check-input"
                      checked={checked || received}
                      disabled={!canAccept || !pending || received}
                      onChange={(e) => toggleReceiverCheck(line.id, e.target.checked)}
                    />
                    <span className="warehouse-packet-check-label">
                      {warehousePacketDisplayLabel(line)}
                      {received ? ' (received)' : ''}
                    </span>
                  </label>
                );
              })}
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="product-form-btn"
                  onClick={() => handleSaveDeliveryNotePdf(session)}
                  disabled={printBusyId === session.id}
                >
                  {printBusyId === session.id
                    ? 'Saving PDF…'
                    : 'Save delivery note as PDF'}
                </button>
                <button
                  type="button"
                  className="product-form-btn"
                  onClick={() => handlePdf(session)}
                  disabled={pdfBusyId === session.id}
                >
                  {pdfBusyId === session.id ? 'Building PDF…' : 'View PDF'}
                </button>
                {pending ? (
                  <button
                    type="button"
                    className="product-form-btn product-form-btn--primary"
                    onClick={() => handleAccept(session.id)}
                    disabled={busyId === session.id || !canAccept || !canAcceptSession || toAcceptCount < 1}
                    style={{ opacity: !canAcceptSession ? 0.5 : 1 }}
                  >
                    {busyId === session.id ? 'Accepting…' : `Accept received packets (${toAcceptCount})`}
                  </button>
                ) : (
                  <span style={{ color: PAGE_THEME.muted, fontWeight: 600, alignSelf: 'center' }}>
                    All packets accepted — use PDF buttons above to review or save.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
