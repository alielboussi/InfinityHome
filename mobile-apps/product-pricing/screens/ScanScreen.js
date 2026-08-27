import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { findProductBySku } from '../services/catalog';
import { theme } from '../theme';

export default function ScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Point at the product QR code (SKU).');
  const scanLockRef = useRef(false);

  const handleBarcode = async ({ data }) => {
    if (scanLockRef.current || busy) return;
    const code = String(data || '').trim();
    if (!code) return;
    scanLockRef.current = true;
    setBusy(true);
    setMessage(`Looking up ${code}…`);
    try {
      const product = await findProductBySku(code);
      if (!product) {
        setMessage(`No product found for SKU "${code}".`);
        scanLockRef.current = false;
        setBusy(false);
        return;
      }
      navigation.replace('ProductEdit', {
        productId: product.id,
        isCombo: Boolean(product.__isCombo),
      });
    } catch (err) {
      setMessage(err?.message || 'Scan failed.');
      scanLockRef.current = false;
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator size="large" color={theme.border} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.message}>Camera permission is required to scan QR codes.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Products</Text>
        </Pressable>
        <Text style={styles.title}>Scan product QR</Text>
      </View>
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={busy ? undefined : handleBarcode}
        />
      </View>
      <Text style={styles.message}>{message}</Text>
      {busy ? <ActivityIndicator color={theme.border} style={{ marginTop: 12 }} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  header: { marginBottom: 12 },
  back: { color: theme.border, fontWeight: '700', marginBottom: 8 },
  title: { color: theme.text, fontSize: 22, fontWeight: '900' },
  cameraWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.borderSoft,
    minHeight: 320,
  },
  camera: { flex: 1 },
  message: { color: theme.muted, textAlign: 'center', marginTop: 14, lineHeight: 20 },
  button: {
    backgroundColor: theme.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#052018', fontWeight: '800' },
  linkButton: { marginTop: 12, alignItems: 'center' },
  linkText: { color: theme.accent, fontWeight: '700' },
});
