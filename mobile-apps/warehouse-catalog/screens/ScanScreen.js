import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  enqueueOfflineOp,
  flushOfflineQueue,
  getOfflineQueueLength,
} from '../shared/offlineScanQueue';
import {
  isLikelyNetworkError,
  warehouseMobileRequest,
} from '../shared/warehouseMobileApi';

async function resolveScan(scan) {
  return warehouseMobileRequest('scan-resolve', { scan });
}

export default function ScanScreen({ navigation, route }) {
  const warehouseLocationId = route.params?.warehouseLocationId;
  const [permission, requestPermission] = useCameraPermissions();
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
    if (result.kind === 'packet') {
      navigation.navigate('PacketForm', {
        prefill: {
          sku: result.packet?.sku || scanValue,
          name: result.packet?.name || '',
          packet_number: String(result.packet?.packet_number ?? ''),
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
          family_sku: result.assembly?.family_sku || scanValue,
          name: result.assembly?.name || '',
          packet_count: String(result.assembly?.packet_count ?? ''),
          id: result.assembly?.id,
        },
        existing: true,
        warehouseLocationId,
      });
      return;
    }
    navigation.navigate('PacketForm', {
      prefill: { sku: scanValue, name: '', packet_number: '' },
      existing: false,
      warehouseLocationId,
    });
  };

  const onScanValue = async (scanValue) => {
    const scan = String(scanValue || '').trim();
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
          prefill: { sku: scan, name: '', packet_number: '' },
          existing: false,
          warehouseLocationId,
        });
      } else {
        setMessage(err?.message || 'Scan failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>Camera access is required to scan barcodes.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {queued > 0 && (
        <Pressable style={styles.queueBanner} onPress={syncQueue}>
          <Text style={styles.queueText}>{queued} scan(s) queued — tap to sync</Text>
        </Pressable>
      )}
      <View style={styles.cameraBox}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'] }}
          onBarcodeScanned={busy ? undefined : ({ data }) => onScanValue(data)}
        />
      </View>
      <Text style={styles.or}>Or type SKU</Text>
      <TextInput
        style={styles.input}
        value={manual}
        onChangeText={setManual}
        placeholder="SKU / barcode"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        onSubmitEditing={() => onScanValue(manual)}
      />
      <Pressable style={styles.btn} onPress={() => onScanValue(manual)} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Working…' : 'Look up'}</Text>
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  cameraBox: { height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  hint: { color: '#94a3b8', marginBottom: 16 },
  or: { color: '#94a3b8', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    marginBottom: 12,
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
