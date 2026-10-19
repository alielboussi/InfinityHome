import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  listWarehouseLabelSkuSuggestions,
  resolveWarehouseLabelFromText,
  WAREHOUSE_LABEL_SCAN_MODE,
} from '../shared/warehouseLabelScanResolve';
import { LABEL_NAME_MEMORY_KIND } from '../shared/warehouseLabelOcrName';
import { pickLabelNameForSku } from '../shared/warehouseLabelNameMemory';

const CAMERA_HEIGHT = 320;

const MODE_HINTS = {
  [WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON]:
    'Point at the packet label and capture. You do not need the whole label in frame — include the barcode or SKU text if you can.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY]:
    'Point at the unit label (family SKU text and/or YY barcode). Partial capture is fine — tap a suggested SKU if we are unsure.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_HEADER]:
    'Capture the label. Include the top SKU and/or YY barcode when possible; we read whatever is in the photo.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_NUMERIC]:
    'Capture the numeric barcode on the label. The full sticker does not need to fit in the frame.',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO]:
    'Capture the label. SKU goes to the product; descriptive text goes to Turkish name. Edit and save to remember corrections.',
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
  const [suggestions, setSuggestions] = useState([]);

  const hint = useMemo(() => MODE_HINTS[mode] || MODE_HINTS[WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO], [mode]);

  const applyResolved = useCallback(async (result) => {
    if (!result?.sku) {
      setMessage('No SKU found in this text. Adjust the camera or edit the text below, then try again.');
      return;
    }
    setSuggestions([]);
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

  const resolveFromText = useCallback(async (text, { keepMessage } = {}) => {
    const raw = String(text || '').trim();
    setManualText(raw);
    if (!raw) {
      setSuggestions([]);
      setMessage('Paste or capture label text first.');
      return;
    }
    const result = resolveWarehouseLabelFromText(raw, mode, { target: labelScanTarget });
    if (result.sku) {
      setMessage('');
      setSuggestions([]);
      await applyResolved(result);
      return;
    }
    const guesses = listWarehouseLabelSkuSuggestions(raw, mode, { target: labelScanTarget });
    setSuggestions(guesses);
    if (guesses.length) {
      setMessage(
        keepMessage
          ? ''
          : 'We read the photo but could not pick one SKU automatically. Tap the best match below, or edit the text.',
      );
    } else if (!keepMessage) {
      setMessage(
        'Could not find a SKU in this capture. Move closer to the barcode or printed code and try again.',
      );
    }
  }, [applyResolved, labelScanTarget, mode]);

  const applySuggestion = useCallback(async (sku) => {
    const base = resolveWarehouseLabelFromText(manualText, mode, { target: labelScanTarget });
    await applyResolved({ ...base, sku, source: 'user_pick' });
  }, [applyResolved, labelScanTarget, manualText, mode]);

  const runOcrOnPhoto = useCallback(async (uri) => {
    try {
      const result = await TextRecognition.recognize(uri);
      const raw = String(result?.text || '').trim();
      if (!raw) {
        setMessage('No text detected. Point at the barcode or SKU and capture again.');
        return;
      }
      await resolveFromText(raw);
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
    setSuggestions([]);
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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap}>
      <Text style={styles.lead}>{hint}</Text>
      <View style={styles.cameraBox}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} autofocus="on" />
        <View pointerEvents="none" style={styles.frameOverlay}>
          <Text style={styles.frameHint}>Aim at barcode or SKU — partial label OK</Text>
        </View>
      </View>
      <Pressable style={styles.btn} onPress={captureAndScan} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Reading label…' : 'Capture label'}</Text>
      </Pressable>

      <Text style={styles.or}>Or paste / edit text from the label</Text>
      <TextInput
        style={styles.input}
        value={manualText}
        onChangeText={(t) => {
          setManualText(t);
          setSuggestions([]);
        }}
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
        <Text style={styles.btnText}>Use this text</Text>
      </Pressable>

      {suggestions.length ? (
        <View style={styles.suggestBlock}>
          <Text style={styles.suggestTitle}>Possible SKUs from this capture</Text>
          {suggestions.map((item) => (
            <Pressable
              key={item.sku}
              style={styles.suggestChip}
              onPress={() => applySuggestion(item.sku)}
            >
              <Text style={styles.suggestChipText}>{item.sku}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {lastRead ? (
        <Text style={styles.preview} numberOfLines={2}>
          Resolved SKU: {lastRead}
        </Text>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0f172a' },
  wrap: { padding: 16, paddingBottom: 32 },
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
    borderColor: 'rgba(250, 204, 21, 0.45)',
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
  suggestBlock: { marginTop: 4, marginBottom: 8 },
  suggestTitle: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  suggestChip: {
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  suggestChipText: { color: '#e0f2fe', fontFamily: 'monospace', fontSize: 14 },
  preview: { color: '#86efac', marginTop: 8, fontFamily: 'monospace', fontSize: 13 },
  message: { color: '#fbbf24', marginTop: 10, fontSize: 13, lineHeight: 18 },
});
