import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CurrencyToggle, PrimaryButton, ScreenWrap } from '../components/ui';
import { getProduct, saveProduct } from '../db/repository';
import { styles } from '../theme';
import { DEFAULT_CURRENCY, normalizeCurrency, parseMoney } from '../utils/format';

export default function ProductFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const productId = route.params?.productId;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const row = await getProduct(productId);
      if (!row) return;
      setName(row.name || '');
      setDescription(row.description || '');
      setPrice(String(row.price ?? ''));
      setCurrency(normalizeCurrency(row.currency));
    })();
  }, [productId]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveProduct({
        id: productId,
        name,
        description,
        price: parseMoney(price),
        currency,
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
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="Product description"
          multiline
          textAlignVertical="top"
        />
        <CurrencyToggle value={currency} onChange={setCurrency} />
        <Text style={styles.label}>Price</Text>
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
