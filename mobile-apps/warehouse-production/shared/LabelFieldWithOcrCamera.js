import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from './theme';

export default function LabelFieldWithOcrCamera({
  label,
  value,
  onChangeText,
  ocrField,
  onOpenOcrCamera,
  editable = true,
  keyboardType,
  mono,
  onBlur,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  placeholder,
  autoCapitalize,
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {ocrField && onOpenOcrCamera ? (
          <Pressable
            onPress={() => onOpenOcrCamera(ocrField)}
            accessibilityRole="button"
            accessibilityLabel={`Capture ${label} from label photo`}
            hitSlop={8}
          >
            <Text style={styles.camera}>📷 OCR</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        ref={inputRef}
        style={[styles.input, !editable && styles.inputDisabled, mono && styles.mono]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        autoCapitalize={autoCapitalize || (mono ? 'none' : 'sentences')}
        autoComplete="off"
        blurOnSubmit={false}
        showSoftInputOnFocus
        onBlur={onBlur}
        onFocus={onFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: { color: theme.textMuted, fontWeight: '600', fontSize: 13, flex: 1 },
  camera: { color: '#7dd3fc', fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
  },
  mono: { fontFamily: 'monospace' },
  inputDisabled: { opacity: 0.7 },
});
