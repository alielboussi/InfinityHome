import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function resolveDisplayImage(row) {
  return row.displayImageUrl || row.cachedImageUrl || row.imageUrl || '';
}

function ComponentsToggle({ expanded, onPress }) {
  return (
    <Pressable
      style={[styles.componentsToggle, expanded && styles.componentsToggleOpen]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Hide set components' : 'Show set components'}
    >
      <View style={[styles.componentsCaret, expanded && styles.componentsCaretOpen]} />
    </Pressable>
  );
}

export default function StockCard({ row, onPressImage }) {
  const [failed, setFailed] = useState(false);
  const [showComponents, setShowComponents] = useState(false);
  const imageUri = resolveDisplayImage(row);
  const showImage = Boolean(imageUri) && !failed;
  const hasComponents = row.type === 'set' && Array.isArray(row.components) && row.components.length > 0;

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.imageWrap}
        onPress={() => showImage && onPressImage(imageUri)}
        disabled={!showImage}
      >
        {showImage ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{row.type === 'set' ? 'SET' : 'No image'}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.type}>{row.type === 'set' ? 'Set' : 'Product'}</Text>
        <Text style={styles.name} numberOfLines={2}>{row.name}</Text>
        {row.sku ? <Text style={styles.sku} numberOfLines={1}>{row.sku}</Text> : null}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Standard</Text>
          <Text style={styles.priceValue}>{row.standardPrice}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Promo</Text>
          <Text style={[styles.priceValue, styles.promoValue]}>{row.promoPrice}</Text>
        </View>
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Available</Text>
          <Text style={styles.qtyValue}>{row.qty}</Text>
        </View>
        {hasComponents ? (
          <>
            <ComponentsToggle
              expanded={showComponents}
              onPress={() => setShowComponents((open) => !open)}
            />
            {showComponents ? (
              <View style={styles.componentsPanel}>
                {row.components.map((component) => (
                  <View key={component.productId} style={styles.componentRow}>
                    <Text style={styles.componentName} numberOfLines={2}>{component.name}</Text>
                    <Text style={styles.componentMeta}>
                      {component.requiredQty > 1 ? `${component.requiredQty} per set · ` : ''}
                      {component.qty} in stock
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

export function ImageLightbox({ uri, onClose }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.lightbox} onPress={onClose}>
        <Pressable style={styles.lightboxClose} onPress={onClose}>
          <Text style={styles.lightboxCloseText}>×</Text>
        </Pressable>
        {uri ? (
          <Image source={{ uri }} style={styles.lightboxImage} resizeMode="contain" />
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    minHeight: 280,
    alignSelf: 'stretch',
  },
  imageWrap: {
    height: 120,
    backgroundColor: '#f1f5f9',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 12,
  },
  body: {
    padding: 10,
    gap: 4,
    position: 'relative',
    paddingBottom: 42,
  },
  type: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    minHeight: 36,
  },
  sku: {
    fontSize: 11,
    color: '#64748b',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  promoValue: {
    color: '#b45309',
  },
  qtyRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  qtyLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
  },
  componentsToggle: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  componentsToggleOpen: {
    backgroundColor: '#e8f0fb',
    borderColor: '#1565c0',
  },
  componentsCaret: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#1565c0',
    marginLeft: 2,
  },
  componentsCaretOpen: {
    transform: [{ rotate: '90deg' }],
  },
  componentsPanel: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  componentRow: {
    gap: 2,
  },
  componentName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  componentMeta: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  lightboxClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
});
