import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import {
  anyDeliveryPacketsReceiverConfirmed,
  deliveryEntryPendingAcceptCount,
  deliveryEntryReceivable,
  deliveryEntryReceived,
  deliveryEntryReceiverProgress,
  formatDateTime,
  groupWarehouseDisplayLines,
  isWarehouseCompleted,
  isWarehousePending,
  warehouseDeliveryReceiverLineKind,
  warehouseDeliveryReceiverNested,
  warehouseDeliveryReceiverProductHeader,
  warehouseDeliveryReceiverTickRows,
  warehouseDeliverySessionRouteLabel,
  warehousePacketDisplayLabel,
} from '../lib/deliveryReceive.js';
import { theme } from '../shared/theme';
import {
  acceptOrdersDelivery,
  fetchOrdersDeliveries,
  setOrdersDeliveryReceiverCheck,
} from '../services/ordersApi';

function TickRow({ line, nested, kitweChecked, canToggle, onToggle }) {
  return (
    <View style={[styles.tickRow, nested && styles.tickRowNested]}>
      <View style={styles.checkHit}>
        <Pressable
          disabled={!canToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: kitweChecked, disabled: !canToggle }}
          style={styles.checkTouch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onToggle}
        >
          <View style={[styles.box, kitweChecked && styles.boxOn]}>
            {kitweChecked ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
        </Pressable>
        <Text
          style={[styles.tickLabel, deliveryEntryReceived(line) ? styles.tickReceived : null]}
          pointerEvents="none"
        >
          {warehousePacketDisplayLabel(line)}
          {deliveryEntryReceived(line) ? ' (received into Kitwe)' : ''}
        </Text>
      </View>
    </View>
  );
}

