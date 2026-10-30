import { Pressable, StyleSheet, Text } from 'react-native';
import { formButtonStyles } from './formButtonStyles';

export default function GenerateRandomSkuButton({ onPress, disabled, busy, label = 'Generate random SKU' }) {
  return (
    <Pressable
      style={[
        formButtonStyles.outline,
        formButtonStyles.outlineAccent,
        styles.wrap,
        (disabled || busy) && formButtonStyles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[formButtonStyles.outlineText, formButtonStyles.outlineTextAccent]}>
        {busy ? 'Generating…' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
});
