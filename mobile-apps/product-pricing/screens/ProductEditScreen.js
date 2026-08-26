import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchProductById,
  saveProductPrices,
  uploadProductImage,
} from '../services/catalog';
import { theme } from '../theme';

export default function ProductEditScreen({ navigation, route }) {
  const { productId, locationId, locationName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState(null);
  const [standardPrice, setStandardPrice] = useState('');
  const [promoPrice, setPromoPrice] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [pickedUri, setPickedUri] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const row = await fetchProductById(productId, locationId);
        if (!alive) return;
        if (!row) {
          setError('Product not found.');
          return;
        }
        setProduct(row);
        setStandardPrice(row.price != null ? String(row.price) : '');
        setPromoPrice(row.promotional_price != null ? String(row.promotional_price) : '');
        setImageUri(row.imageUrl || '');
      } catch (err) {
        if (alive) setError(err?.message || 'Failed to load product.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [productId, locationId]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload a product image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPickedUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a product photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPickedUri(result.assets[0].uri);
    }
  };

  const onSave = async () => {
    if (!product) return;
    setSaving(true);
    setError('');
    try {
      await saveProductPrices({
        productId: product.id,
        locationId,
        standardPrice,
        promoPrice,
        baseProduct: product,
        locationOverride: product._locationOverride,
      });
      if (pickedUri) {
        const publicUrl = await uploadProductImage(product.id, pickedUri);
        setImageUri(publicUrl);
        setPickedUri('');
      }
      Alert.alert('Saved', 'Product updated on the portal products-list.');
      navigation.goBack();
    } catch (err) {
      setError(err?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const previewUri = pickedUri || imageUri;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Edit product</Text>
        <Text style={styles.subtitle}>{locationName}</Text>
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
                {previewUri ? (
                  <Image source={{ uri: previewUri }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.placeholderText}>No image yet</Text>
                  </View>
                )}
                <View style={styles.imageActions}>
                  <Pressable style={styles.secondaryButton} onPress={pickImage}>
                    <Text style={styles.secondaryButtonText}>Choose photo</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={takePhoto}>
                    <Text style={styles.secondaryButtonText}>Take photo</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.label}>Standard price</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={standardPrice}
                onChangeText={setStandardPrice}
                placeholder="0"
                placeholderTextColor={theme.muted}
              />

              <Text style={styles.label}>Promo price</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={promoPrice}
                onChangeText={setPromoPrice}
                placeholder="Leave blank to clear"
                placeholderTextColor={theme.muted}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving…' : 'Save to portal'}
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
  image: { width: '100%', height: 220, borderRadius: 10, marginBottom: 12 },
  imagePlaceholder: {
    height: 220,
    borderRadius: 10,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  placeholderText: { color: theme.muted },
  imageActions: { flexDirection: 'row', gap: 8 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: theme.surfaceAlt,
  },
  secondaryButtonText: { color: theme.text, fontWeight: '700' },
  label: { color: theme.muted, fontSize: 12, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.text,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: theme.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#052018', fontWeight: '900', fontSize: 16 },
  error: { color: theme.danger, marginBottom: 12 },
});
