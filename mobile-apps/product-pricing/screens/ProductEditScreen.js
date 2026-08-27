import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProductImagePreview from '../components/ProductImagePreview';
import {
  fetchCatalogItemById,
  uploadProductImage,
} from '../services/catalog';
import { theme } from '../theme';
import { promptReplaceProductImage } from '../utils/productImagePicker';

function formatPrice(value, currency) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const c = String(currency || 'K').toUpperCase();
  const sym = c === 'USD' || c === '$' ? '$' : 'K';
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

export default function ProductEditScreen({ navigation, route }) {
  const { productId, isCombo, promptImageReplace } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState(null);
  const [imageUri, setImageUri] = useState('');
  const [pickedUri, setPickedUri] = useState('');
  const [error, setError] = useState('');
  const promptedReplaceRef = useRef(false);

  const handleReplaceImage = useCallback(() => {
    promptReplaceProductImage({
      onPicked: (uri) => setPickedUri(uri),
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const row = await fetchCatalogItemById(productId, { isCombo: Boolean(isCombo) });
        if (!alive) return;
        if (!row) {
          setError(isCombo ? 'Set not found.' : 'Product not found.');
          return;
        }
        setProduct(row);
        setImageUri(row.imageUrl || '');
      } catch (err) {
        if (alive) setError(err?.message || 'Failed to load product.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [productId, isCombo]);

  useEffect(() => {
    if (!promptImageReplace || loading || !product || promptedReplaceRef.current) return;
    promptedReplaceRef.current = true;
    const timer = setTimeout(() => handleReplaceImage(), 350);
    return () => clearTimeout(timer);
  }, [promptImageReplace, loading, product, handleReplaceImage]);

  const onSave = async () => {
    if (!product) return;
    if (!pickedUri) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const publicUrl = await uploadProductImage(product.id, pickedUri, {
        isCombo: Boolean(product.__isCombo),
        itemMeta: { name: product.name, sku: product.sku },
      });
      setImageUri(publicUrl);
      setPickedUri('');
      Alert.alert('Saved', `${product.__isCombo ? 'Set' : 'Product'} photo updated on the portal.`);
      navigation.goBack();
    } catch (err) {
      setError(err?.message || 'Failed to upload photo.');
    } finally {
      setSaving(false);
    }
  };

  const previewUri = pickedUri || imageUri;
  const promo = Number(product?.promotional_price);
  const hasPromo = Number.isFinite(promo) && promo > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Products</Text>
        </Pressable>
        <Text style={styles.title}>{product?.__isCombo ? 'Set photo' : 'Product photo'}</Text>
        <Text style={styles.subtitle}>Add or replace the portal image</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.centered} size="large" color={theme.border} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {product ? (
            <>
              <Text style={styles.productName}>{product.name}</Text>
              {product.sku ? <Text style={styles.sku}>SKU: {product.sku}</Text> : null}

              <View style={styles.imageCard}>
                <ProductImagePreview
                  uri={previewUri}
                  title={product.name}
                  onLongPressReplace={handleReplaceImage}
                  hint="Tap image to enlarge · Hold to replace"
                />
                <Pressable style={styles.replaceLink} onPress={handleReplaceImage}>
                  <Text style={styles.replaceLinkText}>Replace image</Text>
                </Pressable>
              </View>

              <View style={styles.priceCard}>
                <Text style={styles.priceCardTitle}>Prices (read-only)</Text>
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

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.primaryButton, !pickedUri && styles.primaryButtonMuted]}
                onPress={onSave}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Uploading…' : pickedUri ? 'Save photo to portal' : 'Back to products'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.error}>{error || 'Product not found.'}</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  back: { color: theme.border, fontWeight: '700', marginBottom: 8 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: theme.muted, marginTop: 4 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { marginTop: 40 },
  productName: { color: theme.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sku: { color: theme.muted, marginBottom: 14 },
  imageCard: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 12,
    marginBottom: 16,
  },
  replaceLink: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  replaceLinkText: { color: theme.border, fontWeight: '700' },
  priceCard: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 14,
    marginBottom: 16,
  },
  priceCardTitle: { color: theme.muted, fontSize: 12, marginBottom: 10, fontWeight: '700' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  priceLabel: { color: theme.muted, fontSize: 14 },
  priceValue: { color: theme.text, fontWeight: '700', fontSize: 14 },
  promoValue: { color: theme.accent },
  primaryButton: {
    backgroundColor: theme.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonMuted: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  primaryButtonText: { color: '#052018', fontWeight: '900', fontSize: 16 },
  error: { color: theme.danger, marginBottom: 12 },
});
