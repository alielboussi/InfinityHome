import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PrimaryButton, ScreenWrap } from '../components/ui';
import { getProduct, saveProduct } from '../db/repository';
import { styles } from '../theme';
import { parseMoney } from '../utils/format';

export default function ProductFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const productId = route.params?.productId;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const row = await getProduct(productId);
      if (!row) return;
      setName(row.name || '');
      setPrice(String(row.price ?? ''));
    })();
  }, [productId]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveProduct({
        id: productId,
        name,
        price: parseMoney(price),
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Product name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Product name" />
        <Text style={styles.label}>Price (K)</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        <PrimaryButton title={saving ? 'Saving…' : 'Save product'} onPress={onSave} disabled={saving} />
      </ScrollView>
    </ScreenWrap>
  );
}
