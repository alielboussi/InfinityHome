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
  clearKitweDraft,
  loadKitweDraft,
  saveKitweDraft,
} from '../shared/offlineScanQueue';
import {
  isLikelyNetworkError,
  warehouseMobileRequest,
} from '../shared/warehouseMobileApi';

export default function KitweTransferScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [sessionId, setSessionId] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [lines, setLines] = useState([]);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);

  const persist = useCallback(async (next) => {
    await saveKitweDraft({
      session_id: next.sessionId,
      delivery_number: next.deliveryNumber,
      lines: next.lines,
    });
  }, []);

  const openSession = useCallback(async () => {
    const draft = await loadKitweDraft();
    if (draft?.session_id && draft?.delivery_number) {
      setSessionId(draft.session_id);
      setDeliveryNumber(draft.delivery_number);
      setLines(Array.isArray(draft.lines) ? draft.lines : []);
      return;
    }
    const res = await warehouseMobileRequest('delivery-session-open');
    setSessionId(res.session_id);
    setDeliveryNumber(res.delivery_number);
    setLines([]);
    await saveKitweDraft({
      session_id: res.session_id,
      delivery_number: res.delivery_number,
      lines: [],
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await openSession();
      } catch (err) {
        setError(err?.message || 'Could not open delivery session.');
      } finally {
        setBooting(false);
      }
    })();
  }, [openSession]);

  const addPacketLine = async (scan) => {
    const value = String(scan || '').trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await warehouseMobileRequest('scan-resolve', { scan: value });
      if (result.kind !== 'packet' || !result.packet?.id) {
        setError('Kitwe delivery accepts warehouse packets only.');
        return;
      }
      const packet = result.packet;
      const nextLines = [
        ...lines,
        {
          packet_id: packet.id,
          sku: packet.sku,
          name: packet.name,
          packet_number: packet.packet_number,
          assembly_id: packet.assembly_id || null,
          qty: 1,
        },
      ];
      setLines(nextLines);
      await persist({ sessionId, deliveryNumber, lines: nextLines });
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        setError('Offline — scans are saved on device; reconnect to resolve barcodes.');
      } else {
        setError(err?.message || 'Scan failed.');
      }
    } finally {
      setBusy(false);
      setManual('');
    }
  };

  const startNewTruck = async () => {
    await clearKitweDraft();
    setBooting(true);
    try {
      const res = await warehouseMobileRequest('delivery-session-open');
      setSessionId(res.session_id);
      setDeliveryNumber(res.delivery_number);
      setLines([]);
      await saveKitweDraft({
        session_id: res.session_id,
        delivery_number: res.delivery_number,
        lines: [],
      });
    } catch (err) {
      setError(err?.message || 'Could not start new session.');
    } finally {
      setBooting(false);
    }
  };

  if (booting) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.dn}>Delivery note: {deliveryNumber || '—'}</Text>
      <Text style={styles.sub}>One DN per truck session — all scans attach here.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {permission?.granted ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => addPacketLine(data)}
          />
        </View>
      ) : (
        <Pressable style={styles.btnSecondary} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
      )}

      <TextInput
        style={styles.input}
        value={manual}
        onChangeText={setManual}
        placeholder="Packet SKU"
        placeholderTextColor="#64748b"
        onSubmitEditing={() => addPacketLine(manual)}
      />

      <Text style={styles.count}>{lines.length} carton scan(s)</Text>

      <Pressable
        style={styles.btn}
        disabled={!lines.length}
        onPress={() => navigation.navigate('KitweReview', {
          sessionId,
          deliveryNumber,
          lines,
        })}
      >
        <Text style={styles.btnText}>Review & submit</Text>
      </Pressable>

      <Pressable style={styles.btnSecondary} onPress={startNewTruck}>
        <Text style={styles.btnText}>New truck session (new DN)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  dn: { color: '#38bdf8', fontSize: 18, fontWeight: '700' },
  sub: { color: '#94a3b8', marginBottom: 12 },
  cameraBox: { height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    marginBottom: 12,
  },
  count: { color: '#cbd5e1', marginBottom: 12 },
  btn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondary: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#e2e8f0', fontWeight: '600' },
  error: { color: '#f87171', marginBottom: 8 },
});
