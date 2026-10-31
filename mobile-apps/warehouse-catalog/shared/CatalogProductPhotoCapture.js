import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';
import { formButtonStyles } from './formButtonStyles';
import {
  askCatalogCameraPermission,
  readCatalogCameraPermission,
} from './catalogCameraPermission';

export default function CatalogProductPhotoCaptureModal({
  visible,
  onCancel,
  onCaptured,
}) {
  const cameraRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permission, setPermission] = useState(null);
  const [captureError, setCaptureError] = useState('');

  const granted = Boolean(permission?.granted);

  useEffect(() => {
    if (!visible) {
      setCapturing(false);
      setCaptureError('');
      setPermissionBusy(false);
      return;
    }
    let alive = true;
    readCatalogCameraPermission().then((result) => {
      if (alive) setPermission(result);
    });
    return () => { alive = false; };
  }, [visible]);

  const handleClose = useCallback(() => {
    if (capturing || permissionBusy) return;
    onCancel?.();
  }, [capturing, onCancel, permissionBusy]);

  const handleAllowCamera = useCallback(async () => {
    if (permissionBusy || granted) return;
    setPermissionBusy(true);
    setCaptureError('');
    try {
      const result = await askCatalogCameraPermission();
      setPermission(result);
      if (!result.granted) {
        setCaptureError(
          result.canAskAgain === false
            ? 'Camera blocked — open Settings to allow camera access.'
            : 'Camera permission is required to take a product photo.',
        );
      }
    } catch (err) {
      setCaptureError(err?.message || 'Could not request camera access.');
    } finally {
      setPermissionBusy(false);
    }
  }, [granted, permissionBusy]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const handleCapture = useCallback(async () => {
    if (capturing || !granted || !cameraRef.current) return;
    setCaptureError('');
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.55,
        exif: false,
      });
      if (!photo?.uri) {
        setCaptureError('Could not read the photo. Try again.');
        return;
      }
      onCaptured(photo);
    } catch (err) {
      setCaptureError(err?.message || 'Could not take photo.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, granted, onCaptured]);

  const permissionLoading = visible && permission === null;
  const showSettings = permission && !permission.granted && permission.canAskAgain === false;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Product photo</Text>
          <Pressable
            onPress={handleClose}
            disabled={capturing || permissionBusy}
            style={formButtonStyles.textLink}
          >
            <Text style={formButtonStyles.textLinkLabel}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Frame the product clearly. Mattresses: avoid tight plastic in frame if you can — AI removes wrap and adds a white catalog background after save.
        </Text>

        {permissionLoading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        ) : null}

        {!permissionLoading && !granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>{captureError || 'Camera access is needed.'}</Text>
            {showSettings ? (
              <Pressable
                style={[formButtonStyles.primary, formButtonStyles.primaryCompact]}
                onPress={handleOpenSettings}
              >
                <Text style={formButtonStyles.primaryText}>Open Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  formButtonStyles.primary,
                  formButtonStyles.primaryCompact,
                  permissionBusy && formButtonStyles.disabled,
                ]}
                onPress={handleAllowCamera}
                disabled={permissionBusy}
              >
                <Text style={formButtonStyles.primaryText}>
                  {permissionBusy ? '…' : 'Allow camera'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {granted ? (
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          </View>
        ) : null}

        {captureError && granted ? (
          <Text style={styles.error}>{captureError}</Text>
        ) : null}

        {granted ? (
          <Pressable
            style={[
              formButtonStyles.primary,
              formButtonStyles.primaryCompact,
              styles.captureBtn,
              capturing && formButtonStyles.disabled,
            ]}
            onPress={handleCapture}
            disabled={capturing}
          >
            <Text style={formButtonStyles.primaryText}>
              {capturing ? 'Capturing…' : 'Take photo'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

export function CatalogProductPhotoField({
  photoUri,
  onOpenCamera,
  onClear,
  disabled,
}) {
  return (
    <View style={fieldStyles.row}>
      <Text style={fieldStyles.label}>Product photo</Text>
      <View style={fieldStyles.actions}>
        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={fieldStyles.thumb} accessibilityLabel="Product photo preview" />
            <Pressable
              onPress={onClear}
              disabled={disabled}
              style={formButtonStyles.textLink}
              accessibilityLabel="Remove product photo"
            >
              <Text style={[formButtonStyles.textLinkLabel, fieldStyles.linkMuted]}>Remove</Text>
            </Pressable>
          </>
        ) : (
          <Text style={fieldStyles.placeholder}>Optional — AI white background applied when you save.</Text>
        )}
        <Pressable
          onPress={onOpenCamera}
          disabled={disabled}
          style={[formButtonStyles.iconCircle, disabled && formButtonStyles.disabled]}
          accessibilityLabel="Take product photo"
        >
          <Ionicons name="camera-outline" size={18} color={theme.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  hint: { color: theme.textMuted, marginTop: 8, marginBottom: 10, lineHeight: 18, fontSize: 13 },
  permissionBox: { marginTop: 20, gap: 10, alignItems: 'center' },
  permissionText: { color: theme.textSecondary, fontSize: 14, textAlign: 'center' },
  cameraWrap: { flex: 1, borderRadius: theme.radiusSm, overflow: 'hidden', marginTop: 6, minHeight: 280 },
  camera: { flex: 1 },
  error: { color: theme.danger, marginTop: 8, fontSize: 13 },
  captureBtn: { marginTop: 12 },
});

const fieldStyles = StyleSheet.create({
  row: { marginBottom: 14 },
  label: { color: theme.textMuted, fontWeight: '600', fontSize: 13, marginBottom: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  thumb: { width: 56, height: 56, borderRadius: theme.radiusSm, backgroundColor: '#fff' },
  placeholder: { color: theme.textDim, flex: 1, minWidth: 140, lineHeight: 18, fontSize: 12 },
  linkMuted: { color: theme.textSecondary, fontSize: 13 },
});
