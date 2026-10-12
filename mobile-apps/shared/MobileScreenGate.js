import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { canMobileScreenView } from './mobileAccessManifest';
import { theme } from './theme';

/** Blocks stack screens unless /user-access allows view for screenId. */
export default function MobileScreenGate({ screenId, grant, navigation, children }) {
  const allowed = canMobileScreenView(grant, screenId);

  useEffect(() => {
    if (!grant || allowed) return;
    navigation.replace('Dashboard');
  }, [allowed, grant, navigation]);

  if (!grant) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!allowed) return null;

  return children;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
