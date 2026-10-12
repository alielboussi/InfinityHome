import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  applyScanQty,
  clearActiveSession,
  createEmptySession,
  findPacketLineByScan,
  listRemainingLines,
  listScannedLines,
  loadActiveSessionId,
  loadSession,
  saveSession,
  sessionStats,
} from '../shared/warehouseStockCountSession';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { theme } from '../shared/theme';

export default function WarehouseStockCountScreen() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [catalogPackets, setCatalogPackets] = useState([]);
  const [scanValue, setScanValue] = useState('');
  const [progressOpen, setProgressOpen] = useState(false);
  const [qtyModal, setQtyModal] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('1');
  const scanRef = useRef(null);
  const { keepFocusAfterSubmit, stripScanTerminator } = useKeepSoftKeyboardOnScanSubmit(scanRef);

  const stats = useMemo(() => sessionStats(session), [session]);
  const scannedLines = useMemo(() => listScannedLines(session), [session]);
  const remainingLines = useMemo(() => listRemainingLines(session), [session]);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await warehouseMobileRequest('catalog-list');
      setCatalogPackets(data?.packets || []);
      const activeId = await loadActiveSessionId();
      const existing = activeId ? await loadSession(activeId) : null;
      setSession(existing);
    } catch (err) {
      setError(err?.message || 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [hydrate]),
  );

  const persistSession = useCallback(async (next) => {
    setSession(next);
    await saveSession(next);
  }, []);

  const startSession = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await warehouseMobileRequest('catalog-list');
      const packets = data?.packets || [];
      if (!packets.length) {
        setError('No packets in catalog. Add packets before starting a count.');
        return;
      }
      const next = createEmptySession({ catalog: data });
      await persistSession(next);
      setCatalogPackets(packets);
      setTimeout(() => scanRef.current?.focus?.(), 80);
    } catch (err) {
      setError(err?.message || 'Could not start session');
    } finally {
      setBusy(false);
    }
  };

  const endSession = () => {
    Alert.alert(
      'End count session?',
      'This clears the floor checklist on this device. It does not change web stocktake or inventory.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End session',
          style: 'destructive',
          onPress: async () => {
            await clearActiveSession();
            setSession(null);
            setScanValue('');
          },
        },
      ],
    );
  };

  const openQtyForLine = (line) => {
    setQtyDraft('1');
    setQtyModal({ packetId: line.packetId, sku: line.sku, name: line.name });
  };

  const commitQty = async () => {
    if (!session || !qtyModal) return;
    const addQty = Math.max(1, Math.floor(Number(qtyDraft) || 1));
    const next = applyScanQty(session, qtyModal.packetId, addQty);
    await persistSession(next);
    setQtyModal(null);
    setScanValue('');
    keepFocusAfterSubmit();
  };

  const handleScanSubmit = (overrideValue) => {
    const normalized = normalizeWarehousePacketScan(overrideValue ?? scanValue);
    if (!session) {
      setError('Start a session before scanning.');
      keepFocusAfterSubmit();
      return;
    }
    if (!normalized) {
      setError('Scan or type a packet SKU.');
      keepFocusAfterSubmit();
      return;
    }
    const line = findPacketLineByScan(
      session,
      catalogPackets,
      normalized,
      expandWarehouseSkuMatchKeys,
    );
    if (!line) {
      setError(`SKU not on this checklist: ${normalized}`);
      setScanValue('');
      keepFocusAfterSubmit();
      return;
    }
    setError('');
    openQtyForLine(line);
  };

  if (loading && !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.lead}>
          Floor stock count checklist — scan each packet SKU and enter qty. This session stays on your
          phone only and is not linked to web stocktake periods.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.primaryBtn} onPress={startSession} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? 'Starting…' : 'Start count session'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sessionMeta}>
        {session.warehouseLocationName} · started{' '}
        {new Date(session.startedAt).toLocaleString()}
      </Text>
      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>Checklist progress</Text>
        <Text style={styles.progressNumbers}>
          <Text style={styles.progressDone}>{stats.scanned}</Text>
          <Text style={styles.progressMuted}> / {stats.total} scanned · </Text>
          <Text style={styles.progressRemain}>{stats.remaining}</Text>
          <Text style={styles.progressMuted}> remaining</Text>
        </Text>
      </View>

      <Text style={styles.label}>Scan packet SKU (Code 128)</Text>
      <TextInput
        ref={scanRef}
        style={styles.scanInput}
        value={scanValue}
        onChangeText={wedgeAwareTextChange(setScanValue, {
          stripScanTerminator,
          keepFocusAfterSubmit,
          transform: (v) => v.toUpperCase(),
          normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'packet'),
          onWedgeComplete: (v) => handleScanSubmit(v),
        })}
        placeholder="Scan or type SKU…"
        placeholderTextColor={theme.textDim}
        autoCapitalize="characters"
        autoCorrect={false}
        blurOnSubmit={false}
        returnKeyType="done"
        onSubmitEditing={() => handleScanSubmit()}
        showSoftInputOnFocus
      />
      <Pressable style={styles.secondaryBtn} onPress={handleScanSubmit}>
        <Text style={styles.secondaryBtnText}>Record scan</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.listBtn} onPress={() => setProgressOpen(true)}>
        <Text style={styles.listBtnText}>Scanned & remaining</Text>
      </Pressable>

      <Pressable style={styles.endBtn} onPress={endSession}>
        <Text style={styles.endBtnText}>End session</Text>
      </Pressable>

      <Modal visible={Boolean(qtyModal)} transparent animationType="fade" onRequestClose={() => setQtyModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Qty for this scan</Text>
            {qtyModal ? (
              <>
                <Text style={styles.modalSku}>{qtyModal.sku}</Text>
                <Text style={styles.modalName} numberOfLines={2}>{qtyModal.name}</Text>
              </>
            ) : null}
            <TextInput
              style={styles.qtyInput}
              value={qtyDraft}
              onChangeText={(v) => setQtyDraft(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              selectTextOnFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setQtyModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={commitQty}>
                <Text style={styles.modalConfirmText}>Tick off</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={progressOpen} animationType="slide" onRequestClose={() => setProgressOpen(false)}>
        <View style={styles.progressModal}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressHeaderTitle}>Scanned & remaining</Text>
            <Pressable onPress={() => setProgressOpen(false)} hitSlop={12}>
              <Text style={styles.closeLink}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.progressScroll}>
            <Text style={styles.sectionTitle}>Scanned ({scannedLines.length})</Text>
            {scannedLines.length === 0 ? (
              <Text style={styles.emptySection}>Nothing scanned yet.</Text>
            ) : (
              scannedLines.map((line) => (
                <View key={line.packetId} style={styles.lineRow}>
                  <Text style={styles.lineSku}>{line.sku}</Text>
                  <Text style={styles.lineName} numberOfLines={1}>{line.name}</Text>
                  <Text style={styles.lineQty}>Qty {line.scannedQty}</Text>
                </View>
              ))
            )}
            <Text style={[styles.sectionTitle, styles.sectionGap]}>Remaining ({remainingLines.length})</Text>
            {remainingLines.length === 0 ? (
              <Text style={styles.emptySection}>All packets ticked — great job.</Text>
            ) : (
              remainingLines.map((line) => (
                <View key={line.packetId} style={styles.lineRowMuted}>
                  <Text style={styles.lineSkuMuted}>{line.sku}</Text>
                  <Text style={styles.lineNameMuted} numberOfLines={1}>{line.name}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: theme.space.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  lead: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: theme.space.lg },
  sessionMeta: { color: theme.textDim, fontSize: 12, marginBottom: theme.space.md },
  progressCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.md,
    marginBottom: theme.space.lg,
  },
  progressTitle: { color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  progressNumbers: { fontSize: 18 },
  progressDone: { color: '#86efac', fontWeight: '800' },
  progressRemain: { color: '#fcd34d', fontWeight: '800' },
  progressMuted: { color: theme.textMuted, fontWeight: '600' },
  label: { color: theme.textMuted, fontWeight: '600', marginBottom: 6, fontSize: 13 },
  scanInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 16,
    fontFamily: 'monospace',
  },
  secondaryBtn: {
    marginTop: 10,
    padding: 12,
    alignItems: 'center',
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryBtnText: { color: theme.text, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: theme.primaryBg,
    borderRadius: theme.radiusSm,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.primaryDark,
  },
  primaryBtnText: { color: theme.text, fontWeight: '800', fontSize: 16 },
  listBtn: {
    marginTop: theme.space.xl,
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radiusSm,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.primary,
  },
  listBtnText: { color: '#93c5fd', fontWeight: '800', fontSize: 16 },
  endBtn: { marginTop: theme.space.md, padding: 12, alignItems: 'center' },
  endBtnText: { color: theme.danger, fontWeight: '700' },
  error: { color: theme.danger, marginTop: 10 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.lg,
  },
  modalTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalSku: { color: '#38bdf8', fontFamily: 'monospace', fontWeight: '700' },
  modalName: { color: theme.textMuted, marginTop: 4, marginBottom: 12 },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalActions: { flexDirection: 'row', marginTop: 16, gap: 10 },
  modalCancel: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalCancelText: { color: theme.textMuted, fontWeight: '700' },
  modalConfirm: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: theme.primaryBg,
    borderWidth: 1,
    borderColor: theme.primaryDark,
  },
  modalConfirmText: { color: theme.text, fontWeight: '800' },
  progressModal: { flex: 1, backgroundColor: theme.bg },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  progressHeaderTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
  closeLink: { color: '#93c5fd', fontWeight: '700', fontSize: 16 },
  progressScroll: { padding: theme.space.lg, paddingBottom: 40 },
  sectionTitle: { color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 8 },
  sectionGap: { marginTop: 20 },
  emptySection: { color: theme.textDim, fontStyle: 'italic', marginBottom: 8 },
  lineRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  lineRowMuted: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    opacity: 0.85,
  },
  lineSku: { color: '#86efac', fontFamily: 'monospace', fontSize: 13, fontWeight: '700' },
  lineSkuMuted: { color: theme.textDim, fontFamily: 'monospace', fontSize: 13 },
  lineName: { color: theme.text, fontSize: 13, marginTop: 2 },
  lineNameMuted: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  lineQty: { color: '#7dd3fc', fontWeight: '800', marginTop: 4, fontSize: 13 },
});
