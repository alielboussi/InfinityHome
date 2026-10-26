import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { theme } from '../shared/theme';
import { tUi } from '../lib/productionKioskI18n';
import { toProductionPhotoDataUri } from '../lib/productionPhotoCapture';
import {
  askProductionCameraPermission,
  readProductionCameraPermission,
} from '../lib/productionCameraPermission';

export default function ProductionPhotoCaptureModal({
  visible,
  locale,
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
    readProductionCameraPermission().then((result) => {
      if (alive) setPermission(result);
    });
    return () => {
      alive = false;
    };
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
      const result = await askProductionCameraPermission();
      setPermission(result);
      if (!result.granted) {
        if (result.canAskAgain === false) {
          setCaptureError(tUi('photoCameraOpenSettings', locale));
        } else {
          setCaptureError(tUi('photoCameraDenied', locale));
        }
      }
    } catch (err) {
      setCaptureError(err?.message || tUi('photoCameraDenied', locale));
    } finally {
      setPermissionBusy(false);
    }
  }, [granted, locale, permissionBusy]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      setCaptureError(tUi('photoCameraOpenSettings', locale));
    });
  }, [locale]);

  const handleCapture = useCallback(async () => {
    if (capturing || !granted || !cameraRef.current) return;
    setCaptureError('');
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
        exif: false,
        skipProcessing: Platform.OS === 'android',
      });
      const dataUri = toProductionPhotoDataUri(photo);
      if (!dataUri) {
        setCaptureError('Could not read the photo. Try again.');
        return;
      }
      onCaptured(dataUri);
    } catch (err) {
      setCaptureError(err?.message || 'Could not take photo.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, granted, onCaptured]);

  const permissionLoading = visible && permission === null;
  const showSettings = permission && !permission.granted && permission.canAskAgain === false;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>{tUi('photoCaptureTitle', locale)}</Text>
          <Pressable
            style={styles.closeBtn}
            onPress={handleClose}
            disabled={capturing || permissionBusy}
            accessibilityLabel="Close camera"
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{tUi('photoCaptureHint', locale)}</Text>

        {permissionLoading ? (
          <View style={styles.cameraBox}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : granted ? (
          <View style={styles.cameraBox}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          </View>
        ) : (
          <View style={styles.permissionBox}>
            <Pressable
              style={[styles.allowBtn, permissionBusy && styles.allowBtnBusy]}
              onPress={handleAllowCamera}
              disabled={permissionBusy || showSettings}
            >
              {permissionBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.allowText}>{tUi('photoAllowCamera', locale)}</Text>
              )}
            </Pressable>
            {showSettings ? (
              <Pressable style={styles.settingsBtn} onPress={handleOpenSettings}>
                <Text style={styles.settingsText}>{tUi('photoOpenSettings', locale)}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {captureError ? <Text style={styles.error}>{captureError}</Text> : null}

        <Pressable
          style={[styles.shutterBtn, (!granted || capturing || permissionBusy) && styles.shutterDisabled]}
          onPress={handleCapture}
          disabled={!granted || capturing || permissionBusy}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.shutterText}>{tUi('photoCaptureShutter', locale)}</Text>
          )}
        </Pressable>
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
    paddingBottom: 24,
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
    marginBottom: 16,
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionBox: {
    flex: 1,
    marginBottom: 16,
    minHeight: 200,
    justifyContent: 'center',
    gap: 12,
  },
  allowBtn: {
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  allowBtnBusy: {
    opacity: 0.85,
  },
  allowText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
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
  error: {
    color: theme.danger,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  shutterBtn: {
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
});
