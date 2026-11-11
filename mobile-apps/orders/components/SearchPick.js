import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';

export default function SearchPick({
  label,
  value,
  options,
  onChange,
  placeholder = 'Search…',
  emptyLabel = 'Select…',
}) {
  const [q, setQ] = useState('');
  const selected = options.find((o) => String(o.value) === String(value || ''));
  const needle = q.trim().toLowerCase();
  const visible = options.filter((o) => !needle || String(o.label || '').toLowerCase().includes(needle)).slice(0, 16);

  return (
    <View style={kiosk.field}>
      {label ? <Text style={kiosk.label}>{label}</Text> : null}
      {selected ? (
        <Pressable style={styles.selected} onPress={() => onChange('')}>
          <Text style={kiosk.metaLine}>{selected.label}</Text>
          <Text style={kiosk.hint}>Tap to change</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={placeholder || emptyLabel}
            placeholderTextColor={theme.textDim}
            style={kiosk.input}
          />
          {visible.map((opt) => (
            <Pressable
              key={String(opt.value)}
              style={styles.row}
              onPress={() => {
                onChange(opt.value);
                setQ('');
              }}
            >
              <Text style={kiosk.hint}>{opt.label}</Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selected: {
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#eff6ff',
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
});
