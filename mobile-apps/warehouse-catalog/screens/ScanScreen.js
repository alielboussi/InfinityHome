import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  enqueueOfflineOp,
  flushOfflineQueue,
  getOfflineQueueLength,
} from '../shared/offlineScanQueue';
import {
  isLikelyNetworkError,
  warehouseMobileRequest,
} from '../shared/warehouseMobileApi';
import {
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  normalizeWarehouseSku,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';

async function resolveScan(scan) {
  return warehouseMobileRequest('scan-resolve', { scan });
}

export default function ScanScreen({ navigation, route }) {
  const warehouseLocationId = route.params?.warehouseLocationId;
  const skuInputRef = useRef(null);
  const {
    keepFocusAfterSubmit,
    stripScanTerminator,
  } = useKeepSoftKeyboardOnScanSubmit(skuInputRef);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [queued, setQueued] = useState(0);

  const refreshQueueCount = useCallback(async () => {
    setQueued(await getOfflineQueueLength());
  }, []);

  const syncQueue = useCallback(async () => {
    const { flushed } = await flushOfflineQueue(async (item) => {
      if (item.op !== 'scan-resolve') return false;
      const scan = String(item.body?.scan || '').trim();
      if (!scan) return true;
      await resolveScan(scan);
      return true;
    });
    if (flushed) setMessage(`Synced ${flushed} queued scan(s).`);
    await refreshQueueCount();
  }, [refreshQueueCount]);

  useEffect(() => {
    refreshQueueCount();
    syncQueue();
  }, [refreshQueueCount, syncQueue]);

  const handleResolved = (result, scanValue) => {
    const packetSku = normalizeWarehousePacketScan(result.packet?.sku || scanValue);
    const productSku = normalizeWarehouseProductSku(result.assembly?.family_sku || scanValue);
    if (result.kind === 'packet') {
      navigation.navigate('PacketForm', {
        prefill: {
          sku: packetSku,
          name: result.packet?.name || '',
          packet_number: String(result.packet?.packet_number ?? ''),
          qty_per_unit: result.packet?.qty_per_unit,
          id: result.packet?.id,
        },
        existing: true,
        warehouseLocationId,
      });
      return;
    }
    if (result.kind === 'assembly') {
      navigation.navigate('ProductForm', {
        prefill: {
          family_sku: productSku,
          name: result.assembly?.name || '',
          packet_count: String(result.assembly?.packet_count ?? ''),
          id: result.assembly?.id,
        },
        existing: true,
        warehouseLocationId,
      });
      return;
    }
    const raw = normalizeWarehouseSku(scanValue);
    if (raw.length > 14 && /^\d{14}/.test(raw)) {
      navigation.navigate('ProductForm', {
        prefill: { family_sku: productSku, name: '', packet_count: '' },
        existing: false,
        fromPackets: false,
        warehouseLocationId,
      });
      return;
    }
    navigation.navigate('PacketForm', {
      prefill: { sku: packetSku, name: '', packet_number: '' },
      existing: false,
      warehouseLocationId,
    });
  };

  const onScanValue = async (scanValue) => {
    const scan = normalizeWarehouseWedgeScanInput(String(scanValue || '').trim(), 'auto');
    if (!scan || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await resolveScan(scan);
      handleResolved(result, scan);
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        await enqueueOfflineOp('scan-resolve', { scan });
        await refreshQueueCount();
        setMessage(`Offline — queued scan "${scan}". Will resolve when back online.`);
        navigation.navigate('PacketForm', {
          prefill: {
            sku: normalizeWarehousePacketScan(scan),
            name: '',
            packet_number: '',
          },
          existing: false,
          warehouseLocationId,
        });
      } else {
        setMessage(err?.message || 'Lookup failed.');
        keepFocusAfterSubmit();
      }
    } finally {
      setBusy(false);
    }
  };

  const onSubmitSku = () => {
    onScanValue(manual);
  };

  return (
    <View style={styles.wrap}>
      {queued > 0 && (
        <Pressable style={styles.queueBanner} onPress={syncQueue}>
          <Text style={styles.queueText}>{queued} scan(s) queued — tap to sync</Text>
        </Pressable>
      )}
      <Text style={styles.lead}>
        Type a SKU or use your external barcode scanner into the field below.
      </Text>
      <TextInput
        ref={skuInputRef}
        style={styles.input}
        value={manual}
        onChangeText={wedgeAwareTextChange(setManual, {
          stripScanTerminator,
          keepFocusAfterSubmit,
          transform: (v) => v.toUpperCase(),
        })}
        placeholder="SKU / barcode"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        autoComplete="off"
        blurOnSubmit={false}
        showSoftInputOnFocus
        returnKeyType="done"
        onSubmitEditing={onSubmitSku}
      />
      <Pressable style={styles.btn} onPress={onSubmitSku} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Working…' : 'Look up'}</Text>
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  lead: { color: '#94a3b8', marginBottom: 16, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  btn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#e2e8f0', fontWeight: '600' },
  message: { color: '#fbbf24', marginTop: 12 },
  queueBanner: {
    backgroundColor: '#422006',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  queueText: { color: '#fde68a', textAlign: 'center' },
});
