import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

function formatPrice(value, currency) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const c = String(currency || 'K').toUpperCase();
  const sym = c === 'USD' || c === '$' ? '$' : 'K';
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

export default function ProductCard({
  product,
  imageStatus,
  onImageBroken,
  onPress,
}) {
  const promo = Number(product.promotional_price);
  const hasPromo = Number.isFinite(promo) && promo > 0;
  const [renderFailed, setRenderFailed] = useState(false);

  const url = String(product.imageUrl || '').trim();
  const statusBroken = imageStatus === 'broken' || imageStatus === 'none' || renderFailed;
  const showImage = Boolean(url) && !statusBroken;

  const handleImageError = () => {
    setRenderFailed(true);
    onImageBroken?.();
  };

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.imageWrap}>
        {showImage ? (
          <Image
            source={{ uri: url }}
            style={styles.image}
            resizeMode="cover"
            onError={handleImageError}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>
              {url && (imageStatus === 'checking' || imageStatus === undefined) ? 'Checking…' : 'No photo'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {product.sku ? <Text style={styles.sku}>SKU: {product.sku}</Text> : null}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Standard</Text>
          <Text style={styles.priceValue}>{formatPrice(product.price, product.currency)}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Promo</Text>
          <Text style={[styles.priceValue, hasPromo && styles.promoValue]}>
            {hasPromo ? formatPrice(promo, product.currency) : '—'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 12,
    marginBottom: 12,
  },
  imageWrap: {
    width: 88,
    height: 88,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: theme.surfaceAlt,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  placeholderText: { color: theme.muted, fontSize: 11, textAlign: 'center' },
  body: { flex: 1, minWidth: 0 },
  name: { color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: 4 },
  sku: { color: theme.muted, fontSize: 12, marginBottom: 8 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  priceLabel: { color: theme.muted, fontSize: 12 },
  priceValue: { color: theme.text, fontWeight: '700', fontSize: 13 },
  promoValue: { color: theme.accent },
});
