import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tUi } from '../lib/productionKioskI18n';
import { kiosk } from './kioskStyles';

export default function ProductionKioskTopBar({ title, locale, onToggleLocale, hideLocaleToggle }) {
  const showLang = !hideLocaleToggle && typeof onToggleLocale === 'function';
  return (
    <View style={styles.header}>
      <Text style={[kiosk.title, styles.titleFlex]} numberOfLines={2}>
        {title}
      </Text>
      {showLang ? (
      <Pressable
        style={({ pressed }) => [kiosk.langBtn, pressed && styles.langBtnPressed]}
        onPress={onToggleLocale}
        accessibilityRole="button"
        accessibilityLabel={tUi('translateToggle', locale)}
      >
        <Text style={kiosk.langBtnText}>{tUi('translateToggle', locale)}</Text>
      </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    minHeight: 48,
  },
  titleFlex: { flex: 1, flexShrink: 1 },
  langBtnPressed: { opacity: 0.85 },
});
