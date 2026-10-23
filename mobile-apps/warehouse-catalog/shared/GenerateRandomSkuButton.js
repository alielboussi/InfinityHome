import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from './theme';

export default function GenerateRandomSkuButton({ onPress, disabled, busy, label = 'Generate random SKU' }) {
  return (
    <Pressable
      style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.btnText}>{busy ? 'Generating…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'center',
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    backgroundColor: '#0f2744',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: '#7dd3fc',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
});
