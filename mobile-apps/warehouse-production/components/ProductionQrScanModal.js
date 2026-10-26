import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { theme } from '../shared/theme';
import { tUi } from '../lib/productionKioskI18n';
import {
  askProductionCameraPermission,
  readProductionCameraPermission,
} from '../lib/productionCameraPermission';

export default function ProductionQrScanModal({
  visible,
  locale,
  onClose,
  onScan,
}) {
  const [permission, setPermission] = useState(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const granted = Boolean(permission?.granted);

  useEffect(() => {
    if (!visible) return;
    readProductionCameraPermission().then(setPermission);
  }, [visible]);

  const handleAllowCamera = useCallback(async () => {
    if (permissionBusy || granted) return;
    setPermissionBusy(true);
    try {
      const result = await askProductionCameraPermission();
      setPermission(result);
    } finally {
      setPermissionBusy(false);
    }
  }, [granted, permissionBusy]);

  const handleBarcode = useCallback(({ data }) => {
    const value = String(data || '').trim();
    if (!value) return;
    const now = Date.now();
    if (lastScanRef.current.value === value && now - lastScanRef.current.at < 1500) {
      return;
    }
    lastScanRef.current = { value, at: now };
    onScan(value);
  }, [onScan]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>{tUi('stockQrTitle', locale)}</Text>
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close QR scanner">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{tUi('stockQrHint', locale)}</Text>

        {permission === null ? (
          <View style={[styles.cameraBox, styles.cameraLoading]}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : granted ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'code39'],
              }}
              onBarcodeScanned={handleBarcode}
            />
            <View style={styles.frame} pointerEvents="none" />
          </View>
        ) : (
          <View style={styles.permissionBox}>
            <Pressable
              style={styles.allowBtn}
              onPress={handleAllowCamera}
              disabled={permissionBusy}
            >
              {permissionBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.allowText}>{tUi('photoAllowCamera', locale)}</Text>
              )}
            </Pressable>
            {permission?.canAskAgain === false ? (
              <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
                <Text style={styles.settingsText}>{tUi('photoOpenSettings', locale)}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
    flex: 1,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 22,
    color: theme.primary,
    fontWeight: '700',
  },
  hint: {
    fontSize: 14,
    color: theme.muted,
    marginBottom: 16,
    lineHeight: 20,
  },
  cameraBox: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 24,
    minHeight: 280,
  },
  cameraLoading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionBox: {
    flex: 1,
    marginBottom: 24,
    minHeight: 200,
    justifyContent: 'center',
    gap: 12,
  },
  frame: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '22%',
    bottom: '22%',
    borderWidth: 2,
    borderColor: theme.primary,
    borderRadius: 8,
  },
  allowBtn: {
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtn: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  settingsText: {
    color: theme.primary,
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
  },
  allowText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
