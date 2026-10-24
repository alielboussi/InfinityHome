import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'react-native';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function ProductionLabelPreviewModal({
  visible,
  onClose,
  locale,
  label,
  pngBase64,
  copies = 1,
}) {
  if (!label) return null;

  const uri = pngBase64 ? `data:image/png;base64,${pngBase64}` : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{tUi('labelPreviewTitle', locale)}</Text>
          <Text style={styles.sub}>
            {copies > 1
              ? tUi('labelPreviewCopies', locale).replace('{n}', String(copies))
              : tUi('labelPreviewSent', locale)}
          </Text>

          {uri ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageWrap}>
              <Image source={{ uri }} style={styles.labelImage} resizeMode="contain" accessibilityLabel="Production label" />
            </ScrollView>
          ) : (
            <View style={styles.fallback}>
              <Text style={styles.fallbackSku}>{label.sku}</Text>
              <Text style={styles.fallbackName}>{label.name}</Text>
              <Text style={styles.fallbackMeta}>{label.print_date}</Text>
              <Text style={styles.fallbackMeta}>{label.print_time}</Text>
            </View>
          )}

          <Pressable style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>{tUi('labelPreviewDone', locale)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 16,
    maxHeight: '92%',
  },
  title: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 4 },
  sub: { fontSize: 14, color: theme.muted, marginBottom: 12 },
  imageWrap: { alignItems: 'center', paddingVertical: 8 },
  labelImage: {
    width: 320,
    height: 272,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  fallback: { padding: 16, alignItems: 'center' },
  fallbackSku: { fontSize: 22, fontWeight: '700', color: theme.text },
  fallbackName: { fontSize: 16, color: theme.text, marginTop: 6, textAlign: 'center' },
  fallbackMeta: { fontSize: 14, color: theme.muted, marginTop: 4 },
  btn: {
    marginTop: 14,
    backgroundColor: theme.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
