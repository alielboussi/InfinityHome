import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';

export default function DropdownSelect({
  label,
  value,
  options = [],
  onChange,
  placeholder = '',
  allowEmpty = false,
  disabled = false,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value || ''));
  const display = selected?.label || placeholder || 'Select…';

  const pick = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View style={kiosk.field}>
      {label ? (
        <Text style={[kiosk.label, compact && styles.labelCompact]} numberOfLines={compact ? 2 : undefined}>
          {label}
        </Text>
      ) : null}
      <Pressable
        disabled={disabled}
        style={[
          styles.trigger,
          kiosk.input,
          compact && styles.triggerCompact,
          disabled && styles.triggerDisabled,
        ]}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.triggerText,
            compact && styles.triggerTextCompact,
            selected ? styles.triggerValue : styles.triggerPlaceholder,
          ]}
          numberOfLines={compact ? 1 : 2}
          adjustsFontSizeToFit={compact}
          minimumFontScale={compact ? 0.78 : 1}
        >
          {display}
        </Text>
        <Text style={[styles.chevron, compact && styles.chevronCompact]} accessibilityElementsHidden>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {allowEmpty && placeholder ? (
                <Pressable
                  style={[styles.option, !value && styles.optionOn]}
                  onPress={() => pick('')}
                >
                  <Text style={[styles.optionText, !value && styles.optionTextOn]}>{placeholder}</Text>
                </Pressable>
              ) : null}
              {options.map((opt) => {
                const on = String(value || '') === String(opt.value);
                return (
                  <Pressable
                    key={String(opt.value)}
                    style={[styles.option, on && styles.optionOn]}
                    onPress={() => pick(opt.value)}
                  >
                    <Text
                      style={[styles.optionText, compact && styles.optionTextCompact, on && styles.optionTextOn]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={kiosk.btnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 10,
  },
  triggerDisabled: { opacity: 0.5 },
  triggerCompact: { minHeight: 42, paddingVertical: 8, paddingHorizontal: 10 },
  labelCompact: { fontSize: 12, lineHeight: 15, marginBottom: 4 },
  triggerText: { flex: 1, fontSize: 18, paddingRight: 8 },
  triggerTextCompact: { fontSize: 13, lineHeight: 16, paddingRight: 4 },
  triggerValue: { color: '#0f172a', fontWeight: '600' },
  triggerPlaceholder: { color: '#64748b', fontWeight: '500' },
  chevron: { color: '#64748b', fontSize: 14, fontWeight: '700' },
  chevronCompact: { fontSize: 11 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  sheetTitle: {
    color: theme.text,
    fontWeight: '800',
    fontSize: 17,
    marginBottom: 10,
  },
  list: { maxHeight: 360 },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionOn: {
    borderColor: theme.primary,
    backgroundColor: '#dbeafe',
  },
  optionText: { color: theme.text, fontWeight: '600', fontSize: 15 },
  optionTextCompact: { fontSize: 14, lineHeight: 18 },
  optionTextOn: { color: theme.primary, fontWeight: '800' },
  closeBtn: {
    marginTop: 10,
    ...kiosk.btn,
    alignItems: 'center',
  },
});
