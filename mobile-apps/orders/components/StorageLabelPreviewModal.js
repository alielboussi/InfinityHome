import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { theme } from '../shared/theme';

/** 80×68 mm label at 10 px/mm — matches server preview raster. */
const LABEL_W = 320;
const LABEL_H = 272;

export default function StorageLabelPreviewModal({
  visible,
  onClose,
  pngBase64,
  labelMeta,
  printError,
  printed,
}) {
  const uri = pngBase64 ? `data:image/png;base64,${pngBase64}` : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Storage label sample (80×68 mm)</Text>
          <Text style={styles.sub}>
            Code 128 SKU, product photo QR, receipt, customer, sale date — same layout as Send to Floor 1.
          </Text>
          {printError ? <Text style={styles.warn}>{printError}</Text> : null}
          {printed && !printError ? (
            <Text style={styles.ok}>Test label sent to Zebra Weblink printer.</Text>
          ) : null}
          {labelMeta ? (
            <Text style={styles.meta} numberOfLines={3}>
              {[
                labelMeta.sku,
                labelMeta.receiptNumber,
                labelMeta.customerName,
              ].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {uri ? (
            <ScrollView horizontal contentContainerStyle={styles.imageWrap}>
              <Image
                source={{ uri }}
                style={styles.labelImage}
                resizeMode="contain"
                accessibilityLabel="Storage sale label preview"
              />
            </ScrollView>
          ) : (
            <Text style={kiosk.hint}>No preview image.</Text>
          )}
          <View style={styles.actions}>
            <Pressable style={kiosk.btnPrimaryBlock} onPress={onClose}>
              <Text style={kiosk.btnPrimaryBlockText}>Done</Text>
            </Pressable>
          </View>
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
  title: { fontSize: 17, fontWeight: '800', color: theme.text, marginBottom: 6 },
  sub: { fontSize: 13, color: theme.muted, marginBottom: 10, lineHeight: 18 },
  warn: { fontSize: 13, color: theme.danger, marginBottom: 8 },
  ok: { fontSize: 13, color: '#047857', marginBottom: 8 },
  meta: { fontSize: 12, color: theme.text, marginBottom: 8 },
  imageWrap: { alignItems: 'center', paddingVertical: 8 },
  labelImage: {
    width: LABEL_W,
    height: LABEL_H,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  actions: { marginTop: 12 },
});
