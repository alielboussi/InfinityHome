import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tUi } from '../lib/productionKioskI18n';
import { kiosk } from './kioskStyles';

export default function ProductionKioskTopBar({ title, locale, onToggleLocale, hideLocaleToggle }) {
  const showLang = !hideLocaleToggle && typeof onToggleLocale === 'function';
  return (
    <View style={styles.header}>
      <View style={styles.headerSide} />
      <Text style={[kiosk.title, styles.titleCenter]} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.headerSide}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 48,
  },
  headerSide: {
    width: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  titleCenter: {
    flex: 1,
    textAlign: 'center',
  },
  langBtnPressed: { opacity: 0.85 },
});
