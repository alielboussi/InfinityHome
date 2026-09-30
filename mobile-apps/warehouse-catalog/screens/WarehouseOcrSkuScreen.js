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
import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  normalizeOcrSkuText,
  photoCropRectForGuideFrame,
} from '../shared/ocrGuideCrop';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

const CAMERA_HEIGHT = 280;

async function resolveScan(scan) {
  return warehouseMobileRequest('scan-resolve', { scan });
}

function assemblyIdFromResolve(result) {
  if (result?.kind === 'assembly' && result.assembly?.id) {
    return { assemblyId: String(result.assembly.id), kind: 'assembly' };
  }
  if (result?.kind === 'packet' && result.assembly?.id) {
    return { assemblyId: String(result.assembly.id), kind: 'packet' };
  }
  if (result?.kind === 'packet' && result.packet?.assembly_id) {
    return { assemblyId: String(result.packet.assembly_id), kind: 'packet' };
  }
  return null;
}

function guideFrameForView(width, height) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (!w || !h) return null;
  const frameW = w * 0.9;
  const frameH = Math.max(44, h * 0.22);
  return {
    left: (w - frameW) / 2,
    top: (h - frameH) / 2,
    width: frameW,
    height: frameH,
  };
}

export default function WarehouseOcrSkuScreen({ navigation, route }) {
  const warehouseLocationId = route.params?.warehouseLocationId;
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [manualText, setManualText] = useState('');
  const [lastRead, setLastRead] = useState('');
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });

  const guideFrame = useMemo(
    () => guideFrameForView(viewSize.width, viewSize.height),
    [viewSize.height, viewSize.width],
  );

  const openProduct = useCallback((assemblyId, matchedSku) => {
    navigation.navigate('WarehouseProductDetail', {
      assemblyId,
      matchedSku,
      warehouseLocationId,
    });
  }, [navigation, warehouseLocationId]);

  const lookupSku = useCallback(async (rawText) => {
    const scan = normalizeOcrSkuText(rawText);
    if (!scan) {
      setMessage('No text to look up. Align the unit code in the yellow box or type it below.');
      return;
    }
    setBusy(true);
    setMessage('');
    setLastRead(scan);
    try {
      const result = await resolveScan(scan);
      const hit = assemblyIdFromResolve(result);
      if (hit) {
        openProduct(hit.assemblyId, scan);
        return;
      }
      setMessage(`No catalog match for "${scan}". Check family SKU on the warehouse product.`);
    } catch (err) {
      setMessage(err?.message || 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  }, [openProduct]);

  const runOcrOnCroppedPhoto = useCallback(async (uri) => {
    try {
      const result = await TextRecognition.recognize(uri);
      const raw = String(result?.text || '').trim();
      if (!raw) {
        setMessage('Could not read text in the box. Hold steady, fill the yellow frame, and try again.');
        return;
      }
      const scan = normalizeOcrSkuText(raw);
      setLastRead(scan || raw);
      if (!scan) {
        setMessage('Text was detected but did not look like a unit code. Type it below if needed.');
        return;
      }
      await lookupSku(scan);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes("doesn't seem to be linked") || msg.includes('Expo managed')) {
        setMessage(
          'On-device text recognition needs a rebuilt APK (not Expo Go). Type the printed unit code below.',
        );
      } else {
        setMessage(msg || 'Could not read text in the box.');
      }
    }
  }, [lookupSku]);

  const captureAndScan = useCallback(async () => {
    if (busy || !cameraRef.current || !guideFrame || !viewSize.width) {
      setMessage('Wait for the camera to load, then align the SKU in the yellow box.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (!photo?.uri || !photo.width || !photo.height) {
        setMessage('Could not capture photo.');
        setBusy(false);
        return;
      }

      const crop = photoCropRectForGuideFrame(
        { width: viewSize.width, height: viewSize.height },
        guideFrame,
        { width: photo.width, height: photo.height },
      );

      const cropped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ crop }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      );

      await runOcrOnCroppedPhoto(cropped.uri);
    } catch (err) {
      setMessage(err?.message || 'Capture failed.');
    } finally {
      setBusy(false);
    }
  }, [busy, guideFrame, runOcrOnCroppedPhoto, viewSize.height, viewSize.width]);

  const onCameraLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    setViewSize({ width, height });
  }, []);

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
        <Text style={styles.hint}>
          Camera access is required to read the printed unit code on the label.
        </Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>
        Align the finished-product unit code (e.g. 22AYS3150ZIZI) inside the yellow box, then capture.
        Only that region is read — not the whole label.
      </Text>
      <View style={styles.cameraBox} onLayout={onCameraLayout}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} />
        {guideFrame ? (
          <>
            <View
              pointerEvents="none"
              style={[styles.dim, { left: 0, top: 0, width: viewSize.width, height: guideFrame.top }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                {
                  left: 0,
                  top: guideFrame.top + guideFrame.height,
                  width: viewSize.width,
                  height: viewSize.height - guideFrame.top - guideFrame.height,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                {
                  left: 0,
                  top: guideFrame.top,
                  width: guideFrame.left,
                  height: guideFrame.height,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                {
                  left: guideFrame.left + guideFrame.width,
                  top: guideFrame.top,
                  width: viewSize.width - guideFrame.left - guideFrame.width,
                  height: guideFrame.height,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.guideFrame,
                {
                  left: guideFrame.left,
                  top: guideFrame.top,
                  width: guideFrame.width,
                  height: guideFrame.height,
                },
              ]}
            >
              <Text style={styles.guideHint}>Unit code here</Text>
            </View>
          </>
        ) : null}
      </View>
      <Pressable style={styles.btn} onPress={captureAndScan} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Working…' : 'Capture & look up'}</Text>
      </Pressable>

      <Text style={styles.or}>Or type unit code</Text>
      <TextInput
        style={styles.input}
        value={manualText}
        onChangeText={setManualText}
        placeholder="e.g. 22AYS3150ZIZI"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        autoCorrect={false}
        onSubmitEditing={() => lookupSku(manualText)}
      />
      <Pressable
        style={styles.btnSecondary}
        onPress={() => lookupSku(manualText)}
        disabled={busy}
      >
        <Text style={styles.btnText}>Look up product</Text>
      </Pressable>

      {lastRead ? (
        <Text style={styles.preview} numberOfLines={2}>
          Last read: {lastRead}
        </Text>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  lead: { color: '#94a3b8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  cameraBox: {
    height: CAMERA_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#000',
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  guideFrame: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#facc15',
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideHint: {
    color: '#fef08a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  hint: { color: '#94a3b8', marginBottom: 16 },
  or: { color: '#94a3b8', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  btn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: '#f8fafc', fontWeight: '600' },
  message: { color: '#fbbf24', marginTop: 12, lineHeight: 18 },
  preview: { color: '#64748b', fontSize: 12, marginTop: 10, fontFamily: 'monospace' },
});
