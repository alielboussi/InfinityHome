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
import Svg, { Line, Rect } from 'react-native-svg';
import { theme } from '../shared/theme';
import { tUi } from '../lib/productionKioskI18n';
import { sanitizeWarehouseScannerInput as sanitizeScanFromShared } from '../shared/warehouseScanResolver';
import {
  askProductionCameraPermission,
  readProductionCameraPermission,
} from '../lib/productionCameraPermission';

function sanitizeWarehouseScannerInput(value) {
  if (typeof sanitizeScanFromShared === 'function') {
    return sanitizeScanFromShared(value);
  }
  let s = String(value ?? '');
  s = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  s = s.replace(/^\][A-Z]\d/i, '');
  return s.trim();
}

export default function ProductionQrScanModal({
  visible,
  locale,
  onClose,
  onScan,
}) {
  const [permission, setPermission] = useState(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [cameraBoxLayout, setCameraBoxLayout] = useState({ width: 0, height: 0 });
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

  const handleBarcode = useCallback((event) => {
    const raw = event?.data ?? event?.nativeEvent?.data ?? '';
    const value = sanitizeWarehouseScannerInput(raw);
    if (!value) return;
    const now = Date.now();
    if (lastScanRef.current.value === value && now - lastScanRef.current.at < 1500) {
      return;
    }
    lastScanRef.current = { value, at: now };
    if (typeof onScan !== 'function') return;
    onScan(value);
  }, [onScan]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>{tUi('stockQrTitle', locale)}</Text>
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel={tUi('closeQrScanner', locale)}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{tUi('stockQrHint', locale)}</Text>

        {permission === null ? (
          <View style={[styles.cameraBox, styles.cameraLoading]}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : granted ? (
          <View
            style={styles.cameraBox}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setCameraBoxLayout({ width, height });
            }}
          >
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'code39'],
              }}
              onBarcodeScanned={handleBarcode}
            />
            {cameraBoxLayout.width > 0 && cameraBoxLayout.height > 0 ? (() => {
              const W = cameraBoxLayout.width;
              const H = cameraBoxLayout.height;
              const boxW = Math.min(W - 32, 320);
              const boxH = Math.min(Math.max(120, Math.round(H * 0.34)), 176);
              const boxX = Math.round((W - boxW) / 2);
              const boxY = Math.round((H - boxH) / 2);
              const midY = Math.round(H / 2);
              return (
                <Svg
                  width={W}
                  height={H}
                  style={styles.scanSvg}
                  pointerEvents="none"
                >
                  {/* Darkened mask outside the scan box */}
                  <Rect x={0} y={0} width={W} height={boxY} fill="rgba(0,0,0,0.52)" />
                  <Rect x={0} y={boxY + boxH} width={W} height={Math.max(0, H - (boxY + boxH))} fill="rgba(0,0,0,0.52)" />
                  <Rect x={0} y={boxY} width={boxX} height={boxH} fill="rgba(0,0,0,0.52)" />
                  <Rect x={boxX + boxW} y={boxY} width={Math.max(0, W - (boxX + boxW))} height={boxH} fill="rgba(0,0,0,0.52)" />
                  {/* Barcode placement box frame */}
                  <Rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    rx={12}
                    ry={12}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={3}
                  />
                  {/* Center laser alignment line inside the box */}
                  <Line
                    x1={boxX + 12}
                    y1={midY}
                    x2={boxX + boxW - 12}
                    y2={midY}
                    stroke="#ffffff"
                    strokeWidth={6}
                    strokeLinecap="round"
                  />
                  <Line
                    x1={boxX + 12}
                    y1={midY}
                    x2={boxX + boxW - 12}
                    y2={midY}
                    stroke="#ff2d2d"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                </Svg>
              );
            })() : null}
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
  scanSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
    elevation: 10,
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