export default function DeliveriesScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [sessions, setSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState('');
  const [acceptBusyId, setAcceptBusyId] = useState('');
  const revertRef = useRef({});
  const warmedRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!allowed) return;
    const quiet = silent || warmedRef.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const res = await fetchOrdersDeliveries();
      setSessions(res.sessions || []);
      setEntriesBySession(res.entriesBySession || {});
      warmedRef.current = true;
    } catch (err) {
      if (!quiet) {
        setError(err?.message || tUi('loadFailed', locale));
        setSessions([]);
        setEntriesBySession({});
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load({ silent: warmedRef.current }); }, [load]));

  const displaySessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => [
      s.delivery_number,
      s.status,
      s.created_by_email,
      s.metadata?.driver_name,
      s.metadata?.customer_name,
    ].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [sessions, search]);

  const patchEntry = (sessionId, entryId, metadata) => {
    setEntriesBySession((prev) => ({
      ...prev,
      [sessionId]: (prev[sessionId] || []).map((row) => (
        String(row.id) === String(entryId) ? { ...row, metadata: { ...(row.metadata || {}), ...metadata } } : row
      )),
    }));
  };

  const optimisticAccept = (sessionId) => {
    const now = new Date().toISOString();
    setSessions((prev) => prev.map((s) => (
      String(s.id) === String(sessionId)
        ? { ...s, status: 'completed', completed_at: now, accepted_at: now }
        : s
    )));
    setEntriesBySession((prev) => {
      const sid = String(sessionId);
      const rows = prev[sid] || [];
      return {
        ...prev,
        [sid]: rows.map((row) => {
          if (!deliveryEntryReceivable(row)) return row;
          const ticked = Boolean(row.metadata?.receiver_checked_at) || deliveryEntryReceived(row);
          if (!ticked) return row;
          return {
            ...row,
            metadata: {
              ...(row.metadata || {}),
              received_at: row.metadata?.received_at || now,
            },
          };
        }),
      };
    });
  };

  const runAccept = async (session) => {
    const sessionId = String(session.id);
    setAcceptBusyId(sessionId);
    optimisticAccept(sessionId);
    try {
      await acceptOrdersDelivery(session.id);
      await load({ silent: true });
    } catch (err) {
      await load({ silent: true });
      Alert.alert('Accept failed', err?.message || '');
    } finally {
      setAcceptBusyId('');
    }
  };

  const promptAcceptDelivery = (session) => {
    const pending = isWarehousePending(session.status);
    if (!pending) return;
    const entries = entriesBySession[String(session.id)] || [];
    const canRunAccept = anyDeliveryPacketsReceiverConfirmed(entries)
      && deliveryEntryPendingAcceptCount(entries) > 0;
    if (!canRunAccept) return;
    Alert.alert(
      tUi('acceptDelivery', locale),
      `Approve delivery ${session.delivery_number || ''} and receive the checked items into Kitwe?`,
      [
        { text: tUi('close', locale), style: 'cancel' },
        { text: 'Approve', onPress: () => void runAccept(session) },
      ],
    );
  };

  const toggleCheck = (session, line) => {
    if (deliveryEntryReceived(line)) return;
    const sessionId = String(session.id);
    const entryId = String(line.id);
    const prevMeta = { ...(line.metadata || {}) };
    const nextChecked = !Boolean(prevMeta.receiver_checked_at);
    const checkedAt = nextChecked ? new Date().toISOString() : null;
    revertRef.current[entryId] = prevMeta;
    patchEntry(sessionId, entryId, {
      ...prevMeta,
      receiver_checked_at: checkedAt,
      sent_to_customer: false,
      sent_to_customer_at: null,
      sent_to_customer_by_email: null,
    });
    void setOrdersDeliveryReceiverCheck(line.id, nextChecked).catch((err) => {
      patchEntry(sessionId, entryId, prevMeta);
      Alert.alert('Update failed', err?.message || '');
    });
  };

  const renderReceivePanel = (session) => {
    const entries = entriesBySession[String(session.id)] || [];
    const displayLines = groupWarehouseDisplayLines(entries);
    const pending = isWarehousePending(session.status);
    const canRunAccept = anyDeliveryPacketsReceiverConfirmed(entries)
      && deliveryEntryPendingAcceptCount(entries) > 0;
    const sessionAccepting = acceptBusyId === String(session.id);

    return (
      <View style={[kiosk.card, styles.detail]}>
        <View style={styles.head}>
          <Text style={kiosk.metaLine}>{session.delivery_number}</Text>
          <Pressable onPress={() => setOpenId('')}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>{tUi('close', locale)}</Text>
          </Pressable>
        </View>
        {displayLines.map((line) => {
          const rowKind = warehouseDeliveryReceiverLineKind(line);
          if (warehouseDeliveryReceiverProductHeader(line) || rowKind === 'assembly-header') {
            return (
              <View key={String(line.id)} style={styles.productBlock}>
                <Text style={styles.productHead}>{line.name}</Text>
              </View>
            );
          }
          if (rowKind !== 'receiver-line') return null;
          const nested = warehouseDeliveryReceiverNested(line);
          const checked = Boolean(line?.metadata?.receiver_checked_at);
          const received = deliveryEntryReceived(line);
          const kitweChecked = checked || received;
          const canToggle = pending && !received;
          return (
            <TickRow
              key={String(line.id)}
              line={line}
              nested={nested}
              kitweChecked={kitweChecked}
              canToggle={canToggle}
              onToggle={() => toggleCheck(session, line)}
            />
          );
        })}
        {canRunAccept ? (
          <Pressable
            style={[kiosk.btnPrimaryBlock, { marginTop: 16 }]}
            disabled={sessionAccepting}
            onPress={() => promptAcceptDelivery(session)}
          >
            <Text style={kiosk.btnPrimaryBlockText}>
              {sessionAccepting ? tUi('saving', locale) : tUi('acceptDelivery', locale)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <OrdersScreenShell
      title={tUi('tileDeliveries', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <Text style={kiosk.hint}>
        Factory → Kitwe deliveries. Tick each product and packet, then approve the delivery.
      </Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search delivery #, status…"
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading && !sessions.length ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {displaySessions.map((session) => {
            const entries = entriesBySession[String(session.id)] || [];
            const { total, confirmed } = deliveryEntryReceiverProgress(entries);
            const tickRows = warehouseDeliveryReceiverTickRows(entries);
            const receivedCount = tickRows.filter((e) => deliveryEntryReceived(e)).length;
            const completed = isWarehouseCompleted(session.status);
            const driver = session?.metadata?.driver_name;
            const progressLabel = completed
              ? `Items received: ${receivedCount}/${total}`
              : `Packets confirmed: ${confirmed}/${total}`;
            const sessionKey = String(session.id);
            const isOpen = openId === sessionKey;
            return (
              <View key={session.id} style={styles.sessionBlock}>
                <Pressable
                  style={[kiosk.card, isOpen && styles.openCard]}
                  onPress={() => setOpenId(isOpen ? '' : sessionKey)}
                  accessibilityRole="button"
                >
                  <View style={styles.head}>
                    <Text style={kiosk.metaLine}>{session.delivery_number || session.id}</Text>
                    {completed ? <Text style={styles.done}>{tUi('completed', locale)}</Text> : null}
                  </View>
                  <Text style={kiosk.hint}>{warehouseDeliverySessionRouteLabel(session)}</Text>
                  <Text style={kiosk.hint}>Sent: {formatDateTime(session.submitted_at || session.created_at)}</Text>
                  {driver ? <Text style={kiosk.hint}>Driver: {driver}</Text> : null}
                  <Text style={[kiosk.metaLine, { color: completed ? '#166534' : '#b45309' }]}>{progressLabel}</Text>
                </Pressable>
                {isOpen ? renderReceivePanel(session) : null}
              </View>
            );
          })}
          {!displaySessions.length ? <Text style={kiosk.hint}>{tUi('empty', locale)}</Text> : null}
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  sessionBlock: { marginBottom: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  done: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  openCard: { borderColor: theme.primary, borderWidth: 2 },
  detail: { marginTop: 8, borderColor: theme.primary, borderWidth: 2 },
  productBlock: { marginTop: 12, marginBottom: 2 },
  productHead: {
    color: theme.text,
    fontWeight: '800',
    fontSize: 16,
    lineHeight: 22,
  },
  tickRow: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.surface,
  },
  tickRowNested: {
    marginLeft: 14,
    marginTop: 6,
    borderStyle: 'dashed',
    backgroundColor: theme.card,
  },
  checkHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
  },
  checkTouch: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: theme.primary },
  checkMark: { color: '#fff', fontWeight: '900' },
  tickLabel: { flex: 1, color: theme.text, fontWeight: '600', lineHeight: 20 },
  tickReceived: { opacity: 0.75 },
});
