import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  resolveWarehouseLabelFromText,
  WAREHOUSE_LABEL_SCAN_MODE,
} from '../shared/warehouseLabelScanResolve';
import { LABEL_NAME_MEMORY_KIND } from '../shared/warehouseLabelOcrName';
import { pickLabelNameForSku } from '../shared/warehouseLabelNameMemory';

const CAMERA_HEIGHT = 320;

const MODE_HINTS = {
  [WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON]:
    'Photograph the whole packet label. We fill packet SKU and name — edit if needed, then save to remember for this SKU.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY]:
    'Photograph the unit label on a BOM product. We match the family SKU (printed text) to the YY… barcode.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_HEADER]:
    'Photograph the label. We match the SKU printed at the top to the YY… barcode.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_NUMERIC]:
    'Photograph the label. We use the numeric barcode (no header SKU on label).',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO]:
    'Photograph the label. SKU goes to the product; descriptive text goes to Turkish name (English name you type). Save to remember corrections.',
};

export default function WarehouseLabelCaptureScreen({ navigation, route }) {
  const mode = route.params?.mode || WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO;
  const returnScreen = route.params?.returnScreen || 'PacketForm';
  const labelScanTarget = route.params?.labelScanTarget;
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [manualText, setManualText] = useState('');
  const [lastRead, setLastRead] = useState('');

  const hint = useMemo(() => MODE_HINTS[mode] || MODE_HINTS[WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO], [mode]);

  const applyResolved = useCallback(async (result) => {
    if (!result?.sku) {
      setMessage('Could not resolve a SKU from this label. Try again or paste label text below.');
      return;
    }
    const kind = result.nameIntent === 'packet'
      ? LABEL_NAME_MEMORY_KIND.PACKET
      : LABEL_NAME_MEMORY_KIND.PRODUCT_TURKISH;
    const { name, nameSource } = await pickLabelNameForSku({
      sku: result.sku,
      kind,
      suggestedName: result.suggestedName,
    });
    const preview = name ? `${result.sku} — ${name}` : result.sku;
    setLastRead(preview);
    navigation.navigate({
      name: returnScreen,
      params: {
        labelScanSku: result.sku,
        ...(name ? { labelScanName: name } : {}),
        ...(nameSource ? { labelScanNameSource: nameSource } : {}),
        ...(labelScanTarget ? { labelScanTarget } : {}),
      },
      merge: true,
    });
  }, [labelScanTarget, navigation, returnScreen]);

  const resolveFromText = useCallback(async (text) => {
    const result = resolveWarehouseLabelFromText(text, mode, { target: labelScanTarget });
    if (!result.sku) {
      setMessage('Could not resolve a SKU from this label. Hold steady and capture the full label.');
      return;
    }
    setMessage('');
    await applyResolved(result);
  }, [applyResolved, labelScanTarget, mode]);

  const runOcrOnPhoto = useCallback(async (uri) => {
    try {
      const result = await TextRecognition.recognize(uri);
      const raw = String(result?.text || '').trim();
      if (!raw) {
        setMessage('No text detected. Fill the frame with the label and try again.');
        return;
      }
      resolveFromText(raw);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes("doesn't seem to be linked") || msg.includes('Expo managed')) {
        setMessage(
          'On-device text recognition needs a rebuilt APK (not Expo Go). Paste label text below.',
        );
      } else {
        setMessage(msg || 'Could not read the label.');
      }
    }
  }, [resolveFromText]);

  const captureAndScan = useCallback(async () => {
    if (busy || !cameraRef.current) {
      setMessage('Wait for the camera to load.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        setMessage('Could not capture photo.');
        return;
      }
      await runOcrOnPhoto(photo.uri);
    } catch (err) {
      setMessage(err?.message || 'Capture failed.');
    } finally {
      setBusy(false);
    }
  }, [busy, runOcrOnPhoto]);

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
        <Text style={styles.hint}>{hint}</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>{hint}</Text>
      <View style={styles.cameraBox}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.frameOverlay}>
          <Text style={styles.frameHint}>Fit entire label in view</Text>
        </View>
      </View>
      <Pressable style={styles.btn} onPress={captureAndScan} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Reading label…' : 'Capture label'}</Text>
      </Pressable>

      <Text style={styles.or}>Or paste text from the label</Text>
      <TextInput
        style={styles.input}
        value={manualText}
        onChangeText={setManualText}
        placeholder="Barcodes and printed codes"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        autoCorrect={false}
        multiline
      />
      <Pressable
        style={styles.btnSecondary}
        onPress={() => resolveFromText(manualText)}
        disabled={busy}
      >
        <Text style={styles.btnText}>Use pasted text</Text>
      </Pressable>

      {lastRead ? (
        <Text style={styles.preview} numberOfLines={2}>
          Resolved SKU: {lastRead}
        </Text>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  lead: { color: '#94a3b8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  hint: { color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  cameraBox: {
    height: CAMERA_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(250, 204, 21, 0.85)',
    borderRadius: 12,
    justifyContent: 'flex-end',
    padding: 8,
  },
  frameHint: {
    color: '#fde68a',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingVertical: 4,
    borderRadius: 6,
  },
  btn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnSecondary: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnText: { color: '#f8fafc', fontWeight: '700', fontSize: 15 },
  or: { color: '#64748b', fontSize: 12, marginVertical: 10, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 10,
    color: '#f1f5f9',
    minHeight: 72,
    fontFamily: 'monospace',
    fontSize: 13,
    marginBottom: 8,
  },
  preview: { color: '#86efac', marginTop: 8, fontFamily: 'monospace', fontSize: 13 },
  message: { color: '#fbbf24', marginTop: 10, fontSize: 13, lineHeight: 18 },
});
