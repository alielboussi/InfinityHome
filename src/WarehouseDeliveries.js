import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { sendWarehouseDeliveryWhatsApp } from './services/whatsapp';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  WAREHOUSE_RETURN_DELIVERY_SOURCES,
  warehouseDeliverySessionRouteLabel,
  deliverySenderName,
  deliveryLineQty,
  groupWarehouseDisplayLines,
  isWarehousePending,
  isWarehouseCompleted,
  WAREHOUSE_RECEIVER_LIST_STATUSES,
  anyDeliveryPacketsReceiverConfirmed,
  deliveryEntryReceiverProgress,
  warehouseDeliveryReceiverTickRows,
  deliveryEntryReceived,
  deliveryEntryReceivable,
  deliveryEntryPendingAcceptCount,
  deliverySessionNeedsCatalogFinalize,
  deliverySessionNeedsTickRowFinalize,
  warehousePacketDisplayLabel,
  warehouseDeliveryReceiverLineKind,
} from './utils/warehouseDelivery';
import { buildKitweDeliveryWhatsAppText } from './utils/kitweDeliveryWhatsAppAdmin';
import { buildWarehouseDeliveryPdf, openPdfBlob } from './utils/warehouseDeliveryPdf';
import {
  buildWarehouseDeliveryNoteHtml,
  downloadWarehouseDeliveryNotePdf,
  renderWarehouseDeliveryNotePdfBlob,
} from './utils/warehouseDeliveryNotePrint';
import {
  acceptWarehouseDeliverySession,
  setDeliveryEntryReceiverCheck,
  cancelWarehouseDeliverySession,
  discardWarehouseDeliveryDraft,
} from './services/warehouseDeliveryMobileApi';
import { getCurrentUser, canPerformWarehouseKitweReceiver, canManageCatalog } from './accessControl';

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
 * Factory → Kitwe deliveries (Kitwe receiver + inventory admin).
 * @param {{ adminMode?: boolean }} props — `/warehouse-deliveries-admin` uses same cards + receive flow as Hassan.
 */
