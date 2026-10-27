import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { theme } from '../shared/theme';
import { kiosk } from './kioskStyles';
import { presetLabel, tUi } from '../lib/productionKioskI18n';

export default function ProductionPresetPicker({
  visible,
  title,
  presets,
  locale,
  textAlign,
  selectedPreset,
  disabled,
  onClose,
  onSelect,
}) {
  const list = Array.isArray(presets) ? presets : [];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { textAlign }]}>{title}</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {list.map((p) => {
              const active = selectedPreset === p;
              return (
                <Pressable
                  key={p}
                  style={[styles.row, active && styles.rowActive, disabled && styles.rowDisabled]}
                  onPress={() => {
                    if (disabled) return;
                    onSelect(p);
                    onClose();
                  }}
                  disabled={disabled}
                >
                  <Text style={[styles.rowText, active && styles.rowTextActive, { textAlign: 'left' }]}>
                    {presetLabel(p, locale)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={[kiosk.btn, styles.closeBtn]} onPress={onClose}>
            <Text style={kiosk.btnText}>{tUi('presetPickerClose', locale)}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '72%',
    backgroundColor: theme.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 12,
  },
  list: {
    marginBottom: 12,
  },
  row: {
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    marginBottom: 8,
    justifyContent: 'center',
  },
  rowActive: {
    borderColor: theme.primary,
    backgroundColor: '#e0f2fe',
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowTextActive: {
    color: '#0369a1',
  },
  closeBtn: {
    width: '100%',
  },
});
