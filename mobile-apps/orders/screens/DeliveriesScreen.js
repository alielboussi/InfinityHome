import { useCallback, useMemo, useState } from 'react';
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
  deliveryEntryReceived,
  deliveryEntryReceiverProgress,
  formatDateTime,
  groupWarehouseDisplayLines,
  isWarehouseCompleted,
  isWarehousePending,
  warehouseDeliveryReceiverLineKind,
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

export default function DeliveriesScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [sessions, setSessions] = useState([]);
  const [entriesBySession, setEntriesBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrdersDeliveries();
      setSessions(res.sessions || []);
      setEntriesBySession(res.entriesBySession || {});
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setSessions([]);
      setEntriesBySession({});
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

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
        String(row.id) === String(entryId) ? { ...row, metadata } : row
      )),
    }));
  };

  const toggleCheck = async (session, line, checked) => {
    setBusy(true);
    try {
      const res = await setOrdersDeliveryReceiverCheck(line.id, checked);
      patchEntry(String(session.id), line.id, res.metadata || { ...(line.metadata || {}), receiver_checked_at: checked ? new Date().toISOString() : null });
    } catch (err) {
      Alert.alert('Update failed', err?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (session) => {
    setBusy(true);
    try {
      await acceptOrdersDelivery(session.id);
      await load();
    } catch (err) {
      Alert.alert('Accept failed', err?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const openSession = sessions.find((s) => String(s.id) === String(openId));

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
        Factory → Kitwe deliveries. Tick received lines to record into Kitwe stock, then accept the delivery.
      </Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search delivery #, status…"
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} /> : (
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
            return (
              <Pressable
                key={session.id}
                style={[kiosk.card, openId === String(session.id) && styles.openCard]}
                onPress={() => setOpenId(String(session.id) === openId ? '' : String(session.id))}
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
            );
          })}
          {!displaySessions.length ? <Text style={kiosk.hint}>{tUi('empty', locale)}</Text> : null}

          {openSession ? (() => {
            const entries = entriesBySession[String(openSession.id)] || [];
            const displayLines = groupWarehouseDisplayLines(entries);
            const pending = isWarehousePending(openSession.status);
            const canRunAccept = anyDeliveryPacketsReceiverConfirmed(entries)
              && deliveryEntryPendingAcceptCount(entries) > 0;
            return (
              <View style={[kiosk.card, styles.detail]}>
                <View style={styles.head}>
                  <Text style={kiosk.metaLine}>{openSession.delivery_number}</Text>
                  <Pressable onPress={() => setOpenId('')}>
                    <Text style={{ color: theme.primary, fontWeight: '700' }}>{tUi('close', locale)}</Text>
                  </Pressable>
                </View>
                {displayLines.map((line) => {
                  const kind = warehouseDeliveryReceiverLineKind(line);
                  if (kind === 'assembly-header') {
                    return <Text key={line.id} style={[kiosk.metaLine, { marginTop: 10 }]}>{line.name}</Text>;
                  }
                  if (kind !== 'receiver-line') return null;
                  const checked = Boolean(line?.metadata?.receiver_checked_at);
                  const received = deliveryEntryReceived(line);
                  const kitweChecked = checked || received;
                  const canToggle = pending && !received;
                  return (
                    <View key={line.id} style={styles.tickRow}>
                      <Pressable
                        disabled={!canToggle || busy}
                        style={styles.checkHit}
                        onPress={() => toggleCheck(openSession, line, !kitweChecked)}
                      >
                        <View style={[styles.box, kitweChecked && styles.boxOn]}>
                          {kitweChecked ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.tickLabel}>
                          {warehousePacketDisplayLabel(line)}
                          {received ? ' (received into Kitwe)' : ''}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
                {canRunAccept ? (
                  <Pressable style={[kiosk.btnPrimaryBlock, { marginTop: 16 }]} disabled={busy} onPress={() => accept(openSession)}>
                    <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('acceptDelivery', locale)}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })() : null}
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
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
  detail: { borderColor: theme.primary, borderWidth: 2 },
  tickRow: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
  },
  checkHit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxOn: { backgroundColor: theme.primary },
  checkMark: { color: '#fff', fontWeight: '900' },
  tickLabel: { flex: 1, color: theme.text, fontWeight: '600', lineHeight: 20 },
});
