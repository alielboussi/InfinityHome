import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../shared/theme';

export default function KitweSendDoneScreen({ route, navigation }) {
  const dn = route.params?.deliveryNumber || '';
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Delivery sent</Text>
      <Text style={styles.dn}>{dn}</Text>
      <Text style={styles.sub}>Hassan will see this on Warehouse Deliveries before the truck arrives.</Text>
      <Pressable style={styles.btn} onPress={() => navigation.popToTop()}>
        <Text style={styles.btnText}>Back to dashboard</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, backgroundColor: theme.bg, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: theme.text },
  dn: { fontSize: 20, color: theme.primary, marginVertical: 12 },
  sub: { color: theme.muted, lineHeight: 22 },
  btn: { marginTop: 24, padding: 16, backgroundColor: theme.primary, borderRadius: 10 },
  btnText: { textAlign: 'center', fontWeight: '800', color: '#0f172a' },
});