export default function WarehouseDeliveries({ adminMode = false } = {}) {
  const location = useLocation();
  const receiverPath = adminMode ? '/warehouse-deliveries-admin' : location.pathname;
  const [sessions, setSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [editQtyMap, setEditQtyMap] = useState({});
  const [destStockByProduct, setDestStockByProduct] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pdfBusyId, setPdfBusyId] = useState('');
  const [printBusyId, setPrintBusyId] = useState('');
  const [fromName, setFromName] = useState('Factory Warehouse');
  const [toName, setToName] = useState('Kitwe Branch');
  const [usersById, setUsersById] = useState(new Map());
  const [deliveryColorContext, setDeliveryColorContext] = useState(null);
  const [isIpadSafari, setIsIpadSafari] = useState(() => detectIpadSafari());
  const [openSessionId, setOpenSessionId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentUserId, setCurrentUserId] = useState('');
  const [cancelBusyId, setCancelBusyId] = useState('');
  const [removeBusyId, setRemoveBusyId] = useState('');
  const [whatsappBusyId, setWhatsappBusyId] = useState('');
  const [catalogAdmin, setCatalogAdmin] = useState(false);
  const sessionUser = useMemo(() => {
    try {
      return getCurrentUser();
    } catch {
      return null;
    }
  }, []);
  const canAccept = canPerformWarehouseKitweReceiver(sessionUser, receiverPath);
  const refreshSeconds = canAccept ? 15 : 60;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      const user = raw ? JSON.parse(raw) : null;
      setCurrentUserId(user?.id || '');
      setCatalogAdmin(canManageCatalog(user));
    } catch {
      setCurrentUserId('');
      setCatalogAdmin(false);
    }
  }, []);

  useEffect(() => {
    const onResize = () => setIsIpadSafari(detectIpadSafari());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadDeliveries = useCallback(async ({ silent = false, skipAutoFinalize = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const sessionSelect = 'id, delivery_number, from_location, to_location, created_at, transfer_datetime, submitted_at, status, total_qty, created_by_id, created_by_email, created_by_name, accepted_at, applied_at, completed_at, last_edited_at, pdf_url, metadata';
      const statusIn = (q) => q.in('status', WAREHOUSE_RECEIVER_LIST_STATUSES);

      let sessionsList = [];
      if (adminMode) {
        const { data: factoryRows, error: sessErr } = await db
          .from('warehouse_delivery_sessions')
          .select(sessionSelect)
          .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
          .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
          .order('delivery_number', { ascending: false });
        if (sessErr) throw sessErr;
        const includeReturns = !['draft', 'cancelled', 'failed'].includes(statusFilter);
        let returnRows = [];
        if (includeReturns) {
          const { data: rr, error: returnErr } = await statusIn(
            db
              .from('warehouse_delivery_sessions')
              .select(sessionSelect)
              .in('metadata->>source', WAREHOUSE_RETURN_DELIVERY_SOURCES),
          ).order('delivery_number', { ascending: false });
          if (returnErr) throw returnErr;
          returnRows = rr || [];
        }
        const byId = new Map();
        [...(factoryRows || []), ...returnRows].forEach((row) => {
          if (row?.id) byId.set(String(row.id), row);
        });
        sessionsList = [...byId.values()].sort((a, b) => {
          const na = String(a.delivery_number || '');
          const nb = String(b.delivery_number || '');
          return nb.localeCompare(na, undefined, { numeric: true });
        });
      } else {
        const [{ data: factoryRows, error: sessErr }, { data: returnRows, error: returnErr }] = await Promise.all([
          statusIn(
            db
              .from('warehouse_delivery_sessions')
              .select(sessionSelect)
              .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
              .eq('to_location', WAREHOUSE_TO_LOCATION_ID),
          ).order('delivery_number', { ascending: false }),
          statusIn(
            db
              .from('warehouse_delivery_sessions')
              .select(sessionSelect)
              .in('metadata->>source', WAREHOUSE_RETURN_DELIVERY_SOURCES),
          ).order('delivery_number', { ascending: false }),
        ]);
        if (sessErr) throw sessErr;
        if (returnErr) throw returnErr;

        const byId = new Map();
        [...(factoryRows || []), ...(returnRows || [])].forEach((row) => {
          if (row?.id) byId.set(String(row.id), row);
        });
        sessionsList = [...byId.values()].sort((a, b) => {
          const na = String(a.delivery_number || '');
          const nb = String(b.delivery_number || '');
          return nb.localeCompare(na, undefined, { numeric: true });
        });
      }
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

      const [
        { data: assemblies },
        { data: assemblyColors },
        { data: colors },
      ] = await Promise.all([
        db.from('warehouse_assemblies').select('id, name, has_color_variants, item_kind'),
        db.from('warehouse_assembly_colors').select('assembly_id, color_id'),
        db.from('warehouse_colors').select('id, name, name_key'),
      ]);
      setDeliveryColorContext({
        assemblies: assemblies || [],
        assemblyColors: assemblyColors || [],
        colors: colors || [],
      });

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
      if (adminMode) setEditQtyMap(nextEdit);

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

      if (canAccept && !skipAutoFinalize) {
        let healedAny = false;
        for (const session of sessionsList) {
          const entries = grouped[String(session.id)] || [];
          const needsFinalize = deliverySessionNeedsCatalogFinalize(entries, session.status)
            || deliverySessionNeedsTickRowFinalize(entries, session.status);
          if (!needsFinalize) continue;
          try {
            await acceptWarehouseDeliverySession(session.id);
            healedAny = true;
          } catch (finalizeErr) {
            console.warn(
              '[warehouse-deliveries] Kitwe catalog finalize failed',
              session.delivery_number || session.id,
              finalizeErr,
            );
          }
        }
        if (healedAny) {
          await loadDeliveries({ silent: true, skipAutoFinalize: true });
          return;
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to load deliveries.');
      setSessions([]);
      setEntriesBySession({});
    } finally {
      if (!silent) setLoading(false);
    }
  }, [adminMode, canAccept, statusFilter]);

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

  useEffect(() => {
    const ms = canAccept ? 15000 : 60000;
    const id = setInterval(() => {
      if (busyId || printBusyId || pdfBusyId) return;
      loadDeliveries({ silent: true });
    }, ms);
    return () => clearInterval(id);
  }, [loadDeliveries, canAccept, busyId, printBusyId, pdfBusyId]);

  const displaySessions = useMemo(() => {
    if (!adminMode) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const status = String(s.status || '').toLowerCase();
      if (statusFilter === 'all') {
        if (status === 'draft' || status === 'cancelled') return false;
      } else if (statusFilter !== 'pending' && statusFilter !== 'completed') {
        if (status !== statusFilter) return false;
      }
      if (statusFilter === 'pending' && !isWarehousePending(status)) return false;
      if (statusFilter === 'completed' && !isWarehouseCompleted(status)) return false;
      if (!q) return true;
      const hay = `${s.delivery_number || ''} ${s.id} ${s.created_by_email || ''} ${s.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [adminMode, sessions, search, statusFilter]);

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
        assemblyColorContext: deliveryColorContext,
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
          const message = buildKitweDeliveryWhatsAppText(
            updatedSession,
            entries,
            usersById,
            deliveryColorContext,
            { fromName, toName },
          );
          let pdfBase64 = '';
          try {
            const html = await buildWarehouseDeliveryNoteHtml({
              session: updatedSession,
              entries,
              copies: 1,
              assemblyColorContext: deliveryColorContext,
            });
            const pdfBlob = await renderWarehouseDeliveryNotePdfBlob(html);
            pdfBase64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result || '');
                resolve(dataUrl.replace(/^data:application\/pdf[^,]*,/, '').replace(/\s+/g, ''));
              };
              reader.onerror = () => reject(reader.error || new Error('PDF read failed'));
              reader.readAsDataURL(pdfBlob);
            });
          } catch (pdfErr) {
            console.warn('Warehouse delivery PDF build failed:', pdfErr);
          }
          const dn = updatedSession?.delivery_number || updatedSession?.id || 'delivery';
          const wa = await sendWarehouseDeliveryWhatsApp({
            message,
            pdfBase64: pdfBase64 || undefined,
            pdfFilename: `${dn}-delivery-note.pdf`,
          });
          if (!wa.ok) console.warn('Warehouse delivery WhatsApp failed:', wa.error);
        } catch (waErr) {
          console.warn('Warehouse delivery WhatsApp error:', waErr);
        }
      })();

      await loadDeliveries({ silent: true, skipAutoFinalize: true });
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
      await loadDeliveries({ silent: true, skipAutoFinalize: true });
      setError(err?.message || 'Failed to update packet confirmation.');
    }
  };

  const handleSaveEdits = async (session) => {
    if (!adminMode || !session?.id || busyId) return;
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

  const handleResendWhatsApp = async (session) => {
    if (!adminMode || !session?.id || whatsappBusyId || !catalogAdmin) return;
    const status = String(session.status || '').toLowerCase();
    if (status === 'draft' || status === 'cancelled') {
      setError('Only submitted deliveries can be sent to WhatsApp.');
      return;
    }
    const entries = entriesBySession[String(session.id)] || [];
    if (!entries.length) {
      setError('Add delivery lines before sending WhatsApp.');
      return;
    }
    setWhatsappBusyId(session.id);
    setError('');
    try {
      const html = await buildWarehouseDeliveryNoteHtml({
        session,
        entries,
        copies: 1,
        assemblyColorContext: deliveryColorContext,
      });
      const pdfBlob = await renderWarehouseDeliveryNotePdfBlob(html);
      const pdfBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          resolve(dataUrl.replace(/^data:application\/pdf[^,]*,/, '').replace(/\s+/g, ''));
        };
        reader.onerror = () => reject(reader.error || new Error('PDF read failed'));
        reader.readAsDataURL(pdfBlob);
      });
      const message = buildKitweDeliveryWhatsAppText(
        session,
        entries,
        usersById,
        deliveryColorContext,
        { fromName, toName },
      );
      const dn = session.delivery_number || session.id;
      const wa = await sendWarehouseDeliveryWhatsApp({
        message,
        pdfBase64,
        pdfFilename: `${dn}-delivery-note.pdf`,
      });
      if (!wa.ok) throw new Error(wa.error || 'WhatsApp send failed.');
    } catch (err) {
      setError(err?.message || 'Failed to send WhatsApp.');
    } finally {
      setWhatsappBusyId('');
    }
  };

  const handleRemoveDraft = async (session) => {
    if (!adminMode || !session?.id || removeBusyId) return;
    const dn = session.delivery_number || session.id;
    const ok = window.confirm(
      `Remove ${dn} from the system? Use this for failed or abandoned drafts so the sender can start again.`,
    );
    if (!ok) return;
    setRemoveBusyId(session.id);
    setError('');
    try {
      await discardWarehouseDeliveryDraft({ sessionId: session.id });
      setOpenSessionId('');
      await loadDeliveries();
    } catch (err) {
      setError(err?.message || 'Failed to remove delivery.');
    } finally {
      setRemoveBusyId('');
    }
  };

  const handleCancelDelivery = async (session) => {
    if (!adminMode || !session?.id || cancelBusyId) return;
    const dn = session.delivery_number || session.id;
    const ok = window.confirm(
      `Cancel ${dn}? Stock is unchanged unless packets were already accepted at Kitwe.`,
    );
    if (!ok) return;
    setCancelBusyId(session.id);
    setError('');
    try {
      await cancelWarehouseDeliverySession({ sessionId: session.id, reason: 'Cancelled from admin' });
      setOpenSessionId('');
      await loadDeliveries();
    } catch (err) {
      setError(err?.message || 'Failed to cancel delivery.');
    } finally {
      setCancelBusyId('');
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
            {adminMode ? 'Deliveries' : 'Warehouse Deliveries'}
          </h1>
        </div>
        <p style={{ color: PAGE_THEME.muted, marginBottom: 16, lineHeight: 1.5, marginTop: 0 }}>
          {adminMode
            ? 'Factory → Kitwe deliveries (same receive flow as Kitwe on iPad): tick items, accept stock, PDFs. Search and filters include admin cleanup for drafts. Auto-refresh every '
            : 'Factory → Kitwe deliveries from the Production app, plus return shipments (WHR) and customer return deliveries (CR) when they use the delivery flow. Accepted sessions stay on this list for PDFs and review. Auto-refresh every '}
          {refreshSeconds} seconds.
        </p>
        {adminMode ? (
          <div className="warehouse-deliveries-toolbar" style={{ marginBottom: 16 }}>
            <input
              type="search"
              className="warehouse-deliveries-toolbar__search"
              placeholder="Search delivery #, email, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="warehouse-deliveries-toolbar__status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Active deliveries</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="draft">Draft (cleanup)</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        ) : null}
        {!canAccept && sessionUser && !adminMode ? (
          <div style={{ color: '#b45309', marginBottom: 12, fontWeight: 600 }}>
            Packet confirmation is limited to Hassan Awad (Kitwe), login-access admin, or localhost testing on this page (
            <code>/warehouse-deliveries</code>
            ).
          </div>
        ) : null}
        {loading && <div style={{ color: PAGE_THEME.muted }}>Loading deliveries...</div>}
        {error && <div className="report-error" style={{ marginBottom: 12 }}>{error}</div>}
        {!loading && displaySessions.length === 0 && (
          <div style={{ color: PAGE_THEME.muted, fontWeight: 500 }}>
            {adminMode ? 'No deliveries found.' : 'No deliveries yet.'}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
        >
          {displaySessions.map((session) => {
            const entries = entriesBySession[String(session.id)] || [];
            const { total, confirmed } = deliveryEntryReceiverProgress(entries);
            const tickRows = warehouseDeliveryReceiverTickRows(entries);
            const receivedCount = tickRows.filter((e) => deliveryEntryReceived(e)).length;
            const progressItemLabel = tickRows.some((e) => e?.metadata?.finished_unit) ? 'Items' : 'Packets';
            const completed = isWarehouseCompleted(session.status);
            const driver = session?.metadata?.driver_name;
            const allTicksReceived = total > 0 && receivedCount === total;
            const progressLabel = completed
              ? `${progressItemLabel} received: ${receivedCount}/${total}`
              : allTicksReceived
                ? `${progressItemLabel} received: ${receivedCount}/${total} (accept to complete)`
                : `${progressItemLabel} confirmed: ${confirmed}/${total}`;
            const progressColor = completed
              ? '#4ade80'
              : allTicksReceived
                ? '#f59e0b'
                : '#fbbf24';
            const routeLabel = warehouseDeliverySessionRouteLabel(session, { fromName, toName });
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
                <div style={{ color: PAGE_THEME.muted, marginTop: 6 }}>
                  {routeLabel}
                </div>
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
          const toAcceptCount = deliveryEntryPendingAcceptCount(entries);
          const needsCatalogFinalize = deliverySessionNeedsCatalogFinalize(entries, session.status);
          const canRunAccept = canAcceptSession && (toAcceptCount > 0 || needsCatalogFinalize);
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
                const rowKind = warehouseDeliveryReceiverLineKind(line);
                if (rowKind === 'assembly-header') {
                  return (
                    <div key={line.id} style={{ fontWeight: 700, marginTop: 14, color: PAGE_THEME.text }}>
                      {line.name}
                    </div>
                  );
                }
                if (rowKind !== 'receiver-line') return null;
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
                    disabled={busyId === session.id || !canAccept || !canRunAccept}
                    style={{ opacity: !canRunAccept ? 0.5 : 1 }}
                  >
                    {busyId === session.id
                      ? 'Accepting…'
                      : (toAcceptCount > 0
                        ? `Accept received items (${toAcceptCount})`
                        : 'Complete delivery & Kitwe catalog')}
                  </button>
                ) : (
                  <span style={{ color: PAGE_THEME.muted, fontWeight: 600, alignSelf: 'center' }}>
                    All items accepted — use PDF buttons above to review or save.
                  </span>
                )}
              </div>
              {adminMode ? (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${PAGE_THEME.borderSoft}` }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Admin</div>
                  {displayLines.map((line) => {
                    if (line.kind === 'set-parent') {
                      return (
                        <div key={`admin-${line.id}`} style={{ fontWeight: 700, textDecoration: 'underline', marginTop: 8 }}>
                          {line.name} (Set)
                        </div>
                      );
                    }
                    const original = line.original_quantity != null ? Number(line.original_quantity) : null;
                    const canEdit = isWarehousePending(session.status);
                    return (
                      <div
                        key={`admin-${line.id}`}
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
                            <span style={{ color: PAGE_THEME.muted, marginLeft: 8, fontSize: 12 }}>
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
                            border: `1px solid ${PAGE_THEME.border}`,
                            background: PAGE_THEME.surfaceAlt,
                            color: PAGE_THEME.text,
                            opacity: canEdit ? 1 : 0.6,
                          }}
                        />
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {(() => {
                      const statusLower = String(session.status || '').toLowerCase();
                      const canWhatsApp = catalogAdmin
                        && statusLower !== 'draft'
                        && statusLower !== 'cancelled'
                        && entries.length > 0;
                      const canEditSession = isWarehousePending(session.status);
                      return (
                        <>
                          {canWhatsApp && (
                            <button
                              type="button"
                              className="portal-btn-whatsapp stock-periods-btn"
                              title="Resend to Automated Delivery Receipts WhatsApp group with A4 delivery note PDF"
                              aria-label="Resend delivery WhatsApp"
                              onClick={() => handleResendWhatsApp(session)}
                              disabled={whatsappBusyId === session.id}
                            >
                              <FaWhatsapp size={18} aria-hidden />
                              {whatsappBusyId === session.id ? 'Sending…' : 'WhatsApp'}
                            </button>
                          )}
                          {canEditSession && (
                            <button
                              type="button"
                              className="product-form-btn product-form-btn--primary"
                              onClick={() => handleSaveEdits(session)}
                              disabled={busyId === session.id}
                            >
                              {busyId === session.id ? 'Saving…' : 'Save qty edits'}
                            </button>
                          )}
                          {canEditSession && (
                            <button
                              type="button"
                              className="product-form-btn"
                              onClick={() => handleCancelDelivery(session)}
                              disabled={cancelBusyId === session.id}
                              style={{ color: '#c62828', borderColor: '#c62828' }}
                            >
                              {cancelBusyId === session.id ? 'Cancelling…' : 'Cancel delivery'}
                            </button>
                          )}
                          {catalogAdmin && (statusLower === 'draft' || statusLower === 'cancelled') && (
                            <button
                              type="button"
                              className="product-form-btn"
                              onClick={() => handleRemoveDraft(session)}
                              disabled={removeBusyId === session.id}
                              style={{ background: '#b91c1c', color: '#fff' }}
                            >
                              {removeBusyId === session.id ? 'Removing…' : 'Remove draft'}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
