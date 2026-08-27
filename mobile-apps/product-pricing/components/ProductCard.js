import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import CachedProductImage from './CachedProductImage';
import ProductImageLightbox from './ProductImageLightbox';
import { theme } from '../theme';
import { estimateProductCardHeight } from '../utils/productCardLayout';

function formatPrice(value, currency) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const c = String(currency || 'K').toUpperCase();
  const sym = c === 'USD' || c === '$' ? '$' : 'K';
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

export default function ProductCard({
  product,
  cardWidth,
  imageStatus,
  onImageBroken,
  onPress,
  onImageLongPress,
  onNameLongPress,
}) {
  const promo = Number(product.promotional_price);
  const hasPromo = Number.isFinite(promo) && promo > 0;
  const [renderFailed, setRenderFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const url = String(product.imageUrl || '').trim();
  const statusBroken = imageStatus === 'broken' || imageStatus === 'none' || renderFailed;
  const showImage = Boolean(url) && !statusBroken;
  const imageHeight = Math.round(cardWidth * 0.52);
  const cardHeight = useMemo(
    () => estimateProductCardHeight(cardWidth, product),
    [cardWidth, product?.name, product?.sku],
  );

  const handleImageError = () => {
    setRenderFailed(true);
    onImageBroken?.();
  };

  const handleImageLongPress = () => {
    if (onImageLongPress) {
      onImageLongPress(product);
      return;
    }
    onPress?.();
  };

  return (
    <>
      <Pressable
        style={[styles.card, { width: cardWidth, minHeight: cardHeight }]}
        onPress={onPress}
      >
        <Pressable
          style={[styles.imageWrap, { height: imageHeight }]}
          onPress={(event) => {
            event.stopPropagation?.();
            if (showImage) setLightboxOpen(true);
          }}
          onLongPress={(event) => {
            event.stopPropagation?.();
            handleImageLongPress();
          }}
          delayLongPress={400}
        >
          {showImage ? (
            <CachedProductImage
              uri={url}
              recyclingKey={product.id}
              onError={handleImageError}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>
                {url && (imageStatus === 'checking' || imageStatus === undefined) ? 'Checking…' : 'Hold to add photo'}
              </Text>
            </View>
          )}
        </Pressable>

        <View style={styles.body}>
          <Pressable
            onLongPress={() => onNameLongPress?.(product)}
            delayLongPress={450}
          >
            <Text style={styles.name}>
              {product.__isCombo ? 'SET · ' : ''}
              {product.name}
            </Text>
          </Pressable>
          {product.sku ? <Text style={styles.sku}>SKU: {product.sku}</Text> : null}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Std</Text>
            <Text style={styles.priceValue}>
              {formatPrice(product.price, product.currency)}
            </Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Promo</Text>
            <Text style={[styles.priceValue, hasPromo && styles.promoValue]}>
              {hasPromo ? formatPrice(promo, product.currency) : '—'}
            </Text>
          </View>
        </View>
      </Pressable>

      <ProductImageLightbox
        visible={lightboxOpen}
        uri={showImage ? url : ''}
        title={product.name}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    backgroundColor: theme.surfaceAlt,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  placeholderText: { color: theme.muted, fontSize: 11, textAlign: 'center', lineHeight: 14 },
  body: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  name: {
    color: theme.text,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 16,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  sku: { color: theme.muted, fontSize: 10, marginBottom: 6 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
    minHeight: 16,
  },
  priceLabel: { color: theme.muted, fontSize: 11 },
  priceValue: { color: theme.text, fontWeight: '700', fontSize: 12, flexShrink: 1, textAlign: 'right' },
  promoValue: { color: theme.accent },
});
