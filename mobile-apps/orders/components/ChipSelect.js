import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';

export default function ChipSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
}) {
  return (
    <View style={kiosk.field}>
      {label ? <Text style={kiosk.label}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {placeholder ? (
          <Pressable
            disabled={disabled}
            style={[styles.chip, !value && styles.chipOn]}
            onPress={() => onChange('')}
          >
            <Text style={[styles.chipText, !value && styles.chipTextOn]}>{placeholder}</Text>
          </Pressable>
        ) : null}
        {options.map((opt) => {
          const id = String(opt.value);
          const on = String(value || '') === id;
          return (
            <Pressable
              key={id}
              disabled={disabled}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onChange(on ? '' : opt.value)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {
    borderColor: theme.primary,
    backgroundColor: '#dbeafe',
  },
  chipText: { color: theme.text, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: theme.primary },
});
